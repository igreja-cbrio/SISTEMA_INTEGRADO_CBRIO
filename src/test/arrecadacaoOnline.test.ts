// A régua da arrecadação do online.
//
// ⚠️⚠️ O QUE ESTE ARQUIVO TRAVA: a importação do balanço é SEMANAL e **53% do
// dinheiro cai na segunda-feira** (medido em 23/09/2026: 1.349 dos 2.546
// créditos de 2026; ZERO no fim de semana). Logo a janela corrente está SEMPRE
// parcial, e comparar parcial com fechado produz queda que não existe — toda
// semana, não uma vez por ano. Medição real do dia: a semana em curso tinha
// R$ 90 contra R$ 17.664 da anterior → a variação ingênua seria **−99,5%**.
import { describe, it, expect } from 'vitest';
const {
  hojeBRT, periodoFechado, variacao, anotarSerie, ultimoFechado,
  mesDoAnoAnterior, compararComAnoAnterior, conferencia, ultimoDiaDoPeriodo,
} = require('../../backend/utils/arrecadacaoOnline');

function comFuso<T>(tz: string, fn: () => T): T {
  const antes = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes;
  }
}

describe('hojeBRT', () => {
  it('⚠️ 23h no Rio ainda é hoje — em UTC já seria amanhã', () => {
    comFuso('America/Sao_Paulo', () => {
      expect(hojeBRT(Date.parse('2026-09-24T02:00:00Z'))).toBe('2026-09-23');
    });
  });
});

describe('periodoFechado · as DUAS condições', () => {
  const ctx = { hoje: '2026-09-23', corte: '2026-09-22' };

  it('fechado quando terminou E o dado foi importado', () => {
    expect(periodoFechado('2026-09-22', ctx)).toBe(true);
    expect(periodoFechado('2026-09-15', ctx)).toBe(true);
  });

  it('⚠️⚠️ período que AINDA CORRE não é fechado', () => {
    expect(periodoFechado('2026-09-29', ctx)).toBe(false);
  });

  it('⚠️⚠️ período que ACABOU mas cujo balanço não foi importado NÃO é fechado', () => {
    // A importação é semanal: a semana pode ter terminado e o dado dela não ter
    // chegado. Sem esta condição, a última semana aparece com uma fração do
    // valor e a variação mente.
    expect(periodoFechado('2026-09-22', { hoje: '2026-09-23', corte: '2026-09-15' })).toBe(false);
  });

  it('⚠️ sem corte conhecido NÃO assume fechado (fail-safe)', () => {
    expect(periodoFechado('2026-09-22', { hoje: '2026-09-23', corte: null })).toBe(false);
    expect(periodoFechado('2026-09-22', { hoje: '2026-09-23' })).toBe(false);
  });

  it('⚠️⚠️ corte NO FUTURO não fecha período que ainda corre', () => {
    // `fim <= corte` sozinho não basta: o banco pode ter lançamento com data
    // futura (programado, pré-agendado), e aí o corte passa de hoje. Só a
    // guarda de `hoje` segura a semana que ainda está acontecendo.
    const comCorteFuturo = { hoje: '2026-09-23', corte: '2026-10-31' };
    expect(periodoFechado('2026-09-29', comCorteFuturo)).toBe(false);
    expect(periodoFechado('2026-09-22', comCorteFuturo)).toBe(true);
  });

  it('entrada inválida não derruba', () => {
    expect(periodoFechado(null as any, ctx)).toBe(false);
    expect(periodoFechado('2026-09-22', { hoje: null as any, corte: '2026-09-22' })).toBe(false);
  });
});

describe('variacao', () => {
  it('calcula com uma casa', () => {
    expect(variacao(120, 100)).toBe(20);
    expect(variacao(80, 100)).toBe(-20);
  });

  it('⚠️⚠️ base ZERO devolve null — não é +∞% nem 0%', () => {
    expect(variacao(500, 0)).toBeNull();
    expect(variacao(0, 0)).toBeNull();
  });

  it('não-número devolve null', () => {
    expect(variacao('x' as any, 100)).toBeNull();
    expect(variacao(100, null as any)).toBeNull();
  });
});

describe('anotarSerie · a trava principal', () => {
  // Números REAIS de produção (23/09/2026).
  const semanas = [
    { inicio: '2026-09-02', fim: '2026-09-08', label: 'Sem 36', total: 28792.54, n: 100 },
    { inicio: '2026-09-09', fim: '2026-09-15', label: 'Sem 37', total: 43256.87, n: 78 },
    { inicio: '2026-09-16', fim: '2026-09-22', label: 'Sem 38', total: 17664.76, n: 76 },
    { inicio: '2026-09-23', fim: '2026-09-29', label: 'Sem 39', total: 90, n: 1 },
  ];
  const ctx = { hoje: '2026-09-23', corte: '2026-09-23' };

  it('⚠️⚠️ a semana EM CURSO não recebe variação', () => {
    // Sem isto a tela anunciaria −99,5% (90 contra 17.664) toda semana.
    const r = anotarSerie(semanas, ctx);
    const emCurso = r[3];
    expect(emCurso.fechado).toBe(false);
    expect(emCurso.comparavel).toBe(false);
    expect(emCurso.variacao).toBeNull();
  });

  it('semana fechada compara com a fechada anterior', () => {
    const r = anotarSerie(semanas, ctx);
    expect(r[2].fechado).toBe(true);
    expect(r[2].comparavel).toBe(true);
    expect(r[2].variacao).toBe(-59.2);   // 17.664 contra 43.256
    expect(r[2].anterior_total).toBe(43256.87);
  });

  it('⚠️ a PRIMEIRA da série não tem com quem comparar', () => {
    const r = anotarSerie(semanas, ctx);
    expect(r[0].comparavel).toBe(false);
    expect(r[0].variacao).toBeNull();
  });

  it('⚠️ anterior PARCIAL também impede a comparação', () => {
    // Import atrasado no meio da série: comparar com uma janela pela metade é
    // a mesma armadilha ao contrário.
    const r = anotarSerie(semanas, { hoje: '2026-09-23', corte: '2026-09-12' });
    expect(r[1].fechado).toBe(false);
    expect(r[2].comparavel).toBe(false);
  });

  it('⚠️⚠️ MÊS não pode ser comparado como prefixo de DIA', () => {
    // `'2026-09' <= '2026-09-23'` é true por prefixo de string — sem expandir
    // para o último dia do mês, o mês CORRENTE apareceria como fechado, que é
    // o contrário do que esta régua existe para impedir.
    const ctxMes = { hoje: '2026-09-23', corte: '2026-09-22', campoFim: 'mes' };
    expect(periodoFechado('2026-09', ctxMes)).toBe(false);
    expect(periodoFechado('2026-08', ctxMes)).toBe(true);
    // e fevereiro bissexto fecha no 29
    expect(periodoFechado('2024-02', { hoje: '2024-02-29', corte: '2024-02-29' })).toBe(true);
    expect(periodoFechado('2024-02', { hoje: '2024-02-28', corte: '2024-02-28' })).toBe(false);
  });

  it('⚠️ o último dia do mês é calculado em UTC, não no fuso da máquina', () => {
    // ⚠️ Em UTC e em BRT (UTC-3) `new Date(a, m, 0)` e `Date.UTC(a, m, 0)`
    // dão o MESMO dia — então um teste sem fuso forçado não observa esta
    // guarda. Num fuso À FRENTE de UTC a diferença aparece: o último dia
    // recuaria um, e fevereiro "fecharia" no dia 28.
    comFuso('Asia/Tokyo', () => {
      expect(ultimoDiaDoPeriodo('2024-02')).toBe('2024-02-29');
      expect(ultimoDiaDoPeriodo('2026-09')).toBe('2026-09-30');
      expect(periodoFechado('2026-09', { hoje: '2026-09-30', corte: '2026-09-30' })).toBe(true);
    });
  });

  it('funciona com mês (campoFim)', () => {
    const meses = [
      { mes: '2026-08', total: 103887, n: 304 },
      { mes: '2026-09', total: 64001, n: 188 },
    ];
    const r = anotarSerie(meses, { hoje: '2026-09-23', corte: '2026-09-22', campoFim: 'mes' });
    expect(r[0].fechado).toBe(true);
    expect(r[1].fechado).toBe(false);    // setembro ainda corre
    expect(r[1].variacao).toBeNull();
  });

  it('lista vazia ou nula não derruba', () => {
    expect(anotarSerie([], ctx)).toEqual([]);
    expect(anotarSerie(null as any, ctx)).toEqual([]);
  });
});

describe('ultimoFechado', () => {
  it('pula o período em curso', () => {
    const r = anotarSerie([
      { fim: '2026-09-15', total: 10 },
      { fim: '2026-09-22', total: 20 },
      { fim: '2026-09-29', total: 1 },
    ], { hoje: '2026-09-23', corte: '2026-09-23' });
    expect(ultimoFechado(r).total).toBe(20);
  });

  it('nenhum fechado devolve null, nunca o parcial', () => {
    const r = anotarSerie([{ fim: '2026-09-29', total: 1 }], { hoje: '2026-09-23', corte: '2026-09-23' });
    expect(ultimoFechado(r)).toBeNull();
  });
});

describe('mesDoAnoAnterior', () => {
  it('2026-09 → 2025-09', () => {
    expect(mesDoAnoAnterior('2026-09')).toBe('2025-09');
    expect(mesDoAnoAnterior('2026-01')).toBe('2025-01');
  });

  it('⚠️ formato torto devolve null, nunca data inventada', () => {
    expect(mesDoAnoAnterior('2026')).toBeNull();
    expect(mesDoAnoAnterior(null as any)).toBeNull();
    expect(mesDoAnoAnterior('abc-de')).toBeNull();
  });
});

describe('compararComAnoAnterior', () => {
  const atual = [
    { mes: '2026-08', total: 103887, dias_segunda: 5 },
    { mes: '2026-09', total: 64001, dias_segunda: 4 },
  ];
  const passado = [
    { mes: '2025-08', total: 51389, dias_segunda: 4 },
    { mes: '2025-09', total: 71701, dias_segunda: 5 },
  ];

  it('casa o mesmo mês do ano anterior', () => {
    const r = compararComAnoAnterior(atual, passado);
    expect(r[0].mes_anterior).toBe('2025-08');
    expect(r[0].total_ano_anterior).toBe(51389);
    expect(r[0].variacao_ano).toBe(102.2);
  });

  it('⚠️⚠️ DECLARA quando o calendário difere — o nº de segundas move ~11%', () => {
    // 53% do valor cai na segunda; 5 segundas contra 4 dá +11% fantasma.
    const r = compararComAnoAnterior(atual, passado);
    expect(r[0].calendario_difere).toBe(true);   // 5 contra 4
    expect(r[0].dias_segunda_ano_anterior).toBe(4);
  });

  it('⚠️ sem par no ano anterior, variação é null — nunca -100%', () => {
    const r = compararComAnoAnterior(atual, []);
    expect(r[0].variacao_ano).toBeNull();
    expect(r[0].total_ano_anterior).toBeNull();
  });

  it('calendário igual não é declarado', () => {
    const r = compararComAnoAnterior(
      [{ mes: '2026-08', total: 10, dias_segunda: 4 }],
      [{ mes: '2025-08', total: 5, dias_segunda: 4 }],
    );
    expect(r[0].calendario_difere).toBe(false);
  });
});

describe('conferencia · a soma tem que FECHAR', () => {
  it('dentro + fora = tudo que a conta recebeu', () => {
    // Números reais de 2026: R$ 961.364 entraram, R$ 471.321 ficaram de fora
    // (cartão do presencial, dinheiro, crédito em conta).
    const r = conferencia(961364.04, [
      { forma: 'Cartão de Crédito', total: 343609.41 },
      { forma: 'Cartão de Débito', total: 127682.51 },
      { forma: '(forma não informada)', total: 29.75 },
    ]);
    expect(r.dentro).toBe(961364.04);
    expect(Math.round(r.fora)).toBe(471322);
    expect(Math.round(r.total_conta)).toBe(1432686);
    expect(r.pct_dentro).toBe(67.1);
  });

  it('sem cauda, tudo entrou', () => {
    const r = conferencia(100, []);
    expect(r.fora).toBe(0);
    expect(r.pct_dentro).toBe(100);
  });

  it('total inválido devolve null', () => {
    expect(conferencia(null as any, [])).toBeNull();
  });
});
