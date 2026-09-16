import { describe, it, expect } from 'vitest';
import { cliqueAbreFicha } from '../pages/ministerial/totemKids/lib/cliqueFicha';

/** Simula um alvo de clique com um `closest` que casa por seletor. */
function alvoQueEstaDentroDe(seletores: string[]): Element {
  return {
    closest(sel: string) {
      const pedidos = sel.split(',').map(s => s.trim());
      return seletores.some(s => pedidos.includes(s)) ? ({} as Element) : null;
    },
  } as unknown as Element;
}
const alvoLivre = alvoQueEstaDentroDe([]);

describe('clique no card abre a ficha', () => {
  it('clique em área neutra do card abre', () => {
    expect(cliqueAbreFicha({ alvo: alvoLivre, temFicha: true })).toBe(true);
  });

  it('⚠️ clique em qualquer elemento com ação própria NÃO abre', () => {
    for (const tag of ['a', 'button', 'input', 'textarea', 'select', 'label', '[role="button"]', '[data-sem-ficha]']) {
      expect(cliqueAbreFicha({ alvo: alvoQueEstaDentroDe([tag]), temFicha: true })).toBe(false);
    }
  });

  it('⚠️ selecionar texto para copiar não abre a ficha ao soltar o mouse', () => {
    expect(cliqueAbreFicha({ alvo: alvoLivre, temFicha: true, temSelecao: true })).toBe(false);
  });

  it('⚠️ sem vínculo de cadastro não abre — não existe ficha para abrir', () => {
    expect(cliqueAbreFicha({ alvo: alvoLivre, temFicha: false })).toBe(false);
    expect(cliqueAbreFicha({ alvo: alvoLivre })).toBe(false);
  });

  it('⚠️ com a anotação aberta o card não abre a ficha por baixo do textarea', () => {
    expect(cliqueAbreFicha({ alvo: alvoLivre, temFicha: true, editandoNota: true })).toBe(false);
  });

  it('⚠️ FAIL-CLOSED: valor truthy que não é `true` não libera', () => {
    for (const v of [1, 'sim', {}, []]) {
      expect(cliqueAbreFicha({ alvo: alvoLivre, temFicha: v as any })).toBe(false);
    }
  });

  it('alvo ausente, nulo ou sem closest não explode e não abre', () => {
    expect(cliqueAbreFicha({ alvo: null, temFicha: true })).toBe(false);
    expect(cliqueAbreFicha({ alvo: undefined, temFicha: true })).toBe(false);
    expect(cliqueAbreFicha({ alvo: {} as Element, temFicha: true })).toBe(false);
    expect(cliqueAbreFicha(undefined as any)).toBe(false);
  });
});
