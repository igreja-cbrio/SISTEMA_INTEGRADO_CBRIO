import { describe, it, expect } from 'vitest';
import { proximoCursor } from '../../backend/utils/cursorLote';

const pagina = (ids: string[]) => ids.map(id => ({ id }));

describe('proximoCursor', () => {
  it('página cheia devolve a chave do ÚLTIMO', () => {
    expect(proximoCursor(pagina(['a', 'b', 'c']), 3)).toBe('c');
  });

  it('⚠️ página incompleta encerra — é o que distingue o último lote', () => {
    expect(proximoCursor(pagina(['a', 'b']), 3)).toBe(null);
    expect(proximoCursor([], 3)).toBe(null);
  });

  it('⚠️ a chave vem da página CRUA, não da filtrada', () => {
    // O último da página pode ser descartado pela aplicação (conta de sistema).
    // Se o cursor viesse da lista já filtrada, ele voltaria pra 'b' e o
    // percurso repetiria a mesma página pra sempre.
    const crua = pagina(['a', 'b', 'sistema']);
    const filtrada = crua.filter(r => r.id !== 'sistema');
    expect(proximoCursor(crua, 3)).toBe('sistema');
    expect(proximoCursor(filtrada, 3)).not.toBe('sistema');
  });

  it('não estoura com entrada inválida', () => {
    expect(proximoCursor(null as any, 3)).toBe(null);
    expect(proximoCursor(pagina(['a']), 1)).toBe('a');
    expect(proximoCursor([{ id: null } as any], 1)).toBe(null);
  });
});
