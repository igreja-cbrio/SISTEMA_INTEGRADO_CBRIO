// ════════════════════════════════════════════════════════════════════════════
//  VISITANTES · a resposta da pesquisa chega PELO PRÓPRIO WHATSAPP (10/09/2026)
//
//  Decisão do Marcos: "não gostaria que a pessoa clicasse em um link". O
//  template sai com CINCO botões de resposta rápida (1 a 5); a pessoa toca e a
//  nota é gravada. Se ela responder com texto em seguida, vira o COMENTÁRIO.
//
//  Esta régua é PURA (no gate · test:visitante): só interpreta o que a pessoa
//  mandou. Quem lê o banco e grava é services/visitantePesquisaResposta.js.
//
//  ⚠️ O texto do botão é o que chega em `m.button.text` — se mudarem os
//  rótulos na Meta, o DÍGITO inicial tem que continuar lá ("1 · Ruim").
// ════════════════════════════════════════════════════════════════════════════

/** Rótulos dos 5 botões do template (≤ 25 chars cada · exigência da Meta). */
const BOTOES_NOTA = ['1 · Ruim', '2 · Fraco', '3 · Ok', '4 · Bom', '5 · Excelente'];

function _norm(v) {
  return String(v || '').trim().toLowerCase();
}

/**
 * Nota 1..5 a partir do que a pessoa mandou, ou null.
 *  · botão do template: "5 · Excelente", "5", "5 estrelas", "⭐⭐⭐⭐⭐";
 *  · texto: SÓ quando a mensagem INTEIRA é a nota ("4", "4.", "nota 4") —
 *    "cheguei 5 minutos atrasado" não é nota.
 */
function interpretarNotaVisitante(bruto) {
  const t = _norm(bruto);
  if (!t) return null;
  // estrelas: conta os ⭐ (ou ★) quando a mensagem é só isso
  const estrelas = (t.match(/[⭐★]/gu) || []).length;
  if (estrelas && t.replace(/[⭐★\s]/gu, '') === '') return estrelas >= 1 && estrelas <= 5 ? estrelas : null;
  // "5", "5.", "5)", "nota 5", "5 · excelente", "5 - bom", "5 estrelas"
  const m = /^(?:nota\s*)?([1-5])(?:\s*[.)·\-–:]\s*[a-záéíóúãõâêôç ]{0,20}|\s*estrelas?)?$/u.exec(t);
  return m ? Number(m[1]) : null;
}

/** Texto que serve como COMENTÁRIO: tem letras, não é só a nota, não é vazio. */
function ehComentario(bruto) {
  const t = String(bruto || '').trim();
  if (t.length < 2) return false;
  if (interpretarNotaVisitante(t) != null) return false;
  return /[a-záéíóúãõâêôç]/iu.test(t);
}

/** O que dizer de volta depois da nota (a janela de 24h está aberta · texto grátis). */
function textoObrigado(primeiroNome, nota) {
  const nome = String(primeiroNome || '').trim() || 'obrigado';
  if (nota >= 4) {
    return `Que bom, ${nome}! 💚 Obrigado pela nota ${nota}. Se quiser contar o que mais gostou (ou o que a gente pode melhorar), é só responder esta mensagem.`;
  }
  return `Obrigado pela sinceridade, ${nome} 🙏 Sua nota ${nota} nos ajuda a melhorar. Se puder contar o que faltou, é só responder esta mensagem — a gente lê tudo.`;
}

/**
 * A resposta do FORMULÁRIO (WhatsApp Flow · botão "Avaliar minha visita" do
 * template · backend/whatsapp-flows/visitante-avaliacao.json). O `response_json`
 * do `nfm_reply` chega como STRING com `{ nota: "1".."5", comentario?, flow_token }`.
 * Devolve `{ nota, comentario }` ou null quando não é a nossa resposta.
 *
 * ⚠️ Aceita objeto OU string (o webhook entrega string; o teste passa objeto).
 * ⚠️ `nota` fora de 1..5 (ou ausente) ⇒ null — o Flow exige a nota, então
 *    resposta sem nota não é deste formulário.
 */
function interpretarRespostaFlowVisitante(responseJson) {
  let obj = responseJson;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const n = Number(obj.nota);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  const c = String(obj.comentario ?? '').trim().slice(0, 1000);
  return { nota: n, comentario: c || null };
}

module.exports = {
  BOTOES_NOTA, interpretarNotaVisitante, ehComentario, textoObrigado, interpretarRespostaFlowVisitante,
};
