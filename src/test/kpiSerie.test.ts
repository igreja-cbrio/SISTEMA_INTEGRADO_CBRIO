// ⚠️⚠️ A TABELA MÊS A MÊS DA FICHA DO KPI — e a divergência que ela revelou.
//
// Pedido do Matheus (23/09/2026): clicar no card do "% de voluntários que
// fizeram check-in" e ver `mês | escalas | com check-in | %`.
//
// ⚠️⚠️ O achado que este módulo protege: há DOIS números por mês. O GRAVADO em
// `kpi_valores_calculados` (o que o card mostra, congelado na última apuração)
// e o AO VIVO, recalculado da fonte. Medido em 23/09/2026 no ONL-17: agosto
// gravado **24,14%**, ao vivo **60,66%** (37 de 61) — a Ariel lançou check-in
// retroativo DEPOIS do cron das 07:01. E maio gravado **32,58%** com a verdade
// em **0%**. Mostrar só um dos dois esconde metade da história.
import { describe, it, expect } from 'vitest';
import { montarSerie, TOLERANCIA } from '../../backend/utils/kpiSerie.js';

const AGOSTO = { periodo: '2026-08', numerador: 37, denominador: 61, valor: 60.66 };
const SETEMBRO = { periodo: '2026-09', numerador: 11, denominador: 31, valor: 35.48 };

describe('a tabela mostra o número inteiro, não só o resultado', () => {
  it('devolve numerador e denominador de cada mês', () => {
    const s = montarSerie([AGOSTO], []);
    expect(s.tem_partes).toBe(true);
    expect(s.linhas[0]).toMatchObject({ periodo: '2026-08', numerador: 37, denominador: 61, valor: 60.66 });
  });

  it('mês sem escala nenhuma aparece com zero, não some', () => {
    const s = montarSerie([{ periodo: '2026-04', numerador: 0, denominador: 0, valor: null }], []);
    expect(s.linhas).toHaveLength(1);
    expect(s.linhas[0].denominador).toBe(0);
    expect(s.linhas[0].valor).toBeNull();
  });

  it('converte texto numérico do Postgres (numeric vem string)', () => {
    const s = montarSerie([{ periodo: '2026-08', numerador: '37', denominador: '61', valor: '60.66' }], []);
    expect(s.linhas[0].numerador).toBe(37);
    expect(s.linhas[0].valor).toBe(60.66);
  });
});

describe('⚠️ a divergência entre o card e a verdade', () => {
  it('marca o mês em que o gravado ficou para trás do ao vivo', () => {
    const s = montarSerie([AGOSTO], [{ periodo_referencia: '2026-08', valor_calculado: '24.14' }]);
    expect(s.linhas[0].divergente).toBe(true);
    expect(s.linhas[0].valor_gravado).toBe(24.14);
    expect(s.divergencias).toBe(1);
  });

  it('não marca divergência quando os dois batem', () => {
    const s = montarSerie([AGOSTO], [{ periodo_referencia: '2026-08', valor_calculado: '60.66' }]);
    expect(s.linhas[0].divergente).toBe(false);
    expect(s.divergencias).toBe(0);
  });

  // ⚠️ Arredondamento não é desatualização. Marcar 0,01 como "atrasado" é ruído
  // que ensina a ignorar o aviso — o mesmo motivo pelo qual o hook do conselho
  // não dispara em "sim".
  // ⚠️ VALOR LITERAL de propósito. A primeira versão deste teste usava
  // `60.66 + TOLERANCIA / 2` — e aí zerar a constante zerava também o teste:
  // o mutante `TOLERANCIA = 0` passava incólume. Teste que lê a constante que
  // ele testa não testa nada.
  it('arredondamento (0,02) não vira alarme, mas 0,20 vira', () => {
    const perto = montarSerie([AGOSTO], [{ periodo_referencia: '2026-08', valor_calculado: '60.68' }]);
    expect(perto.linhas[0].divergente).toBe(false);
    const longe = montarSerie([AGOSTO], [{ periodo_referencia: '2026-08', valor_calculado: '60.86' }]);
    expect(longe.linhas[0].divergente).toBe(true);
    expect(TOLERANCIA).toBeGreaterThan(0);
  });

  // ⚠️ Mês que o cron NUNCA apurou não está "atrasado", está por apurar. A
  // ausência do valor gravado já conta isso; um alarme ali seria mentira.
  it('mês sem valor gravado não é divergente', () => {
    const s = montarSerie([SETEMBRO], []);
    expect(s.linhas[0].valor_gravado).toBeNull();
    expect(s.linhas[0].divergente).toBe(false);
    expect(s.divergencias).toBe(0);
  });
});

describe('⚠️ sem ramo de partes, mostra o histórico gravado — não inventa', () => {
  const s = montarSerie([], [
    { periodo_referencia: '2026-07', valor_calculado: '38.41' },
    { periodo_referencia: '2026-06', valor_calculado: '41.79' },
  ]);

  it('marca que não tem partes e não finge numerador', () => {
    expect(s.tem_partes).toBe(false);
    expect(s.linhas.every((l: { numerador: number | null }) => l.numerador === null)).toBe(true);
  });

  it('ordena por período mesmo vindo fora de ordem', () => {
    expect(s.linhas.map((l: { periodo: string }) => l.periodo)).toEqual(['2026-06', '2026-07']);
  });

  it('não acusa divergência consigo mesmo', () => {
    expect(s.divergencias).toBe(0);
  });
});

describe('entrada torta não derruba a ficha', () => {
  it('aceita null nos dois lados', () => {
    expect(montarSerie(null as never, null as never)).toEqual({ tem_partes: false, linhas: [], divergencias: 0 });
  });

  it('ignora linha gravada sem período', () => {
    const s = montarSerie([], [{ periodo_referencia: null, valor_calculado: '10' }] as never);
    expect(s.linhas).toHaveLength(0);
  });
});
