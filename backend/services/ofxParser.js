// Parser de arquivo OFX (Open Financial Exchange · formato SGML)
// Suporta OFX 1.x (SGML) e 2.x (XML) · encoding 1252 (windows) e UTF-8
//
// Estrutura tipica do Santander:
//   <STMTTRN>
//     <TRNTYPE>CREDIT|DEBIT
//     <DTPOSTED>20260504000000[-3:GMT]
//     <TRNAMT>600,00
//     <FITID>3957130004222202605040
//     <MEMO>PIX RECEBIDO     11885260733
//   </STMTTRN>

const iconv = require('iconv-lite');

/**
 * Decodifica buffer respeitando encoding declarado no header
 */
const { extrairDocumentoDoMemo } = require('../utils/documentoBr');

function decodeBuffer(buffer) {
  const headerEnd = buffer.indexOf('\n\n') > 0 ? buffer.indexOf('\n\n') : buffer.indexOf('\r\n\r\n');
  const headerRaw = buffer.slice(0, Math.max(headerEnd, 0)).toString('ascii');

  let charset = 'utf-8';
  if (/CHARSET\s*[:=]\s*1252/i.test(headerRaw) || /CHARSET\s*[:=]\s*WINDOWS-1252/i.test(headerRaw)) {
    charset = 'win1252';
  } else if (/CHARSET\s*[:=]\s*UTF-8/i.test(headerRaw)) {
    charset = 'utf-8';
  } else if (/CHARSET\s*[:=]\s*USASCII/i.test(headerRaw) || /ENCODING\s*[:=]\s*USASCII/i.test(headerRaw)) {
    charset = 'ascii';
  }

  if (charset === 'win1252') return iconv.decode(buffer, 'win1252');
  if (charset === 'ascii') return buffer.toString('ascii');
  return buffer.toString('utf-8');
}

/**
 * Extrai valor de uma tag SGML/XML (com ou sem fechamento)
 */
function extractTag(block, tag) {
  // Tenta XML primeiro: <TAG>valor</TAG>
  const xmlMatch = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
  if (xmlMatch) return xmlMatch[1].trim();

  // SGML: <TAG>valor (termina na próxima tag ou fim de linha)
  const sgmlMatch = block.match(new RegExp(`<${tag}>([^<\\n\\r]*)`, 'i'));
  if (sgmlMatch) return sgmlMatch[1].trim();

  return null;
}

/**
 * Parseia DTPOSTED no formato YYYYMMDDHHMMSS[tz:zone]
 * Retorna { date: 'YYYY-MM-DD', time: 'HH:MM:SS', hasTime: bool }
 */
function parseDtPosted(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = `${y}-${mo}-${d}`;
  const hasTime = h !== undefined && (h !== '00' || mi !== '00' || s !== '00');
  return {
    date,
    time: hasTime ? `${h}:${mi}:${s}` : null,
    hasTime,
  };
}

/**
 * Parseia valor BR (1234,56) ou EN (1234.56) pra number
 */
function parseAmount(raw) {
  if (!raw) return 0;
  const clean = raw.trim().replace(/\s/g, '');
  // Detecta separador decimal
  if (/,\d{1,2}$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(clean);
}

/**
 * Extrai CPF/CNPJ do MEMO de uma transacao.
 *
 * ⚠️ A RÉGUA VIVE EM `backend/utils/documentoBr.js` — aqui é casca fina. Ela
 * estava copiada em 5 lugares com o MESMO bug (colapsar o memo em dígitos colava
 * a data no CPF e fabricava CNPJ), e o bug só apareceu com um extrato bom: dos
 * 5.921 créditos com CPF do arquivo de 90 dias, a versão antiga acertou ZERO.
 */
function extractDocumento(memo) {
  const r = extrairDocumentoDoMemo(memo);
  // Contrato preservado: os chamadores esperam string de dígitos ou null.
  return r?.documento || null;
}

/**
 * Extrai o NOME LIMPO da contraparte do MEMO.
 * Padrão do memo (Itaú): "PIX RECEBIDO <NOME+DD/MM> <NOME COMPLETO> <CPF/CNPJ>"
 *   ex.: "PIX RECEBIDO TATIANE24/05 TATIANE PEREIRA 091.314.057-03" → "TATIANE PEREIRA"
 * Santander traz só o CPF (sem nome) → retorna null.
 * A versão antiga falhava porque o CPF vem FORMATADO (091.314.057-03), e
 * `\d{8,}` não removia (runs de 3 díg entre pontos), sobrando o lixo + CPF.
 */
function extractNomeContraparte(memo) {
  if (!memo) return null;
  const prefixos = [
    'PIX QR CODE RECEBIDO', 'PIX QR CODE ENVIADO', 'PIX ENVIADO', 'PIX RECEBIDO',
    'TED RECEBIDA', 'TED ENVIADA', 'DOC RECEBIDO', 'DOC ENVIADO',
    'TRANSFERENCIA RECEBIDA', 'TRANSFERENCIA ENVIADA',
    'PAGAMENTO A FORNECEDORES', 'PAGAMENTO DE BOLETO', 'PAGAMENTO CARTAO DE DEBITO',
  ];
  let s = String(memo);
  const up = s.toUpperCase();
  for (const p of prefixos) {
    if (up.startsWith(p)) { s = s.substring(p.length); break; }
  }
  // Remove CPF/CNPJ (formatado ou cru) e ids longos crus.
  s = s
    .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, ' ') // CNPJ
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, ' ')          // CPF
    .replace(/\d{6,}/g, ' ');                                // ids crus
  // Remove o token colado NOME+DD/MM do começo (ex.: "TATIANE24/05 ", "WAGNER 03/05 ").
  s = s.replace(/^.*?\d{1,2}\/\d{1,2}\s+/, '');
  // Limpa resíduos de data/hora/códigos e normaliza espaços.
  s = s
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/[.\-/]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Precisa sobrar algo que pareça nome (tem letra e ≥3 chars).
  if (!s || s.length < 3 || !/[A-Za-zÀ-ÿ]/.test(s)) return null;
  return s;
}

/**
 * Parseia conteúdo completo do OFX
 */
/**
 * ⚠️⚠️ HORA IDÊNTICA EM TODO O ARQUIVO É CARIMBO DO BANCO, NÃO HORA DA TRANSAÇÃO.
 *
 * Medido no extrato de 90 dias do Santander (02/09/2026): as **7.297**
 * transações do arquivo têm `<DTPOSTED>` terminando em `100000` — 10:00:00,
 * exatamente igual, do primeiro ao último lançamento. Não existe extrato real
 * em que 7 mil transações caiam no mesmo segundo: é campo preenchido com
 * constante.
 *
 * O estrago de gravar assim mesmo não é estético:
 *
 * 1. **Bloqueia o casamento com o PIX.** `financeiroClassificador.matchOfxPix`
 *    só age onde `hora_lancamento IS NULL` — e é ele que traz a hora REAL, o
 *    `end_to_end_id` e o `pagador_nome` do extrato PIX. Com a hora falsa
 *    gravada, aquele caminho nunca mais alcança a linha.
 * 2. **`hora_origem: 'ofx'` afirma que foi MEDIDO.** Precisão inventada que se
 *    lê como fato é a classe de erro que este projeto trata como pior que a
 *    ausência do dado (mesma lei do centróide que nunca vira `lat/lng` de
 *    pessoa).
 * 3. `fin_identifica_culto` decide de qual CULTO é a oferta pela hora. Hoje o
 *    estrago não se materializa (o banco não processa em domingo, e 10:00 só
 *    cai em slot no domingo), mas é bomba armada.
 *
 * ⚠️ O piso de 3 transações existe porque num arquivo de 1 ou 2 lançamentos a
 * igualdade é trivial e pode ser hora real. Descartar hora é seguro (o PIX
 * preenche depois); gravar hora falsa não é — por isso, na dúvida, descarta.
 *
 * ⚠️ RESÍDUO DECLARADO: banco que carimbe uma hora DIFERENTE por dia escapa
 * desta régua. Ela é deliberadamente simples e determinística — sem limiar de
 * percentual — porque régua de carimbo com heurística é régua que ninguém
 * consegue conferir depois.
 */
const MIN_TRN_PARA_DETECTAR_CARIMBO = 3;

function horaEhCarimbo(horas) {
  const comHora = horas.filter(Boolean);
  if (comHora.length < MIN_TRN_PARA_DETECTAR_CARIMBO) return null;
  if (comHora.length !== horas.length) return null; // parte sem hora ⇒ não é carimbo uniforme
  const distintas = new Set(comHora);
  if (distintas.size !== 1) return null;
  return { hora: comHora[0], transacoes: comHora.length };
}

function parseOfx(buffer) {
  const content = typeof buffer === 'string' ? buffer : decodeBuffer(buffer);

  // Header info
  const bankIdMatch = content.match(/<BANKID>([^\n<]+)/);
  const acctIdMatch = content.match(/<ACCTID>([^\n<]+)/);
  const acctTypeMatch = content.match(/<ACCTTYPE>([^\n<]+)/);
  const curdefMatch = content.match(/<CURDEF>([^\n<]+)/);
  const dtstartMatch = content.match(/<DTSTART>([^\n<]+)/);
  const dtendMatch = content.match(/<DTEND>([^\n<]+)/);

  const header = {
    bankId: bankIdMatch ? bankIdMatch[1].trim() : null,
    acctId: acctIdMatch ? acctIdMatch[1].trim() : null,
    acctType: acctTypeMatch ? acctTypeMatch[1].trim() : null,
    currency: curdefMatch ? curdefMatch[1].trim() : 'BRL',
    dtStart: dtstartMatch ? parseDtPosted(dtstartMatch[1].trim())?.date : null,
    dtEnd: dtendMatch ? parseDtPosted(dtendMatch[1].trim())?.date : null,
  };

  // Extrai todos os STMTTRN
  const transactions = [];
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;
  while ((match = trnRegex.exec(content)) !== null) {
    const block = match[1];
    const trnType = extractTag(block, 'TRNTYPE');
    const dtPosted = extractTag(block, 'DTPOSTED');
    const trnAmt = extractTag(block, 'TRNAMT');
    const fitid = extractTag(block, 'FITID');
    const memo = extractTag(block, 'MEMO');
    const checkNum = extractTag(block, 'CHECKNUM');
    const refNum = extractTag(block, 'REFNUM');

    const dt = parseDtPosted(dtPosted);
    if (!dt) continue;

    const valor = parseAmount(trnAmt);
    const documento = extractDocumento(memo);
    const nome = extractNomeContraparte(memo);

    transactions.push({
      tipo_trn: trnType?.toUpperCase() || (valor < 0 ? 'DEBIT' : 'CREDIT'),
      data_lancamento: dt.date,
      hora_lancamento: dt.hasTime ? dt.time : null,
      hora_origem: dt.hasTime ? 'ofx' : null,
      valor,
      memo: memo || '',
      fitid,
      documento_contraparte: documento,
      nome_contraparte: nome,
      raw_data: { check_num: checkNum, ref_num: refNum, dt_posted_raw: dtPosted },
    });
  }

  // ⚠️ Hora igual no arquivo inteiro é carimbo do banco — ver `horaEhCarimbo`.
  const carimbo = horaEhCarimbo(transactions.map((t) => t.hora_lancamento));
  if (carimbo) {
    for (const t of transactions) {
      t.hora_lancamento = null;
      t.hora_origem = null;
    }
    header.horaDescartada = { motivo: 'carimbo_fixo', ...carimbo };
  }

  return { header, transactions };
}

module.exports = {
  parseOfx,
  parseDtPosted,
  horaEhCarimbo,
  parseAmount,
  extractDocumento,
  extractNomeContraparte,
};
