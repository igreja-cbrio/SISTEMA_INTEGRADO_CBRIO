// ============================================================================
// ARRASTO DO KANBAN · máquina de estado PURA (sem DOM, sem React)
// ============================================================================
// Reclamação do Pedro (14/08/2026): *"quando você clica e tenta arrastar não vai;
// ele até aceita apertar em Triar e aí vai pra próxima etapa, mas o drag and drop
// não funciona — veja principalmente os de triagem, pois eles são a rotina"*.
//
// ⚠️⚠️ POR QUE TROCAR O HTML5 DRAG-AND-DROP em vez de consertá-lo:
//
//  1. **Não dispara em TOQUE.** `dragstart`/`drop` são eventos de mouse. Em
//     tablet/celular não existe arrasto nenhum — e esta tela é responsiva de
//     propósito (colunas `w-[85vw]` no mobile).
//  2. **O `dragover`/`dragleave` do container OSCILAVA a cada filho** que o
//     ponteiro atravessava (os dois eventos borbulham), então a coluna
//     re-renderizava dezenas de vezes por segundo no meio do arrasto.
//  3. **Não dá auto-scroll**: as 6 colunas vivem num container com scroll +
//     `snap-mandatory`. Levar um card do Backlog até Concluído exigia que a
//     coluna de destino JÁ estivesse visível.
//  4. A coluna **Triagem nunca participou** (sem `onDrop`, cards sem
//     `draggable`) — e é exatamente a rotina dele.
//
// Pointer events resolvem os quatro com UM mecanismo: `pointerdown/move/up`
// chegam igual de mouse, caneta e dedo.
//
// ⚠️ Esta régua NÃO conhece DOM: quem descobre "que coluna está sob o ponteiro"
// é o componente (via `elementFromPoint`), e passa o resultado pra cá. É o que
// torna a decisão testável sem navegador.
// ============================================================================

// Distância (px) que o ponteiro precisa andar para virar ARRASTO em vez de
// clique. ⚠️ Sem este limiar, todo clique no card iniciaria um arrasto e o
// painel de detalhe deixaria de abrir — o card é clicável E arrastável.
export const LIMIAR_ARRASTO_PX = 6;

// Faixa (px) junto à borda do container em que o auto-scroll horizontal liga.
export const FAIXA_AUTOSCROLL_PX = 72;
// Velocidade máxima do auto-scroll (px por quadro).
export const VELOCIDADE_AUTOSCROLL_MAX = 18;

export type EstadoArrasto = {
  ativo: boolean;        // já passou do limiar? (antes disso ainda pode ser clique)
  pointerId: number;
  cardId: string;
  estadoOrigem: string;  // coluna de onde saiu — pra não "mover" pro mesmo lugar
  x0: number;
  y0: number;
  x: number;
  y: number;
};

export function iniciarArrasto(args: {
  pointerId: number; cardId: string; estadoOrigem: string; x: number; y: number;
}): EstadoArrasto {
  return {
    ativo: false,
    pointerId: args.pointerId,
    cardId: args.cardId,
    estadoOrigem: args.estadoOrigem,
    x0: args.x, y0: args.y, x: args.x, y: args.y,
  };
}

// Atualiza a posição e diz se ISTO já é um arrasto.
// ⚠️ Uma vez ativo, NUNCA volta a ser clique: o ponteiro pode passar de novo
// perto da origem no meio do movimento, e desativar ali faria o arrasto "cair"
// e o clique disparar no fim.
export function moverArrasto(e: EstadoArrasto | null, x: number, y: number): EstadoArrasto | null {
  if (!e) return null;
  const dist = Math.hypot(x - e.x0, y - e.y0);
  return { ...e, x, y, ativo: e.ativo || dist >= LIMIAR_ARRASTO_PX };
}

// O que fazer ao soltar. `colunaAlvo` é `null` quando o ponteiro não estava
// sobre coluna nenhuma (soltou fora do quadro).
//
// ⚠️ Devolve `{ acao: 'clique' }` quando nunca passou do limiar — é assim que o
// card continua abrindo o painel no toque simples, sem `onClick` separado (dois
// caminhos disputando o mesmo gesto foi parte do problema original).
export function decidirSoltura(
  e: EstadoArrasto | null,
  colunaAlvo: string | null,
  aceitaColuna?: (coluna: string) => boolean,
): { acao: 'nada' } | { acao: 'clique'; cardId: string } | { acao: 'mover'; cardId: string; para: string } {
  if (!e) return { acao: 'nada' };
  if (!e.ativo) return { acao: 'clique', cardId: e.cardId };
  if (!colunaAlvo) return { acao: 'nada' };
  // Soltar na coluna de origem não é movimento — e mandar um PATCH pro mesmo
  // estado geraria notificação de "mudou" sem nada ter mudado.
  if (colunaAlvo === e.estadoOrigem) return { acao: 'nada' };
  if (aceitaColuna && !aceitaColuna(colunaAlvo)) return { acao: 'nada' };
  return { acao: 'mover', cardId: e.cardId, para: colunaAlvo };
}

// Quanto rolar o container horizontal neste quadro, pela posição do ponteiro.
// Negativo = esquerda. Zero = não rola.
//
// ⚠️ Proporcional à profundidade dentro da faixa: perto da borda rola rápido,
// no começo da faixa rola devagar. Velocidade fixa faz a coluna passar voando
// e a pessoa perde o alvo.
export function velocidadeAutoScroll(
  xPonteiro: number,
  retangulo: { left: number; right: number },
): number {
  if (!Number.isFinite(xPonteiro)) return 0;
  const { left, right } = retangulo;
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return 0;

  const daEsquerda = xPonteiro - left;
  const daDireita = right - xPonteiro;

  // Fora do container (arrastou pra fora) → rola no sentido de onde saiu, no máximo.
  if (daEsquerda < 0) return -VELOCIDADE_AUTOSCROLL_MAX;
  if (daDireita < 0) return VELOCIDADE_AUTOSCROLL_MAX;

  if (daEsquerda < FAIXA_AUTOSCROLL_PX) {
    const forca = (FAIXA_AUTOSCROLL_PX - daEsquerda) / FAIXA_AUTOSCROLL_PX;
    return -Math.max(1, Math.round(forca * VELOCIDADE_AUTOSCROLL_MAX));
  }
  if (daDireita < FAIXA_AUTOSCROLL_PX) {
    const forca = (FAIXA_AUTOSCROLL_PX - daDireita) / FAIXA_AUTOSCROLL_PX;
    return Math.max(1, Math.round(forca * VELOCIDADE_AUTOSCROLL_MAX));
  }
  return 0;
}
