// Janela de período — resolvedor ÚNICO dos filtros de data do sistema.
//
// Nasceu (2026-08-03) na Caixa de entrada de Grupos, depois de um mal-entendido
// REAL: o Marcos abriu o "Retrato do período" e leu **301 pedidos / 193 pessoas**
// como se fossem os do lançamento de domingo — que foram **177 / 161**. Nenhum
// número estava errado: o filtro padrão é de 180 dias e somava os **120 pedidos
// de julho**. O defeito era o rótulo genérico, que não dizia QUAL período.
//
// Duas coisas nasceram daqui:
//   1. o título passa a nomear a janela ("Retrato · temporada T2-2026");
//   2. existe a opção **"Temporada atual"**, porque "como foi a abertura?" é a
//      pergunta real e nenhuma janela em DIAS a responde de forma estável.
//
// ⚠️ Fonte ÚNICA: a lista, o painel e o rótulo leem a MESMA janela. Antes o
// cálculo `Date.now() - fPeriodo * 86400000` estava repetido em 3 lugares — com
// uma opção que não é número cada um daria `NaN`, e **NaN numa comparação de
// data não filtra nada: mostraria tudo, em silêncio.**
//
// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-24 · POR ANO (pedido do Marcos depois da apresentação do ministerial)
//
// Nenhum filtro do sistema tinha "por ano": dava para ver 180 ou 365 dias, mas
// não "2025 inteiro". Sem isso não existe comparação anual — que é exatamente o
// que a reunião de governança pede.
//
// ⚠️⚠️ ANO É A PRIMEIRA JANELA **FECHADA** DO SISTEMA. Todas as outras são
// "últimos N dias a partir de agora" e por isso só precisavam de um `desde`.
// Um ano tem começo E fim: escolher 2024 e usar só o `desde` mostraria
// 2024→hoje — errado, e errado em SILÊNCIO, do jeito mais difícil de perceber
// (o número só fica maior, nada quebra). Por isso `resolverJanela` passou a
// devolver **`ateMs` SEMPRE**, e é `Infinity` nas janelas móveis: quem compara
// `data <= ateMs` continua correto nas antigas e passa a ficar correto na nova.
//
// Quem consumir esta função é obrigado a usar os DOIS lados. Há um teste que
// tranca isso (`ano fechado: dezembro entra, janeiro do ano seguinte não`).
// ─────────────────────────────────────────────────────────────────────────────

// Primeiro ano com dado real no sistema: as contribuições começam em 2022
// (medido em 24/08/2026 — 2.383 lançamentos naquele ano). Anos anteriores
// existiriam vazios e só poluiriam o seletor.
export const ANO_INICIAL = 2022;

/** Anos oferecidos no filtro, do mais recente para o mais antigo. */
export function anosDisponiveis(agora = Date.now()) {
  const atual = new Date(agora).getFullYear();
  const anos = [];
  for (let a = atual; a >= ANO_INICIAL; a--) anos.push(a);
  return anos;
}

/** `true` para os valores de ano ('ano:2025'), que são janela FECHADA. */
export function ehAno(valor) {
  return typeof valor === 'string' && /^ano:\d{4}$/.test(valor);
}

/** Extrai o número do ano de 'ano:2025'. Devolve null se não for ano. */
export function anoDe(valor) {
  return ehAno(valor) ? Number(String(valor).slice(4)) : null;
}

/** Opções de ano, prontas pro <select>. */
export function opcoesAno(agora = Date.now()) {
  return anosDisponiveis(agora).map((a) => ({ dias: `ano:${a}`, label: String(a), ano: a }));
}

// Janelas móveis. O ano NÃO entra aqui: ele é gerado por `opcoesAno` para não
// precisar de manutenção anual no código.
const FILTRO_MOVEL = [
  { dias: 'temporada', label: 'Temporada atual' },
  { dias: 7, label: 'Últimos 7 dias' },
  { dias: 30, label: 'Últimos 30 dias' },
  { dias: 60, label: 'Últimos 60 dias' },
  { dias: 90, label: 'Últimos 90 dias' },
  { dias: 180, label: 'Últimos 180 dias' },
  { dias: 365, label: 'Último ano' },
  { dias: 1825, label: 'Últimos 5 anos' },
];

/**
 * Lista completa do filtro: janelas móveis + um ano por linha.
 * `comTemporada: false` para os módulos que não têm temporada (só Grupos tem).
 */
export function filtroPeriodo({ comTemporada = true, agora = Date.now() } = {}) {
  const moveis = comTemporada ? FILTRO_MOVEL : FILTRO_MOVEL.filter((f) => f.dias !== 'temporada');
  return [...moveis, ...opcoesAno(agora)];
}

// Mantido para os consumidores que já importavam a constante (Caixa de entrada
// de Grupos). É a lista COM temporada e COM os anos.
export const FILTRO_PERIODO = filtroPeriodo();

const DIAS_PADRAO = 180;
const DIAS_FALLBACK_TEMPORADA = 30;

/**
 * @param {object} p
 * @param {number|'temporada'|`ano:${number}`} p.fPeriodo
 * @param {{id?:string, data_inicio?:string}|null} [p.temporada] — a temporada ativa
 * @param {number} [p.agora] — injetável pra teste (nunca usar Date.now() direto no teste)
 * @returns {{desdeMs:number, ateMs:number, rotulo:string, temporadaIni:string|null, ano:number|null}}
 *   `ateMs` é `Infinity` nas janelas móveis e o fim do ano na janela de ano.
 */
export function resolverJanela({ fPeriodo, temporada = null, agora = Date.now() } = {}) {
  const temporadaIni = temporada?.data_inicio || null;

  // ── Ano: a única janela FECHADA ──────────────────────────────────────────
  if (ehAno(fPeriodo)) {
    const ano = anoDe(fPeriodo);
    // Meio-dia LOCAL nas duas pontas, pela mesma razão do bloco da temporada:
    // `new Date('2026-01-01')` é meia-noite UTC = 31/12 às 21h no Rio, e o
    // último dia de dezembro cairia fora da própria janela.
    const desdeMs = new Date(`${ano}-01-01T00:00:00`).getTime();
    const fimDoAno = new Date(`${ano}-12-31T23:59:59`).getTime();
    return {
      // Ano corrente não pode terminar no futuro: o rótulo diria "2026" e o
      // gráfico desenharia meses vazios até dezembro.
      desdeMs,
      ateMs: Math.min(fimDoAno, agora),
      rotulo: String(ano),
      temporadaIni,
      ano,
    };
  }

  if (fPeriodo === 'temporada') {
    if (temporadaIni) {
      // ⚠️ Meio-dia LOCAL. `new Date('2026-08-01')` é meia-noite UTC, que no Rio
      // é 31/07 às 21h — um pedido da véspera (temporada ANTERIOR) entraria como
      // se fosse da nova. Mesma armadilha do faixaEtaria.
      return {
        desdeMs: new Date(`${temporadaIni}T12:00:00`).getTime(),
        ateMs: Infinity,
        rotulo: `temporada ${temporada.id || 'atual'}`,
        temporadaIni,
        ano: null,
      };
    }
    // Temporada ainda não carregou (ou não existe): piso conhecido, nunca NaN.
    return {
      desdeMs: agora - DIAS_FALLBACK_TEMPORADA * 86400000,
      ateMs: Infinity,
      rotulo: `últimos ${DIAS_FALLBACK_TEMPORADA} dias`,
      temporadaIni: null,
      ano: null,
    };
  }

  const dias = Number(fPeriodo) > 0 ? Number(fPeriodo) : DIAS_PADRAO;
  const opcao = FILTRO_MOVEL.find((f) => f.dias === dias);
  return {
    desdeMs: agora - dias * 86400000,
    ateMs: Infinity,
    rotulo: opcao ? opcao.label.toLowerCase() : `últimos ${dias} dias`,
    temporadaIni,
    ano: null,
  };
}

/**
 * Recorte em ISO (YYYY-MM-DD) — o formato que as colunas de data do banco usam
 * e que as rotas recebem por query. `ate` é `null` nas janelas móveis.
 */
export function janelaIso(args) {
  const j = resolverJanela(args);
  // ⚠️⚠️ Formata em hora LOCAL, NUNCA `toISOString()`. As pontas do ano são
  // meia-noite e 23:59:59 LOCAIS; em UTC o fim de 31/12 às 23:59 no Rio é
  // 01/01 às 02:59 — o `ate` do ano FECHADO vazaria pro ano seguinte, que é
  // exatamente o que a janela fechada existe pra impedir. Um teste trava isso.
  const iso = (ms) => {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  return {
    de: iso(j.desdeMs),
    ate: Number.isFinite(j.ateMs) ? iso(j.ateMs) : null,
    rotulo: j.rotulo,
    ano: j.ano,
  };
}

/**
 * Granularidade de gráfico para a janela. Um ano sempre em MÊS: 365 pontos
 * diários num gráfico de largura de tela vira uma mancha.
 */
export function granularidadeDaJanela(fPeriodo) {
  if (ehAno(fPeriodo)) return 'mes';
  if (fPeriodo === 'temporada') return 'semana';
  const dias = Number(fPeriodo) > 0 ? Number(fPeriodo) : DIAS_PADRAO;
  if (dias <= 90) return 'semana';
  return 'mes';
}
