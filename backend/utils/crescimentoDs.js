// ════════════════════════════════════════════════════════════════════════════
//  ONL-11 · "% crescimento da frequência em relação a semana anterior", pelo DS
//
//  Pedido do Matheus (23/09/2026): *"esse aqui eu gostaria que fosse o valor do
//  DS. entao quero que use os numeros do DS para medir esse kpi"*. Escolha dele
//  entre as três que ofereci: **o card guarda o crescimento %, e a ficha abre em
//  partes** (DS da semana, semana anterior, %).
//
//  ⚠️⚠️ O QUE O KPI MEDIA ANTES, e por que o número parecia absurdo. O collector
//  `cultos.online_freq` soma `cultos.online_pico` — espectadores SIMULTÂNEOS.
//  O card mostrava "1032" contra uma meta de "30", porque guardava audiência
//  absoluta num indicador cujo nome promete percentual. Medido em 23/09:
//  W35 1.146 · W36 1.262 · W37 1.400 · W38 1.032.
//
//  ⚠️ DS não é pico e não é view acumulada. São TRÊS grandezas distintas
//  (ver `dsOnline.js`): `online_pico` = simultâneos; `online_views_live` =
//  acumulado até o fim da live; `online_ds` = views DEPOIS que a live acabou.
//
//  ⚠️⚠️ A GUARDA QUE JUSTIFICA ESTE MÓDULO EXISTIR SOZINHO: semana sem NENHUM
//  culto com DS preenchido vale **sem dado**, nunca zero. O DS é lido na manhã
//  seguinte ao culto, então a semana corrente passa horas legitimamente vazia —
//  e somar zero ali produziria "−100% de crescimento", que é mentira com cara
//  de alarme. Foi exatamente esse zero que encheu o ONL-11 de "0%" (W39..W52).
//
//  ⚠️ Esta régua vive em `utils/` de propósito. Guarda que decide algo e mora no
//  serviço que lê o banco é guarda que nenhum mutante alcança — já custou 623
//  escalas religadas errado.
// ════════════════════════════════════════════════════════════════════════════

/** Número finito ou null. Texto do Postgres (`"4638"`) entra normalmente. */
function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Soma o DS de uma lista de cultos.
 *
 * ⚠️ Devolve `total: null` quando NENHUM culto tem DS — não 0. A diferença
 * entre "somou zero" e "não há o que somar" é a diferença entre um indicador
 * honesto e um −100% inventado.
 *
 * @param cultos  [{ online_ds }]
 */
function somarDs(cultos) {
  const linhas = Array.isArray(cultos) ? cultos : [];
  let total = 0;
  let comDado = 0;
  for (const c of linhas) {
    const v = numero(c && c.online_ds);
    if (v === null) continue;
    total += v;
    comDado += 1;
  }
  return {
    total: comDado === 0 ? null : total,
    cultos: linhas.length,
    com_ds: comDado,
  };
}

/**
 * O crescimento percentual de uma semana contra a anterior.
 *
 * ⚠️ Base zero ou ausente devolve `null`, e não "infinito" nem 100 — é a mesma
 * régua do `delta_pct` do SQL (`IF v_anterior IS NULL OR v_anterior = 0 THEN
 * v_valor := NULL`). Divergir dela faria o mesmo KPI ter dois comportamentos
 * conforme o motor que calculou.
 *
 * @returns { valor, motivo }  `motivo` só vem preenchido quando valor é null.
 */
function crescimentoPct(atual, anterior) {
  const a = numero(atual);
  const b = numero(anterior);
  if (a === null) return { valor: null, motivo: 'sem_dado_no_periodo' };
  if (b === null) return { valor: null, motivo: 'sem_dado_no_periodo_anterior' };
  if (b === 0) return { valor: null, motivo: 'base_zero' };
  return { valor: Math.round(((a - b) / b) * 10000) / 100, motivo: null };
}

/**
 * O resultado do collector para uma semana: valor + a frase que explica.
 *
 * A `observacao` carrega as PARTES porque o `kpi_registros` guarda só o valor —
 * sem ela, ninguém consegue reconstruir de onde saiu o percentual.
 */
function resultadoSemana(cultosAtual, cultosAnterior) {
  const atual = somarDs(cultosAtual);
  const anterior = somarDs(cultosAnterior);
  const { valor, motivo } = crescimentoPct(atual.total, anterior.total);
  if (valor === null) return { valor: null, motivo, atual, anterior };
  const fmt = (n) => Number(n).toLocaleString('pt-BR');
  return {
    valor,
    motivo: null,
    atual,
    anterior,
    observacao: `DS ${fmt(atual.total)} em ${atual.com_ds} culto(s) · semana anterior ${fmt(anterior.total)}`,
  };
}

module.exports = { numero, somarDs, crescimentoPct, resultadoSemana };
