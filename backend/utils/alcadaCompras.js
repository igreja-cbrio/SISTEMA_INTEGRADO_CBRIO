/**
 * Alçada de compras · régua PURA
 *
 * Responde UMA pergunta: "esta compra pode ser aprovada pelo responsável da
 * área que a atende, sem passar pelo portão financeiro?"
 *
 * Vive em `utils/` (sem Supabase) pra entrar no gate de deploy — quem lê o
 * banco é `routes/solicitacoes.js`. NÃO duplicar a régua lá.
 *
 * ⚠️ O valor que decide é o `valor_cotado` (a COTAÇÃO), nunca o
 * `valor_estimado` que o solicitante digitou. Motivo medido em 2026-08-12: das
 * 19 compras paradas em `em_cotacao`, 6 não tinham estimativa nenhuma e as
 * demais são chute do solicitante. O próprio `registrar-cotacao` sobrescreve
 * `valor_estimado` com a cotação justamente porque "alcada/relatorios usam o
 * valor real".
 *
 * ⚠️ Só `compras`. `servico` (contratação externa) fica FORA de propósito:
 * o pedido do Marcos foi sobre compra, e contratar terceiro tem contrato/nota
 * de serviço no caminho. Ampliar é decisão de gente, não inferência.
 */

// Teto padrão quando a área não tem linha própria em `area_alcadas`.
const LIMITE_ALCADA_PADRAO = 1000;

// Categorias que a alçada cobre. Ampliar exige decisão explícita.
const CATEGORIAS_ALCADA = new Set(['compras']);

/**
 * A cotação foi registrada de verdade? (espelha `cotacaoObrigatoriaRegistrada`
 * do handler, mas aqui é condição de ELEGIBILIDADE, não só de aprovação.)
 */
function temCotacaoRegistrada(sol) {
  // ⚠️ `Number(null)` é 0 (finito!), então checar só `Number.isFinite` deixaria
  // passar `valor_cotado: null` como se fosse uma cotação de R$ 0 — ou seja,
  // sempre dentro do teto. O teste desta função pegou exatamente isso.
  const bruto = sol?.valor_cotado;
  if (bruto === null || bruto === undefined || bruto === '') return false;
  const valor = Number(bruto);
  return !!sol?.cotacao_em && Number.isFinite(valor) && valor >= 0;
}

/**
 * @param {object} sol linha de `solicitacoes`
 * @param {number} limite teto em reais (default 1000)
 * @returns {{ ok: boolean, motivo: string|null, valor: number|null, limite: number }}
 */
function elegivelAlcada(sol, limite = LIMITE_ALCADA_PADRAO) {
  const teto = Number.isFinite(Number(limite)) ? Number(limite) : LIMITE_ALCADA_PADRAO;
  const base = { ok: false, motivo: null, valor: null, limite: teto };

  if (!sol || typeof sol !== 'object') return { ...base, motivo: 'sem_solicitacao' };
  if (sol.deleted_at) return { ...base, motivo: 'excluida' };
  if (!CATEGORIAS_ALCADA.has(sol.categoria)) return { ...base, motivo: 'categoria_fora' };

  // Só vale no exato momento do portão financeiro. Antes disso (em_cotacao) a
  // compra ainda não tem valor decidido; depois, já foi aprovada por alguém.
  const aguardando = sol.status === 'aguardando_aprovacao_financeira'
    && sol.precisa_aprovacao_financeira === true
    && !sol.aprovado_financeiro_em;
  if (!aguardando) return { ...base, motivo: 'nao_aguardando_financeiro' };

  if (!temCotacaoRegistrada(sol)) return { ...base, motivo: 'sem_cotacao' };

  const valor = Number(sol.valor_cotado);
  if (valor > teto) return { ...base, motivo: 'acima_do_limite', valor };

  return { ok: true, motivo: null, valor, limite: teto };
}

module.exports = {
  LIMITE_ALCADA_PADRAO,
  CATEGORIAS_ALCADA,
  elegivelAlcada,
  temCotacaoRegistrada,
};
