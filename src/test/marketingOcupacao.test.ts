import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const {
  OCUPACOES_DIAS, ehDiaUtil, proximoDiaUtil, calcularDataFim,
  diasUteisNoIntervalo, cargaNoDia, ocupacaoPorDia,
} = require_('../../backend/utils/marketingOcupacao.js');

// 2026-08-17 é uma SEGUNDA · 22 = sábado · 23 = domingo · 24 = segunda.
const SEG = '2026-08-17';
const TER = '2026-08-18';
const SEX = '2026-08-21';
const SAB = '2026-08-22';
const DOM = '2026-08-23';
const SEG2 = '2026-08-24';

describe('dia útil', () => {
  it('reconhece a semana e o fim de semana', () => {
    expect(ehDiaUtil(SEG)).toBe(true);
    expect(ehDiaUtil(SEX)).toBe(true);
    expect(ehDiaUtil(SAB)).toBe(false);
    expect(ehDiaUtil(DOM)).toBe(false);
  });

  // ⚠️ A conta é em UTC de propósito: `new Date('2026-08-17').getDay()` cai no
  // fuso local e no Rio devolve o dia ANTERIOR — sábado viraria dia útil.
  it('não escorrega de dia por causa de fuso', () => {
    expect(ehDiaUtil('2026-08-24')).toBe(true);
    expect(ehDiaUtil('2026-08-23')).toBe(false);
  });

  it('recusa data inexistente e entrada inválida', () => {
    expect(ehDiaUtil('2026-02-31')).toBe(false);   // Date.parse rolaria pra março
    expect(ehDiaUtil('17/08/2026')).toBe(false);
    expect(ehDiaUtil('' as any)).toBe(false);
    expect(ehDiaUtil(null as any)).toBe(false);
  });

  it('próximo dia útil pula o fim de semana', () => {
    expect(proximoDiaUtil(SAB)).toBe(SEG2);
    expect(proximoDiaUtil(DOM)).toBe(SEG2);
    expect(proximoDiaUtil(SEG)).toBe(SEG);          // já é útil: não anda
  });
});

describe('quanto ocupa → data de fim', () => {
  // ⚠️ O dia de início CONTA como o 1º dia ocupado. Somar `ocupa` ao início daria
  // um dia a mais de carga POR TAREFA — com 83 tarefas, uma semana de capacidade
  // fantasma.
  it('1 dia termina no próprio dia', () => {
    expect(calcularDataFim(SEG, 1)).toBe(SEG);
  });

  it('2 dias a partir de segunda termina na terça', () => {
    expect(calcularDataFim(SEG, 2)).toBe(TER);
  });

  it('5 dias a partir de segunda termina na sexta', () => {
    expect(calcularDataFim(SEG, 5)).toBe(SEX);
  });

  // ⚠️ Fim de semana é pulado: 2 dias a partir de sexta cai na segunda seguinte.
  it('pula o fim de semana', () => {
    expect(calcularDataFim(SEX, 2)).toBe(SEG2);
    expect(calcularDataFim(SEX, 3)).toBe('2026-08-25');
  });

  it('início no fim de semana anda pro dia útil', () => {
    expect(calcularDataFim(SAB, 1)).toBe(SEG2);
  });

  // Meio dia ainda ocupa um dia no calendário — o dia existe.
  it('meio dia ocupa 1 dia de calendário', () => {
    expect(calcularDataFim(SEG, 0.5)).toBe(SEG);
  });

  it('entrada inválida devolve null em vez de data errada', () => {
    expect(calcularDataFim(SEG, 0)).toBeNull();
    expect(calcularDataFim(SEG, -3)).toBeNull();
    expect(calcularDataFim(SEG, 'abc' as any)).toBeNull();
    expect(calcularDataFim('lixo', 2)).toBeNull();
  });

  it('as ocupações oferecidas na triagem geram fim válido', () => {
    for (const o of OCUPACOES_DIAS) expect(calcularDataFim(SEG, o)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('dias úteis no intervalo', () => {
  it('conta só a semana', () => {
    expect(diasUteisNoIntervalo(SEG, SEX)).toBe(5);
    expect(diasUteisNoIntervalo(SEG, SEG2)).toBe(6);   // 5 + a segunda seguinte
    expect(diasUteisNoIntervalo(SAB, DOM)).toBe(0);
  });

  it('fim antes do início é 0, não negativo', () => {
    expect(diasUteisNoIntervalo(SEX, SEG)).toBe(0);
  });
});

describe('carga por dia (a régua vigente: paralela=1 slot · foco enche)', () => {
  it('paralela consome 1 slot', () => {
    expect(cargaNoDia({ pode_paralelo: true, slots_dia: 3, ocupa_dias: 2 })).toBe(1);
  });

  it('FOCO enche o dia da pessoa', () => {
    expect(cargaNoDia({ pode_paralelo: false, slots_dia: 3 })).toBe(3);
    expect(cargaNoDia({ pode_paralelo: false, slots_dia: 5 })).toBe(5);
  });

  // É o que deixa o Pedro encaixar duas coisas curtas no mesmo dia.
  it('meio dia em paralelo consome meio slot', () => {
    expect(cargaNoDia({ pode_paralelo: true, slots_dia: 3, ocupa_dias: 0.5 })).toBe(0.5);
  });

  it('slots_dia inválido cai no padrão 3', () => {
    expect(cargaNoDia({ pode_paralelo: false, slots_dia: 0 })).toBe(3);
    expect(cargaNoDia({ pode_paralelo: false, slots_dia: null as any })).toBe(3);
    expect(cargaNoDia({})).toBe(1);
  });
});

describe('ocupação por dia da pessoa', () => {
  const tarefa = (o: any) => ({ titulo: 't', pode_paralelo: true, ...o });

  it('soma as tarefas nos dias úteis do intervalo', () => {
    const m = ocupacaoPorDia({
      slots_dia: 3,
      tarefas: [
        tarefa({ data_inicio: SEG, data_fim: TER }),
        tarefa({ data_inicio: SEG, data_fim: SEG }),
      ],
    });
    expect(m[SEG].slots).toBe(2);
    expect(m[TER].slots).toBe(1);
  });

  it('NÃO ocupa fim de semana', () => {
    const m = ocupacaoPorDia({ tarefas: [tarefa({ data_inicio: SEX, data_fim: SEG2 })] });
    expect(m[SAB]).toBeUndefined();
    expect(m[DOM]).toBeUndefined();
    expect(m[SEX].slots).toBe(1);
    expect(m[SEG2].slots).toBe(1);
  });

  // ⚠️ "bateu no teto" e "passou do teto" são coisas diferentes: a 1ª é
  // planejamento normal, a 2ª é sobrecarga que alguém tem que resolver.
  it('separa CHEIO de EXCEDIDO', () => {
    const tres = [1, 2, 3].map(() => tarefa({ data_inicio: SEG, data_fim: SEG }));
    const m3 = ocupacaoPorDia({ slots_dia: 3, tarefas: tres });
    expect(m3[SEG].cheio).toBe(true);
    expect(m3[SEG].excedido).toBe(false);

    const m4 = ocupacaoPorDia({ slots_dia: 3, tarefas: [...tres, tarefa({ data_inicio: SEG, data_fim: SEG })] });
    expect(m4[SEG].excedido).toBe(true);
  });

  it('uma tarefa em FOCO enche o dia sozinha', () => {
    const m = ocupacaoPorDia({
      slots_dia: 3,
      tarefas: [tarefa({ data_inicio: SEG, data_fim: SEG, pode_paralelo: false })],
    });
    expect(m[SEG].slots).toBe(3);
    expect(m[SEG].cheio).toBe(true);
  });

  // ⚠️ Tarefa sem plano (era o caso de 83 de 83) é IGNORADA, não conta como 0
  // nem estoura: quem não tem data não ocupa dia nenhum.
  it('tarefa sem datas é ignorada', () => {
    const m = ocupacaoPorDia({
      tarefas: [
        tarefa({ data_inicio: null, data_fim: null }),
        tarefa({ data_inicio: SEG, data_fim: null }),
        tarefa({ data_inicio: SEX, data_fim: SEG }),   // fim antes do início
      ],
    });
    expect(Object.keys(m)).toHaveLength(0);
  });

  it('respeita a janela pedida', () => {
    const m = ocupacaoPorDia({
      tarefas: [tarefa({ data_inicio: SEG, data_fim: SEX })],
      de: TER, ate: TER,
    });
    expect(Object.keys(m)).toEqual([TER]);
  });

  it('não estoura com entrada ausente', () => {
    expect(() => ocupacaoPorDia()).not.toThrow();
    expect(ocupacaoPorDia({ tarefas: null as any })).toEqual({});
  });

  it('não devolve slots com erro de ponto flutuante', () => {
    const m = ocupacaoPorDia({
      slots_dia: 3,
      tarefas: [0.5, 0.5, 0.5].map(o => tarefa({ data_inicio: SEG, data_fim: SEG, ocupa_dias: o })),
    });
    expect(m[SEG].slots).toBe(1.5);
  });
});
