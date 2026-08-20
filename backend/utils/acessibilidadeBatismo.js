// ============================================================================
// ACESSIBILIDADE NA INSCRIÇÃO DE BATISMO — 2026-08-20
//
// Pedido do Matheus: *"se a pessoa falar que tem deficiência, preciso que
// apareça um campo para ela especificar, para a equipe de batismo ficar ciente
// de qual tipo de limitação a pessoa tem."*
//
// O formulário público só perguntava Sim/Não. Quem respondia "Sim" virava
// `deficiencia_descricao = 'Limitação de mobilidade'` — uma frase que repete a
// pergunta e não diz nada à equipe. Cadeirante, surdez e autismo pedem preparos
// diferentes do batistério, e os três chegavam com o mesmo texto.
//
// ⚠️⚠️ A LEI DESTE ARQUIVO: **a MESMA régua decide na tela e no servidor.**
// O espelho vive em `src/lib/acessibilidadeBatismo.js` e
// `src/test/acessibilidadeBatismo.test.ts` roda a mesma tabela de casos nos
// dois lados. Divergir dá um de dois estragos, os mesmos que o
// `camposCondicionais` já documenta: formulário INSUBMISSÍVEL (o servidor exige
// o que a tela não mostrou) ou dado GRAVADO de pergunta que a pessoa não viu.
//
// ⚠️ O SEGUNDO estrago é concreto aqui, e é por isso que a régua existe: quem
// escolhe "Sim", escreve a limitação e depois volta para "Não" deixava o texto
// no formulário. O servidor lia `possuiDef = ... || !!descReal` e MARCAVA
// deficiência em alguém que acabara de dizer que não tem. A régua descarta a
// descrição quando a resposta não é afirmativa — a resposta manda, não o
// resíduo de digitação.
// ============================================================================

const DESC_MAX = 500; // mesmo teto da coluna

/** A pessoa respondeu "Sim" à pergunta de limitação? (tolera espaço/caixa) */
function disseSim(resposta) {
  return /^sim$/i.test(String(resposta == null ? '' : resposta).trim());
}

/**
 * Régua única: o que a tela mostra e o que o servidor grava.
 *
 * @param {{ limitacao_mobilidade?: unknown, possui_deficiencia?: unknown,
 *           deficiencia_descricao?: unknown }} bruto o que o formulário mandou
 * @returns {{ possui: boolean, pedeDescricao: boolean, descricao: string|null }}
 *   `pedeDescricao` = a tela mostra e EXIGE o campo "qual?".
 *   `descricao` = o que vai para a coluna (null quando não há o que gravar).
 */
function acessibilidadeBatismo(bruto = {}) {
  const b = bruto || {};
  const sim = disseSim(b.limitacao_mobilidade);
  const marcado = b.possui_deficiencia === true;
  const afirmou = sim || marcado;

  // ⚠️ A descrição só CONTA depois da afirmação. Ver o aviso do cabeçalho.
  const escrito = afirmou
    ? String(b.deficiencia_descricao == null ? '' : b.deficiencia_descricao).trim()
    : '';

  // ⚠️ `possui` É `afirmou`, e não `afirmou || !!escrito` como o servidor fazia:
  // o texto só é lido DEPOIS da afirmação, então ele nunca pode marcar sozinho.
  // A versão com o `||` passava num teste-mutante porque era código morto.
  if (!afirmou) return { possui: false, pedeDescricao: false, descricao: null };

  // Sem texto, "Sim" ainda vale como aviso — a equipe pelo menos sabe que tem
  // algo a preparar. É o piso, não o alvo: a tela exige o texto.
  const descricao = escrito ? escrito.slice(0, DESC_MAX) : (sim ? 'Limitação de mobilidade' : null);
  return { possui: true, pedeDescricao: true, descricao };
}

module.exports = {
  DESC_MAX,
  disseSim,
  acessibilidadeBatismo,
};
