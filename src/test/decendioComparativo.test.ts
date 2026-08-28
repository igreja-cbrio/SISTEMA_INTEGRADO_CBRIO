import { describe, it, expect } from 'vitest';
import { situacaoDecendio, compararDecendio, montarGrade } from '../../backend/utils/decendioComparativo';

const HOJE = '2026-08-19'; // dia 19: 1º fechado, 2º correndo, 3º nem começou

describe('situacaoDecendio', () => {
  it('classifica os três decêndios do mês corrente na data real', () => {
    expect(situacaoDecendio('2026-08', 1, HOJE)).toBe('fechado');
    expect(situacaoDecendio('2026-08', 2, HOJE)).toBe('em_andamento');
    expect(situacaoDecendio('2026-08', 3, HOJE)).toBe('futuro');
  });

  it('mês passado fecha inteiro; mês futuro é todo futuro', () => {
    [1, 2, 3].forEach(d => expect(situacaoDecendio('2026-07', d, HOJE)).toBe('fechado'));
    [1, 2, 3].forEach(d => expect(situacaoDecendio('2026-09', d, HOJE)).toBe('futuro'));
  });

  it('⚠️ o decêndio fecha NO DIA do corte, não no dia seguinte', () => {
    expect(situacaoDecendio('2026-08', 1, '2026-08-10')).toBe('fechado');
    expect(situacaoDecendio('2026-08', 1, '2026-08-09')).toBe('em_andamento');
  });

  it('⚠️ no dia 10 o SEGUNDO decêndio ainda não começou', () => {
    // Fixa a fronteira: deslocar o corte em um dia faria o dia 10 já contar
    // como 2º decêndio, e um período que não existe apareceria como aberto.
    expect(situacaoDecendio('2026-08', 2, '2026-08-10')).toBe('futuro');
    expect(situacaoDecendio('2026-08', 2, '2026-08-11')).toBe('em_andamento');
    expect(situacaoDecendio('2026-08', 3, '2026-08-20')).toBe('futuro');
    expect(situacaoDecendio('2026-08', 3, '2026-08-21')).toBe('em_andamento');
  });

  it('⚠️ o 3º só fecha quando o mês vira — o mês não tem tamanho fixo', () => {
    expect(situacaoDecendio('2026-08', 3, '2026-08-31')).toBe('em_andamento');
    expect(situacaoDecendio('2026-08', 3, '2026-09-01')).toBe('fechado');
  });
});

describe('compararDecendio', () => {
  const ago1 = { mes: '2026-08', decendio: 1, receita: 120 };
  const jul1 = { mes: '2026-07', decendio: 1, receita: 100 };

  it('compara dois decêndios fechados e dá o percentual', () => {
    const r = compararDecendio(ago1, jul1, HOJE);
    expect(r!.percentual).toBeCloseTo(20);
    expect(r!.diferenca).toBe(20);
    expect(r!.base_mes).toBe('2026-07');
  });

  it('⚠️ decêndio EM ANDAMENTO não ganha percentual', () => {
    // É o número que iria pra uma reunião: no dia 19, o 2º decêndio tem 9 de 10
    // dias, e comparar com um fechado mostraria uma queda que não existe.
    const r = compararDecendio(
      { mes: '2026-08', decendio: 2, receita: 50 },
      { mes: '2026-07', decendio: 2, receita: 100 }, HOJE);
    expect(r!.percentual).toBe(null);
    expect(r!.motivo_sem_percentual).toBe('periodo_em_aberto');
    // ⚠️ mas o VALOR continua aparecendo — esconder o dado seria pior.
    expect(r!.receita).toBe(50);
  });

  it('⚠️ base zero não vira +100%: é indefinido', () => {
    const r = compararDecendio(ago1, { mes: '2026-07', decendio: 1, receita: 0 }, HOJE);
    expect(r!.percentual).toBe(null);
    expect(r!.motivo_sem_percentual).toBe('base_zero');
  });

  it('sem mês anterior, informa em vez de inventar', () => {
    const r = compararDecendio(ago1, null, HOJE);
    expect(r!.percentual).toBe(null);
    expect(r!.motivo_sem_percentual).toBe('sem_mes_anterior');
    expect(r!.base_receita).toBe(null);
  });

  it('queda tem percentual negativo', () => {
    const r = compararDecendio({ mes: '2026-08', decendio: 1, receita: 75 }, jul1, HOJE);
    expect(r!.percentual).toBeCloseTo(-25);
  });
});

describe('montarGrade', () => {
  const linhas = [
    { mes: '2026-06', decendio: 1, receita: 100 },
    { mes: '2026-07', decendio: 1, receita: 150 },
    { mes: '2026-08', decendio: 1, receita: 120 },
  ];

  it('cada mês compara com o anterior DA SÉRIE', () => {
    const g = montarGrade(linhas, HOJE);
    expect(g.map(m => m.mes)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(g[1].decendios[0]!.percentual).toBeCloseTo(50);   // jul vs jun
    expect(g[2].decendios[0]!.percentual).toBeCloseTo(-20);  // ago vs jul
    expect(g[0].decendios[0]!.percentual).toBe(null);        // jun não tem base
  });

  it('⚠️ mês sem lançamento NÃO entra como zero na comparação', () => {
    // Se julho sumisse da view, agosto compararia com JUNHO — e não com um
    // julho fantasma valendo zero, que reportaria +infinito/-100%.
    const semJulho = linhas.filter(l => l.mes !== '2026-07');
    const g = montarGrade(semJulho, HOJE);
    expect(g[1].decendios[0]!.base_mes).toBe('2026-06');
    expect(g[1].decendios[0]!.percentual).toBeCloseTo(20);
  });

  it('preenche os 3 decêndios mesmo quando a view só trouxe um', () => {
    const g = montarGrade([{ mes: '2026-08', decendio: 1, receita: 10 }], HOJE);
    expect(g[0].decendios.length).toBe(3);
    expect(g[0].decendios[2]!.receita).toBe(0);
  });

  it('lista vazia não estoura', () => {
    expect(montarGrade([], HOJE)).toEqual([]);
    expect(montarGrade(null as any, HOJE)).toEqual([]);
  });
});
