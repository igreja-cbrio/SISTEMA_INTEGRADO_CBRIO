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

  // SGML: <TAG>valor (termina na proxima tag ou fim de linha)
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
 * Extrai CPF/CNPJ do MEMO de uma transacao
 * Aceita 11 digitos (CPF) ou 14 (CNPJ), com ou sem formatacao
 */
function extractDocumento(memo) {
  if (!memo) return null;
  const onlyDigits = memo.replace(/\D/g, '');
  // Procura sequencias de 14 (CNPJ) primeiro, depois 11 (CPF)
  const cnpj = onlyDigits.match(/\d{14}/);
  if (cnpj) return cnpj[0];
  // CPF: procura sequencia exata de 11 digitos
  const sequencias = memo.match(/\d{11}/g);
  if (sequencias && sequencias.length > 0) {
    // Retorna a primeira que nao faz parte de um numero maior
    for (const seq of sequencias) {
      const idx = memo.indexOf(seq);
      const before = idx > 0 ? memo[idx - 1] : '';
      const after = memo[idx + 11] || '';
      if (!/\d/.test(before) && !/\d/.test(after)) {
        return seq;
      }
    }
  }
  return null;
}

/**
 * Extrai nome de contraparte do MEMO removendo palavras-chave
 */
function extractNomeContraparte(memo) {
  if (!memo) return null;
  const prefixos = [
    'PIX ENVIADO', 'PIX RECEBIDO', 'TED RECEBIDA', 'TED ENVIADA',
    'PAGAMENTO A FORNECEDORES', 'PAGAMENTO DE BOLETO',
    'PAGAMENTO CARTAO DE DEBITO',
  ];
  let s = memo;
  for (const p of prefixos) {
    if (s.toUpperCase().startsWith(p)) {
      s = s.substring(p.length).trim();
      break;
    }
  }
  // Remove digitos longos (CPF/CNPJ/IDs)
  s = s.replace(/\d{8,}/g, '').replace(/\s+/g, ' ').trim();
  // Se sobrou so codigo (ex: "3957.4900010396-D-000008"), retorna null
  if (!s || /^[\d.\-/]+$/.test(s)) return null;
  return s || null;
}

/**
 * Parseia conteudo completo do OFX
 */
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

  return { header, transactions };
}

module.exports = {
  parseOfx,
  parseDtPosted,
  parseAmount,
  extractDocumento,
  extractNomeContraparte,
};
