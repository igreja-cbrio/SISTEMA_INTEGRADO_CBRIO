import { describe, it, expect } from 'vitest';
import { resolverJanela, FILTRO_PERIODO } from '@/lib/janelaPeriodo';

// Ancorado num "agora" fixo: teste que depende da hora da execução é o que
// mordeu no faixaEtaria.test.ts.
const AGORA = new Date('2026-08-03T15:00:00-03:00').getTime();
const T2 = { id: 'T2-2026', data_inicio: '2026-08-01', ativa: true };

describe('resolverJanela · uma fonte só pra lista, painel e rótulo', () => {
  it('dias: recua exatamente a quantidade pedida', () => {
    const j = resolverJanela({ fPeriodo: 30, temporada: T2, agora: AGORA });
    expect(AGORA - j.desdeMs).toBe(30 * 86400000);
    expect(j.rotulo).toBe('últimos 30 dias');
  });

  it('temporada: começa na data_inicio dela, não numa contagem de dias', () => {
    const j = resolverJanela({ fPeriodo: 'temporada', temporada: T2, agora: AGORA });
    expect(j.rotulo).toContain('T2-2026');
    expect(j.temporadaIni).toBe('2026-08-01');
    // 01/08 tem que ENTRAR na janela (é o 1º dia da temporada).
    expect(j.desdeMs).toBeLessThan(new Date('2026-08-01T23:59:59-03:00').getTime());
  });

  // ⚠️ O bug que este teste tranca: `new Date('2026-08-01')` é meia-noite UTC,
  // que no Rio é 31/07 21h. Se a janela usasse isso, um pedido das 22h de 31/07
  // (temporada ANTERIOR) entraria como se fosse da temporada nova.
  it('não deixa a véspera entrar por causa do fuso', () => {
    const j = resolverJanela({ fPeriodo: 'temporada', temporada: T2, agora: AGORA });
    const vespera22h = new Date('2026-07-31T22:00:00-03:00').getTime();
    expect(vespera22h).toBeLessThan(j.desdeMs);
  });

  it('temporada ainda não carregada: cai em 30 dias, NUNCA em NaN', () => {
    const j = resolverJanela({ fPeriodo: 'temporada', temporada: null, agora: AGORA });
    expect(Number.isNaN(j.desdeMs)).toBe(false);
    expect(AGORA - j.desdeMs).toBe(30 * 86400000);
  });

  it('valor lixo não vira NaN (NaN em data mostraria TUDO em silêncio)', () => {
    ['abc', undefined, null, ''].forEach((v) => {
      const j = resolverJanela({ fPeriodo: v as any, temporada: T2, agora: AGORA });
      expect(Number.isNaN(j.desdeMs)).toBe(false);
      expect(j.desdeMs).toBeLessThan(AGORA);
    });
  });

  it('toda opção do filtro resolve numa janela válida', () => {
    FILTRO_PERIODO.forEach((f) => {
      const j = resolverJanela({ fPeriodo: f.dias, temporada: T2, agora: AGORA });
      expect(Number.isNaN(j.desdeMs)).toBe(false);
      expect(j.rotulo).toBeTruthy();
    });
  });

  it('a opção "Temporada atual" é a PRIMEIRA (é a pergunta operacional)', () => {
    expect(FILTRO_PERIODO[0].dias).toBe('temporada');
  });
});
