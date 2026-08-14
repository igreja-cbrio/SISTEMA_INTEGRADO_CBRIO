// ════════════════════════════════════════════════════════════════════════════
//  ESCALA · token do link "vou / não vou poder"
//
//  Pedido do Matheus (14/08/2026): a mensagem de escala tem que chegar no
//  WhatsApp **com a opção da pessoa dizer que NÃO vai**, e a resposta tem que
//  atualizar a escala na hora.
//
//  ⚠️ O link é PESSOAL e assinado, do mesmo jeito que o do censo e o do
//  comprovante de inscrição: quem manda a mensagem já sabe para quem está
//  mandando, então não existe busca nem login no meio. A prova de identidade é
//  o token ter chegado no WhatsApp DELA.
//
//  ⚠️ Namespace próprio (`escala-resposta:`). Sem ele, um token do censo ou do
//  comprovante — que usam o MESMO segredo — seria aceito aqui, e quem tivesse
//  um comprovante de inscrição poderia derrubar a escala de outra pessoa.
//
//  ⚠️ Sem env NOVA de propósito: `ESCALA_TOKEN_SECRET` é override OPCIONAL e o
//  fallback é o `CRON_SECRET` (já obrigatório em produção). Sem NENHUM segredo
//  fica FAIL-CLOSED — não gera link e não aceita token; a mensagem sai sem o
//  link e a pessoa responde pelo app, nada quebra. NUNCA usar literal de
//  fallback (lição do MEM_QR_SALT).
//
//  ⚠️ O token dá UM poder só: ver e responder AQUELA escala. Não autentica no
//  sistema, não abre módulo, não serve para outra escala.
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

function segredo() {
  return process.env.ESCALA_TOKEN_SECRET || process.env.CRON_SECRET || null;
}

// 20 hex = 80 bits: inviável de forjar online e curto o bastante pro link caber
// numa mensagem de WhatsApp sem virar um monstro.
function assinar(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`escala-resposta:${idNorm}`).digest('hex').slice(0, 20);
}

/** UUID da escala → `<32 hex>.<20 hex>`, ou null sem segredo / id inválido. */
function gerarTokenEscala(scheduleId) {
  const sec = segredo();
  const idNorm = String(scheduleId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinar(idNorm, sec)}`;
}

/** Token → UUID da escala, ou null (formato, segredo ou assinatura inválidos). */
function verificarTokenEscala(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinar(m[1], sec);
  // Comprimentos iguais por construção (regex 20 + slice 20) — timingSafeEqual exige.
  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}

/** Link completo pra mensagem. `null` quando não há segredo (fail-closed). */
function montarLinkEscala(scheduleId, baseUrl) {
  const t = gerarTokenEscala(scheduleId);
  if (!t) return null;
  const base = String(baseUrl || process.env.FRONTEND_URL || 'https://cbrio.org').replace(/\/+$/, '');
  return `${base}/e/${t}`;
}

module.exports = { gerarTokenEscala, verificarTokenEscala, montarLinkEscala };
