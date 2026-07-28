// ============================================================================
// Comprovante de inscrição (SPEC-06 · check-in QR) — token ASSINADO, sem
// migration: HMAC-SHA256 do id da inscrição com segredo do servidor. O QR da
// tela de sucesso codifica a URL pública /i/c/<token>; a tela de check-in lê
// o QR e troca o token pelo id com verificação de assinatura (forjar ou
// enumerar exige o segredo).
//
// ⚠️ Sem env NOVA de propósito (env obrigatória nova = merge blocker):
// INSC_QR_SECRET é override OPCIONAL; o fallback é o CRON_SECRET, que já é
// obrigatório em produção. Sem NENHUM segredo fica fail-closed — não gera
// token nem aceita QR (o check-in por busca de nome continua funcionando).
// NUNCA usar literal de fallback (lição do MEM_QR_SALT na auditoria).
// Trocar o segredo invalida os QRs já emitidos — a pessoa entra pela busca,
// nada quebra.
// ============================================================================
const crypto = require('crypto');

function segredo() {
  return process.env.INSC_QR_SECRET || process.env.CRON_SECRET || null;
}

// 20 hex = 80 bits de assinatura — inviável de forjar online e curto o
// suficiente pro QR ficar denso de menos (URL inteira ~70 chars).
function assinar(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`insc-comprovante:${idNorm}`).digest('hex').slice(0, 20);
}

/** UUID da inscrição → token `<32 hex do id>.<20 hex de assinatura>` (ou null sem segredo). */
function gerarTokenComprovante(inscricaoId) {
  const sec = segredo();
  const idNorm = String(inscricaoId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinar(idNorm, sec)}`;
}

/** Token → UUID da inscrição, ou null (formato ou assinatura inválida). */
function verificarTokenComprovante(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinar(m[1], sec);
  // Comprimentos iguais por construção (regex 20 + slice 20) — timingSafeEqual exige.
  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}

/**
 * O leitor aceita o QR como sair da câmera: a URL completa (/i/c/<token>) ou
 * o token cru — quem decide é sempre a assinatura, nunca o formato.
 */
function extrairToken(texto) {
  const s = String(texto || '').trim();
  const m = /\/i\/c\/([0-9a-f]{32}\.[0-9a-f]{20})/i.exec(s);
  return (m ? m[1] : s).toLowerCase();
}

module.exports = { gerarTokenComprovante, verificarTokenComprovante, extrairToken };
