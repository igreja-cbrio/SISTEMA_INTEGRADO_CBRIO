import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const {
  ehDomingo,
  domingosNoMes,
  divisorDomingos,
} = require_('../../backend/utils/divisorMandala.js');

// Datas reais dos cultos de janeiro/2026 (o mês que expôs a distorção):
// domingos 4, 11, 18, 25 · quartas 7, 14, 21, 28 · e a quarta 1º de janeiro,
// que pertence à semana ISO de 29/12 — semana cujo domingo está em DEZEMBRO.
const JANEIRO_2026 = [
  '2026-01-01', '2026-01-04', '2026-01-07', '2026-01-11',
  '2026-01-14', '2026-01-18', '2026-01-21', '2026-01-25', '2026-01-28',
].map((data) => ({ data }));

describe('divisor da média de frequência · por DOMINGO', () => {
  it('reconhece domingo pela data ISO', () => {
    expect(ehDomingo('2026-01-04')).toBe(true);   // domingo
    expect(ehDomingo('2026-01-01')).toBe(false);  // quinta
    expect(ehDomingo('2026-01-03')).toBe(false);  // sábado
  });

  // ⚠️ MUTANTE: trocar getUTCDay() por getDay() deixa este caso VERMELHO.
  // O gate roda em UTC, onde os dois são idênticos — por isso o teste força
  // o fuso da igreja (BRT) antes de medir: `2026-01-04T00:00:00Z` é 03/01 21h
  // no Rio, ou seja getDay() responderia SÁBADO e nenhum domingo do mês seria
  // contado. Restaurar o TZ no finally é obrigatório: o worker do vitest é
  // compartilhado com os outros testes do arquivo.
  it('a leitura do dia da semana é em UTC, mesmo com a máquina em BRT', () => {
    const tzOriginal = process.env.TZ;
    try {
      process.env.TZ = 'America/Sao_Paulo';
      // Confirma que a troca de fuso pegou de fato — sem isso o caso passaria
      // por não estar exercendo nada (guarda que não guarda).
      expect(new Date('2026-01-04T00:00:00Z').getTimezoneOffset()).toBe(180);
      expect(new Date('2026-01-04T00:00:00Z').getDay()).toBe(6); // sábado no Rio

      expect(ehDomingo('2026-01-04')).toBe(true);
      expect(domingosNoMes(2026, 1)).toBe(4);
      expect(divisorDomingos(JANEIRO_2026, { ano: 2026, mes: 1 })).toBe(4);
    } finally {
      if (tzOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = tzOriginal;
    }
  });

  it('entrada inválida não vira domingo', () => {
    expect(ehDomingo(null as unknown as string)).toBe(false);
    expect(ehDomingo('')).toBe(false);
    expect(ehDomingo('04/01/2026')).toBe(false);
    expect(ehDomingo('2026-13-45')).toBe(false);
  });

  it('conta os domingos do calendário', () => {
    expect(domingosNoMes(2026, 1)).toBe(4);   // 4, 11, 18, 25
    expect(domingosNoMes(2026, 3)).toBe(5);   // 1, 8, 15, 22, 29
    expect(domingosNoMes(2026, 8)).toBe(5);   // 2, 9, 16, 23, 30
    expect(domingosNoMes(2024, 2)).toBe(4);   // fevereiro bissexto
  });

  it('mês inválido não explode', () => {
    expect(domingosNoMes(2026, 0)).toBe(0);
    expect(domingosNoMes(2026, 13)).toBe(0);
    expect(domingosNoMes(null as unknown as number, null as unknown as number)).toBe(0);
  });

  // ⚠️ MUTANTE: voltar a contar SEMANAS (ISO) devolveria 5 aqui — é exatamente
  // a distorção que esta régua existe pra corrigir. A quarta 01/01 traz a semana
  // de 29/12 pra conta sem trazer o domingo dela (28/12, que é de dezembro).
  it('janeiro/2026 divide por 4 domingos, não por 5 semanas', () => {
    expect(divisorDomingos(JANEIRO_2026, { ano: 2026, mes: 1 })).toBe(4);
  });

  it('média de janeiro/2026 bate com o número medido em produção', () => {
    const presencialTotal = 9046; // soma real de presencial_adulto + kids
    const divisor = divisorDomingos(JANEIRO_2026, { ano: 2026, mes: 1 });
    expect(Math.round(presencialTotal / divisor)).toBe(2262); // era 1809 por semana
  });

  it('conta domingo DISTINTO, não linha de culto (são 4 cultos por domingo)', () => {
    const quatroCultosNoMesmoDomingo = [
      { data: '2026-03-01' }, { data: '2026-03-01' },
      { data: '2026-03-01' }, { data: '2026-03-01' },
      { data: '2026-03-08' },
    ];
    expect(divisorDomingos(quatroCultosNoMesmoDomingo, { ano: 2026, mes: 3 })).toBe(2);
  });

  it('mês sem culto nenhum cai no calendário', () => {
    expect(divisorDomingos([], { ano: 2026, mes: 3 })).toBe(5);
    expect(divisorDomingos(null as unknown as [], { ano: 2026, mes: 1 })).toBe(4);
  });

  // ⚠️ Divisor 0 viraria Infinity na tela. Nunca devolver zero.
  it('nunca devolve 0, nem sem culto e sem mês de referência', () => {
    expect(divisorDomingos([], {} as { ano: number; mes: number })).toBe(1);
    expect(divisorDomingos([{ data: '2026-01-07' }], {} as { ano: number; mes: number })).toBe(1);
  });

  it('mês só com culto de quarta cai no calendário em vez de dividir por zero', () => {
    const soQuartas = [{ data: '2026-01-07' }, { data: '2026-01-14' }];
    expect(divisorDomingos(soQuartas, { ano: 2026, mes: 1 })).toBe(4);
  });

  it('aceita data com hora e string solta', () => {
    expect(divisorDomingos(['2026-03-01', '2026-03-08T00:00:00Z'], { ano: 2026, mes: 3 })).toBe(2);
  });

  // Meses de 5 domingos não mudam nada — a correção é cirúrgica.
  it('mês com 5 domingos e 5 semanas mantém o mesmo divisor', () => {
    const marco = ['2026-03-01', '2026-03-04', '2026-03-08', '2026-03-11', '2026-03-15',
      '2026-03-18', '2026-03-22', '2026-03-25', '2026-03-29'].map((data) => ({ data }));
    expect(divisorDomingos(marco, { ano: 2026, mes: 3 })).toBe(5);
  });
});
