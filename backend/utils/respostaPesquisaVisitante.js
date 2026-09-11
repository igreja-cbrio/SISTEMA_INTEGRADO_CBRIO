// ════════════════════════════════════════════════════════════════════════════
//  VISITANTES · a resposta da pesquisa chega PELO PRÓPRIO WHATSAPP (10/09/2026)
//
//  Decisão do Marcos: "não gostaria que a pessoa clicasse em um link". O
//  template sai com botões de resposta rápida; a pessoa toca e a nota é
//  gravada. Se ela responder com texto em seguida, vira o COMENTÁRIO.
//
//  Esta régua é PURA (no gate · test:visitante): só interpreta o que a pessoa
//  mandou. Quem lê o banco e grava é services/visitantePesquisaResposta.js.
//
//  ⚠️⚠️ O TEMPLATE APROVADO NA META (11/09/2026) tem TRÊS botões, e o texto
//  deles NÃO começa por dígito — o Marcos escreveu em linguagem de gente:
//    "Amei o culto, me senti em casa" · "Eu gostei, o culto foi bom" ·
//    "Não gostei, poderia ser melhor"
//  Por isso a régua casa por TEXTO (mapa BOTOES_TEXTO) ANTES de procurar
//  dígito. Sem isso a pessoa toca no botão e a nota NÃO é gravada — falha
//  silenciosa, porque o webhook responde 200 e ninguém percebe.
//  ⚠️ Mudou o rótulo na Meta? Muda aqui também. Este mapa é a ÚNICA coisa que
//  liga aquele botão a uma nota.
// ════════════════════════════════════════════════════════════════════════════

/** Rótulos dos 5 botões da escala numérica (fallback · ≤ 25 chars cada). */
const BOTOES_NOTA = ['1 · Ruim', '2 · Fraco', '3 · Ok', '4 · Bom', '5 · Excelente'];

/**
 * Os TRÊS botões do template vivo, em texto → nota de 1 a 5.
 *
 * ⚠️ A escala é 5 · 4 · 2, não 5 · 3 · 1. "Eu gostei, o culto foi bom" é
 * elogio, não neutro — jogá-lo em 3 puxaria a média pra baixo e faria a igreja
 * ler como morno o que a pessoa disse que foi bom. E "não gostei, poderia ser
 * melhor" é reclamação moderada; 1 fica pra quem escrever algo pior no
 * comentário ou responder pela página de carinhas.
 * ⚠️ NÃO existe 3 neste template. Quem ler a média precisa saber disso: com
 * três opções o que informa é a DISTRIBUIÇÃO, não a média.
 */
const BOTOES_TEXTO = [
  { nota: 5, texto: 'amei o culto, me senti em casa' },
  { nota: 4, texto: 'eu gostei, o culto foi bom' },
  { nota: 2, texto: 'não gostei, poderia ser melhor' },
];

function _norm(v) {
  return String(v || '').trim().toLowerCase();
}

function _semAcento(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
  // 1º: os botões do template vivo, casados por TEXTO. Sem acento dos dois
  // lados — o que chega é o rótulo aprovado, mas acento e caixa não podem ser
  // o que decide se a nota entra.
  const alvo = _semAcento(t);
  for (const b of BOTOES_TEXTO) {
    if (_semAcento(b.texto) === alvo) return b.nota;
  }
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

/**
 * O que dizer de volta depois da nota (a janela de 24h está aberta · texto grátis).
 *
 * ⚠️ NÃO citar o número da nota. Quem responde pelo template vivo toca em
 * "Amei o culto, me senti em casa" e nunca viu número nenhum — devolver
 * "obrigado pela nota 5" faria a pessoa achar que respondeu outra coisa. O
 * número é linguagem NOSSA, de relatório; o que ela mandou foi uma frase.
 */
function textoObrigado(primeiroNome, nota) {
  const nome = String(primeiroNome || '').trim() || 'obrigado';
  if (nota >= 4) {
    return `Que bom, ${nome}! 💚 Obrigado por responder. Se quiser contar o que mais gostou (ou o que a gente pode melhorar), é só responder esta mensagem.`;
  }
  return `Obrigado pela sinceridade, ${nome} 🙏 Sua resposta nos ajuda a melhorar. Se puder contar o que faltou, é só responder esta mensagem — a gente lê tudo.`;
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
  BOTOES_NOTA, BOTOES_TEXTO, interpretarNotaVisitante, ehComentario, textoObrigado, interpretarRespostaFlowVisitante,
};
