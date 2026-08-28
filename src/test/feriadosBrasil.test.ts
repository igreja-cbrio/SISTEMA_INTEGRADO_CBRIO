import { describe, it, expect } from 'vitest';
import { domingoDePascoa, feriadosNacionais, feriadosPorData } from '../lib/feriadosBrasil';

describe('Páscoa (Meeus/Butcher)', () => {
  // Datas conferidas contra o calendário litúrgico — cobrem o ciclo do
  // planejamento (2026-2030) e anos de borda conhecidos.
  const casos: Array<[number, string]> = [
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2029, '2029-04-01'],
    [2030, '2030-04-21'],
    [2038, '2038-04-25'], // Páscoa mais tardia possível
  ];
  it.each(casos)('Páscoa de %i é %s', (ano, esperado) => {
    expect(domingoDePascoa(ano)).toBe(esperado);
  });
});

describe('feriados nacionais', () => {
  it('2027: móveis derivados da Páscoa (28/03) batem', () => {
    const porNome = Object.fromEntries(feriadosNacionais(2027).map((f) => [f.nome, f.data]));
    expect(porNome['Carnaval']).toBe('2027-02-09');
    expect(porNome['Sexta-Feira Santa']).toBe('2027-03-26');
    expect(porNome['Páscoa']).toBe('2027-03-28');
    expect(porNome['Corpus Christi']).toBe('2027-05-27');
  });

  it('inclui os fixos e a Consciência Negra (nacional desde 2023)', () => {
    const f2027 = feriadosNacionais(2027);
    const datas = f2027.map((x) => x.data);
    expect(datas).toContain('2027-01-01');
    expect(datas).toContain('2027-09-07');
    expect(datas).toContain('2027-11-20');
    expect(datas).toContain('2027-12-25');
  });

  it('vem ordenado por data e todo item tem ISO válido', () => {
    const lista = feriadosNacionais(2028);
    const ordenado = [...lista].sort((a, b) => a.data.localeCompare(b.data));
    expect(lista).toEqual(ordenado);
    for (const f of lista) {
      expect(f.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.data.slice(0, 4)).toBe('2028');
      expect(f.nome.length).toBeGreaterThan(2);
    }
  });

  it('índice por data agrupa e permite lookup direto', () => {
    const mapa = feriadosPorData(2026);
    expect(mapa['2026-04-05'][0].nome).toBe('Páscoa');
    expect(mapa['2026-01-01'][0].nome).toBe('Confraternização Universal');
    expect(mapa['2026-06-10']).toBeUndefined();
  });

  it('carnaval de 2026 cai em fevereiro (Páscoa 05/04)', () => {
    const porNome = Object.fromEntries(feriadosNacionais(2026).map((f) => [f.nome, f.data]));
    expect(porNome['Carnaval']).toBe('2026-02-17');
    expect(porNome['Corpus Christi']).toBe('2026-06-04');
  });
});
