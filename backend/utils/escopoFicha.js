/**
 * Régua do ESCOPO da ficha da pessoa (`GET /membresia/membros/:id`).
 *
 * ⚠️⚠️ Existe como módulo PURO de propósito. A decisão "esta ficha mostra o
 * bloco financeiro?" nasceu dentro do handler, que lê banco — e guarda que vive
 * lá é guarda que nenhum mutante alcança. Foi a lição das 623 escalas religadas
 * errado: o que decide algo mora aqui e é testado aqui.
 *
 * Duas entradas, e elas NÃO se somam — se multiplicam:
 *   - `escopo`: o que a TELA pediu (`basico` = ficha reduzida)
 *   - `podeFinanceiro`: o que a PERMISSÃO do usuário permite
 *
 * O escopo só sabe ESTREITAR. Uma tela pedindo escopo amplo nunca destrava o
 * que a permissão negou; e uma permissão ampla não reabre o que a tela cortou.
 */

const ESCOPO_BASICO = 'basico';

/** `true` só para o literal exato — qualquer outra coisa é escopo completo. */
function isEscopoBasico(escopo) {
  return escopo === ESCOPO_BASICO;
}

/**
 * @param {{ escopo?: unknown, podeFinanceiro?: unknown, podeMarcadorSensivel?: unknown }} e
 * @returns {{ basico: boolean, mostrarFinanceiro: boolean, mostrarMarcadorSensivel: boolean }}
 */
function resolverEscopoFicha(e) {
  const entrada = e || {};
  const basico = isEscopoBasico(entrada.escopo);
  // ⚠️ FAIL-CLOSED: só o booleano `true` libera. `1`, `'sim'` e `undefined`
  // não liberam — permissão que se deixa convencer por valor truthy é buraco.
  const permiteFin = entrada.podeFinanceiro === true;
  const permiteMarc = entrada.podeMarcadorSensivel === true;
  return {
    basico,
    mostrarFinanceiro: !basico && permiteFin,
    mostrarMarcadorSensivel: !basico && permiteMarc,
  };
}

module.exports = { ESCOPO_BASICO, isEscopoBasico, resolverEscopoFicha };
