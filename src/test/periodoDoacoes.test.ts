import { describe, it, expect } from 'vitest';
import {
  LIMITE_PADRAO, parsePeriodoDoacoes, parseLimite, coberturaNominal, diaSeguinte,
} from '../../backend/utils/periodoDoacoes.js';

const AGORA = new Date('2026-08-26T18:00:00Z');

describe('periodoDoacoes · o filtro do ranking de contribuintes', () => {
  it('"ano" é 1º de janeiro até HOJE', () => {
    const r = parsePeriodoDoacoes('ano', AGORA);
    expect(r.desde).toBe('2026-01-01');
    expect(r.ate).toBe('2026-08-27'); // exclusivo → inclui 26/08
  });

  it('⚠️ o fim do intervalo é EXCLUSIVO, senão o último dia se perde', () => {
    // A consulta usa .lt('data', ate). Se `ate` fosse o próprio 26/08, as
    // doações do dia 26 ficariam de fora sem ninguém perceber.
    const r = parsePeriodoDoacoes('2026-01-01:2026-08-26', AGORA);
    expect(r.ate).toBe('2026-08-27');
    expect(diaSeguinte('2026-08-26')).toBe('2026-08-27');
  });

  it('vira o mês e o ano no fim do intervalo', () => {
    expect(diaSeguinte('2026-01-31')).toBe('2026-02-01');
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01');
    expect(diaSeguinte('2028-02-29')).toBe('2028-03-01'); // bissexto
  });

  it('intervalo invertido é corrigido, não recusado', () => {
    const r = parsePeriodoDoacoes('2026-08-26:2026-01-01', AGORA);
    expect(r.desde).toBe('2026-01-01');
    expect(r.ate).toBe('2026-08-27');
  });

  it('mês específico continua funcionando como antes', () => {
    const r = parsePeriodoDoacoes('2026-03', AGORA);
    expect(r).toMatchObject({ desde: '2026-03-01', ate: '2026-04-01', rotulo: 'mes' });
  });

  it('"tudo" não corta nada', () => {
    expect(parsePeriodoDoacoes('tudo', AGORA)).toMatchObject({ desde: null, ate: null });
  });

  it('lixo cai em 12 meses, nunca em intervalo quebrado', () => {
    for (const v of ['', 'lixo', '2026-13', '2026-01-01:', ':2026-01-01', '2026-1-1:2026-2-2', null as any]) {
      const r = parsePeriodoDoacoes(v, AGORA);
      expect(r.periodo).toBe('12m');
      expect(r.desde).toBe('2025-08-26');
    }
  });

  it('o limite é 20 por padrão, aceita 30 e tem teto', () => {
    expect(parseLimite(undefined)).toBe(LIMITE_PADRAO);
    expect(parseLimite('30')).toBe(30);
    expect(parseLimite('999')).toBe(100);
    for (const v of ['0', '-5', 'abc', '']) expect(parseLimite(v)).toBe(LIMITE_PADRAO);
  });

  it('⚠️ acusa período INCOMPLETO quando passa do último dia com nome', () => {
    // Estado real em 26/08/2026: a doação nominal para em junho.
    const c = coberturaNominal({
      desde: '2026-01-01', ate: '2026-08-27', ultimoDiaNominal: '2026-06-30',
    });
    expect(c.incompleto).toBe(true);
    expect(c.ultimo_dia_nominal).toBe('2026-06-30');
    expect(c.fim_pedido).toBe('2026-08-26');
  });

  it('período que termina DENTRO do que tem nome não é incompleto', () => {
    const c = coberturaNominal({
      desde: '2026-01-01', ate: '2026-04-01', ultimoDiaNominal: '2026-06-30',
    });
    expect(c.incompleto).toBe(false);
  });

  it('"todo período" (sem fim) com dado nominal parado também é incompleto', () => {
    const c = coberturaNominal({ desde: null, ate: null, ultimoDiaNominal: '2026-06-30' });
    expect(c.incompleto).toBe(true);
  });

  it('sem nenhuma doação nominal, não afirma incompletude', () => {
    const c = coberturaNominal({ desde: '2026-01-01', ate: '2026-08-27', ultimoDiaNominal: null });
    expect(c.incompleto).toBe(false);
    expect(c.ultimo_dia_nominal).toBeNull();
  });

  it('⚠️ "hoje" é o dia da IGREJA, não o UTC', () => {
    // 23h de 26/08 no Rio já é 27/08 em UTC — "ano" não pode incluir amanhã.
    const r = parsePeriodoDoacoes('ano', new Date('2026-08-27T02:00:00Z'));
    expect(r.ate).toBe('2026-08-27'); // exclusivo → último dia incluso é 26/08
  });
});
