// ============================================================================
// utils/jornadaTempo · "quanto tempo o novo convertido levou até cada marco?"
// ============================================================================
// Régua PURA (sem banco, sem rede, sem relógio implícito — o "hoje" é sempre
// INJETADO). Mora em `utils/` pra entrar no gate de deploy.
// Quem lê o banco é o handler `GET /cuidados/jornada-convertidos`.
//
// Pedido do Matheus (14/08/2026): a tela de jornada já dizia SE a pessoa bateu
// cada marco, mas só o primeiro contato tinha "quantos dias levou". Batismo,
// Next, grupo, voluntariado e generosidade eram booleano. Sem o tempo, o líder
// não sabe se a pessoa está no começo do caminho ou parada há meio ano.
//
// ⚠️⚠️ A LEI DESTE ARQUIVO · marco sem data NÃO é marco que não aconteceu, e
// data que não é do EVENTO não pode virar medida de tempo.
//
// São três estados, e confundi-los é o que faz um painel mentir:
//   1. não tem o marco            → ausência de REGISTRO (nunca "não fez")
//   2. tem o marco, data confiável → entra na mediana
//   3. tem o marco, data suspeita  → CONTA como alcançado, fica FORA da mediana
//
// O estado 3 existe por medição, não por precaução teórica. Em 14/08/2026, dos
// 23 convertidos com vínculo de grupo, 16 (70%) tinham `entrou_em` numa das três
// datas de importação em massa (2026-06-19 = 342 pessoas · 2026-07-10 = 233 ·
// 2026-06-23 = 115). Usar essas datas produziria uma mediana de "tempo até
// entrar em grupo" inteiramente fabricada — e com cara de medição.
// Ver a migration 20260619140000_nsm_sinais_engajamento_v3.sql, que registra o
// mesmo fato e é a razão de nenhuma régua do sistema aplicar janela de tempo
// em grupo até hoje.
// ============================================================================

/**
 * Catálogo dos marcos, NA ORDEM DA JORNADA. `meta_dias` é o prazo interno
 * acordado (null = não há prazo — pertencer não tem prazo).
 * `sensivel` espelha utils/jornadaMarcadores: generosidade é dado financeiro.
 */
const MARCOS_TEMPO = [
  { chave: 'contato',      label: '1º contato',   curto: 'CONT',    meta_dias: 3,   sensivel: false },
  { chave: 'next',         label: 'Next',         curto: 'NEXT',    meta_dias: 90,  sensivel: false },
  { chave: 'batismo',      label: 'Batismo',      curto: 'BAT',     meta_dias: 90,  sensivel: false },
  { chave: 'grupo',        label: 'Grupo',        curto: 'GRUPO',   meta_dias: null, sensivel: false },
  { chave: 'servir',       label: 'Voluntariado', curto: 'SERVE',   meta_dias: null, sensivel: false },
  { chave: 'generosidade', label: 'Generosidade', curto: 'CONTRIB', meta_dias: null, sensivel: true },
];

const CHAVES_TEMPO = MARCOS_TEMPO.map((m) => m.chave);
const CHAVES_SENSIVEIS_TEMPO = MARCOS_TEMPO.filter((m) => m.sensivel).map((m) => m.chave);

// ⚠️ Dia no fuso da IGREJA. `toISOString().slice(0,10)` daria o dia UTC, e das
// 21h BRT em diante ele já virou — o culto de domingo 19:00 cairia na segunda.
// Mesma lição do dia da curva do censo e do check-in do Kids.
const FMT_DIA_BRT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Normaliza date/timestamptz para 'YYYY-MM-DD' no fuso da igreja. */
function diaBRT(valor) {
  if (!valor) return null;
  const s = String(valor);
  // date puro já vem no dia certo — construir Date aqui só criaria erro de fuso
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return FMT_DIA_BRT.format(d);
}

/**
 * Dias inteiros entre dois dias 'YYYY-MM-DD'. Via Date.UTC de propósito: somar
 * 86400000 sobre horário local erra na virada do horário de verão.
 */
function diasEntre(de, ate) {
  const a = diaBRT(de);
  const b = diaBRT(ate);
  if (!a || !b) return null;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/**
 * Datas de IMPORTAÇÃO EM MASSA, detectadas pelo próprio dado em vez de
 * hardcodadas: um dia em que N pessoas entraram no mesmo grupo-mundo não é um
 * dia de vida da igreja, é um dia de carga de planilha.
 *
 * ⚠️ Limiar deliberadamente ALTO (100). Medido em 14/08/2026: as 3 cargas reais
 * têm 342/233/115 pessoas e o pico ORGÂNICO mais alto (abertura da temporada T2,
 * 2026-08-10) tem 71. Baixar o limiar começaria a marcar como "suspeito" o dia
 * de maior adesão real da igreja, que é exatamente o dado que se quer medir.
 *
 * @param {string[]} datas  uma entrada por VÍNCULO (repetida por pessoa)
 * @returns {Set<string>}   dias 'YYYY-MM-DD' considerados carga
 */
function datasDeImport(datas, opts = {}) {
  const minPessoas = opts.minPessoas ?? 100;
  const contagem = new Map();
  for (const d of datas || []) {
    const dia = diaBRT(d);
    if (!dia) continue;
    contagem.set(dia, (contagem.get(dia) || 0) + 1);
  }
  const out = new Set();
  for (const [dia, n] of contagem) if (n >= minPessoas) out.add(dia);
  return out;
}

/**
 * Monta UM marco a partir da data crua.
 *
 * @param {string|null} data       data crua do evento (date ou timestamptz)
 * @param {string} dataDecisao     't0' da pessoa
 * @param {object} [opts]
 * @param {boolean} [opts.alcancado]  força "aconteceu" mesmo sem data
 *                                    (ex.: contato marcado só pelo status)
 * @param {boolean} [opts.suspeita]   a data existe mas não é do evento
 * @returns {null | {alcancado, data, dias, aproximada, motivo}}
 *   `null` = não há registro. `dias: null` = alcançado sem data utilizável.
 */
function montarMarco(data, dataDecisao, opts = {}) {
  const dia = diaBRT(data);
  const alcancado = opts.alcancado === true || !!dia;
  if (!alcancado) return null;

  if (!dia) {
    return { alcancado: true, data: null, dias: null, aproximada: true, motivo: 'sem_data' };
  }

  const dias = diasEntre(dataDecisao, dia);

  // ⚠️ Marco ANTES da decisão não é "tempo até engajar" — é gente que já estava
  // na igreja e decidiu depois (ou data de carga). Conta como alcançado e sai
  // da mediana: um número negativo puxaria a média pra baixo fingindo agilidade.
  if (dias !== null && dias < 0) {
    return { alcancado: true, data: dia, dias, aproximada: true, motivo: 'antes_da_decisao' };
  }
  if (opts.suspeita) {
    return { alcancado: true, data: dia, dias, aproximada: true, motivo: 'data_de_importacao' };
  }
  return { alcancado: true, data: dia, dias, aproximada: false, motivo: null };
}

/** Mediana de uma lista de números. Lista vazia → null (nunca 0). */
function mediana(nums) {
  const a = (nums || []).filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const meio = Math.floor(a.length / 2);
  return a.length % 2 ? a[meio] : Math.round((a[meio - 1] + a[meio]) / 2);
}

/** Quantil por interpolação linear (mesma convenção do numpy/R type 7). */
function quantil(nums, p) {
  const a = (nums || []).filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  if (a.length === 1) return a[0];
  const pos = (a.length - 1) * p;
  const base = Math.floor(pos);
  const resto = pos - base;
  const prox = a[base + 1] === undefined ? a[base] : a[base + 1];
  return Math.round(a[base] + resto * (prox - a[base]));
}

/**
 * Estatística de UM marco sobre a coorte.
 *
 * ⚠️ Mediana, não média: a cauda é longa (gente que engaja em 300 dias) e a
 * média viraria um número que não descreve ninguém.
 * ⚠️ `aproximados` é DECLARADO no retorno pra tela poder dizer sobre quantos a
 * mediana foi calculada. Excluir em silêncio é o que faz um número parecer mais
 * sólido do que é.
 */
function estatisticaMarco(pessoas, chave) {
  const lista = pessoas || [];
  let alcancaram = 0;
  let aproximados = 0;
  const dias = [];
  for (const p of lista) {
    const m = p?.marcos?.[chave];
    if (!m || !m.alcancado) continue;
    alcancaram += 1;
    if (m.aproximada || m.dias === null) aproximados += 1;
    else dias.push(m.dias);
  }
  const total = lista.length;
  return {
    chave,
    alcancaram,
    pct: total ? Math.round((alcancaram / total) * 100) : 0,
    com_data_confiavel: dias.length,
    aproximados,
    mediana: mediana(dias),
    q1: quantil(dias, 0.25),
    q3: quantil(dias, 0.75),
    min: dias.length ? Math.min(...dias) : null,
    max: dias.length ? Math.max(...dias) : null,
  };
}

/**
 * "Há quantos dias esta pessoa não registra nada?" — a partir do marco mais
 * recente, ou da própria decisão quando não há marco nenhum.
 * `hoje` é INJETADO (teste que lê o relógio da máquina é flake garantido).
 */
function diasParado(pessoa, hoje) {
  const marcos = Object.values(pessoa?.marcos || {}).filter((m) => m && m.alcancado && typeof m.dias === 'number' && m.dias >= 0);
  const ultimoDia = marcos.length ? Math.max(...marcos.map((m) => m.dias)) : 0;
  const desdeDecisao = diasEntre(pessoa?.data_decisao, hoje);
  if (desdeDecisao === null) return null;
  return Math.max(0, desdeDecisao - ultimoDia);
}

/** Quantos marcos (além da decisão) a pessoa alcançou. */
function totalMarcos(pessoa) {
  return Object.values(pessoa?.marcos || {}).filter((m) => m && m.alcancado).length;
}

module.exports = {
  MARCOS_TEMPO,
  CHAVES_TEMPO,
  CHAVES_SENSIVEIS_TEMPO,
  diaBRT,
  diasEntre,
  datasDeImport,
  montarMarco,
  mediana,
  quantil,
  estatisticaMarco,
  diasParado,
  totalMarcos,
};
