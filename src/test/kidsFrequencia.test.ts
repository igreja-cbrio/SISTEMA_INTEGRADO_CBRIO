// Contrato da régua de frequência do Kids · "ativa é quem VEIO".
//
// Guarda três coisas:
//   1. as faixas de quantidade de check-in (o filtro pedido pela equipe);
//   2. a janela de 12 meses que define "ativa";
//   3. ⚠️ que as DUAS implementações (servidor e cliente) decidem IGUAL — se
//      divergirem, o contador do seletor deixa de bater com a lista que
//      aparece ao escolher a faixa, e ninguém percebe olhando a tela.
//
// Mutantes rodados (todos matam):
//   - faixa '1' devolvendo '2-5' (limite errado)
//   - `frequentaNaJanela` aceitando check-in sem data como "veio"
//   - `cobertura_parcial` fixo em false (a tela pararia de avisar que o totem
//     só tem 6 semanas de coleta, e "sem check-in" seria lido como "não vem")

import { describe, it, expect } from 'vitest';
import {
  faixaCheckin as faixaCliente,
  casaFaixaCheckin as casaCliente,
  FAIXAS_CHECKIN as FAIXAS_CLIENTE,
} from '../lib/kidsFrequencia';
import {
  faixaCheckins as faixaServidor,
  casaFaixa as casaServidor,
  frequentaNaJanela,
  avaliarFrequencia,
  inicioDaJanela,
  FAIXAS_CHECKIN as FAIXAS_SERVIDOR,
  JANELA_ATIVA_MESES,
} from '../../backend/utils/kidsFrequencia.js';

// Vetor único, rodado nas duas implementações.
const CASOS: Array<[number | null | undefined, string]> = [
  [0, 'zero'], [null, 'zero'], [undefined, 'zero'], [-3, 'zero'],
  [1, '1'],
  [2, '2-5'], [3, '2-5'], [5, '2-5'],
  [6, '6-10'], [9, '6-10'], [10, '6-10'],
  [11, '11+'], [40, '11+'], [999, '11+'],
];

describe('faixas de check-in · servidor e cliente concordam', () => {
  it.each(CASOS)('%s → %s nas duas implementações', (qtd, esperado) => {
    expect(faixaServidor(qtd)).toBe(esperado);
    expect(faixaCliente(qtd)).toBe(esperado);
  });

  it('as duas listas de faixas têm as mesmas chaves, na mesma ordem', () => {
    expect(FAIXAS_CLIENTE.map(f => f.key)).toEqual(FAIXAS_SERVIDOR.map((f: any) => f.key));
  });

  it("'todas' nunca filtra, nos dois lados", () => {
    for (const [qtd] of CASOS) {
      expect(casaServidor(qtd, 'todas')).toBe(true);
      expect(casaCliente(qtd, 'todas')).toBe(true);
    }
  });

  it('casaFaixa concorda com faixaCheckin nos dois lados', () => {
    for (const [qtd, esperado] of CASOS) {
      expect(casaServidor(qtd, esperado)).toBe(true);
      expect(casaCliente(qtd, esperado)).toBe(true);
      const outra = esperado === 'zero' ? '11+' : 'zero';
      expect(casaServidor(qtd, outra)).toBe(false);
      expect(casaCliente(qtd, outra)).toBe(false);
    }
  });
});

describe('janela de 12 meses · quem é "ativa"', () => {
  const AGORA = Date.parse('2026-08-17T15:00:00Z');

  it('a janela canônica é de 12 meses', () => {
    expect(JANELA_ATIVA_MESES).toBe(12);
    expect(inicioDaJanela(AGORA)).toBe('2025-08-17T15:00:00.000Z');
  });

  it('check-in de ontem conta', () => {
    expect(frequentaNaJanela('2026-08-16T12:00:00Z', AGORA)).toBe(true);
  });

  it('check-in de 11 meses atrás conta', () => {
    expect(frequentaNaJanela('2025-09-20T12:00:00Z', AGORA)).toBe(true);
  });

  it('check-in de 13 meses atrás NÃO conta', () => {
    expect(frequentaNaJanela('2025-07-01T12:00:00Z', AGORA)).toBe(false);
  });

  // Sem check-in é "não veio" — nunca um terceiro estado, senão a soma
  // frequentam + sem_checkin deixaria de fechar com o total da tela.
  it('sem check-in nenhum é falso, não nulo', () => {
    expect(frequentaNaJanela(null, AGORA)).toBe(false);
    expect(frequentaNaJanela(undefined, AGORA)).toBe(false);
    expect(frequentaNaJanela('', AGORA)).toBe(false);
    expect(frequentaNaJanela('data-invalida', AGORA)).toBe(false);
  });
});

describe('avaliarFrequencia · o resumo da tela', () => {
  const AGORA = Date.parse('2026-08-17T15:00:00Z');
  const CRIANCAS = [
    { ultimo_checkin: '2026-08-16T12:00:00Z' },  // veio
    { ultimo_checkin: '2026-07-06T12:00:00Z' },  // veio
    { ultimo_checkin: null },                     // nunca veio
    { ultimo_checkin: '2024-01-10T12:00:00Z' },  // veio, mas fora da janela
  ];

  it('conta quem veio e quem não, fechando com o total', () => {
    const r = avaliarFrequencia(CRIANCAS, { agora: AGORA });
    expect(r.total).toBe(4);
    expect(r.frequentam).toBe(2);
    expect(r.sem_checkin).toBe(2);
    expect(r.frequentam + r.sem_checkin).toBe(r.total);
  });

  // ⚠️ O caso que existe por causa da realidade: o totem começou em 06/07/2026
  // e a janela pede 12 meses. A tela PRECISA dizer que o silêncio de parte do
  // período é falta de registro, não ausência da criança.
  it('declara cobertura parcial quando a coleta é mais nova que a janela', () => {
    const r = avaliarFrequencia(CRIANCAS, { agora: AGORA, coletaDesde: '2026-07-06T12:00:00Z' });
    expect(r.cobertura_parcial).toBe(true);
    expect(r.coleta_desde).toBe('2026-07-06T12:00:00Z');
  });

  it('com 12+ meses de coleta, não há ressalva a fazer', () => {
    const r = avaliarFrequencia(CRIANCAS, { agora: AGORA, coletaDesde: '2024-01-01T12:00:00Z' });
    expect(r.cobertura_parcial).toBe(false);
  });

  it('sem saber desde quando existe coleta, não afirma cobertura', () => {
    expect(avaliarFrequencia(CRIANCAS, { agora: AGORA }).cobertura_parcial).toBe(false);
  });
});
