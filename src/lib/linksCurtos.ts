// Regras puras dos links curtos (QR dinâmico), fora do componente para poderem
// ser testadas sozinhas — e porque constante exportada de arquivo de tela
// atrapalha o hot reload.

/** Base do endereço que vai IMPRESSO no QR. Mudar isto invalida todo papel já
 *  produzido, então é constante de uma linha só, num lugar só. */
export const BASE_QR = 'https://www.cbrio.org/r/';

/**
 * Sugere o código a partir do nome. Espelha o backend de propósito: a pessoa vê
 * o código ANTES de salvar, e o que ela vê é o que vai ser gravado.
 *
 * ⚠️ A faixa `̀-ͯ` (marcas de acento) precisa ficar ESCAPADA. Escrita
 * com os caracteres literais ela funciona, mas some ao passar por ferramenta que
 * reescreva o arquivo — e aí a função para de tirar acento em silêncio,
 * "Inscrição" vira "inscric-a-o", e isso vai impresso e imutável. Coberto em
 * linksCurtos.test.ts.
 */
export function sugerirSlug(titulo: string) {
  return String(titulo || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
