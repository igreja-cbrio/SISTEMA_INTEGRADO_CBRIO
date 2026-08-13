// ============================================================================
// Contagem de inscritos por evento · a guarda do soft-delete (2026-08-10)
//
// O bug que este teste existe pra impedir: o card da série RETIRO dizia
// "14 no total" e o detalhe do MESMO evento dizia 0, porque o embed
// `inscricoes(count)` do PostgREST conta linha APAGADA. Aqui o `db` é
// falsificado — o que está sob teste é a CONSULTA que montamos (filtro,
// paginação, lotes), não o PostgREST.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { contarInscritosVivos, PAGINA, LOTE_IDS } = require_(
  '../../backend/services/inscricaoContagem.js',
);

type Chamada = { filtros: Record<string, unknown>; range: [number, number] };

/**
 * Banco falso: guarda o que foi pedido e devolve as linhas cruas.
 * `linhas` são as que o servidor devolveria PARA AQUELA consulta — então um
 * teste que não filtra soft-delete precisa devolver as apagadas de propósito.
 */
function dbFake(linhas: { evento_id: string; deleted_at?: string | null }[]) {
  const chamadas: Chamada[] = [];
  const db = {
    from() {
      const estado: Chamada = { filtros: {}, range: [0, 0] };
      const q: any = {
        select() { return q; },
        in(col: string, vals: string[]) { estado.filtros[`in:${col}`] = vals; return q; },
        is(col: string, val: unknown) { estado.filtros[`is:${col}`] = val; return q; },
        range(de: number, ate: number) {
          estado.range = [de, ate];
          chamadas.push(estado);
          // Só entrega o que casa com os filtros que o helper pediu.
          const ids = (estado.filtros['in:evento_id'] as string[]) || [];
          const filtraApagada = 'is:deleted_at' in estado.filtros;
          const elegiveis = linhas.filter(
            (l) => ids.includes(l.evento_id) && (!filtraApagada || !l.deleted_at),
          );
          return Promise.resolve({
            data: elegiveis.slice(de, ate + 1).map((l) => ({ evento_id: l.evento_id })),
            error: null,
          });
        },
      };
      return q;
    },
  };
  return { db, chamadas };
}

describe('contarInscritosVivos', () => {
  it('IGNORA inscrição apagada — o bug do card "14 no total" com detalhe 0', async () => {
    // O caso real: 14 linhas, TODAS soft-deletadas pelo Matheus.
    const linhas = Array.from({ length: 14 }, () => ({
      evento_id: 'retiro', deleted_at: '2026-08-05T18:00:00Z',
    }));
    const { db } = dbFake(linhas);
    const c = await contarInscritosVivos(db, ['retiro']);
    expect(c.get('retiro')).toBeUndefined(); // sem linha viva = nem entra no mapa
  });

  it('⚠️ MUTANTE: pede `deleted_at is null` na consulta', async () => {
    // Tirar o `.is('deleted_at', null)` do helper faz este teste falhar — é a
    // única coisa que separa "0 inscritos" de "14 inscritos apagados".
    const { db, chamadas } = dbFake([{ evento_id: 'e1', deleted_at: null }]);
    await contarInscritosVivos(db, ['e1']);
    expect(chamadas[0].filtros).toHaveProperty('is:deleted_at', null);
  });

  it('conta só as vivas quando há mistura (Celebra: 201 no banco, 200 vivas)', async () => {
    const linhas = [
      ...Array.from({ length: 200 }, () => ({ evento_id: 'celebra', deleted_at: null })),
      { evento_id: 'celebra', deleted_at: '2026-07-30T12:00:00Z' },
    ];
    const { db } = dbFake(linhas);
    const c = await contarInscritosVivos(db, ['celebra']);
    expect(c.get('celebra')).toBe(200);
  });

  it('separa a contagem por evento numa consulta só', async () => {
    const { db } = dbFake([
      { evento_id: 'a', deleted_at: null },
      { evento_id: 'a', deleted_at: null },
      { evento_id: 'b', deleted_at: null },
      { evento_id: 'c', deleted_at: '2026-01-01' },
    ]);
    const c = await contarInscritosVivos(db, ['a', 'b', 'c']);
    expect([c.get('a'), c.get('b'), c.get('c')]).toEqual([2, 1, undefined]);
  });

  it('PAGINA além do cap do PostgREST — sem isso a contagem trunca em silêncio', async () => {
    const linhas = Array.from({ length: PAGINA + 7 }, () => ({
      evento_id: 'grande', deleted_at: null,
    }));
    const { db, chamadas } = dbFake(linhas);
    const c = await contarInscritosVivos(db, ['grande']);
    expect(c.get('grande')).toBe(PAGINA + 7);
    expect(chamadas.length).toBe(2); // 1ª página cheia ⇒ pede a 2ª
  });

  it('quebra a lista de ids em lotes (`.in()` longo estoura a URL)', async () => {
    const ids = Array.from({ length: LOTE_IDS + 5 }, (_, i) => `ev${i}`);
    const { db, chamadas } = dbFake(ids.map((id) => ({ evento_id: id, deleted_at: null })));
    const c = await contarInscritosVivos(db, ids);
    expect(chamadas.length).toBe(2);
    expect((chamadas[0].filtros['in:evento_id'] as string[]).length).toBe(LOTE_IDS);
    expect((chamadas[1].filtros['in:evento_id'] as string[]).length).toBe(5);
    expect(c.size).toBe(ids.length);
  });

  it('id repetido não conta duas vezes (dedup antes de consultar)', async () => {
    const { db, chamadas } = dbFake([{ evento_id: 'x', deleted_at: null }]);
    await contarInscritosVivos(db, ['x', 'x', 'x']);
    expect((chamadas[0].filtros['in:evento_id'] as string[])).toEqual(['x']);
  });

  it('lista vazia não consulta nada', async () => {
    const { db, chamadas } = dbFake([]);
    const c = await contarInscritosVivos(db, []);
    expect(c.size).toBe(0);
    expect(chamadas.length).toBe(0);
  });

  it('erro do banco PROPAGA — contagem errada é pior que erro visível', async () => {
    const db = {
      from: () => ({
        select: () => ({
          in: () => ({
            is: () => ({ range: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
          }),
        }),
      }),
    };
    await expect(contarInscritosVivos(db, ['e1'])).rejects.toBeTruthy();
  });
});
