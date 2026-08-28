// ════════════════════════════════════════════════════════════════════════════
//  EVENTO · token do QR de AUTOATENDIMENTO do check-in (2026-08-28)
//
//  Pedido do Matheus: um QR na porta do evento em que a pessoa faz o próprio
//  check-in — digita CPF e nascimento, o sistema pergunta "você é fulano?", ela
//  confirma e entra. Sem fila no operador.
//
//  ⚠️ Namespace próprio (`evento-checkin:`). Sem ele, um token do censo, da
//  escala, do culto ou do comprovante de inscrição — que usam o MESMO segredo —
//  seria aceito aqui. É a diferença entre "QR da porta do Celebra" e "qualquer
//  link assinado que a igreja já emitiu".
//
//  ⚠️ Sem env NOVA: `EVENTO_CHECKIN_TOKEN_SECRET` é override OPCIONAL e o
//  fallback é o `CRON_SECRET` (já obrigatório em produção). Sem NENHUM segredo
//  fica FAIL-CLOSED — não gera QR e não aceita token. NUNCA usar literal de
//  fallback (lição do MEM_QR_SALT).
//
//  ⚠️ O token dá UM poder só: marcar presença NAQUELE evento, e só para quem
//  provar CPF + nascimento. Ele NÃO autentica, NÃO lista pessoas, NÃO devolve
//  nome de ninguém sozinho e NÃO desfaz check-in. Desfazer é do operador
//  logado — o QR fica na parede e quem passa por ele é público.
//
//  ⚠️ Sem expiração no token: a validade REAL é reconferida no servidor a cada
//  uso (o evento existir, estar publicado e com `checkin_ativo`). Desligar o
//  check-in do evento mata o QR na hora, que é o freio que a operação entende.
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

function segredo() {
  return process.env.EVENTO_CHECKIN_TOKEN_SECRET || process.env.CRON_SECRET || null;
}

function assinar(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`evento-checkin:${idNorm}`).digest('hex').slice(0, 20);
}

/** UUID do evento → `<32 hex>.<20 hex>`, ou null sem segredo / id inválido. */
function gerarTokenCheckin(eventoId) {
  const sec = segredo();
  const idNorm = String(eventoId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinar(idNorm, sec)}`;
}

/** Token → UUID do evento, ou null (formato, segredo ou assinatura inválidos). */
function verificarTokenCheckin(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinar(m[1], sec);
  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}

/** Link do QR da porta. `null` quando não há segredo (fail-closed). */
function montarLinkCheckin(eventoId, baseUrl) {
  const t = gerarTokenCheckin(eventoId);
  if (!t) return null;
  const base = String(baseUrl || 'https://www.cbrio.org').replace(/\/+$/, '');
  return `${base}/ec/${t}`;
}

module.exports = { gerarTokenCheckin, verificarTokenCheckin, montarLinkCheckin };
