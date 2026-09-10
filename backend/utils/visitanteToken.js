// ════════════════════════════════════════════════════════════════════════════
//  VISITANTES · token do link da pesquisa de satisfação (09/09/2026)
//
//  O link que vai no WhatsApp identifica A VISITA (não a pesquisa), então a
//  resposta sabe quem respondeu — é o que o `nps_pesquisas.link_publico_token`
//  não dá (um token por PESQUISA, todo mundo recebe o mesmo link).
//
//  ⚠️ NAMESPACE PRÓPRIO (`visitante-pesquisa:`). O segredo é compartilhado com
//  o token do censo, da escala, da decisão e do comprovante — sem namespace um
//  token de outro fluxo seria aceito aqui (lição do censoToken).
//  ⚠️ FAIL-CLOSED sem segredo: não gera link e não aceita token.
//  ⚠️ O poder do token é UM só: responder a pesquisa DAQUELA visita. Não
//  autentica, não lê lista, não altera voucher.
//  ⚠️ Sem expiração no token: a validade quem decide é a rota (a resposta só
//  vale uma vez, e a pesquisa só é enviada dentro de 72h).
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

function segredo() {
  return process.env.VISITANTE_TOKEN_SECRET || process.env.CRON_SECRET || null;
}

function assinar(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`visitante-pesquisa:${idNorm}`).digest('hex').slice(0, 20);
}

/** UUID da visita → `<32 hex>.<20 hex>`, ou null sem segredo / id inválido. */
function gerarTokenPesquisa(visitaId) {
  const sec = segredo();
  const idNorm = String(visitaId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinar(idNorm, sec)}`;
}

/** Token → UUID da visita, ou null (formato, segredo ou assinatura inválidos). */
function verificarTokenPesquisa(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinar(m[1], sec);
  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}

/** Link da pesquisa daquela visita. `null` quando não há segredo (fail-closed). */
function montarLinkPesquisa(visitaId, baseUrl) {
  const t = gerarTokenPesquisa(visitaId);
  if (!t) return null;
  const base = String(baseUrl || process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'https://www.cbrio.org').replace(/\/+$/, '');
  return `${base}/visitante/avaliar/${t}`;
}

module.exports = { gerarTokenPesquisa, verificarTokenPesquisa, montarLinkPesquisa };
