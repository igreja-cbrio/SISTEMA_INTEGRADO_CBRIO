import { describe, it, expect } from 'vitest';
import {
  normalizarIds, separarExclusaoLote, resumoDoLote, TETO_LOTE,
} from '../../backend/utils/exclusaoInscricaoLote.js';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('normalizarIds · o que o cliente manda não é o que a gente apaga', () => {
  it('aceita uuid, descarta lixo e DECLARA o que descartou', () => {
    const r = normalizarIds([ID(1), 'nao-e-uuid', '', null, ID(2)]);
    expect(r.ids).toEqual([ID(1), ID(2)]);
    expect(r.ignorados).toBe(3);
  });

  it('id repetido conta uma vez só (senão o resumo diria 2 exclusões de 1 linha)', () => {
    const r = normalizarIds([ID(1), ID(1), ID(1)]);
    expect(r.ids).toEqual([ID(1)]);
  });

  it('⚠️ corta no teto e DIZ quantas ficaram de fora', () => {
    const muitos = Array.from({ length: TETO_LOTE + 7 }, (_, i) => ID(i + 1));
    const r = normalizarIds(muitos);
    expect(r.ids).toHaveLength(TETO_LOTE);
    // Truncar em silêncio faria a pessoa achar que apagou as 207 quando apagou 200.
    expect(r.acimaDoTeto).toBe(7);
  });

  it('payload que não é lista não explode', () => {
    expect(normalizarIds(undefined).ids).toEqual([]);
    expect(normalizarIds('tudo' as unknown as string[]).ids).toEqual([]);
    expect(normalizarIds({} as unknown as string[]).ids).toEqual([]);
  });
});

describe('separarExclusaoLote · o servidor reavalia, o payload só sugere', () => {
  const vivas = [
    { id: ID(1), nome_completo: 'Ana Teste' },
    { id: ID(2), nome_completo: 'Bruno Pagante' },
    { id: ID(3), nome_completo: 'Carla Teste' },
  ];

  it('⚠️⚠️ QUEM TEM PAGAMENTO NÃO SAI EM LOTE — e é declarado com nome', () => {
    // Apagar quem pagou some com a pessoa do placar enquanto o dinheiro segue
    // na conta da igreja. Se alguém "simplificar" tirando este ramo, some a
    // única guarda entre um clique em massa e receita escondida.
    const r = separarExclusaoLote([ID(1), ID(2), ID(3)], vivas, [ID(2)]);
    expect(r.excluir).toEqual([ID(1), ID(3)]);
    expect(r.comPagamento).toEqual([{ id: ID(2), nome: 'Bruno Pagante' }]);
  });

  it('id que não está VIVO NESTE evento não é apagado — vira "não encontrada"', () => {
    // Cobre os três casos de uma vez: já apagada, de outro evento e id
    // inventado. O payload é do cliente; a lista viva é a verdade.
    const r = separarExclusaoLote([ID(1), ID(9)], vivas, []);
    expect(r.excluir).toEqual([ID(1)]);
    expect(r.naoEncontradas).toEqual([ID(9)]);
  });

  it('lote inteiro bloqueado não excluí nada e não vira erro', () => {
    const r = separarExclusaoLote([ID(2)], vivas, [ID(2)]);
    expect(r.excluir).toEqual([]);
    expect(r.comPagamento).toHaveLength(1);
    expect(r.naoEncontradas).toEqual([]);
  });

  it('lista de bloqueados vazia/ausente não quebra', () => {
    expect(separarExclusaoLote([ID(1)], vivas, []).excluir).toEqual([ID(1)]);
    expect(separarExclusaoLote([ID(1)], vivas, undefined as unknown as string[]).excluir).toEqual([ID(1)]);
  });

  it('sem linhas vivas, nada é excluído (evento vazio ou consulta sem resultado)', () => {
    const r = separarExclusaoLote([ID(1), ID(2)], [], []);
    expect(r.excluir).toEqual([]);
    expect(r.naoEncontradas).toHaveLength(2);
  });
});

describe('resumoDoLote · "12 excluídas" não distingue sucesso de exclusão parcial', () => {
  it('caso limpo diz só o que foi feito', () => {
    expect(resumoDoLote({ excluidas: 3 })).toBe('3 inscrições excluídas.');
    expect(resumoDoLote({ excluidas: 1 })).toBe('1 inscrição excluída.');
  });

  it('o que ficou de fora aparece na frase, com o caminho', () => {
    const frase = resumoDoLote({ excluidas: 2, comPagamento: 1, naoEncontradas: 1 });
    expect(frase).toContain('2 inscrições excluídas');
    expect(frase).toContain('pagamento');
    expect(frase).toContain('já não estava na lista');
  });

  it('falha NÃO se disfarça de sucesso — diz que a linha continua na lista', () => {
    expect(resumoDoLote({ excluidas: 0, falhas: 2 })).toContain('continuam na lista');
  });
});
