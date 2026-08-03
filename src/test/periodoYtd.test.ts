import { describe, it, expect } from 'vitest';

// @ts-expect-error módulo JS sem tipos
import { hojeBrt, ehBissexto, corteDoAno, ultimaSemanaIsoCompleta } from '../../backend/utils/periodoYtd.js';

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
