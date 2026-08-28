// Contrato do "quanto tempo o convertido levou até cada marco".
//
// Pedido do Matheus (14/08/2026): a tela de jornada dizia SE a pessoa bateu o
// marco, não QUANDO. Sem o tempo, o líder não distingue quem está começando de
// quem está parado há meio ano.
//
// ⚠️ MUTATION-TEST das armadilhas que fariam o painel MENTIR:
//   · marco em data de importação entrando na mediana (medido: 16 dos 23
//     convertidos com grupo caem numa das 3 cargas em massa — a mediana de
//     "tempo até entrar em grupo" seria 100% fabricada);
//   · marco alcançado SEM data virando "não alcançado" (diria "não fez o Next"
//     para quem esteve no encontro, só porque `next_encontros.data` é nullable);
//   · dia em UTC em vez de BRT (das 21h o dia já virou: o culto de domingo
//     19:00 cairia na segunda);
//   · média no lugar da mediana (a cauda de quem engaja em 300 dias arrasta).
import { describe, it, expect } from 'vitest';
import {
  diaBRT, diasEntre, datasDeImport, montarMarco,
  mediana, quantil, estatisticaMarco, diasParado, totalMarcos,
  MARCOS_TEMPO, CHAVES_SENSIVEIS_TEMPO,
} from '../../backend/utils/jornadaTempo.js';

describe('diaBRT · o dia é o da igreja, não o do UTC', () => {
  it('date puro passa intacto (construir Date aqui só criaria erro de fuso)', () => {
    expect(diaBRT('2026-08-12')).toBe('2026-08-12');
  });

  it('⚠️ culto de domingo 19:00 BRT NÃO cai na segunda', () => {
    // 2026-08-09 22:30 BRT = 2026-08-10 01:30 UTC
    expect(diaBRT('2026-08-10T01:30:00.000Z')).toBe('2026-08-09');
  });

  it('meia-noite UTC ainda é o dia anterior no Rio', () => {
    expect(diaBRT('2026-08-10T00:00:00.000Z')).toBe('2026-08-09');
  });

  it('vazio e lixo devolvem null, nunca uma data inventada', () => {
    expect(diaBRT(null)).toBeNull();
    expect(diaBRT('')).toBeNull();
    expect(diaBRT('nao-e-data')).toBeNull();
  });
});

describe('diasEntre', () => {
  it('conta dias inteiros', () => {
    expect(diasEntre('2026-01-01', '2026-01-31')).toBe(30);
  });

  it('atravessa o horário de verão sem perder/ganhar dia', () => {
    expect(diasEntre('2026-02-01', '2026-12-01')).toBe(303);
  });

  it('mesma data = 0', () => {
    expect(diasEntre('2026-05-05', '2026-05-05')).toBe(0);
  });

  it('sem uma das pontas devolve null (não 0 — 0 significaria "no mesmo dia")', () => {
    expect(diasEntre(null, '2026-05-05')).toBeNull();
    expect(diasEntre('2026-05-05', null)).toBeNull();
  });
});

describe('datasDeImport · carga de planilha não é dia de vida da igreja', () => {
  const carga = (dia: string, n: number) => Array.from({ length: n }, () => dia);

  it('pega as 3 cargas reais e NÃO pega o pico orgânico', () => {
    // números medidos em produção em 14/08/2026
    const datas = [
      ...carga('2026-06-19', 342),
      ...carga('2026-07-10', 233),
      ...carga('2026-06-23', 115),
      ...carga('2026-08-10', 71), // abertura da temporada T2 — adesão REAL
      ...carga('2026-08-09', 47),
    ];
    const out = datasDeImport(datas);
    expect([...out].sort()).toEqual(['2026-06-19', '2026-06-23', '2026-07-10']);
    expect(out.has('2026-08-10')).toBe(false);
  });

  it('⚠️ MUTANTE: limiar baixo passaria a marcar o dia de maior adesão real', () => {
    const datas = [...carga('2026-08-10', 71)];
    expect(datasDeImport(datas, { minPessoas: 50 }).has('2026-08-10')).toBe(true);
    expect(datasDeImport(datas).has('2026-08-10')).toBe(false);
  });

  it('lista vazia não explode', () => {
    expect(datasDeImport([]).size).toBe(0);
    expect(datasDeImport(null as any).size).toBe(0);
  });
});

describe('montarMarco · os três estados', () => {
  const t0 = '2026-01-10';

  it('sem data e sem alcançado = SEM REGISTRO (null), nunca "não fez"', () => {
    expect(montarMarco(null, t0)).toBeNull();
  });

  it('data confiável entra com dias e aproximada=false', () => {
    expect(montarMarco('2026-02-13', t0)).toEqual({
      alcancado: true, data: '2026-02-13', dias: 34, aproximada: false, motivo: null,
    });
  });

  it('⚠️ alcançado SEM data conta como alcançado e sai da mediana', () => {
    // é o caso do encontro do Next sem `data` e do contato marcado só por status
    const m = montarMarco(null, t0, { alcancado: true });
    expect(m).toMatchObject({ alcancado: true, data: null, dias: null, aproximada: true, motivo: 'sem_data' });
  });

  it('⚠️ data de importação CONTA como alcançado, mas é aproximada', () => {
    const m = montarMarco('2026-06-19', t0, { suspeita: true });
    expect(m).toMatchObject({ alcancado: true, aproximada: true, motivo: 'data_de_importacao' });
    expect(m!.dias).toBe(160);
  });

  it('⚠️ marco ANTES da decisão é aproximado (dias negativos fingiriam agilidade)', () => {
    const m = montarMarco('2025-12-01', t0);
    expect(m).toMatchObject({ alcancado: true, aproximada: true, motivo: 'antes_da_decisao' });
    expect(m!.dias).toBeLessThan(0);
  });

  it('o veto de "antes da decisão" roda ANTES do de importação', () => {
    // se a ordem invertesse, o motivo exibido explicaria a coisa errada
    expect(montarMarco('2025-12-01', t0, { suspeita: true })!.motivo).toBe('antes_da_decisao');
  });
});

describe('mediana e quantil', () => {
  it('mediana de lista vazia é null, NUNCA 0', () => {
    // 0 seria lido como "engajaram no mesmo dia" — o oposto de "não sei"
    expect(mediana([])).toBeNull();
    expect(mediana(null as any)).toBeNull();
  });

  it('ímpar pega o do meio; par tira a média dos dois centrais', () => {
    expect(mediana([10, 2, 6])).toBe(6);
    expect(mediana([2, 4, 6, 10])).toBe(5);
  });

  it('⚠️ MUTANTE: média no lugar da mediana é arrastada pela cauda', () => {
    const dias = [10, 12, 14, 16, 300];
    const media = Math.round(dias.reduce((a, b) => a + b, 0) / dias.length);
    expect(mediana(dias)).toBe(14);
    expect(media).toBe(70); // não descreve ninguém da lista
  });

  it('quartis delimitam a faixa do meio', () => {
    const dias = [10, 20, 30, 40, 50];
    expect(quantil(dias, 0.25)).toBe(20);
    expect(quantil(dias, 0.75)).toBe(40);
  });
});

describe('estatisticaMarco · o que a tela mostra', () => {
  const pessoa = (marcos: any) => ({ marcos });

  it('separa alcançados de quem tem data confiável, e declara os aproximados', () => {
    const pessoas = [
      pessoa({ grupo: { alcancado: true, dias: 30, aproximada: false } }),
      pessoa({ grupo: { alcancado: true, dias: 50, aproximada: false } }),
      pessoa({ grupo: { alcancado: true, dias: 160, aproximada: true, motivo: 'data_de_importacao' } }),
      pessoa({}),
    ];
    const e = estatisticaMarco(pessoas, 'grupo');
    expect(e.alcancaram).toBe(3);
    expect(e.pct).toBe(75);
    expect(e.com_data_confiavel).toBe(2);
    expect(e.aproximados).toBe(1);
    expect(e.mediana).toBe(40);
  });

  it('⚠️ MUTANTE: incluir a data de importação move a mediana', () => {
    const dias = [30, 50, 160];
    expect(mediana(dias)).toBe(50); // seria isso se o aproximado entrasse
    expect(mediana([30, 50])).toBe(40); // é isso que a régua entrega
  });

  it('marco que ninguém alcançou devolve mediana null, não 0', () => {
    const e = estatisticaMarco([pessoa({}), pessoa({})], 'servir');
    expect(e.alcancaram).toBe(0);
    expect(e.mediana).toBeNull();
  });

  it('coorte vazia não divide por zero', () => {
    expect(estatisticaMarco([], 'batismo')).toMatchObject({ alcancaram: 0, pct: 0, mediana: null });
  });
});

describe('diasParado · "há quanto tempo essa pessoa não registra nada"', () => {
  const hoje = '2026-08-14';

  it('sem marco nenhum, conta desde a decisão', () => {
    expect(diasParado({ data_decisao: '2026-01-01', marcos: {} } as any, hoje)).toBe(225);
  });

  it('com marco, conta a partir do MAIS RECENTE', () => {
    const p = { data_decisao: '2026-01-01', marcos: { contato: { alcancado: true, dias: 2 }, next: { alcancado: true, dias: 40 } } };
    expect(diasParado(p as any, hoje)).toBe(185);
  });

  it('marco sem dias (aproximado) não conta como atividade recente', () => {
    const p = { data_decisao: '2026-01-01', marcos: { next: { alcancado: true, dias: null } } };
    expect(diasParado(p as any, hoje)).toBe(225);
  });

  it('nunca devolve negativo', () => {
    const p = { data_decisao: '2026-08-14', marcos: { contato: { alcancado: true, dias: 0 } } };
    expect(diasParado(p as any, hoje)).toBe(0);
  });
});

describe('catálogo', () => {
  it('generosidade é o ÚNICO marco sensível (espelha jornadaMarcadores)', () => {
    expect(CHAVES_SENSIVEIS_TEMPO).toEqual(['generosidade']);
  });

  it('a ordem do catálogo é a ordem da jornada', () => {
    expect(MARCOS_TEMPO.map((m) => m.chave)).toEqual(
      ['contato', 'next', 'batismo', 'grupo', 'servir', 'generosidade'],
    );
  });

  it('só contato/next/batismo têm prazo — pertencer não tem prazo', () => {
    const comPrazo = MARCOS_TEMPO.filter((m) => m.meta_dias !== null).map((m) => m.chave);
    expect(comPrazo).toEqual(['contato', 'next', 'batismo']);
  });

  it('totalMarcos conta só os alcançados', () => {
    expect(totalMarcos({ marcos: { contato: { alcancado: true }, next: { alcancado: true } } } as any)).toBe(2);
    expect(totalMarcos({ marcos: {} } as any)).toBe(0);
  });
});
