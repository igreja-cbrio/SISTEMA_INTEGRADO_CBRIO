'use strict';

// Régua ÚNICA de "esta pessoa pode vincular um pedido do Mercado Livre a esta
// solicitação?" e "esta solicitação aceita vínculo?".
//
// ⚠️⚠️ POR QUE UMA RÉGUA SÓ: a tela nova lista as solicitações candidatas e o
// POST /:id/vincular-ml decide se aceita. Se a LISTA e a DECISÃO divergirem, o
// usuário escolhe uma opção que o servidor recusa com 403 — o pior tipo de erro
// de permissão, porque a própria tela ofereceu. Extraída do handler original
// (19/08/2026) sem afrouxar nada: os mesmos quatro caminhos, na mesma ordem.

// Estados em que a solicitação já está encerrada — não faz sentido pendurar um
// pedido novo nela. ⚠️ Derivados do CHECK vivo de `solicitacoes.status`
// (conferido no catálogo), não decorados.
const STATUS_ENCERRADOS = Object.freeze([
  'concluido', 'rejeitado', 'cancelado', 'avaliado',
]);

/**
 * A solicitação está num estado que aceita vínculo?
 * ⚠️ `ml_order_id` preenchido NÃO bloqueia aqui de propósito: trocar o pedido
 * vinculado é caso real (vinculou o errado). Quem decide é a tela, que mostra o
 * pedido atual e pede confirmação — não uma recusa seca do servidor.
 */
function aceitaVinculo(sol) {
  if (!sol) return false;
  if (sol.deleted_at) return false;
  if (sol.categoria !== 'compras') return false;
  return !STATUS_ENCERRADOS.includes(sol.status);
}

/**
 * Espelho EXATO da permissão do POST /:id/vincular-ml.
 *
 * @param {object} sol solicitação (solicitante_id, responsavel_id, area_responsavel)
 * @param {object} ator { userId, role, areasResponsavel: string[] }
 */
function podeVincular(sol, ator) {
  if (!sol || !ator?.userId) return false;
  if (['admin', 'diretor'].includes(ator.role)) return true;
  if (sol.solicitante_id === ator.userId) return true;
  if (sol.responsavel_id === ator.userId) return true;
  // Responsável pela ÁREA que atende a solicitação.
  if (!sol.area_responsavel) return false;
  const areas = Array.isArray(ator.areasResponsavel) ? ator.areasResponsavel : [];
  return areas.includes(sol.area_responsavel);
}

/** Candidatas que ESTE ator pode vincular. Combina as duas réguas acima. */
function candidatas(solicitacoes, ator) {
  return (Array.isArray(solicitacoes) ? solicitacoes : [])
    .filter((s) => aceitaVinculo(s) && podeVincular(s, ator));
}

module.exports = { aceitaVinculo, podeVincular, candidatas, STATUS_ENCERRADOS };
