// ============================================================================
// kpiPontualidade — a régua de PONTUALIDADE do acompanhamento de KPIs
//
// Por que este arquivo existe (diagnóstico de 04/09/2026):
// o sistema tinha UMA luz (`status_trajetoria`) respondendo DUAS perguntas
// diferentes — "alguém preencheu?" e "bateu a meta?" — e a primeira ficava
// invisível. `sem_dado` na view significa "nunca teve valor na vida", não
// "está atrasado": medido em produção, 16 KPIs tinham farol aceso com dado de
// 2+ períodos atrás e 4 deles apareciam VERDES (ex.: AMI-05 "no alvo" com dado
// de maio). Quem parou de preencher desaparecia justamente quando o último
// número dele foi bom.
//
// O único proxy de atraso era "sem dado nos últimos 60 dias", uma janela FIXA:
// para os 28 KPIs trimestrais/semestrais/anual, 60 dias é alarme garantido e
// falso; para os 21 semanais, 60 dias deixa passar 8 semanas de silêncio.
// Aqui o atraso é contado em PERÍODOS DO PRÓPRIO KPI.
//
// ⚠️ Funções PURAS de propósito (nenhuma consulta): é o que permite testá-las
// sem banco e reusar a mesma régua na rota, no gerador de notificação e em
// qualquer medição futura. A régua fica em UM lugar — espalhar `CASE WHEN
// periodicidade` foi como as duas views do farol divergiram em agosto.
//
// ⚠️ O rótulo de período NÃO é reinventado aqui: `periodoAtual` vem do
// kpiAutoCollector, que é quem grava, e a convenção da casa é a do SQL
// `_kpi_periodo_corrente`: 2026-W36 · 2026-09 · 2026-Q3 · 2026-S2 · 2026.
// Reimplementar isso daria uma segunda régua — foi exatamente o erro que a
// primeira medição deste diagnóstico cometeu (contei trimestral como
// `YYYY-MM`, e os 27 trimestrais/semestrais apareceram como 0% de cobertura
// só porque o rótulo não casava).
// ============================================================================

const { periodoAtual } = require('./kpiAutoCollector');

// Quantos períodos para trás vale procurar antes de desistir. 60 cobre 1 ano
// de semanas (52) com folga e é barato: a busca é sobre rótulos, não sobre I/O.
const MAX_BUSCA = 60;
// E quantos para FRENTE, para reconhecer rótulo futuro (existem 144 registros
// de semana futura em produção, zerados por um backfill de 24/08 — sem isso um
// deles seria lido como "o dado mais recente").
const MAX_FUTURO = 60;

// Data-âncora do período deslocado `n` posições a partir de `hoje`.
// ⚠️ Ancorar no DIA 15 não é detalhe: `setUTCMonth(mes - 1)` num dia 31 cai em
// "31/02", que o JS normaliza para março, e o mês anterior escaparia nos dias
// 29, 30 e 31 — a armadilha que o teste de `periodosAlvo` já registra.
function ancora(periodicidade, n, hoje) {
  const y = hoje.getUTCFullYear();
  const m = hoje.getUTCMonth();
  switch (periodicidade) {
    case 'semanal': {
      const d = new Date(hoje.getTime());
      d.setUTCDate(d.getUTCDate() - 7 * n);
      return d;
    }
    case 'trimestral': return new Date(Date.UTC(y, m - 3 * n, 15, 12));
    case 'semestral':  return new Date(Date.UTC(y, m - 6 * n, 15, 12));
    case 'anual':      return new Date(Date.UTC(y - n, 6, 15, 12));
    case 'mensal':
    default:           return new Date(Date.UTC(y, m - n, 15, 12));
  }
}

// Rótulo do período deslocado `n` posições (0 = corrente, 1 = último fechado).
function periodoDeslocado(periodicidade, n, hoje = new Date()) {
  const per = (periodicidade || 'mensal').toLowerCase();
  return periodoAtual(per, ancora(per, n, hoje));
}

// Os `n` períodos JÁ FECHADOS mais recentes, do mais recente para o mais antigo.
//
// ⚠️ O período CORRENTE fica fora de propósito: cobrar o mês que ainda não
// fechou é a cobrança que queima a credibilidade da cobrança — o líder abre a
// tela, vê "atrasado" no dia 2, e da terceira vez para de olhar.
function periodosFechados(periodicidade, n, hoje = new Date()) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(periodoDeslocado(periodicidade, i, hoje));
  return out;
}

// Idade de um rótulo em períodos do próprio KPI:
//   0 = período corrente · 1 = último fechado · 2+ = atrasado · negativo = FUTURO
// `null` quando o rótulo não é reconhecível pela periodicidade (dado sujo).
function idadeEmPeriodos(rotulo, periodicidade, hoje = new Date()) {
  if (!rotulo) return null;
  const alvo = String(rotulo).trim();
  for (let i = 0; i <= MAX_BUSCA; i++) {
    if (periodoDeslocado(periodicidade, i, hoje) === alvo) return i;
  }
  for (let i = 1; i <= MAX_FUTURO; i++) {
    if (periodoDeslocado(periodicidade, -i, hoje) === alvo) return -i;
  }
  return null;
}

// Rótulo de período que ainda não chegou.
function ehFuturo(rotulo, periodicidade, hoje = new Date()) {
  const idade = idadeEmPeriodos(rotulo, periodicidade, hoje);
  return idade != null && idade < 0;
}

// Espelha `public._kpi_atingiu` (migration 20260824120000). Existe porque
// pontualidade e desempenho são julgados no mesmo lugar e a direção da meta
// tem que valer para os dois — comparar `valor >= meta` seco é o bug que
// deixou 75 dias de lead time VERDE contra meta de 7.
function atingiuMeta(valor, meta, sentido) {
  if (valor == null || meta == null || Number(meta) === 0) return null;
  const v = Number(valor);
  const alvo = Number(meta);
  if ((sentido || 'maior_melhor') === 'menor_melhor') return v <= alvo;
  return v >= alvo;
}

// ----------------------------------------------------------------------------
// A classificação em TRÊS selos, que é o ponto do refactor: fonte,
// pontualidade e desempenho têm donos diferentes (engenharia, líder da área e
// diretoria) e misturá-los produziu 78 vermelhos que ninguém trata — 58% deles
// eram zero de fórmula sem fonte, não resultado ruim.
//
// Entradas (tudo já buscado pelo chamador):
//   kpi              { id, periodicidade, sentido_meta }
//   valoresPorPeriodo { '2026-08': 12, ... } só valores NÃO nulos
//   temLinhaCalculada  o coletor já gravou alguma linha para este KPI?
//   ultimoCalculoNulo  o cálculo mais recente devolveu NULL?
//   metaPeriodo        meta já normalizada pela periodicidade (view)
//   janela             quantos períodos fechados olhar (default 3)
// ----------------------------------------------------------------------------
function classificar({
  kpi,
  valoresPorPeriodo = {},
  temLinhaCalculada = false,
  ultimoCalculoNulo = false,
  metaPeriodo = null,
  janela = 3,
  hoje = new Date(),
}) {
  const per = (kpi?.periodicidade || 'mensal').toLowerCase();
  const esperados = periodosFechados(per, janela, hoje);
  const preenchidos = esperados.filter(p => valoresPorPeriodo[p] != null);

  // ⚠️ Rótulo de período FUTURO não é valor: são 144 registros de 2026-W37 a
  // W52, todos zero, gravados por um backfill em 24/08. Sem este filtro um KPI
  // que não recebe dado desde julho apareceria como "tem valor, só atrasado" —
  // e o dado que ele "tem" é de uma semana que ainda não aconteceu.
  const temAlgumValor = Object.keys(valoresPorPeriodo).some(p => {
    if (valoresPorPeriodo[p] == null) return false;
    const idade = idadeEmPeriodos(p, per, hoje);
    return idade != null && idade >= 0;
  });

  // ── Pontualidade ──
  // Atraso = quantos períodos fechados se passaram sem valor. O último fechado
  // preenchido é atraso 0. Rótulo FUTURO nunca conta como preenchimento.
  let atraso = null;
  for (let i = 0; i < esperados.length; i++) {
    if (valoresPorPeriodo[esperados[i]] != null) { atraso = i; break; }
  }
  let pontualidade;
  if (atraso === 0) pontualidade = 'em_dia';
  else if (atraso != null) pontualidade = 'atrasado';
  else pontualidade = temAlgumValor ? 'atrasado' : 'nunca';
  // Sem valor em nenhum dos períodos da janela, mas com valor mais antigo:
  // o atraso é ao menos o tamanho da janela.
  const periodosAtraso = atraso != null ? atraso : (pontualidade === 'atrasado' ? janela : null);

  // ── Fonte ──
  let fonte;
  if (!temLinhaCalculada && !temAlgumValor) fonte = 'inexistente';
  else if (ultimoCalculoNulo && preenchidos.length === 0) fonte = 'nula';
  else fonte = 'viva';

  // ── Desempenho ──
  // ⚠️ A regra que faltava: NÃO se pinta desempenho sem pontualidade. Dado de
  // 2+ períodos atrás vira 'nao_julgavel' em vez de verde — era o caso dos 4
  // KPIs que apareciam "no alvo" com dado velho.
  const valorRecente = atraso != null ? valoresPorPeriodo[esperados[atraso]] : null;
  let desempenho;
  // 'sem_dado' fica reservado pra quem NUNCA teve valor. Quem tinha e parou
  // recebe 'nao_julgavel' — chamar os dois de "sem dado" era o que fazia
  // "parou de preencher" desaparecer atrás de "nunca começou".
  if (pontualidade === 'nunca') desempenho = 'sem_dado';
  else if (valorRecente == null) desempenho = 'nao_julgavel';
  else if (periodosAtraso >= 2) desempenho = 'nao_julgavel';
  else if (metaPeriodo == null || Number(metaPeriodo) === 0) desempenho = 'sem_meta';
  else desempenho = atingiuMeta(valorRecente, metaPeriodo, kpi?.sentido_meta) ? 'no_alvo' : 'abaixo';

  // ── Crônico ──
  // Crônico de verdade: os DOIS últimos períodos fechados têm valor e os dois
  // ficaram abaixo da meta. Antes o rótulo "cronicamente vermelhos" mostrava
  // simplesmente quem está vermelho agora (o próprio código admitia:
  // "refinamos depois com histórico").
  let cronico = false;
  if (metaPeriodo != null && Number(metaPeriodo) !== 0 && esperados.length >= 2) {
    const v0 = valoresPorPeriodo[esperados[0]];
    const v1 = valoresPorPeriodo[esperados[1]];
    cronico = v0 != null && v1 != null
      && atingiuMeta(v0, metaPeriodo, kpi?.sentido_meta) === false
      && atingiuMeta(v1, metaPeriodo, kpi?.sentido_meta) === false;
  }

  return {
    periodos_esperados: esperados,
    slots: esperados.length,
    preenchidos: preenchidos.length,
    cobertura_pct: esperados.length ? Math.round((preenchidos.length / esperados.length) * 1000) / 10 : 0,
    pontualidade,
    periodos_atraso: periodosAtraso,
    fonte,
    desempenho,
    cronico,
    valor_recente: valorRecente ?? null,
    periodo_recente: atraso != null ? esperados[atraso] : null,
  };
}

module.exports = {
  periodoAtual,
  periodoDeslocado,
  periodosFechados,
  idadeEmPeriodos,
  ehFuturo,
  atingiuMeta,
  classificar,
};
