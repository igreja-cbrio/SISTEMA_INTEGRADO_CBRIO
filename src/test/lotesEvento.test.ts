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
const { sanitizarLotes, totalVagasLotes, loteDaPosicao, loteAtual, loteDaInscricao, anexarLoteNasInscricoes } = require_('../../backend/utils/lotesEvento.js');

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

describe('loteDaInscricao · o lote que a PESSOA comprou (09/09/2026)', () => {
  it('E-Inscrição: vale a categoria da planilha (régua de preço de lá), mesmo com valor diferente', () => {
    const r = loteDaInscricao(RETIRO, { valor_cobrado_centavos: 80325, dados: { e_inscricao: { categoria: 'Lote 1' } } }, 34);
    expect(r).toEqual({ nome: 'Lote 1', indice: 0, valor_centavos: null, fonte: 'plataforma' });
  });
  it('sistema: o valor cobrado casa com a tabela — e vence a posição', () => {
    // pagou 830 (lote 1) mas, depois de uma importação com created_at antigo, caiu na posição 60
    const r = loteDaInscricao(RETIRO, { valor_cobrado_centavos: 83000 }, 60);
    expect(r).toMatchObject({ nome: 'Lote 1', indice: 0, fonte: 'valor' });
    expect(loteDaInscricao(RETIRO, { valor_cobrado_centavos: 85000 }, 3)).toMatchObject({ nome: 'Lote 2', fonte: 'valor' });
  });
  it('isenta/bolsa/sem pagar: cai na posição (mesma régua do POST)', () => {
    expect(loteDaInscricao(RETIRO, { valor_cobrado_centavos: 0 }, 50)).toMatchObject({ nome: 'Lote 1', fonte: 'posicao' });
    expect(loteDaInscricao(RETIRO, { valor_cobrado_centavos: 41500 }, 51)).toMatchObject({ nome: 'Lote 2', fonte: 'posicao' });
    expect(loteDaInscricao(RETIRO, { valor_cobrado_centavos: null }, null)).toBeNull();
  });
  it('evento sem lotes → null (a etiqueta não aparece)', () => {
    expect(loteDaInscricao([], { valor_cobrado_centavos: 83000 }, 1)).toBeNull();
    expect(loteDaInscricao(null, { valor_cobrado_centavos: 83000 }, 1)).toBeNull();
  });
});

describe('anexarLoteNasInscricoes', () => {
  const base = (id: string, created_at: string, extra: any = {}) => ({ id, created_at, status: 'confirmada', ...extra });
  it('posição conta só vivas não-canceladas, na ordem (created_at, id)', () => {
    const lotes = [{ nome: 'L1', vagas: 2, valor_centavos: 100 }, { nome: 'L2', vagas: 2, valor_centavos: 200 }];
    const r = anexarLoteNasInscricoes(lotes, [
      base('c', '2026-01-03T00:00:00Z'),
      base('a', '2026-01-01T00:00:00Z'),
      base('x', '2026-01-02T00:00:00Z', { status: 'cancelada' }),
      base('b', '2026-01-02T00:00:00Z'),
    ]);
    const por = Object.fromEntries(r.map((i: any) => [i.id, i.lote?.nome ?? null]));
    expect(por).toEqual({ a: 'L1', b: 'L1', c: 'L2', x: null });
    expect(r.find((i: any) => i.id === 'x').lote).toBeNull();
  });
  it('lista parcial (app): sem posição, só categoria/valor', () => {
    const lotes = [{ nome: 'L1', vagas: 2, valor_centavos: 100 }, { nome: 'L2', vagas: 2, valor_centavos: 200 }];
    const r = anexarLoteNasInscricoes(lotes, [base('a', '2026-01-01T00:00:00Z'), base('b', '2026-01-01T00:00:01Z', { valor_cobrado_centavos: 200 })], { completo: false });
    expect(r[0].lote).toBeNull();
    expect(r[1].lote).toMatchObject({ nome: 'L2', fonte: 'valor' });
  });
});
