// Lotes de preço por evento (backend/utils/lotesEvento.js · 20/08/2026).
//
// Os números dos casos são os REAIS do AMI CAMP 2027 (mensagem do Arthur):
// Lote 1 · 50 vagas · R$ 830 — Lote 2 · 100 vagas · R$ 850 — Lote 3 · 150
// vagas · R$ 870 (Pix no nosso site; o cartão é cobrado no E-Inscrição, com
// tabela própria de lá).
//
// ⚠️ Mutantes que estes casos matam:
// - fronteira off-by-one (posição 50 tem que ser lote 1; a 51 é que vira lote 2)
// - remover o clamp do último lote (posição além da soma cobraria NADA numa
//   inscrição que a RPC de vaga já aceitou)
// - `restantes_no_lote` contando a própria posição (diria "resta 0" pra quem
//   ainda compra pelo preço atual)
// - aceitar lote de 0 vagas ou R$ 0 no saneador
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { sanitizarLotes, totalVagasLotes, loteDaPosicao, loteAtual } = require_('../../backend/utils/lotesEvento.js');

const RETIRO = [
  { nome: 'Lote 1', vagas: 50, valor_centavos: 83000 },
  { nome: 'Lote 2', vagas: 100, valor_centavos: 85000 },
  { nome: 'Lote 3', vagas: 150, valor_centavos: 87000 },
];

describe('loteDaPosicao · fronteiras cumulativas', () => {
  it('posições 1 e 50 são o lote 1; a 51 é o lote 2', () => {
    expect(loteDaPosicao(RETIRO, 1)?.valor_centavos).toBe(83000);
    expect(loteDaPosicao(RETIRO, 50)?.valor_centavos).toBe(83000);
    expect(loteDaPosicao(RETIRO, 51)?.valor_centavos).toBe(85000);
  });

  it('posições 150 → lote 2 · 151 → lote 3 · 300 → lote 3', () => {
    expect(loteDaPosicao(RETIRO, 150)?.nome).toBe('Lote 2');
    expect(loteDaPosicao(RETIRO, 151)?.nome).toBe('Lote 3');
    expect(loteDaPosicao(RETIRO, 300)?.nome).toBe('Lote 3');
  });

  it('⚠️ posição ALÉM da soma cai no ÚLTIMO lote, nunca null (quem limita é o vagas do evento)', () => {
    expect(loteDaPosicao(RETIRO, 301)?.valor_centavos).toBe(87000);
    expect(loteDaPosicao(RETIRO, 9999)?.nome).toBe('Lote 3');
  });

  it('posição inválida ou sem lotes devolve null', () => {
    expect(loteDaPosicao(RETIRO, 0)).toBeNull();
    expect(loteDaPosicao(RETIRO, -3)).toBeNull();
    expect(loteDaPosicao([], 1)).toBeNull();
    expect(loteDaPosicao(null, 1)).toBeNull();
  });
});

describe('loteAtual · o que a PRÓXIMA inscrição paga', () => {
  it('evento zerado está no lote 1, com as 50 posições restantes', () => {
    const l = loteAtual(RETIRO, 0);
    expect(l?.nome).toBe('Lote 1');
    expect(l?.valor_centavos).toBe(83000);
    expect(l?.restantes_no_lote).toBe(50);
    expect(l?.proximo?.valor_centavos).toBe(85000);
  });

  it('49 ocupadas → ainda lote 1, resta 1 · 50 ocupadas → virou o lote 2', () => {
    expect(loteAtual(RETIRO, 49)?.restantes_no_lote).toBe(1);
    expect(loteAtual(RETIRO, 49)?.nome).toBe('Lote 1');
    const virou = loteAtual(RETIRO, 50);
    expect(virou?.nome).toBe('Lote 2');
    expect(virou?.restantes_no_lote).toBe(100);
  });

  it('último lote não anuncia fim (quem dá o teto é o vagas do evento) nem próximo', () => {
    const l = loteAtual(RETIRO, 150);
    expect(l?.nome).toBe('Lote 3');
    expect(l?.restantes_no_lote).toBeNull();
    expect(l?.proximo).toBeNull();
  });

  it('ocupadas inválido conta como 0 (a tela nunca fica sem preço por um NaN)', () => {
    expect(loteAtual(RETIRO, undefined)?.nome).toBe('Lote 1');
    expect(loteAtual(RETIRO, NaN)?.nome).toBe('Lote 1');
  });

  it('sem lotes válidos devolve null (o evento cobra o valor de tabela)', () => {
    expect(loteAtual([], 10)).toBeNull();
    expect(loteAtual(undefined, 10)).toBeNull();
  });
});

describe('sanitizarLotes', () => {
  it('não-array devolve null (campo ausente = não mexer); array vazio vale', () => {
    expect(sanitizarLotes(undefined)).toBeNull();
    expect(sanitizarLotes('x' as any)).toBeNull();
    expect(sanitizarLotes([])).toEqual([]);
  });

  it('⚠️ lote de 0 vagas ou R$ 0 é DESCARTADO — nunca cobraria certo em silêncio', () => {
    expect(sanitizarLotes([{ nome: 'a', vagas: 0, valor_centavos: 100 }])).toEqual([]);
    expect(sanitizarLotes([{ nome: 'a', vagas: 10, valor_centavos: 0 }])).toEqual([]);
  });

  it('normaliza strings numéricas, nome default e corta em 6', () => {
    const r = sanitizarLotes([{ vagas: '50', valor_centavos: '83000' }]);
    expect(r).toEqual([{ nome: 'Lote 1', vagas: 50, valor_centavos: 83000 }]);
    const sete = Array.from({ length: 7 }, (_, i) => ({ nome: `L${i}`, vagas: 1, valor_centavos: 1 }));
    expect(sanitizarLotes(sete)).toHaveLength(6);
  });
});

describe('totalVagasLotes', () => {
  it('soma as vagas (o retiro descreve 300 posições)', () => {
    expect(totalVagasLotes(RETIRO)).toBe(300);
    expect(totalVagasLotes([])).toBe(0);
    expect(totalVagasLotes(null)).toBe(0);
  });
});
