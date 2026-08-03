import { describe, it, expect } from 'vitest';

// @ts-expect-error módulo JS sem tipos
import { hojeBrt, ehBissexto, corteDoAno, ultimaSemanaIsoCompleta, resolverPeriodo } from '../../backend/utils/periodoYtd.js';

const HOJE = { ano: 2026, mes: 8, dia: 3 };
const TODOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// "Agora" sempre INJETADO: teste que lê o relógio da máquina foi o que mordeu no
// faixaEtaria.test.ts (roda verde de manhã, vermelho depois das 21h).

describe('hojeBrt · o dia é o do fuso da igreja, não o do UTC', () => {
  it('23h em Brasília ainda é o mesmo dia (o UTC já virou)', () => {
    // 2026-08-03T23:30 BRT = 2026-08-04T02:30 UTC
    expect(hojeBrt(new Date('2026-08-03T23:30:00-03:00'))).toEqual({ ano: 2026, mes: 8, dia: 3 });
  });

  it('meio-dia devolve o dia trivialmente', () => {
    expect(hojeBrt(new Date('2026-08-03T12:00:00-03:00'))).toEqual({ ano: 2026, mes: 8, dia: 3 });
  });

  it('01h UTC do dia 1º ainda é o último dia do ano anterior em BRT', () => {
    // 2027-01-01T01:00 UTC = 2026-12-31T22:00 BRT · o ANO também não pode virar cedo
    expect(hojeBrt(new Date('2027-01-01T01:00:00Z'))).toEqual({ ano: 2026, mes: 12, dia: 31 });
  });
});

describe('ehBissexto', () => {
  it('divisível por 4 é bissexto', () => expect(ehBissexto(2024)).toBe(true));
  it('divisível por 100 não é', () => expect(ehBissexto(1900)).toBe(false));
  it('divisível por 400 é', () => expect(ehBissexto(2000)).toBe(true));
  it('ano comum não é', () => expect(ehBissexto(2026)).toBe(false));
});

describe('corteDoAno · a data tem que EXISTIR no ano comparado', () => {
  it('monta o mesmo dia/mês com zero à esquerda', () => {
    expect(corteDoAno(2025, 8, 3)).toBe('2025-08-03');
    expect(corteDoAno(2025, 12, 25)).toBe('2025-12-25');
  });

  it('29/02 vira 28/02 em ano NÃO bissexto', () => {
    // Sem isto o Postgres recusa a query inteira ('2025-02-29' não existe) e o
    // comparativo quebra por completo num dia a cada quatro anos.
    expect(corteDoAno(2025, 2, 29)).toBe('2025-02-28');
    expect(corteDoAno(2023, 2, 29)).toBe('2023-02-28');
  });

  it('29/02 é preservado em ano bissexto', () => {
    expect(corteDoAno(2024, 2, 29)).toBe('2024-02-29');
    expect(corteDoAno(2000, 2, 29)).toBe('2000-02-29');
  });

  it('28/02 não é mexido em nenhum dos dois casos', () => {
    expect(corteDoAno(2025, 2, 28)).toBe('2025-02-28');
    expect(corteDoAno(2024, 2, 28)).toBe('2024-02-28');
  });
});

describe('ultimaSemanaIsoCompleta · semana corrente só conta quando FECHA', () => {
  it('segunda-feira devolve a semana ANTERIOR (a atual acabou de começar)', () => {
    // 2026-08-03 é segunda · semana ISO 32 · incluí-la compararia 1 dia de 2026
    // com 7 dias de cada ano anterior.
    expect(ultimaSemanaIsoCompleta({ ano: 2026, mes: 8, dia: 3 })).toBe(31);
  });

  it('domingo devolve a PRÓPRIA semana (fechou no dia)', () => {
    // 2026-08-09 é domingo · fim da semana ISO 32
    expect(ultimaSemanaIsoCompleta({ ano: 2026, mes: 8, dia: 9 })).toBe(32);
  });

  it('sábado ainda devolve a semana anterior', () => {
    expect(ultimaSemanaIsoCompleta({ ano: 2026, mes: 8, dia: 8 })).toBe(31);
  });

  it('não estoura em 29/02 de ano bissexto', () => {
    // 2024-02-29 é quinta · semana ISO 9 aberta → 8
    expect(ultimaSemanaIsoCompleta({ ano: 2024, mes: 2, dia: 29 })).toBe(8);
  });
});

describe('resolverPeriodo · o período escolhido vale IGUAL em todos os anos', () => {
  it('ano todo com o ano corrente na lista → parcial, corta hoje', () => {
    const p = resolverPeriodo({ meses: TODOS, anos: [2024, 2025, 2026], hoje: HOJE });
    expect(p.parcial).toBe(true);
    expect(p.fimMes).toBe(8);
    expect(p.dia).toBe(3);
    // Meses depois do corte são descartados: não há dado pra eles em ano nenhum
    expect(p.meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(p.rotulo).toBe('1º de janeiro a 3 de agosto');
  });

  it('período que termina ANTES do mês de hoje → fechado, até o fim do mês', () => {
    const p = resolverPeriodo({ meses: [1, 2, 3, 4, 5, 6], anos: [2024, 2025, 2026], hoje: HOJE });
    expect(p.parcial).toBe(false);
    expect(p.fimMes).toBe(6);
    expect(p.dia).toBe(30);
    expect(p.rotulo).toBe('1º de janeiro a 30 de junho');
  });

  it('⚠️ ano todo SEM o ano corrente → fechado em dezembro, não cortado em agosto', () => {
    // Comparar 2024 × 2025 (dois anos completos) não pode ser truncado no dia de
    // hoje: os dois já fecharam, e cortar jogaria 5 meses de dado fora dos dois.
    const p = resolverPeriodo({ meses: TODOS, anos: [2024, 2025], hoje: HOJE });
    expect(p.parcial).toBe(false);
    expect(p.fimMes).toBe(12);
    expect(p.dia).toBe(31);
    expect(p.meses).toEqual(TODOS);
  });

  it('mês corrente sozinho → parcial do 1º ao dia de hoje', () => {
    const p = resolverPeriodo({ meses: [8], anos: [2024, 2025, 2026], hoje: HOJE });
    expect(p.parcial).toBe(true);
    expect(p.meses).toEqual([8]);
    expect(p.rotulo).toBe('1º de agosto a 3 de agosto');
  });

  it('fevereiro fechado devolve dia 29 · quem clampa por ano é o corteDoAno', () => {
    const p = resolverPeriodo({ meses: [2], anos: [2024, 2025], hoje: HOJE });
    expect(p.dia).toBe(29);
    expect(corteDoAno(2025, p.fimMes, p.dia)).toBe('2025-02-28'); // não bissexto
    expect(corteDoAno(2024, p.fimMes, p.dia)).toBe('2024-02-29'); // bissexto
  });

  it('seleção não-contígua é marcada e o rótulo lista os meses', () => {
    const p = resolverPeriodo({ meses: [3, 5, 7], anos: [2024, 2025, 2026], hoje: HOJE });
    expect(p.contiguo).toBe(false);
    expect(p.meses).toEqual([3, 5, 7]);
    expect(p.rotulo).toContain('mar, mai, jul');
  });

  it('seleção contígua NÃO é marcada como buraco', () => {
    const p = resolverPeriodo({ meses: [3, 4, 5], anos: [2024], hoje: HOJE });
    expect(p.contiguo).toBe(true);
    expect(p.rotulo).toBe('1º de março a 31 de maio');
  });

  it('lista vazia cai no ano todo (nenhum mês marcado não vira período vazio)', () => {
    const p = resolverPeriodo({ meses: [], anos: [2026], hoje: HOJE });
    expect(p.inicioMes).toBe(1);
    expect(p.fimMes).toBe(8);
  });

  it('mês fora de 1..12 é descartado', () => {
    const p = resolverPeriodo({ meses: [0, 5, 13, 6], anos: [2024], hoje: HOJE });
    expect(p.meses).toEqual([5, 6]);
  });

  it('só meses FUTUROS com o ano corrente na lista → parcial, sem mês sobrando', () => {
    // set..dez em 2026 ainda não aconteceu: o corte é hoje e nenhum mês do
    // recorte sobrevive, então a tela mostra "sem dado" em vez de somar 2024/2025
    // num período que 2026 não viveu.
    const p = resolverPeriodo({ meses: [9, 10, 11, 12], anos: [2024, 2025, 2026], hoje: HOJE });
    expect(p.parcial).toBe(true);
    expect(p.fimMes).toBe(8);
    expect(p.meses).toEqual([]);
  });
});
