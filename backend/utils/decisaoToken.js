// ════════════════════════════════════════════════════════════════════════════
//  DECISÃO ONLINE · token do QR que fica GRAVADO no vídeo
//
//  Pergunta do Matheus (27/08/2026): "o vídeo fica lá... e quando um cara
//  assistir um vídeo de 2 anos e se converter, ele vai preencher o formulário,
//  e aí, como fica? Tem como a gente ter um QR dinâmico automático, em que cada
//  culto fica vinculado a um culto?"
//
//  ⚠️⚠️ POR QUE O QR FIXO NÃO SERVE. Com um QR único (`/decisao`), o sistema
//  DEDUZ o culto pelo relógio: janela do horário, rabo de 12h e, fora disso, o
//  último culto online dos 7 dias. Ao vivo funciona. Num vídeo de 2 anos é
//  chute — a decisão cola no culto da semana em que a pessoa assistiu, que ela
//  nunca viu. E metade da semana cai nesse ramo.
//
//  Com o culto DENTRO do link, o QR entra no overlay daquele culto e fica
//  gravado no vídeo para sempre. Quem escaneia em 2028 cai no culto de 2026,
//  sem o servidor adivinhar nada.
//
//  ⚠️ NAMESPACE PRÓPRIO (`decisao-online:`). O segredo é o mesmo do token do
//  voluntário, do censo e do comprovante de inscrição — sem namespace, um token
//  de outro fluxo seria aceito aqui. É a lição registrada do `censoToken`.
//
//  ⚠️ SEM EXPIRAÇÃO, e isto é o ponto do desenho: o vídeo não expira. Um token
//  com prazo transformaria o QR gravado numa imagem morta no dia seguinte —
//  justamente o caso que ele existe para atender.
//
//  ⚠️ FAIL-CLOSED sem segredo: não gera link e não aceita token. Nunca usar
//  literal de fallback (lição do MEM_QR_SALT).
//
//  ⚠️ O poder do token é UM só: registrar decisão NAQUELE culto. Não autentica,
//  não abre módulo, não lê lista de pessoas, não altera e não apaga nada.
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

function segredo() {
  return process.env.CULTO_TOKEN_SECRET || process.env.CRON_SECRET || null;
}

function assinar(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`decisao-online:${idNorm}`).digest('hex').slice(0, 20);
}

/** UUID do culto → `<32 hex>.<20 hex>`, ou null sem segredo / id inválido. */
function gerarTokenDecisao(cultoId) {
  const sec = segredo();
  const idNorm = String(cultoId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinar(idNorm, sec)}`;
}

/** Token → UUID do culto, ou null (formato, segredo ou assinatura inválidos). */
function verificarTokenDecisao(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinar(m[1], sec);
  // Comprimentos iguais por construção (regex 20 + slice 20) — timingSafeEqual exige.
  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}

/** Link do QR daquele culto. `null` quando não há segredo (fail-closed). */
function montarLinkDecisao(cultoId, baseUrl) {
  const t = gerarTokenDecisao(cultoId);
  if (!t) return null;
  const base = String(baseUrl || process.env.FRONTEND_URL || 'https://www.cbrio.org').replace(/\/+$/, '');
  return `${base}/decisao/${t}`;
}

module.exports = { gerarTokenDecisao, verificarTokenDecisao, montarLinkDecisao };
