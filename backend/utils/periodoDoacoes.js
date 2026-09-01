// ============================================================================
// GENEROSIDADE · a régua do período do ranking de contribuintes (2026-08-26)
//
// Pedido do Matheus: "quero conseguir saber os 30 top doadores de janeiro até
// agora. coloque um filtro de período". Antes só havia 3 presets (12 meses,
// todo período, um mês) e o teto era fixo em 20.
//
// ⚠️ Régua PURA em `backend/utils/` de propósito — entra no gate (`npm test`).
// Quem lê o banco é `routes/financeiro.js`.
// ============================================================================

const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Teto de linhas do ranking. 20 continua o padrão; 100 é o máximo aceito. */
const LIMITE_PADRAO = 20;
const LIMITE_MAX = 100;

/** Hoje no fuso da igreja. `agora` só existe para teste. */
function hojeBRT(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

/** Dia seguinte a 'YYYY-MM-DD' — o `ate` das consultas é EXCLUSIVO (`lt`). */
function diaSeguinte(dia) {
  if (!RE_DIA.test(String(dia || ''))) return null;
  const [a, m, d] = String(dia).split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

/**
 * Resolve o período do ranking.
 *
 * Formas aceitas em `periodo`:
 *   '12m'                    · últimos 12 meses (padrão)
 *   'tudo'                   · sem corte
 *   'AAAA-MM'                · um mês
 *   'ano'                    · 1º de janeiro do ano corrente até HOJE
 *   'AAAA-MM-DD:AAAA-MM-DD'  · intervalo escolhido, com as duas pontas INCLUSAS
 *
 * ⚠️ O `ate` devolvido é EXCLUSIVO porque a consulta usa `.lt('data', ate)` —
 * é o contrato que já existia para o modo mês. Passar o próprio dia final aqui
 * perderia silenciosamente as doações do último dia do intervalo.
 *
 * ⚠️ Intervalo invertido (fim antes do início) é CORRIGIDO trocando as pontas,
 * não recusado: o seletor de data deixa a pessoa escolher em qualquer ordem, e
 * devolver "erro" para algo que se resolve sozinho é atrito sem ganho.
 */
function parsePeriodoDoacoes(periodo, agora = new Date()) {
  const p = String(periodo || '');

  const faixa = p.split(':');
  if (faixa.length === 2 && RE_DIA.test(faixa[0]) && RE_DIA.test(faixa[1])) {
    const [ini, fim] = faixa[0] <= faixa[1] ? faixa : [faixa[1], faixa[0]];
    return { periodo: `${ini}:${fim}`, desde: ini, ate: diaSeguinte(fim), rotulo: 'intervalo' };
  }

  if (p === 'ano') {
    const hoje = hojeBRT(agora);
    return {
      periodo: 'ano', desde: `${hoje.slice(0, 4)}-01-01`,
      ate: diaSeguinte(hoje), rotulo: 'ano',
    };
  }

  if (RE_MES.test(p)) {
    const [ano, mes] = p.split('-').map(Number);
    return {
      periodo: p, desde: `${p}-01`,
      ate: new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
      rotulo: 'mes',
    };
  }

  if (p === 'tudo') return { periodo: 'tudo', desde: null, ate: null, rotulo: 'tudo' };

  const corte = new Date(agora);
  corte.setUTCFullYear(corte.getUTCFullYear() - 1);
  return { periodo: '12m', desde: corte.toISOString().slice(0, 10), ate: null, rotulo: '12m' };
}

/** Quantas linhas o ranking devolve. Lixo cai no padrão, nunca em NaN. */
function parseLimite(limite) {
  const n = parseInt(String(limite ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return LIMITE_PADRAO;
  return Math.min(n, LIMITE_MAX);
}

/**
 * ⚠️⚠️ A COBERTURA NOMINAL do período — o que impede o ranking de mentir.
 *
 * `vw_doacoes_unificada` tem a doação de julho e agosto de 2026, mas com
 * `membro_id` NULO nas duas: o dinheiro está lançado e a identificação nominal
 * parou em junho. Um "top 30 de janeiro até agora" somaria só até junho e
 * pareceria completo.
 *
 * Devolve o intervalo pedido, o último dia com doação NOMINAL dentro dele, e
 * `incompleto: true` quando o pedido vai além desse último dia. A tela declara.
 */
function coberturaNominal({ desde, ate, ultimoDiaNominal }) {
  const fimPedido = ate ? previousDay(ate) : null;
  const ultimo = RE_DIA.test(String(ultimoDiaNominal || '')) ? String(ultimoDiaNominal) : null;
  if (!ultimo) return { ultimo_dia_nominal: null, incompleto: false, fim_pedido: fimPedido };
  const incompleto = !!(fimPedido && fimPedido > ultimo) || (!fimPedido && !!ultimo);
  return { ultimo_dia_nominal: ultimo, incompleto, fim_pedido: fimPedido };
}

function previousDay(dia) {
  if (!RE_DIA.test(String(dia || ''))) return null;
  const [a, m, d] = String(dia).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

module.exports = {
  LIMITE_PADRAO, LIMITE_MAX,
  hojeBRT, diaSeguinte, previousDay,
  parsePeriodoDoacoes, parseLimite, coberturaNominal,
};
