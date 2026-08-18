/**
 * O próximo cursor de um percurso em lotes.
 *
 * ⚠️ Existe por causa de um bug real (18/08/2026): a rota `/vincular-membros`
 * paginava por DESLOCAMENTO num conjunto que ela mesma encolhia — quem ganhava
 * `membresia_id` saía do filtro `membresia_id is null`. O offset marchava de 40
 * em 40 sobre uma lista que diminuía, passava do fim, e o PostgREST respondia
 * "Requested range not satisfiable". Parou com 188 de 279 aplicados.
 *
 * ⚠️ Voltar ao offset 0 a cada lote também não resolve: os que NÃO são ligados
 * (conflito, sem correspondência) permanecem no conjunto, e a rodada nunca
 * terminaria. Só a chave é imune às duas coisas.
 *
 * ⚠️ O cursor sai da PÁGINA CRUA, antes de qualquer filtro de aplicação. Se o
 * último item da página for descartado (conta de sistema, por exemplo) e o
 * cursor viesse da lista filtrada, o percurso voltaria pra trás e repetiria a
 * mesma página pra sempre.
 */
function proximoCursor(paginaCrua, tamanho, chave = 'id') {
  const linhas = Array.isArray(paginaCrua) ? paginaCrua : [];
  // Página incompleta = acabou. Testar o TAMANHO e não "veio algo" é o que
  // distingue "último lote" de "ainda tem mais".
  if (!linhas.length || linhas.length < tamanho) return null;
  const ultimo = linhas[linhas.length - 1];
  return ultimo && ultimo[chave] != null ? ultimo[chave] : null;
}

module.exports = { proximoCursor };
