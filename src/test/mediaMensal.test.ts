// Média de arrecadação mensal (aba "Mensal" do Dashboard Semanal).
//
// ⚠️⚠️ O que este arquivo protege, em ordem de dano:
//   1. ⚠️⚠️ a média virar `total / 12`. O endpoint SEMPRE devolve 12 meses,
//      zerando o que não tem dado — em setembro/2026 isso conta outubro,
//      novembro e dezembro como R$ 0 e derruba a média em **33%**
//      (R$ 893.309 contra R$ 1.339.963);
//   2. ⚠️⚠️ o mês EM CURSO entrar na conta. Setembro tinha 2 dias de dado
//      quando isto foi escrito; incluí-lo tira **11%** da média — e faria o
//      número CAIR todo dia 1º e subir ao longo do mês, mudando de sentido
//      conforme o dia em que a TV estivesse ligada;
//   3. a mediana sumir. Julho/2026 fechou em R$ 3,06 mi com R$ 2,08 mi de
//      extraordinária e sozinho põe a média 17% acima da mediana. Sem o par,
//      um mês de campanha é lido como o novo normal;
//   4. a BASE sumir do lado do número (lei da casa: "todo corte mostra a base").
import { describe, it, expect } from 'vitest';
import {
  calcularMediaMensal, mesCorrenteISO, mediaPuxadaPorUmMes,
  textoBase, LIMIAR_ASSIMETRIA,
} from '@/lib/mediaMensal';

const L = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Monta os 12 meses como o endpoint monta: sempre 12, faltante = 0. */
const doze = (ano: number, receitas: Record<number, number>) =>
  L.map((label, i) => ({
    mes: `${ano}-${String(i + 1).padStart(2, '0')}`,
    mes_label: label,
    receita: receitas[i + 1] ?? 0,
  }));

// Números REAIS medidos no banco em 02/09/2026 (vw_fin_arrecadacao_mensal).
const R2026 = {
  1: 977239, 2: 1189147, 3: 1013244, 4: 942047, 5: 1217589,
  6: 1226967, 7: 3057311, 8: 1096159, 9: 53137, // setembro = 2 dias
};
const HOJE = new Date('2026-09-02T12:00:00Z');

describe('⚠️⚠️ a média NÃO divide por 12 nem inclui o mês em curso', () => {
  const r = calcularMediaMensal(doze(2026, R2026), HOJE);

  it('usa só os 8 meses fechados', () => {
    expect(r.base).toBe(8);
    expect(r.meses).toEqual(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']);
  });

  it('bate com a média medida no banco', () => {
    expect(Math.round(r.media!)).toBe(1339963);
  });

  it('⚠️⚠️ NÃO é o total dividido por 12 (erro de 33%)', () => {
    const total = Object.values(R2026).reduce((a, b) => a + b, 0);
    expect(Math.round(r.media!)).not.toBe(Math.round(total / 12));
    expect(Math.round(total / 12)).toBe(897737); // o número errado, nomeado
  });

  it('⚠️⚠️ NÃO inclui setembro em curso (erro de 11%)', () => {
    const total = Object.values(R2026).reduce((a, b) => a + b, 0);
    expect(Math.round(r.media!)).not.toBe(Math.round(total / 9));
    expect(Math.round(total / 9)).toBe(1196982); // o outro número errado
  });

  it('mas DIZ que setembro ficou de fora', () => {
    expect(r.emCurso).toBe('Set');
    expect(textoBase(r)).toBe('8 meses fechados · Set em curso está fora');
  });

  it('⚠️ a média não muda quando o mês em curso cresce', () => {
    // O mesmo ano com setembro já em R$ 900 mil: a média tem de ser IDÊNTICA.
    const cresceu = calcularMediaMensal(doze(2026, { ...R2026, 9: 900000 }), HOJE);
    expect(cresceu.media).toBe(r.media);
    expect(cresceu.base).toBe(8);
  });
});

describe('⚠️⚠️ a mediana denuncia o mês de campanha', () => {
  it('média fica acima da mediana com a extraordinária de julho', () => {
    const r = calcularMediaMensal(doze(2026, R2026), HOJE);
    expect(Math.round(r.mediana!)).toBe(1142653);
    expect(r.assimetria).toBeGreaterThan(LIMIAR_ASSIMETRIA);
    expect(mediaPuxadaPorUmMes(r)).toBe(true);
    expect(r.maiorMes).toBe('Jul');
  });

  it('⚠️ sem a extraordinária o aviso SOME — é o que prova a causa', () => {
    // Mesmos meses, julho pela ordinária (R$ 976.088), como o filtro global
    // "sem extraordinárias" já entrega. Média e mediana ficam a 1,4%.
    const semExtra = { ...R2026, 7: 976088, 6: 1226967, 8: 1036159 };
    const r = calcularMediaMensal(doze(2026, semExtra), HOJE);
    expect(r.assimetria).toBeLessThan(LIMIAR_ASSIMETRIA);
    expect(mediaPuxadaPorUmMes(r)).toBe(false);
  });

  it('mediana par é a média dos dois centrais', () => {
    const r = calcularMediaMensal(doze(2025, { 1: 100, 2: 200, 3: 300, 4: 400 }), HOJE);
    expect(r.mediana).toBe(250);
  });

  it('não avisa com base minúscula (2 meses não têm assimetria a declarar)', () => {
    const r = calcularMediaMensal(doze(2025, { 1: 100, 2: 10000 }), HOJE);
    expect(mediaPuxadaPorUmMes(r)).toBe(false);
  });
});

describe('⚠️ ano passado e ano futuro pela MESMA regra', () => {
  it('ano fechado usa os 12 meses', () => {
    const r = calcularMediaMensal(doze(2025, Object.fromEntries(L.map((_, i) => [i + 1, 1000]))), HOJE);
    expect(r.base).toBe(12);
    expect(r.media).toBe(1000);
    expect(r.emCurso).toBeNull();
    expect(textoBase(r)).toBe('12 meses fechados');
  });

  it('⚠️⚠️ ano futuro não produz média (nenhum mês fechado)', () => {
    const r = calcularMediaMensal(doze(2027, { 1: 5000 }), HOJE);
    expect(r.media).toBeNull();
    expect(r.base).toBe(0);
  });

  it('mês sem dado não conta como zero arrecadado', () => {
    // Ano em que a base só começa em junho: a média é dos 7 meses com dado,
    // não dos 12 — senão o começo do histórico vira arrecadação R$ 0.
    const r = calcularMediaMensal(
      doze(2025, { 6: 700, 7: 700, 8: 700, 9: 700, 10: 700, 11: 700, 12: 700 }), HOJE,
    );
    expect(r.base).toBe(7);
    expect(r.media).toBe(700);
  });
});

describe('⚠️ entrada hostil não derruba a tela', () => {
  it('lista vazia, nula e indefinida', () => {
    for (const v of [null, undefined, []]) {
      const r = calcularMediaMensal(v as never, HOJE);
      expect(r.media).toBeNull();
      expect(r.base).toBe(0);
      expect(textoBase(r)).toBe('sem mês fechado com dado');
    }
  });

  it('receita não-numérica, NaN e negativa são ignoradas', () => {
    const sujo = [
      { mes: '2026-01', mes_label: 'Jan', receita: NaN },
      { mes: '2026-02', mes_label: 'Fev', receita: undefined },
      { mes: '2026-03', mes_label: 'Mar', receita: -500 },
      { mes: '2026-04', mes_label: 'Abr', receita: 1000 },
      { mes: '', mes_label: 'x', receita: 9999 },
    ];
    const r = calcularMediaMensal(sujo as never, HOJE);
    expect(r.base).toBe(1);
    expect(r.media).toBe(1000);
  });

  it('mês corrente ZERADO não anuncia "em curso"', () => {
    // Dizer "Set em curso está fora" sobre um mês sem lançamento nenhum sugere
    // que existe algo escondido lá.
    const r = calcularMediaMensal(doze(2026, { 1: 1000, 8: 1000 }), HOJE);
    expect(r.emCurso).toBeNull();
  });
});

describe('mesCorrenteISO', () => {
  it('formata com dois dígitos', () => {
    expect(mesCorrenteISO(new Date('2026-09-02T12:00:00Z'))).toBe('2026-09');
    expect(mesCorrenteISO(new Date('2026-01-31T12:00:00Z'))).toBe('2026-01');
    expect(mesCorrenteISO(new Date('2026-12-01T12:00:00Z'))).toBe('2026-12');
  });
});
