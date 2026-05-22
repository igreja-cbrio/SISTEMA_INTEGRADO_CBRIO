// Service de Cobranca PIX (QR Code) via API Santander
//
// Segue o padrao Open Finance Brasil (BACEN) · paths podem variar conforme
// versao do produto Santander. Permite override via env:
//
//   SANTANDER_PIX_COB_BASE_PATH   · prefixo customizado (default '/pix/v1')
//   SANTANDER_PIX_COB_CHAVE       · chave PIX da igreja (CNPJ/email/celular/aleatoria)
//
// Endpoints (relativos ao BASE_PATH):
//   PUT   /cob/{txid}    · cria cobranca imediata com txid fixo
//   GET   /cob/{txid}    · consulta cobranca
//   PATCH /cob/{txid}    · altera cobranca (cancela)
//
// Toggle global:
//   SANTANDER_PIX_COB_ENABLED=true · ativa endpoints REST (default false)

const crypto = require('crypto');
const { callApi } = require('./httpClient');

const ENABLED = (process.env.SANTANDER_PIX_COB_ENABLED || 'false').toLowerCase() === 'true';
const BASE_PATH = process.env.SANTANDER_PIX_COB_BASE_PATH || '/pix/v1';
const CHAVE_PIX = process.env.SANTANDER_PIX_COB_CHAVE || process.env.SANTANDER_CNPJ_TITULAR || '';

function isEnabled() {
  return ENABLED;
}

function getChave() {
  return CHAVE_PIX;
}

/**
 * Gera um txid no padrao BACEN.
 * Regras: 26-35 caracteres, A-Z a-z 0-9. Unico por PSP recebedor.
 */
function gerarTxid(prefix = 'cbrio') {
  const random = crypto.randomBytes(16).toString('hex').slice(0, 26);
  const out = `${prefix}${random}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 35);
  if (out.length < 26) {
    // padding pra atingir o minimo
    return (out + crypto.randomBytes(20).toString('hex')).slice(0, 26);
  }
  return out;
}

/**
 * Cria (PUT) cobranca PIX imediata com txid fixo.
 *
 * @param {object} args
 * @param {string} args.txid             · pre-gerado por gerarTxid()
 * @param {number} args.valor            · em reais (sera formatado pra string '0.00')
 * @param {object} [args.devedor]        · { cpf|cnpj, nome }
 * @param {string} [args.solicitacao]    · texto livre exibido pro pagador
 * @param {number} [args.expiracao]      · segundos · default 3600 (1h)
 * @returns Santander payload com `pixCopiaECola` e `location`.
 */
async function criarCobranca({ txid, valor, devedor, solicitacao, expiracao = 3600 }) {
  if (!ENABLED) throw new Error('PIX Cobranca desabilitado · setar SANTANDER_PIX_COB_ENABLED=true');
  if (!CHAVE_PIX) throw new Error('SANTANDER_PIX_COB_CHAVE nao configurada');
  if (!txid) throw new Error('txid obrigatorio');
  if (!valor || valor <= 0) throw new Error('valor invalido');

  const body = {
    calendario: { expiracao: Math.max(60, Math.floor(expiracao)) },
    valor: { original: Number(valor).toFixed(2) },
    chave: CHAVE_PIX,
  };
  if (devedor) {
    const doc = String(devedor.cpf || devedor.cnpj || '').replace(/\D/g, '');
    if (doc.length === 11) body.devedor = { cpf: doc, nome: devedor.nome || 'Pagador' };
    else if (doc.length === 14) body.devedor = { cnpj: doc, nome: devedor.nome || 'Pagador' };
  }
  if (solicitacao) body.solicitacaoPagador = String(solicitacao).slice(0, 140);

  return callApi(`${BASE_PATH}/cob/${txid}`, {
    method: 'PUT',
    body,
  });
}

/**
 * Consulta cobranca por txid.
 */
async function consultarCobranca(txid) {
  if (!ENABLED) throw new Error('PIX Cobranca desabilitado');
  return callApi(`${BASE_PATH}/cob/${txid}`, { method: 'GET' });
}

/**
 * Cancela cobranca (PATCH com status REMOVIDA_PELO_USUARIO_RECEBEDOR).
 */
async function cancelarCobranca(txid) {
  if (!ENABLED) throw new Error('PIX Cobranca desabilitado');
  return callApi(`${BASE_PATH}/cob/${txid}`, {
    method: 'PATCH',
    body: { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' },
  });
}

/**
 * Lista cobrancas no periodo (relatorio).
 * Endpoint padrao BACEN aceita query inicio/fim ISO + cpf/cnpj opcional.
 */
async function listarCobrancas({ inicio, fim, cpf, cnpj, status }) {
  if (!ENABLED) throw new Error('PIX Cobranca desabilitado');
  return callApi(`${BASE_PATH}/cob`, {
    method: 'GET',
    query: {
      inicio: inicio || undefined,
      fim: fim || undefined,
      cpf: cpf || undefined,
      cnpj: cnpj || undefined,
      status: status || undefined,
    },
  });
}

module.exports = {
  isEnabled,
  getChave,
  gerarTxid,
  criarCobranca,
  consultarCobranca,
  cancelarCobranca,
  listarCobrancas,
};
