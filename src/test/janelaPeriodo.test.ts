import { describe, it, expect } from 'vitest';
import {
  resolverJanela, FILTRO_PERIODO, filtroPeriodo, anosDisponiveis,
  ANO_INICIAL, granularidadeDaJanela, janelaIso,
} from '@/lib/janelaPeriodo';

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

// ─────────────────────────────────────────────────────────────────────────────
// POR ANO (2026-08-24) · a primeira janela FECHADA do sistema.
// ─────────────────────────────────────────────────────────────────────────────
describe('resolverJanela · por ano', () => {
  it('ano fechado: dezembro entra, janeiro do ano seguinte NÃO', () => {
    const j = resolverJanela({ fPeriodo: 'ano:2024', agora: AGORA });
    const natal = new Date('2024-12-25T10:00:00-03:00').getTime();
    const anoNovo = new Date('2025-01-01T10:00:00-03:00').getTime();
    expect(natal).toBeGreaterThanOrEqual(j.desdeMs);
    expect(natal).toBeLessThanOrEqual(j.ateMs);
    // ⚠️ O bug que este teste tranca: usar só o `desde` mostraria 2024→hoje.
    expect(anoNovo).toBeGreaterThan(j.ateMs);
  });

  it('1º de janeiro entra na janela do próprio ano', () => {
    const j = resolverJanela({ fPeriodo: 'ano:2025', agora: AGORA });
    const primeiroDia = new Date('2025-01-01T08:00:00-03:00').getTime();
    expect(primeiroDia).toBeGreaterThanOrEqual(j.desdeMs);
  });

  it('31 de dezembro às 22h ainda é do ano (fuso não pode empurrar pro seguinte)', () => {
    const j = resolverJanela({ fPeriodo: 'ano:2025', agora: AGORA });
    const reveillon = new Date('2025-12-31T22:00:00-03:00').getTime();
    expect(reveillon).toBeLessThanOrEqual(j.ateMs);
  });

  it('ano CORRENTE não termina no futuro', () => {
    const j = resolverJanela({ fPeriodo: 'ano:2026', agora: AGORA });
    expect(j.ateMs).toBe(AGORA);
    expect(j.ateMs).toBeLessThan(new Date('2026-12-31T00:00:00').getTime());
  });

  it('janela MÓVEL tem ateMs infinito (quem compara <= ateMs não muda de comportamento)', () => {
    [7, 30, 90, 365, 1825].forEach((d) => {
      expect(resolverJanela({ fPeriodo: d, agora: AGORA }).ateMs).toBe(Infinity);
    });
    expect(resolverJanela({ fPeriodo: 'temporada', temporada: T2, agora: AGORA }).ateMs).toBe(Infinity);
  });

  it('o rótulo do ano é só o ano — não "últimos 365 dias"', () => {
    expect(resolverJanela({ fPeriodo: 'ano:2023', agora: AGORA }).rotulo).toBe('2023');
    expect(resolverJanela({ fPeriodo: 365, agora: AGORA }).rotulo).toBe('último ano');
  });

  it('ano lixo não vira NaN', () => {
    ['ano:', 'ano:abc', 'ano:20', 'ano:99999'].forEach((v) => {
      const j = resolverJanela({ fPeriodo: v as any, agora: AGORA });
      expect(Number.isNaN(j.desdeMs)).toBe(false);
      expect(Number.isNaN(j.ateMs)).toBe(false);
    });
  });

  it('toda opção do filtro (inclusive os anos) resolve numa janela válida e ordenada', () => {
    filtroPeriodo({ agora: AGORA }).forEach((f) => {
      const j = resolverJanela({ fPeriodo: f.dias, temporada: T2, agora: AGORA });
      expect(Number.isNaN(j.desdeMs)).toBe(false);
      expect(Number.isNaN(j.ateMs)).toBe(false);
      expect(j.desdeMs).toBeLessThan(j.ateMs);
      expect(j.rotulo).toBeTruthy();
    });
  });

  it('anosDisponiveis vai do ano corrente até 2022, sem furo', () => {
    const anos = anosDisponiveis(AGORA);
    expect(anos[0]).toBe(2026);
    expect(anos[anos.length - 1]).toBe(ANO_INICIAL);
    anos.forEach((a, i) => { if (i) expect(anos[i - 1] - a).toBe(1); });
  });

  it('sem temporada, a opção "Temporada atual" não aparece', () => {
    const l = filtroPeriodo({ comTemporada: false, agora: AGORA });
    expect(l.some((f) => f.dias === 'temporada')).toBe(false);
    expect(l.some((f) => f.dias === 'ano:2026')).toBe(true);
  });

  it('granularidade: ano é sempre mês (365 pontos diários viram mancha)', () => {
    expect(granularidadeDaJanela('ano:2025')).toBe('mes');
    expect(granularidadeDaJanela(30)).toBe('semana');
    expect(granularidadeDaJanela(365)).toBe('mes');
  });

  it('janelaIso: ano devolve as duas pontas; janela móvel devolve ate=null', () => {
    const a = janelaIso({ fPeriodo: 'ano:2024', agora: AGORA });
    expect(a.de).toBe('2024-01-01');
    expect(a.ate).toBe('2024-12-31');
    expect(janelaIso({ fPeriodo: 90, agora: AGORA }).ate).toBeNull();
  });
});
