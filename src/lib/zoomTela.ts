// ════════════════════════════════════════════════════════════════════════════
//  Escala de leitura do Dashboard Semanal — a tela que vai espelhada na TV.
//
//  Pedido do Matheus (02/09/2026): "se tivesse talvez uma opção de aumentar
//  fonte do próprio sistema, seria perfeito" → e, ao ouvir os riscos:
//  "e se implementar isso apenas para o dashboard semanal, pois mostramos essa
//  tela espelhada na tv".
//
//  ⚠️⚠️ POR QUE `zoom` E NÃO `html { font-size }`. Medido no código em 02/09:
//
//    fontSize inline em px .. 5.288      classes Tailwind em rem .. 5.936
//    text-[NNpx] ............ 1.561      uso direto de rem ........ 0
//
//  Mexer na raiz escalaria só as 5.936 e deixaria 6.849 paradas — a tela
//  DESALINHA em vez de aumentar (legenda em rem virando maior que o dado em
//  px). É a lei do "conserto capaz do efeito": o mecanismo tem que ser capaz
//  do resultado pedido, e este não é.
//
//  ⚠️ `transform: scale()` está descartado: cria containing block e quebra os
//  101 `position: fixed` do sistema, além de rasterizar o texto — o oposto do
//  pedido, que é LEGIBILIDADE.
//
//  ⚠️⚠️ POR QUE SÓ NESTA TELA. O conselho (02/09) levantou que um zoom global
//  deixaria os 8 portais do Radix a 100% dentro de uma UI a 125%, porque
//  `useFullscreenContainer` devolve `undefined` fora de fullscreen e o Radix
//  cai no `document.body`. Medido nesta página: **zero portais do Radix** (o
//  único `<Tooltip>` é do recharts, que renderiza dentro do container do
//  gráfico). A objeção morre no escopo estreito — e é por isso que ele fica
//  estreito.
//
//  ⚠️ Sobra UM portal próprio nesta tela (o modal de drilldown, `fixed inset-0`
//  para `document.body`). Ele NÃO herda o zoom do container, então recebe a
//  escala explicitamente — por isso a variável mora no `documentElement`.
// ════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ Teto de 1.5. Acima disso as tabelas densas do dashboard passam a exigir
 * scroll horizontal, e `zoom` NÃO refaz media query — o layout continua achando
 * que tem a largura toda. Para TV, 1.25/1.5 é onde o ganho de leitura acontece
 * sem quebrar a grade.
 */
export const NIVEIS_ZOOM = [1, 1.15, 1.25, 1.5] as const;
export type NivelZoom = (typeof NIVEIS_ZOOM)[number];

export const ZOOM_PADRAO: NivelZoom = 1;

/**
 * ⚠️ Chave por DISPOSITIVO (localStorage), não por conta. A TV da sala e o
 * notebook de quem opera querem números diferentes, e preferência por conta
 * faria o ajuste do desktop viajar para a TV — e vice-versa. É o mesmo padrão
 * do tema (`cbrio-theme`), que já é por dispositivo neste sistema.
 */
export const CHAVE_ZOOM = 'cbrio_dash_zoom_v1';

/** Aceita só os níveis conhecidos. Lixo no localStorage vira o padrão. */
export function normalizarZoom(v: unknown): NivelZoom {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return ZOOM_PADRAO;
  return (NIVEIS_ZOOM as readonly number[]).includes(n) ? (n as NivelZoom) : ZOOM_PADRAO;
}

/**
 * ⚠️ Nunca lança: `localStorage` estoura em modo privado do Safari e em iframe
 * com cookies bloqueados. Uma tela de leitura não pode morrer por causa da
 * preferência de tamanho dela.
 */
export function lerZoomSalvo(storage?: Pick<Storage, 'getItem'>): NivelZoom {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    return normalizarZoom(s?.getItem(CHAVE_ZOOM));
  } catch {
    return ZOOM_PADRAO;
  }
}

export function salvarZoom(nivel: NivelZoom, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    s?.setItem(CHAVE_ZOOM, String(normalizarZoom(nivel)));
  } catch {
    /* preferência é conforto, não pode derrubar a tela */
  }
}

/** Rótulo curto para o controle (o "A" cresce junto). */
export function rotuloZoom(n: NivelZoom): string {
  return n === 1 ? '100%' : `${Math.round(n * 100)}%`;
}
