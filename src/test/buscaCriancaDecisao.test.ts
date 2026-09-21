import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tokensDaBusca, dataDaDecisao, montarResultado } = require('../../backend/utils/buscaCriancaDecisao.js');

const crianca = (o: Record<string, unknown>) => ({ ativo: true, visitante: false, ...o });

describe('tokensDaBusca', () => {
  // ⚠️ Foi acento que fez "monica" não achar "Mônica" no seletor de supervisor.
  it('tira acento dos dois lados', () => {
    expect(tokensDaBusca('Mônica')).toEqual(['monica']);
    expect(tokensDaBusca('Ana Júlia')).toEqual(['ana', 'julia']);
  });

  it('descarta ligações e letra solta', () => {
    expect(tokensDaBusca('Vicente de Souza')).toEqual(['vicente', 'souza']);
    expect(tokensDaBusca('a e o')).toEqual([]);
  });

  it('espaço sobrando e pontuação não atrapalham', () => {
    expect(tokensDaBusca('  Maria   Eduarda  ')).toEqual(['maria', 'eduarda']);
    expect(tokensDaBusca(null as never)).toEqual([]);
  });
});

describe('dataDaDecisao', () => {
  // ⚠️ `decidiu_em` existe pro REPLAY: decisão registrada hoje sobre culto antigo.
  it('decidiu_em vence o carimbo de digitação', () => {
    expect(dataDaDecisao({ decidiu_em: '2026-03-11', registrado_em: '2026-09-02T11:32:00Z' })).toBe('2026-03-11');
  });
  it('sem decidiu_em cai no registrado_em', () => {
    expect(dataDaDecisao({ registrado_em: '2026-09-02T11:32:00Z' })).toBe('2026-09-02');
  });
  it('lixo devolve null, nunca data inventada', () => {
    expect(dataDaDecisao({})).toBeNull();
    expect(dataDaDecisao({ registrado_em: 'xx' })).toBeNull();
  });
});

describe('montarResultado · os TRÊS estados', () => {
  // ⚠️⚠️ A LEI: criança que EXISTE e não tem registro tem de APARECER, como
  // `sem_decisao`. Sumir com ela transforma "não achei" e "achei e não tem" na
  // mesma resposta — e as duas levam a ações opostas.
  it('criança sem decisão APARECE, como sem_decisao', () => {
    const r = montarResultado({
      criancas: [crianca({ id: 'a', nome: 'Ana Clara', nome_norm: 'ana clara' })],
      decisoes: [], termo: 'ana',
    });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].estado).toBe('sem_decisao');
    expect(r.itens[0].total_decisoes).toBe(0);
  });

  it('com decisão traz data e culto', () => {
    const r = montarResultado({
      criancas: [crianca({ id: 'a', nome: 'Bento Seibel', nome_norm: 'bento seibel' })],
      decisoes: [{ kids_crianca_id: 'a', decidiu_em: '2026-08-30', culto_nome: 'Domingo 09:30' }],
      termo: 'bento',
    });
    expect(r.itens[0].estado).toBe('com_decisao');
    expect(r.itens[0].ultima).toBe('2026-08-30');
    expect(r.itens[0].decisoes[0].culto).toBe('Domingo 09:30');
  });

  // ⚠️⚠️ A view do módulo filtra `ativo = true`. Criança que saiu do ministério
  // mas ACEITOU não pode sumir — é o falso negativo que mais importa aqui.
  it('ficha INATIVA aparece, marcada', () => {
    const r = montarResultado({
      criancas: [crianca({ id: 'a', nome: 'Isabella Batista', nome_norm: 'isabella batista', ativo: false })],
      decisoes: [{ kids_crianca_id: 'a', decidiu_em: '2026-03-01' }],
      termo: 'isabella',
    });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].ativa).toBe(false);
    expect(r.itens[0].estado).toBe('com_decisao');
  });

  // ⚠️ A ficha e a decisão nominal podem divergir — mostra os dois.
  it('ficha com data de conversão e sem decisão nominal mostra as duas coisas', () => {
    const r = montarResultado({
      criancas: [crianca({ id: 'a', nome: 'Gael Vanzella', nome_norm: 'gael vanzella', data_conversao: '2026-04-01' })],
      decisoes: [], termo: 'gael',
    });
    expect(r.itens[0].estado).toBe('sem_decisao');
    expect(r.itens[0].data_conversao_ficha).toBe('2026-04-01');
  });

  it('ordena por tokens em comum, e ativa antes de inativa no empate', () => {
    const r = montarResultado({
      criancas: [
        crianca({ id: 'x', nome: 'Ana Souza', nome_norm: 'ana souza' }),
        crianca({ id: 'y', nome: 'Ana Júlia Alves', nome_norm: 'ana julia alves' }),
      ],
      decisoes: [], termo: 'ana julia',
    });
    expect(r.itens[0].nome).toBe('Ana Júlia Alves');
  });

  // ⚠️ Truncar em silêncio é a doença do seletor de supervisor (teto de 8 mudo).
  it('teto estourado é DECLARADO', () => {
    const muitas = Array.from({ length: 30 }, (_, i) => crianca({ id: `i${i}`, nome: `Ana ${i}`, nome_norm: `ana ${i}` }));
    const r = montarResultado({ criancas: muitas, decisoes: [], termo: 'ana', teto: 25 });
    expect(r.itens).toHaveLength(25);
    expect(r.total).toBe(30);
    expect(r.truncado).toBe(true);
  });

  it('sem resultado devolve lista vazia sem truncado', () => {
    const r = montarResultado({ criancas: [], decisoes: [], termo: 'zzz' });
    expect(r.itens).toEqual([]);
    expect(r.truncado).toBe(false);
  });

  it('decisão órfã (sem kids_crianca_id) não derruba nem inventa criança', () => {
    const r = montarResultado({
      criancas: [crianca({ id: 'a', nome: 'Davi', nome_norm: 'davi' })],
      decisoes: [{ kids_crianca_id: null, decidiu_em: '2026-01-01' }],
      termo: 'davi',
    });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].estado).toBe('sem_decisao');
  });
});
