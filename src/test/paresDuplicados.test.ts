import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { parKey, dedupPorParKey } = require_('../../backend/utils/paresDuplicados.js');

// Contexto: em 19/08/2026 o botão "Adiar todos" da aba Possíveis duplicidades
// devolveu `ON CONFLICT DO UPDATE command cannot affect row a second time`
// (21000). A causa era o MESMO par chegar duas vezes no lote, porque as duas
// fontes da fila emitem os ids em ordens diferentes e o mapa era chaveado pela
// ordem crua. Estes casos travam as duas metades do conserto.

const A = '00000000-0000-0000-0000-0000000000aa';
const B = '00000000-0000-0000-0000-0000000000bb';
const C = '00000000-0000-0000-0000-0000000000cc';

describe('parKey · a identidade do par são os dois ids ORDENADOS', () => {
  it('dá a MESMA chave nas duas ordens — é o que impede o par duplicado', () => {
    expect(parKey(A, B)).toBe(parKey(B, A));
  });

  it('usa o formato gravado em entradas_pares_adiados.par_key (menor_maior)', () => {
    expect(parKey(B, A)).toBe(`${A}_${B}`);
  });

  it('devolve null quando falta um lado — nunca uma chave pela metade', () => {
    expect(parKey(A, null)).toBeNull();
    expect(parKey(null, B)).toBeNull();
    expect(parKey(undefined, undefined)).toBeNull();
    expect(parKey(A, '')).toBeNull();
  });

  it('par consigo mesmo não é par', () => {
    expect(parKey(A, A)).toBeNull();
  });

  it('aceita id numérico sem inventar ordem numérica (a coluna é uuid/text)', () => {
    expect(parKey(10, 9)).toBe(parKey(9, 10));
  });
});

describe('dedupPorParKey · o lote NÃO pode levar a mesma chave duas vezes', () => {
  it('o caso real: progressiva (A,B) + triagem (B,A) viram UMA linha', () => {
    const entrada = [
      { membro_a_id: A, membro_b_id: B, origem: 'progressiva' },
      { membro_a_id: B, membro_b_id: A, origem: 'triagem' },
    ];
    const { linhas, duplicadas } = dedupPorParKey(entrada);
    expect(linhas).toHaveLength(1);
    expect(duplicadas).toBe(1);
  });

  it('preserva a PRIMEIRA ocorrência (quem chama já ordenou por relevância)', () => {
    const { linhas } = dedupPorParKey([
      { membro_a_id: A, membro_b_id: B, origem: 'progressiva' },
      { membro_a_id: B, membro_b_id: A, origem: 'triagem' },
    ]);
    expect(linhas[0].origem).toBe('progressiva');
  });

  it('não mexe em pares realmente diferentes', () => {
    const { linhas, duplicadas } = dedupPorParKey([
      { membro_a_id: A, membro_b_id: B },
      { membro_a_id: A, membro_b_id: C },
      { membro_a_id: B, membro_b_id: C },
    ]);
    expect(linhas).toHaveLength(3);
    expect(duplicadas).toBe(0);
  });

  it('descarta linha sem chave e CONTA — par_key é a unicidade da tabela', () => {
    const { linhas, semChave } = dedupPorParKey([
      { membro_a_id: A, membro_b_id: null },
      { membro_a_id: A, membro_b_id: B },
    ]);
    expect(linhas).toHaveLength(1);
    expect(semChave).toBe(1);
  });

  it('aceita leitor de chave próprio (o lote já monta par_key)', () => {
    const { linhas, duplicadas } = dedupPorParKey(
      [{ par_key: `${A}_${B}` }, { par_key: `${A}_${B}` }, { par_key: `${A}_${C}` }],
      (l: { par_key: string }) => l.par_key,
    );
    expect(linhas).toHaveLength(2);
    expect(duplicadas).toBe(1);
  });

  it('lista vazia ou inválida não estoura', () => {
    expect(dedupPorParKey([]).linhas).toEqual([]);
    expect(dedupPorParKey(null as never).linhas).toEqual([]);
    expect(dedupPorParKey(undefined as never).linhas).toEqual([]);
  });

  it('as chaves que sobram são únicas — é a invariante que o Postgres exige', () => {
    const entrada = [
      { membro_a_id: A, membro_b_id: B },
      { membro_a_id: B, membro_b_id: A },
      { membro_a_id: C, membro_b_id: A },
      { membro_a_id: A, membro_b_id: C },
      { membro_a_id: B, membro_b_id: C },
    ];
    const { linhas } = dedupPorParKey(entrada);
    const chaves = linhas.map((l: { membro_a_id: string; membro_b_id: string }) =>
      parKey(l.membro_a_id, l.membro_b_id));
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
