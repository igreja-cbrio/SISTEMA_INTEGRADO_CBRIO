import { describe, it, expect } from 'vitest';
import { trocarVizinho, aplicarNovaOrdem } from '../lib/ordenarTarefas';

const t = (id: string) => ({ id, titulo: id });

describe('trocarVizinho', () => {
  it('sobe e desce', () => {
    expect(trocarVizinho(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(trocarVizinho(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });
  it('⚠️ nas pontas devolve null — não grava "nova ordem" igual à antiga', () => {
    expect(trocarVizinho(['a', 'b'], 0, -1)).toBeNull();
    expect(trocarVizinho(['a', 'b'], 1, 1)).toBeNull();
  });
  it('índice fora da lista não quebra', () => {
    expect(trocarVizinho(['a'], 5, -1)).toBeNull();
    expect(trocarVizinho([], 0, 1)).toBeNull();
  });
  it('não muta a lista original', () => {
    const ids = ['a', 'b'];
    trocarVizinho(ids, 0, 1);
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('aplicarNovaOrdem', () => {
  it('⚠️⚠️ o grupo NÃO é contíguo: só as posições dele mudam, o resto fica', () => {
    // c e a são do grupo; x e y são de outros grupos, no meio.
    const lista = [t('c'), t('x'), t('a'), t('y')];
    const r = aplicarNovaOrdem(lista, ['a', 'c']);
    expect(r.map((i) => i.id)).toEqual(['a', 'x', 'c', 'y']);
  });

  it('grupo contíguo funciona igual', () => {
    const lista = [t('a'), t('b'), t('c')];
    expect(aplicarNovaOrdem(lista, ['c', 'b', 'a']).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('id que não está mais na lista é ignorado, não vira buraco', () => {
    const lista = [t('a'), t('b')];
    const r = aplicarNovaOrdem(lista, ['b', 'sumiu', 'a']);
    expect(r.map((i) => i.id)).toEqual(['b', 'a']);
    expect(r.every(Boolean)).toBe(true);
  });

  it('lista ou ids vazios devolvem a lista como está', () => {
    const lista = [t('a')];
    expect(aplicarNovaOrdem(lista, [])).toBe(lista);
    expect(aplicarNovaOrdem(lista, undefined as never)).toBe(lista);
  });

  it('não perde nem duplica ninguém', () => {
    const lista = ['a', 'b', 'c', 'd'].map(t);
    const r = aplicarNovaOrdem(lista, ['d', 'b']);
    expect(r).toHaveLength(4);
    expect(new Set(r.map((i) => i.id)).size).toBe(4);
  });
});
