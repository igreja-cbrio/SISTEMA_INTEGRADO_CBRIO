// Máquina de estados da cobrança.
//
// Existe em DUAS camadas de propósito: aqui (primeira barreira, com motivo
// legível pra log/telemetria) e no trigger `fn_pag_cobrancas_transicao`
// (autoridade final, pega escrita direta por SQL/script/backfill). As duas
// listas de transição têm que espelhar uma à outra — a fonte é `tipos.js`.
//
// ⚠️ Transição inválida NÃO é exceção. Um handler de webhook que lança vira
// retry infinito no PSP: ele reentrega, a gente lança de novo, e o ciclo não
// fecha. O contrato aqui é "diga se pode e por quê"; quem chama decide (o
// caminho normal é ignorar e registrar).

const { STATUS, STATUS_ABERTOS, STATUS_TERMINAIS, STATUS_COM_DINHEIRO, TRANSICOES } = require('./tipos');

/**
 * Pode sair de `atual` pra `novo`?
 *
 * @param {string} atual
 * @param {string} novo
 * @returns {{ok: boolean, motivo?: string, noop?: boolean}}
 *   `ok:true, noop:true`  → mesmo estado (idempotência: reentrega do PSP).
 *   `ok:false, motivo`    → regressão/estado desconhecido. NÃO lançar.
 */
function aplicarTransicao(atual, novo) {
  if (!atual || !novo) {
    return { ok: false, motivo: 'status ausente' };
  }
  if (atual === novo) {
    // Reentrega do mesmo evento. Não é erro — é o caso comum.
    return { ok: true, noop: true };
  }
  const permitidas = TRANSICOES[atual];
  if (!permitidas) {
    return { ok: false, motivo: `status atual desconhecido: ${atual}` };
  }
  if (!TRANSICOES[novo]) {
    return { ok: false, motivo: `status destino desconhecido: ${novo}` };
  }
  if (!permitidas.includes(novo)) {
    return { ok: false, motivo: `transicao nao permitida: ${atual} -> ${novo}` };
  }
  return { ok: true };
}

/** Cobrança ainda pode mudar por ação do pagador/PSP (o cron consulta essas). */
function estaAberta(status) {
  return STATUS_ABERTOS.includes(status);
}

/** Estado final — nada reabre. Reabrir = cobrança nova. */
function estaTerminal(status) {
  return STATUS_TERMINAIS.includes(status);
}

/** Dinheiro entrou (total ou parcial). Não cobre estorno/chargeback. */
function temDinheiro(status) {
  return STATUS_COM_DINHEIRO.includes(status);
}

/**
 * A cobrança pode ser expirada pelo cron?
 *
 * ⚠️ NUNCA expirar quem já tem `valor_pago_centavos > 0`, mesmo que o prazo
 * tenha passado: o dinheiro entrou e a pessoa tem direito à vaga. Pagamento
 * fora do prazo é caso pra revisão humana, não pra expiração automática.
 */
function podeExpirar(cobranca) {
  if (!cobranca) return false;
  if (!estaAberta(cobranca.status)) return false;
  if (Number(cobranca.valor_pago_centavos || 0) > 0) return false;
  if (!cobranca.expira_em) return false;
  return new Date(cobranca.expira_em).getTime() <= Date.now();
}

/**
 * Status derivado de quanto foi efetivamente pago.
 *
 * Usado quando o PSP informa valor liquidado mas não um status que a gente
 * consiga mapear 1:1 (parcial é o caso típico). Tolerância de 1 centavo cobre
 * arredondamento de parcela — 12x de R$ 800 não fecha exato.
 */
function statusPorValor({ valor_centavos, valor_pago_centavos }) {
  const total = Number(valor_centavos || 0);
  const pago = Number(valor_pago_centavos || 0);
  if (pago <= 0) return null;
  if (pago >= total - 1) return STATUS.PAGO;
  return STATUS.PAGO_PARCIAL;
}

module.exports = {
  aplicarTransicao,
  estaAberta,
  estaTerminal,
  temDinheiro,
  podeExpirar,
  statusPorValor,
};
