// ============================================================================
// ESPELHO de backend/utils/acessibilidadeBatismo.js — o campo "qual limitação?"
// da inscrição de batismo · 2026-08-20
//
// ⚠️⚠️ ESTE ARQUIVO E O DO BACKEND DECIDEM A MESMA COISA E TÊM QUE CONCORDAR.
// `src/test/acessibilidadeBatismo.test.ts` roda a MESMA tabela de casos nos
// dois lados e falha quando eles divergem. Mudou aqui? Muda lá.
//
// ⚠️ O caso que a régua existe para pegar: quem escolhe "Sim", escreve a
// limitação e depois volta para "Não". Sem a régua, o texto continuava no
// formulário e o servidor MARCAVA deficiência em quem acabara de dizer que não
// tem. A resposta manda, não o resíduo de digitação.
// ============================================================================

export const DESC_MAX = 500; // mesmo teto da coluna

/** A pessoa respondeu "Sim" à pergunta de limitação? (tolera espaço/caixa) */
export function disseSim(resposta) {
  return /^sim$/i.test(String(resposta == null ? '' : resposta).trim());
}

/**
 * Régua única: o que a tela mostra e o que o servidor grava.
 * `pedeDescricao` = a tela mostra e EXIGE o campo "qual?".
 */
export function acessibilidadeBatismo(bruto = {}) {
  const b = bruto || {};
  const sim = disseSim(b.limitacao_mobilidade);
  const marcado = b.possui_deficiencia === true;
  const afirmou = sim || marcado;

  const escrito = afirmou
    ? String(b.deficiencia_descricao == null ? '' : b.deficiencia_descricao).trim()
    : '';

  // ⚠️ `possui` É `afirmou`, e não `afirmou || !!escrito` como o servidor fazia:
  // o texto só é lido DEPOIS da afirmação, então ele nunca pode marcar sozinho.
  // A versão com o `||` passava num teste-mutante porque era código morto.
  if (!afirmou) return { possui: false, pedeDescricao: false, descricao: null };

  const descricao = escrito ? escrito.slice(0, DESC_MAX) : (sim ? 'Limitação de mobilidade' : null);
  return { possui: true, pedeDescricao: true, descricao };
}
