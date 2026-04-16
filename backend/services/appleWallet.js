/**
 * appleWallet.js — Gera passes .pkpass para Apple Wallet
 *
 * Usa passkit-generator (v3) + node-forge para:
 *  1. Extrair cert PEM + chave privada PEM do .p12 (base64 env var)
 *  2. Converter WWDR .cer (DER base64) para PEM
 *  3. Gerar PNG minimalista (icone colorido sem dependencia externa)
 *  4. Assinar e empacotar o .pkpass
 *
 * Dois tipos de passe: 'membro' e 'voluntario'
 */

const { PKPass } = require('passkit-generator');
const forge = require('node-forge');
const zlib = require('zlib');
const crypto = require('crypto');

// ── Geracao de PNG minimalista (sem lib externa) ──────────────────────────

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crcBuf]);
}

/**
 * Gera um PNG solido da cor especificada.
 * @param {number} w largura em pixels
 * @param {number} h altura em pixels
 * @param {number} r, g, b componentes RGB 0-255
 * @returns {Buffer} PNG valido
 */
function makeSolidPng(w, h, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  // bytes 10-12 = 0 (compression, filter, interlace)

  const rowSize = 1 + w * 3;
  const raw = Buffer.alloc(h * rowSize);
  for (let y = 0; y < h; y++) {
    const off = y * rowSize;
    raw[off] = 0; // filter none
    for (let x = 0; x < w; x++) {
      raw[off + 1 + x * 3]     = r;
      raw[off + 1 + x * 3 + 1] = g;
      raw[off + 1 + x * 3 + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Cores por tipo de passe
// Membro: bege #eae3da = rgb(234, 227, 218)
// Voluntario: azul escuro #408097 = rgb(64, 128, 151)

// Icones pre-gerados por tipo (cached — gerados uma vez no startup)
const ICONS_MEMBRO = {
  'icon.png':    makeSolidPng(29,  29,  234, 227, 218),
  'icon@2x.png': makeSolidPng(58,  58,  234, 227, 218),
  'icon@3x.png': makeSolidPng(87,  87,  234, 227, 218),
  'logo.png':    makeSolidPng(160, 50,  234, 227, 218),
  'logo@2x.png': makeSolidPng(320, 100, 234, 227, 218),
};

const ICONS_VOLUNTARIO = {
  'icon.png':    makeSolidPng(29,  29,  64, 128, 151),
  'icon@2x.png': makeSolidPng(58,  58,  64, 128, 151),
  'icon@3x.png': makeSolidPng(87,  87,  64, 128, 151),
  'logo.png':    makeSolidPng(160, 50,  64, 128, 151),
  'logo@2x.png': makeSolidPng(320, 100, 64, 128, 151),
};

// ── Conversao de certificados ─────────────────────────────────────────────

/**
 * Extrai certPem e keyPem de um .p12 em base64 com senha.
 * @returns {{ certPem: string, keyPem: string }}
 */
function p12ToPem(p12Base64, password) {
  const der = forge.util.decode64(p12Base64);
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const bags = certBags[forge.pki.oids.certBag] || [];
  if (!bags.length) throw new Error('Nenhum certificado encontrado no .p12');

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const kbags = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  if (!kbags.length) throw new Error('Nenhuma chave privada encontrada no .p12');

  return {
    certPem: forge.pki.certificateToPem(bags[0].cert),
    keyPem:  forge.pki.privateKeyToPem(kbags[0].key),
  };
}

/**
 * Converte WWDR .cer (DER, base64) para PEM.
 */
function wwdrToPem(cerBase64) {
  const der = forge.util.decode64(cerBase64);
  const asn1 = forge.asn1.fromDer(der);
  const cert = forge.pki.certificateFromAsn1(asn1);
  return forge.pki.certificateToPem(cert);
}

// Cache de certs extraidos (operacao cara, faz uma vez por cold start)
let _certCache = null;

function getCerts() {
  if (_certCache) return _certCache;

  const password = process.env.APPLE_WALLET_CERT_PASSWORD || '';
  const wwdrBase64 = process.env.APPLE_WALLET_WWDR_BASE64 || '';
  const membroBase64 = process.env.APPLE_WALLET_MEMBRO_P12_BASE64 || '';
  const voluntarioBase64 = process.env.APPLE_WALLET_VOLUNTARIO_P12_BASE64 || '';

  if (!wwdrBase64 || !membroBase64 || !voluntarioBase64) {
    throw new Error('Apple Wallet nao configurado (env vars ausentes)');
  }

  const wwdrPem = wwdrToPem(wwdrBase64);
  const membro = p12ToPem(membroBase64, password);
  const voluntario = p12ToPem(voluntarioBase64, password);

  _certCache = {
    wwdrPem,
    membro:    { certPem: membro.certPem,    keyPem: membro.keyPem    },
    voluntario:{ certPem: voluntario.certPem, keyPem: voluntario.keyPem },
    password,
  };

  return _certCache;
}

// ── Construcao dos passes ─────────────────────────────────────────────────

/**
 * Gera o .pkpass do cartao de identidade do membro.
 *
 * @param {{nome: string, qrToken: string, memberId: string, pending?: boolean}} opts
 * @returns {Promise<Buffer>} conteudo binario do .pkpass
 */
async function buildMembroPass({ nome, qrToken, memberId, pending = false }) {
  const certs = getCerts();
  const passTypeId = process.env.APPLE_WALLET_PASS_TYPE_MEMBRO || 'pass.br.cbrio.membro';
  const teamId     = process.env.APPLE_WALLET_TEAM_ID           || 'AK67335XW5';

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: `mem-${crypto.createHash('sha256').update(qrToken).digest('hex').slice(0, 16)}`,
    teamIdentifier: teamId,
    organizationName: 'CBRio',
    description: 'CBRio — Cartao de Membro',
    backgroundColor: 'rgb(234, 227, 218)',
    foregroundColor: 'rgb(64, 128, 151)',
    labelColor: 'rgb(64, 128, 151)',
    generic: {
      primaryFields: [
        { key: 'name', label: 'MEMBRO', value: nome || 'Membro' },
      ],
      secondaryFields: [
        { key: 'org',    label: 'IGREJA',  value: 'CBRio' },
        { key: 'status', label: 'STATUS',  value: pending ? 'Cadastro pendente' : 'Ativo' },
      ],
      auxiliaryFields: [
        { key: 'id', label: 'ID', value: memberId },
      ],
      backFields: [
        { key: 'info', label: 'Informacoes', value: 'Apresente este QR Code para identificacao na CBRio.' },
      ],
    },
    barcodes: [{
      message: qrToken,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    }],
    barcode: {
      message: qrToken,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    },
  };

  const pass = new PKPass(
    {
      ...ICONS_MEMBRO,
    {
      wwdr:                 Buffer.from(certs.wwdrPem),
      signerCert:           Buffer.from(certs.membro.certPem),
      signerKey:            Buffer.from(certs.membro.keyPem),
      signerKeyPassphrase:  certs.password,
    },
  );

  return pass.getAsBuffer();
}

/**
 * Gera o .pkpass do cracha de voluntario (check-in).
 *
 * @param {{nome: string, qrCode: string, voluntarioId: string}} opts
 * @returns {Promise<Buffer>}
 */
async function buildVoluntarioPass({ nome, qrCode, voluntarioId }) {
  const certs = getCerts();
  const passTypeId = process.env.APPLE_WALLET_PASS_TYPE_VOLUNTARIO || 'pass.br.cbrio.voluntario';
  const teamId     = process.env.APPLE_WALLET_TEAM_ID              || 'AK67335XW5';

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: `vol-${crypto.createHash('sha256').update(qrCode).digest('hex').slice(0, 16)}`,
    teamIdentifier: teamId,
    organizationName: 'CBRio',
    description: 'CBRio — Cracha de Voluntario',
    backgroundColor: 'rgb(64, 128, 151)',
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(255, 255, 255)',
    generic: {
      primaryFields: [
        { key: 'name', label: 'VOLUNTARIO', value: nome || 'Voluntario' },
      ],
      secondaryFields: [
        { key: 'org', label: 'IGREJA', value: 'CBRio' },
        { key: 'uso', label: 'USO',    value: 'Check-in no Totem' },
      ],
      auxiliaryFields: [
        { key: 'id', label: 'ID', value: voluntarioId },
      ],
      backFields: [
        { key: 'info', label: 'Como usar', value: 'Abra este passe e apresente o QR Code no totem de check-in da CBRio.' },
      ],
    },
    barcodes: [{
      message: qrCode,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    }],
    barcode: {
      message: qrCode,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    },
  };

  const pass = new PKPass(
    {
      ...ICONS_VOLUNTARIO,
      'pass.json': Buffer.from(JSON.stringify(passJson)),
    },
    {
      wwdr:                Buffer.from(certs.wwdrPem),
      signerCert:          Buffer.from(certs.voluntario.certPem),
      signerKey:           Buffer.from(certs.voluntario.keyPem),
      signerKeyPassphrase: certs.password,
    },
  );

  return pass.getAsBuffer();
}

module.exports = { buildMembroPass, buildVoluntarioPass };
