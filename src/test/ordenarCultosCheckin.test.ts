// ⚠️⚠️ A ORDEM DOS CULTOS NA TELA DE CHECK-IN.
//
// Pedido do Matheus (23/09/2026): *"queria que fosse ordenado pela data. Pois a
// ariel ta fazendo o checkin retroativo dos voluntarios do online, eai ela
// precisa dessa organizacao"*.
//
// Antes era por PROXIMIDADE de hoje (`Math.abs(data - agora)`), que produz
// hoje → ontem → amanhã → anteontem: ótimo para achar o culto do momento no
// totem, e ilegível para trabalhar um mês inteiro em sequência.
//
// ⚠️ Data decrescente PURA quebraria o uso ao vivo. Medido em 23/09: a janela
// tem **144 cultos — 29 futuros, 2 hoje, 113 passados**. Com os futuros no topo,
// o operador rolaria 29 itens no domingo para achar o culto que está
// acontecendo. Por isso o futuro vai para o FIM: check-in é sempre de algo que
// já aconteceu.
import { describe, it, expect } from 'vitest';
import { ordenarCultosCheckin } from '@/pages/ministerial/voluntariado/hooks/useVolServices';

// Meio-dia BRT evita que o corte por dia caia na virada.
const AGORA = new Date('2026-09-23T15:00:00Z');
const c = (scheduled_at: string, id = scheduled_at) => ({ id, scheduled_at });
const ids = (arr: { id: string }[]) => arr.map((x) => x.id);

describe('⚠️⚠️ hoje e o passado primeiro, em ordem de data', () => {
  it('o passado vem do mais recente para o mais antigo', () => {
    const r = ordenarCultosCheckin([
      c('2026-08-02T22:00:00Z', 'ago02'),
      c('2026-09-20T22:00:00Z', 'set20'),
      c('2026-08-16T22:00:00Z', 'ago16'),
    ], AGORA);
    expect(ids(r), 'a Ariel trabalha o mês inteiro em sequência').toEqual(['set20', 'ago16', 'ago02']);
  });

  it('⚠️ o culto de HOJE fica no topo — é o uso ao vivo', () => {
    const r = ordenarCultosCheckin([
      c('2026-09-27T22:00:00Z', 'futuro'),
      c('2026-09-20T22:00:00Z', 'passado'),
      c('2026-09-23T22:00:00Z', 'hoje'),
    ], AGORA);
    expect(ids(r)[0], 'no domingo ninguém pode rolar 29 itens para achar o culto do momento').toBe('hoje');
  });

  it('⚠️⚠️ e o culto de hoje às 19h NÃO conta como futuro às 12h', () => {
    // O corte é por DIA: senão o mesmo culto mudaria de bloco no meio do domingo.
    const r = ordenarCultosCheckin([
      c('2026-09-30T22:00:00Z', 'outro-dia'),
      c('2026-09-23T22:00:00Z', 'hoje-19h'),
    ], AGORA);
    expect(ids(r)[0]).toBe('hoje-19h');
  });
});

describe('⚠️ o futuro vai para o FIM, e em ordem crescente', () => {
  it('depois de todo o passado', () => {
    const r = ordenarCultosCheckin([
      c('2026-10-04T22:00:00Z', 'out04'),
      c('2026-08-02T22:00:00Z', 'ago02'),
      c('2026-09-27T22:00:00Z', 'set27'),
    ], AGORA);
    expect(ids(r)).toEqual(['ago02', 'set27', 'out04']);
  });

  it('⚠️ o futuro MAIS PRÓXIMO primeiro — é o próximo culto a acontecer', () => {
    const r = ordenarCultosCheckin([
      c('2026-10-25T22:00:00Z', 'longe'),
      c('2026-09-27T22:00:00Z', 'perto'),
    ], AGORA);
    expect(ids(r)).toEqual(['perto', 'longe']);
  });
});

describe('⚠️ dado ruim não some da lista', () => {
  it('data ilegível fica com o passado, não no fim', () => {
    const r = ordenarCultosCheckin([
      c('2026-10-04T22:00:00Z', 'futuro'),
      c('nao-e-data', 'quebrado'),
    ], AGORA);
    expect(
      ids(r).indexOf('quebrado'),
      'mandar para o fim esconderia o problema no rodapé de 144 itens',
    ).toBeLessThan(ids(r).indexOf('futuro'));
  });

  it('não muta o array recebido', () => {
    const entrada = [c('2026-08-02T22:00:00Z', 'a'), c('2026-09-20T22:00:00Z', 'b')];
    ordenarCultosCheckin(entrada, AGORA);
    expect(ids(entrada)).toEqual(['a', 'b']);
  });

  it('lista vazia não quebra', () => {
    expect(ordenarCultosCheckin([], AGORA)).toEqual([]);
  });
});
