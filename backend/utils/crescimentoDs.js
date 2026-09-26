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
  // ⚠️⚠️ SEMANA INTEIRA ZERADA É FALHA DE COLETA, NÃO QUEDA DE 100%.
  //
  // Descoberto no ensaio do backfill (24/09/2026): duas semanas davam −100%.
  // Em 2025-W30 os SEIS cultos tinham `online_ds = 0` — e `online_pico` de
  // 553, 443, 365, 321, 260 e 25, com `online_ddus` chegando a 1.181. Gente
  // assistiu; o DS é que não foi gravado. Medido na base desde 2024: **17
  // cultos com DS = 0 tendo audiência comprovada** (pico ou DDUS > 0), contra
  // 758 com DS > 0.
  //
  // ⚠️ Uma semana de igreja com literalmente zero visualização depois da live
  // não acontece. Então `total === 0` é o mesmo sinal que `comDado === 0`: não
  // dá para afirmar nada. Devolver 0 aqui produziria "−100%" — a mesma mentira
  // com cara de alarme que a guarda de cima já evita, entrando por outra porta.
  const vazio = comDado === 0;
  const zerado = !vazio && total === 0;
  return {
    total: vazio || zerado ? null : total,
    cultos: linhas.length,
    com_ds: comDado,
    // Por que não há total, quando não há. `null` quando há.
    ausencia: vazio ? 'sem_coleta' : zerado ? 'tudo_zerado' : null,
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
 * ⚠️⚠️ A SEMANA EM CURSO NÃO VALE — E ISSO NÃO É DETALHE.
 *
 * Descoberto ao rodar o backfill (24/09/2026): a semana corrente entrou com
 * **−94,09%**. Não houve queda nenhuma — W39 tinha UM culto com DS coletado
 * (a quarta de 23/09) contra SEIS da semana anterior. Comparar semana pela
 * metade com semana inteira é sempre catástrofe falsa, e ela apareceria no card
 * de terça a sábado, toda semana, para sempre.
 *
 * ⚠️ O DS ainda atrasa mais um dia: é lido na manhã SEGUINTE ao culto. Então a
 * semana só está fechada quando o dia seguinte ao último dia dela já passou.
 * Por isso a régua exige `fim` (exclusivo, a segunda seguinte) <= hoje.
 *
 * ⚠️ O KPI passa a ficar uma semana "atrás" — e está certo assim: um indicador
 * de crescimento SEMANAL só tem resposta quando a semana acaba. A tolerância de
 * 1 período em `vw_kpi_trajetoria_atual` já aceita essa defasagem sem marcar
 * dado vencido.
 *
 * @param fimExclusivo  'YYYY-MM-DD' — o primeiro dia FORA da semana
 * @param hoje          'YYYY-MM-DD' — dia de referência
 */
function semanaFechada(fimExclusivo, hoje) {
  if (!fimExclusivo || !hoje) return false;
  return String(fimExclusivo) <= String(hoje);
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
  // ⚠️ `tudo_zerado` sobe como motivo próprio: "não coletamos" e "não houve
  // culto" são coisas diferentes, e quem for investigar precisa saber qual.
  if (valor === null) {
    return {
      valor: null,
      motivo: atual.ausencia === 'tudo_zerado' ? 'ds_zerado_na_semana' : motivo,
      atual,
      anterior,
    };
  }
  const fmt = (n) => Number(n).toLocaleString('pt-BR');
  return {
    valor,
    motivo: null,
    atual,
    anterior,
    observacao: `DS ${fmt(atual.total)} em ${atual.com_ds} culto(s) · semana anterior ${fmt(anterior.total)}`,
  };
}

module.exports = { numero, somarDs, crescimentoPct, semanaFechada, resultadoSemana };
