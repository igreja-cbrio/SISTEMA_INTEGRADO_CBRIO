// ════════════════════════════════════════════════════════════════════════════
// Qual é "a semana anterior" no card de views do Online.
//
// ⚠️⚠️ SEMANA SEG→DOM, em BRT — a semana de FREQUÊNCIA da igreja, a mesma de
// `utils/isoWeek.js` que o Dashboard Semanal já usa.
// NÃO criar uma terceira definição de semana neste sistema: já existem DUAS e
// elas divergem de propósito (frequência seg→dom · financeira quarta→terça).
//
// ⚠️⚠️ `isoWeek.js` decide tudo em UTC (`getUTCDate`). Usá-lo direto com o
// agora faria a semana virar às **21h de domingo** — 3 horas cedo, bem na
// faixa do culto de domingo à noite. Por isso QUAL semana se decide com
// `hojeBRT`, e só então `isoWeekRange` (que só gera datas, não lê relógio).
//
// ⚠️ A janela de CONSOLIDAÇÃO é real, não conservadorismo: a Analytics API do
// YouTube leva até ~2 dias para finalizar o dia. Na segunda de manhã o número
// da semana fechada ainda sobe. O card MOSTRA o número (esconder vira tela
// muda) e DECLARA que está consolidando — um número que muda em silêncio
// depois de publicado é pior que um número com ressalva.
// ════════════════════════════════════════════════════════════════════════════
const { isoWeekRange, isoWeekOf } = require('./isoWeek');

/** Dias que o YouTube ainda ajusta depois do fato. */
const DIAS_CONSOLIDACAO = 2;

/** Dia de hoje no fuso da igreja (YYYY-MM-DD). Espelha `cultoJanela.hojeBRT`. */
function hojeBRT(agora = Date.now()) {
  return new Date(agora - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function ddmm(isoDia) {
  // ⚠️ Fatiar a string, nunca `new Date(iso).getDate()`: a string sem horário
  // é meia-noite UTC, que no Rio é 21h do dia ANTERIOR — o rótulo mostraria
  // o dia errado.
  const [, m, d] = isoDia.split('-');
  return `${d}/${m}`;
}

/**
 * A semana SEG→DOM imediatamente anterior à de hoje (BRT).
 *
 * Devolve `{ inicio, fim, rotulo, ano, semana, consolidando, dias }`, tudo em
 * `YYYY-MM-DD`. `consolidando` diz que o YouTube ainda pode revisar o número.
 */
function semanaAnteriorBRT(agora = Date.now()) {
  const hoje = hojeBRT(agora);
  const hojeDate = new Date(`${hoje}T00:00:00Z`);

  // Recua 7 dias e pergunta de que semana ISO aquele dia é — assim a virada
  // de ano/semana fica com `isoWeekOf`, que já sabe a regra da quinta-feira.
  const naSemanaAnterior = new Date(hojeDate);
  naSemanaAnterior.setUTCDate(hojeDate.getUTCDate() - 7);
  const { ano, semana } = isoWeekOf(naSemanaAnterior);
  const { inicio, fim } = isoWeekRange(ano, semana);

  const inicioIso = iso(inicio);
  const fimIso = iso(fim);

  // Quantos dias se passaram desde o fim da semana. Domingo fecha às 23:59 de
  // domingo; na segunda `desde` = 1, na quarta = 3.
  const desde = Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${fimIso}T00:00:00Z`)) / 86400000);

  return {
    ano,
    semana,
    inicio: inicioIso,
    fim: fimIso,
    rotulo: `${ddmm(inicioIso)} a ${ddmm(fimIso)}`,
    consolidando: desde <= DIAS_CONSOLIDACAO,
    dias: 7,
  };
}

/**
 * Soma as views de um intervalo a partir das linhas de `online_canal_views_dia`.
 *
 * ⚠️⚠️ A COBERTURA vai junto do número, e não é enfeite: dia sem coleta some
 * da soma SEM AVISO, e aí ninguém distingue "a audiência caiu" de "o cron
 * falhou". Devolve `dias_com_dado` de 7 para a tela declarar.
 *
 * ⚠️ Lista vazia devolve `views: null`, NUNCA 0 — "não coletamos" e "ninguém
 * assistiu" levam a decisões opostas.
 */
function somarViews(linhas, inicio, fim) {
  const noIntervalo = (Array.isArray(linhas) ? linhas : []).filter((l) => {
    const d = typeof l?.data === 'string' ? l.data.slice(0, 10) : null;
    return d && d >= inicio && d <= fim;
  });

  if (noIntervalo.length === 0) {
    return { views: null, watch_minutos: null, dias_com_dado: 0 };
  }

  let views = 0;
  let watch = 0;
  let temWatch = false;
  for (const l of noIntervalo) {
    const v = Number(l.views);
    if (Number.isFinite(v)) views += v;
    const w = Number(l.watch_minutos);
    if (Number.isFinite(w)) { watch += w; temWatch = true; }
  }

  return {
    views,
    watch_minutos: temWatch ? watch : null,
    dias_com_dado: noIntervalo.length,
  };
}

module.exports = { DIAS_CONSOLIDACAO, hojeBRT, semanaAnteriorBRT, somarViews };
