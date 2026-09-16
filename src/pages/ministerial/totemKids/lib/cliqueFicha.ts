/**
 * O card inteiro da inscrição abre a ficha — mas ele carrega botões dentro
 * (WhatsApp, Anotação, Encaminhar, copiar e-mail) e um textarea quando a
 * anotação está aberta.
 *
 * ⚠️⚠️ Vive aqui, e não dentro do componente, porque DECIDE algo. Guarda que
 * decide e mora no meio do JSX é guarda que nenhum teste alcança — é a mesma
 * lição que custou as 623 escalas religadas errado.
 *
 * Dois jeitos de o clique no card atrapalhar em vez de ajudar:
 *   1. clicar em "Encaminhar ao ministério" abriria TAMBÉM a ficha, por cima
 *      da ação que a pessoa quis;
 *   2. arrastar o mouse para selecionar o e-mail e copiar abriria a ficha ao
 *      soltar o botão.
 */

/** Elementos que já têm ação própria: clique neles NUNCA vira abrir-ficha. */
const INTERATIVOS = 'a,button,input,textarea,select,label,[role="button"],[data-sem-ficha]';

export type EntradaClique = {
  /** O `event.target`. */
  alvo: Element | null | undefined;
  /** Há texto selecionado na página neste momento? */
  temSelecao?: boolean;
  /** A inscrição está vinculada a um cadastro? Sem vínculo não há ficha. */
  temFicha?: boolean;
  /** A anotação desta inscrição está aberta para edição? */
  editandoNota?: boolean;
};

/**
 * `true` somente quando o clique deve abrir a ficha.
 * ⚠️ FAIL-CLOSED: na dúvida, não abre. Abrir demais interrompe o trabalho de
 * quem está triando; abrir de menos custa um clique no nome, que continua
 * sendo um <button> de verdade (e é por ele que teclado e leitor de tela
 * chegam à ficha — o card é atalho de mouse, nunca a via única).
 */
export function cliqueAbreFicha(e: EntradaClique): boolean {
  if (!e) return false;
  if (e.temFicha !== true) return false;
  if (e.editandoNota === true) return false;
  if (e.temSelecao === true) return false;
  const alvo = e.alvo;
  if (!alvo || typeof alvo.closest !== 'function') return false;
  if (alvo.closest(INTERATIVOS)) return false;
  return true;
}
