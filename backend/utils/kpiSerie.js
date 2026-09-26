// ════════════════════════════════════════════════════════════════════════════
//  A série mês a mês da ficha do KPI — e a divergência que ela revela.
//
//  Pedido do Matheus (23/09/2026): ao clicar no card do "% de voluntários que
//  fizeram check-in", ver a tabela `mês | escalas | com check-in | %`.
//
//  ⚠️⚠️ O QUE A TABELA DESCOBRIU, E POR QUE ESTE MÓDULO EXISTE. Há DOIS números
//  por mês, e eles não são o mesmo:
//
//    • o GRAVADO em `kpi_valores_calculados` — o que o card mostra, congelado
//      na última vez que o cron apurou aquele mês;
//    • o AO VIVO, recalculado da fonte agora.
//
//  Medido em 23/09/2026 no ONL-17: agosto está gravado como **24,14%** e ao
//  vivo é **60,66%** (37 de 61) — porque a Ariel lançou check-in retroativo
//  DEPOIS da apuração das 07:01. E maio está gravado como **32,58%** com a
//  verdade em **0%** (11 escalas, zero check-in): a reapuração não volta tanto.
//
//  ⇒ Mostrar só o ao vivo faria a tabela contradizer o card sem explicação.
//    Mostrar só o gravado esconderia o trabalho retroativo da Ariel. A ficha
//    mostra o ao vivo E marca onde o card está atrasado — que é justamente a
//    informação que ninguém tinha.
// ════════════════════════════════════════════════════════════════════════════

// Diferença a partir da qual os dois números contam como divergentes. O valor
// gravado tem 2 casas; qualquer coisa abaixo disso é arredondamento, não
// desatualização — marcar arredondamento como "atrasado" é ruído que ensina a
// ignorar o aviso.
const TOLERANCIA = 0.05;

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Casa a série recalculada com os valores gravados.
 *
 * @param partes    linhas de `kpi_serie_partes` — [{periodo, numerador, denominador, valor}]
 * @param gravados  linhas de `kpi_valores_calculados` — [{periodo_referencia, valor_calculado}]
 * @returns { tem_partes, linhas, divergencias }
 */
function montarSerie(partes, gravados, periodoAtual = null) {
  const porPeriodo = new Map();
  for (const g of Array.isArray(gravados) ? gravados : []) {
    const p = g && g.periodo_referencia;
    if (!p) continue;
    // ⚠️⚠️ PERÍODO FUTURO NÃO ENTRA NA TABELA. Medido em 23/09/2026 no ONL-11:
    // havia 14 registros de W39 a W52 — semanas que ainda não aconteceram —
    // todos com valor 0, inseridos de uma vez num backfill em 24/08. A ficha
    // pegava "os 12 mais recentes" e mostrava só esse lixo: doze linhas de 0%,
    // nenhuma delas real. Zero de semana futura não é resultado, é ausência.
    //
    // ⚠️ Comparação de texto funciona porque todo formato de período do sistema
    // (`YYYY-MM`, `YYYY-Wnn`, `YYYY-Qn`, `YYYY-Sn`, `YYYY`) é zero-padded, e aí
    // a ordem alfabética É a ordem cronológica. Um formato sem padding
    // quebraria isso em silêncio — por isso o teste cobre W09 × W10.
    if (periodoAtual && String(p) > String(periodoAtual)) continue;
    porPeriodo.set(String(p), numero(g.valor_calculado));
  }

  const vivas = (Array.isArray(partes) ? partes : [])
    .filter((l) => !periodoAtual || String(l.periodo) <= String(periodoAtual));

  // ⚠️ Sem ramo de partes para este `dado_tipo`, a ficha ainda mostra o
  // histórico gravado — só sem as colunas de numerador/denominador. É menos,
  // mas é verdade; inventar as partes seria pior que mostrar só o valor.
  if (vivas.length === 0) {
    const linhas = [...porPeriodo.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([periodo, valor]) => ({
        periodo, numerador: null, denominador: null, valor,
        valor_gravado: valor, divergente: false,
      }));
    return { tem_partes: false, linhas, divergencias: 0 };
  }

  let divergencias = 0;
  const linhas = vivas.map((l) => {
    const periodo = String(l.periodo);
    const valor = numero(l.valor);
    const gravado = porPeriodo.has(periodo) ? porPeriodo.get(periodo) : null;
    // Divergente só quando há OS DOIS números: mês ao vivo que o cron nunca
    // apurou não está "atrasado", está por apurar — e a ficha já diz isso pela
    // ausência do valor gravado.
    const divergente = valor !== null && gravado !== null
      && Math.abs(valor - gravado) > TOLERANCIA;
    if (divergente) divergencias += 1;
    return {
      periodo,
      numerador: numero(l.numerador),
      denominador: numero(l.denominador),
      valor,
      valor_gravado: gravado,
      divergente,
    };
  });

  return { tem_partes: true, linhas, divergencias };
}

module.exports = { TOLERANCIA, montarSerie };
