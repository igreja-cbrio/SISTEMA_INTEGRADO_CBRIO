// Rolagem automática enquanto se arrasta — a régua PURA.
//
// Vive aqui, e não no componente, porque é conta: a velocidade cresce conforme o
// ponteiro entra na zona da borda, e errar isso dá os dois defeitos clássicos —
// rolagem que dispara longe da borda (a tela "foge" no meio do arrasto) ou que
// só anda quando o ponteiro já saiu da janela (não dá pra alcançar).
//
// O componente cuida do laço de animação e dos listeners; aqui não há DOM além
// da busca do container, que é leitura de estilo computado.

/** Faixa (px) junto ao topo e à base que ativa a rolagem. */
export const ZONA_BORDA = 90;
/** Velocidade máxima, em px por frame (~60fps ⇒ ~1.400 px/s no limite). */
export const VELOCIDADE_MAX = 24;

/**
 * Quantos px rolar neste frame, dado o Y do ponteiro e a altura visível.
 * Negativo = para cima. Zero = fora das zonas, não rola.
 *
 * ⚠️ A proporção é SATURADA em 1: ponteiro fora da janela (y < 0, ou y maior que
 * a altura — acontece ao arrastar rápido) continua na velocidade máxima em vez de
 * virar um número absurdo. Sem isso, um arrasto brusco jogaria a página inteira.
 */
export function velocidadeAutoScroll(
  y: number,
  altura: number,
  zona: number = ZONA_BORDA,
  vMax: number = VELOCIDADE_MAX,
): number {
  if (!Number.isFinite(y) || !Number.isFinite(altura) || altura <= 0) return 0;
  // Zona maior que metade da janela não faz sentido: as duas se sobreporiam e
  // o meio da tela rolaria para os dois lados.
  const z = Math.max(1, Math.min(zona, Math.floor(altura / 2)));

  if (y < z) {
    const p = Math.min(1, (z - y) / z);
    return -Math.max(1, Math.round(p * vMax));
  }
  if (y > altura - z) {
    const p = Math.min(1, (y - (altura - z)) / z);
    return Math.max(1, Math.round(p * vMax));
  }
  return 0;
}

/**
 * Quem rola: o ancestral com barra de rolagem própria, ou `null` para a janela.
 *
 * ⚠️ Conferido em 10/08/2026 que a casca do sistema (`AppShell`) NÃO tem wrapper
 * com `overflow:auto` — hoje quem rola é o documento, então isto devolve `null`.
 * A busca existe porque, se algum dia a lista for para dentro de um painel com
 * rolagem própria, `window.scrollBy` passaria a não fazer NADA: a funcionalidade
 * morreria em silêncio, sem erro, e ninguém saberia por quê.
 */
export function containerDeScroll(el: Element | null): Element | null {
  let atual: Element | null = el?.parentElement || null;
  while (atual && atual !== document.body && atual !== document.documentElement) {
    const estilo = getComputedStyle(atual);
    const rolavel = /(auto|scroll|overlay)/.test(estilo.overflowY);
    if (rolavel && atual.scrollHeight > atual.clientHeight + 1) return atual;
    atual = atual.parentElement;
  }
  return null;
}

/** Já está no fim daquele lado? Evita manter o laço vivo sem efeito. */
export function podeRolar(alvo: Element | null, delta: number): boolean {
  if (delta === 0) return false;
  if (!alvo) {
    const y = window.scrollY;
    if (delta < 0) return y > 0;
    return y + window.innerHeight < document.documentElement.scrollHeight - 1;
  }
  if (delta < 0) return alvo.scrollTop > 0;
  return alvo.scrollTop + alvo.clientHeight < alvo.scrollHeight - 1;
}
