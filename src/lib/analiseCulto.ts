// ════════════════════════════════════════════════════════════════════════════
//  Análises que aparecem ao expandir um culto (aba Online).
//
//  Pedido do Matheus (02/09/2026): "quero poder clicar em um culto e expandir
//  mais as análises." Escolheu quatro: comparação com a média dos últimos,
//  momento em que a audiência caiu, evolução ao longo das semanas, e inscritos
//  por origem.
//
//  ⚠️⚠️ A QUARTA NÃO ESTÁ AQUI, e não é esquecimento: `online_video_trafico`
//  guarda só `fonte, views, watch_minutes`. Não há inscritos por origem no
//  banco — e o relatório de fontes do YouTube expõe apenas `views` e
//  `estimatedMinutesWatched`. Mostrar "inscritos por origem" hoje seria
//  repartir um total por participação de views e chamar de medição. Fica de
//  fora até existir dado que sustente.
//
//  ⚠️ COMPARAR SÓ COM O MESMO TIPO DE CULTO. Quarta com Deus e Domingo 11:30
//  têm patamares diferentes; misturar produz "abaixo da média" para todo culto
//  de quarta, para sempre. A comparação é sempre dentro do mesmo
//  `service_type_name`.
// ════════════════════════════════════════════════════════════════════════════

import type { PontoCurva } from './curvaRetencao';

export type CultoBase = {
  id: string;
  data: string;
  service_type_name: string | null;
  online_pico: number | null;
  online_ds: number | null;
  online_ddus: number | null;
  online_watch_minutes_ddus: number | null;
  online_retencao_pct_ddus: number | null;
  online_subs_ganhos: number | null;
  retencao_curva?: PontoCurva[];
  actual_start_time?: string | null;
  actual_end_time?: string | null;
};

/** Quantos cultos anteriores formam a régua. */
export const JANELA_COMPARACAO = 8;
/** Abaixo disso a "média dos últimos" não é média, é anedota. */
export const MINIMO_PARA_COMPARAR = 3;

export type Comparacao = {
  chave: string;
  rotulo: string;
  valor: number | null;
  media: number | null;
  difPct: number | null;
  /** true quando maior é melhor (todas aqui são, mas explicitar evita erro). */
  maiorEhMelhor: boolean;
};

export type ResumoComparacao = {
  /** Quantos cultos anteriores entraram na régua. */
  base: number;
  tipo: string | null;
  linhas: Comparacao[];
};

const METRICAS: { chave: keyof CultoBase; rotulo: string }[] = [
  { chave: 'online_pico', rotulo: 'Pico ao vivo' },
  { chave: 'online_ds', rotulo: 'Views (manhã seguinte)' },
  { chave: 'online_ddus', rotulo: 'Views on-demand' },
  { chave: 'online_watch_minutes_ddus', rotulo: 'Watch time' },
  { chave: 'online_retencao_pct_ddus', rotulo: 'Retenção média' },
  { chave: 'online_subs_ganhos', rotulo: 'Inscritos ganhos' },
];

/**
 * Compara um culto com a média dos anteriores DO MESMO TIPO.
 *
 * ⚠️ "Anteriores" é por data, não a lista inteira: comparar um culto com cultos
 * que vieram DEPOIS dele faria a régua mudar de valor conforme o tempo passa, e
 * um culto bem avaliado hoje ficaria ruim amanhã sem nada ter acontecido.
 */
export function compararComAnteriores(
  culto: CultoBase,
  todos: CultoBase[] | null | undefined,
): ResumoComparacao {
  const tipo = culto?.service_type_name ?? null;
  const vazio: ResumoComparacao = { base: 0, tipo, linhas: [] };
  if (!culto || !Array.isArray(todos)) return vazio;

  const anteriores = todos
    .filter((c) => c.id !== culto.id
      && (c.service_type_name ?? null) === tipo
      && c.data < culto.data)
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .slice(0, JANELA_COMPARACAO);

  if (anteriores.length < MINIMO_PARA_COMPARAR) return { ...vazio, base: anteriores.length };

  const linhas = METRICAS.map(({ chave, rotulo }) => {
    const valor = numOuNulo(culto[chave]);
    const amostra = anteriores.map((c) => numOuNulo(c[chave])).filter((v): v is number => v != null);
    const media = amostra.length ? amostra.reduce((s, v) => s + v, 0) / amostra.length : null;
    const difPct = valor != null && media != null && media !== 0
      ? ((valor - media) / media) * 100
      : null;
    return { chave: String(chave), rotulo, valor, media, difPct, maiorEhMelhor: true };
  });

  return { base: anteriores.length, tipo, linhas };
}

function numOuNulo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────

export type Queda = {
  /** Minuto (ou % se não houver duração) onde a queda começa. */
  x: number;
  /** Queda em pontos da métrica (ex.: 0.08 = 8 pontos). */
  tamanho: number;
  /** Hora real BRT do trecho, quando `actual_start_time` existe. */
  hora: string | null;
  de: number;
  para: number;
};

/**
 * Acha os trechos de maior queda de audiência — para dar onde procurar no vídeo.
 *
 * ⚠️ IGNORA A ABERTURA de propósito. A maior "queda" de toda transmissão é
 * sempre a saída da tela de espera (0,77 → 0,06 no culto medido). Se ela
 * entrasse, a resposta seria a mesma todo culto e não serviria para nada.
 *
 * ⚠️ E ignora o encerramento (últimos 5%), pela mesma razão: o vídeo acabar não
 * é a audiência abandonando.
 */
export function acharQuedas(
  curva: PontoCurva[] | null | undefined,
  opcoes: { inicioAposPct?: number; duracaoMin?: number | null; inicioIso?: string | null; quantas?: number } = {},
): Queda[] {
  if (!Array.isArray(curva) || curva.length < 4) return [];
  const { inicioAposPct = 0, duracaoMin = null, inicioIso = null, quantas = 3 } = opcoes;

  const pts = [...curva]
    .filter((p) => Number.isFinite(p?.ratio_pct) && Number.isFinite(p?.audience_watch_ratio))
    .sort((a, b) => a.ratio_pct - b.ratio_pct)
    .filter((p) => p.ratio_pct > inicioAposPct && p.ratio_pct <= 95);
  if (pts.length < 2) return [];

  const emMin = Number.isFinite(duracaoMin as number) && (duracaoMin as number) > 0;
  const quedas: Queda[] = [];
  for (let i = 1; i < pts.length; i++) {
    const tamanho = pts[i - 1].audience_watch_ratio - pts[i].audience_watch_ratio;
    if (tamanho <= 0) continue;
    const pct = pts[i - 1].ratio_pct;
    const x = emMin ? (pct / 100) * (duracaoMin as number) : pct;
    quedas.push({ x, tamanho, de: pts[i - 1].audience_watch_ratio, para: pts[i].audience_watch_ratio,
      hora: horaDoTrecho(inicioIso, emMin ? x : null) });
  }

  return quedas.sort((a, b) => b.tamanho - a.tamanho).slice(0, quantas);
}

/** Hora BRT do minuto N da transmissão. `null` sem início conhecido. */
export function horaDoTrecho(inicioIso: string | null | undefined, minuto: number | null): string | null {
  if (!inicioIso || minuto == null || !Number.isFinite(minuto)) return null;
  const t = new Date(inicioIso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + minuto * 60000).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export type PontoEvolucao = {
  data: string;
  rotulo: string;
  pico: number | null;
  views: number | null;
  retencao: number | null;
};

/**
 * Série histórica do MESMO tipo de culto, do mais antigo ao mais novo.
 *
 * ⚠️ Ordem crescente é obrigatória: o endpoint devolve por data DESC, e um
 * gráfico de evolução desenhado nessa ordem mostra o tempo andando para trás.
 */
export function serieDoTipo(
  culto: CultoBase,
  todos: CultoBase[] | null | undefined,
  limite = 12,
): PontoEvolucao[] {
  if (!culto || !Array.isArray(todos)) return [];
  const tipo = culto.service_type_name ?? null;
  return todos
    .filter((c) => (c.service_type_name ?? null) === tipo && c.data <= culto.data)
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .slice(0, limite)
    .reverse()
    .map((c) => ({
      data: c.data,
      rotulo: c.data.slice(8, 10) + '/' + c.data.slice(5, 7),
      pico: numOuNulo(c.online_pico),
      views: (numOuNulo(c.online_ds) ?? 0) + (numOuNulo(c.online_ddus) ?? 0) || null,
      retencao: numOuNulo(c.online_retencao_pct_ddus),
    }));
}
