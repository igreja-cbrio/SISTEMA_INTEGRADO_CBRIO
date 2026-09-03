// Análises da expansão de um culto (aba Online).
//
// ⚠️⚠️ O que este arquivo protege, em ordem de dano:
//   1. ⚠️⚠️ a comparação misturar TIPOS de culto. Quarta com Deus e Domingo
//      11:30 têm patamares diferentes; misturar carimba "abaixo da média" em
//      todo culto de quarta, para sempre;
//   2. ⚠️⚠️ a régua incluir cultos POSTERIORES ao comparado. Isso faz a
//      avaliação de um culto mudar sozinha com o tempo — bom hoje, ruim amanhã,
//      sem nada ter acontecido;
//   3. ⚠️⚠️ "o momento da queda" devolver sempre a saída da tela de espera. É a
//      maior queda de toda transmissão (0,77 → 0,06 no culto medido) e seria a
//      mesma resposta todo culto, servindo para nada;
//   4. a série de evolução sair em ordem decrescente — o endpoint devolve por
//      data DESC, e o gráfico mostraria o tempo andando para trás;
//   5. comparar contra 1 ou 2 cultos e chamar de "média".
import { describe, it, expect } from 'vitest';
import {
  compararComAnteriores, acharQuedas, serieDoTipo, horaDoTrecho,
  JANELA_COMPARACAO, MINIMO_PARA_COMPARAR,
} from '@/lib/analiseCulto';

const culto = (data: string, tipo: string | null, pico: number, extra: Record<string, unknown> = {}) => ({
  id: data + tipo, data, service_type_name: tipo,
  online_pico: pico, online_ds: pico * 2, online_ddus: pico * 3,
  online_watch_minutes_ddus: pico * 10, online_retencao_pct_ddus: 40,
  online_subs_ganhos: 1, ...extra,
});

const QUARTAS = [
  culto('2026-08-26', 'Quarta Com Deus', 457),
  culto('2026-08-19', 'Quarta Com Deus', 400),
  culto('2026-08-12', 'Quarta Com Deus', 380),
  culto('2026-08-05', 'Quarta Com Deus', 420),
  culto('2026-07-29', 'Quarta Com Deus', 360),
];
const DOMINGOS = [
  culto('2026-08-23', 'Domingo 11:30', 2000),
  culto('2026-08-16', 'Domingo 11:30', 1900),
  culto('2026-08-09', 'Domingo 11:30', 2100),
];
const TODOS = [...QUARTAS, ...DOMINGOS];

describe('⚠️⚠️ a comparação nunca cruza tipos de culto', () => {
  it('a régua da quarta usa só quartas', () => {
    const r = compararComAnteriores(QUARTAS[0], TODOS);
    expect(r.tipo).toBe('Quarta Com Deus');
    expect(r.base).toBe(4);                       // as 4 quartas anteriores
    const pico = r.linhas.find((l) => l.chave === 'online_pico')!;
    // média das 4 quartas anteriores = (400+380+420+360)/4 = 390
    expect(pico.media).toBe(390);
    expect(pico.valor).toBe(457);
    expect(Math.round(pico.difPct!)).toBe(17);
  });

  it('⚠️⚠️ os domingos (pico ~2000) NÃO entram na régua da quarta', () => {
    const r = compararComAnteriores(QUARTAS[0], TODOS);
    const pico = r.linhas.find((l) => l.chave === 'online_pico')!;
    // Se cruzasse tipos, a média passaria de 1.000 e a quarta ficaria -70%.
    expect(pico.media).toBeLessThan(500);
    expect(pico.difPct).toBeGreaterThan(0);
  });
});

describe('⚠️⚠️ a régua olha só para TRÁS', () => {
  it('cultos posteriores não entram', () => {
    const meio = QUARTAS[2]; // 12/08 — tem 2 depois e 2 antes
    const r = compararComAnteriores(meio, TODOS);
    expect(r.base).toBe(2);                       // só 05/08 e 29/07
    // ⚠️ 2 anteriores é menos que o mínimo, então NÃO sai comparação nenhuma —
    // é o comportamento certo: 2 cultos não são uma média.
    expect(r.linhas).toEqual([]);
  });

  it('⚠️ base menor que o mínimo não vira "média"', () => {
    const r = compararComAnteriores(QUARTAS[2], TODOS);
    expect(r.base).toBeLessThan(MINIMO_PARA_COMPARAR);
    expect(r.linhas).toEqual([]);
  });

  it('a janela é limitada — não usa o histórico inteiro', () => {
    const muitos = Array.from({ length: 20 }, (_, i) =>
      culto(`2026-0${i < 9 ? 1 : 2}-${String((i % 28) + 1).padStart(2, '0')}`, 'X', 100));
    const alvo = culto('2026-12-31', 'X', 100);
    const r = compararComAnteriores(alvo, [...muitos, alvo]);
    expect(r.base).toBe(JANELA_COMPARACAO);
  });
});

describe('⚠️⚠️ "onde a audiência caiu" ignora a abertura e o fim', () => {
  // Curva real do culto de 26/08: a maior queda é a saída da tela de espera.
  const curva = [
    { ratio_pct: 1, audience_watch_ratio: 0.77 },
    { ratio_pct: 2, audience_watch_ratio: 0.12 },   // -0,65 · a espera
    { ratio_pct: 5, audience_watch_ratio: 0.06 },
    { ratio_pct: 30, audience_watch_ratio: 0.38 },
    { ratio_pct: 40, audience_watch_ratio: 0.45 },
    { ratio_pct: 60, audience_watch_ratio: 0.46 },
    { ratio_pct: 65, audience_watch_ratio: 0.30 },  // -0,16 · queda de verdade
    { ratio_pct: 70, audience_watch_ratio: 0.43 },
    { ratio_pct: 100, audience_watch_ratio: 0.16 }, // encerramento
  ];

  it('⚠️⚠️ sem filtro, a resposta é sempre a tela de espera', () => {
    const sem = acharQuedas(curva, { quantas: 1 });
    expect(sem[0].tamanho).toBeCloseTo(0.65, 2);   // inútil: é todo culto
  });

  it('começando depois da abertura, acha a queda REAL', () => {
    const q = acharQuedas(curva, { inicioAposPct: 5, quantas: 1 });
    expect(q[0].tamanho).toBeCloseTo(0.16, 2);
    expect(q[0].de).toBe(0.46);
    expect(q[0].para).toBe(0.30);
  });

  it('⚠️ o encerramento (acima de 95%) fica fora', () => {
    const q = acharQuedas(curva, { inicioAposPct: 5, quantas: 5 });
    expect(q.every((x) => x.tamanho !== 0.43 - 0.16)).toBe(true);
  });

  it('converte para minuto e hora real de Brasília', () => {
    const q = acharQuedas(curva, {
      inicioAposPct: 5, duracaoMin: 76,
      inicioIso: '2026-08-26T22:51:00Z',   // 19:51 BRT
      quantas: 1,
    });
    // 60% de 76 min = 45,6 min (não 46 — a hora usa o valor exato)
    expect(Math.round(q[0].x)).toBe(46);
    expect(q[0].hora).toBe('20:36');              // 19:51 + 45,6 min
  });

  it('sem início conhecido, não inventa hora', () => {
    const q = acharQuedas(curva, { inicioAposPct: 5, duracaoMin: 76, quantas: 1 });
    expect(q[0].hora).toBeNull();
    expect(horaDoTrecho(null, 30)).toBeNull();
    expect(horaDoTrecho('2026-08-26T22:51:00Z', null)).toBeNull();
  });

  it('curva vazia ou curta não quebra', () => {
    for (const v of [null, undefined, [], [{ ratio_pct: 1, audience_watch_ratio: 1 }]]) {
      expect(acharQuedas(v as never)).toEqual([]);
    }
  });
});

describe('⚠️ a evolução sai do mais ANTIGO para o mais novo', () => {
  it('ordem crescente, senão o tempo anda para trás', () => {
    const s = serieDoTipo(QUARTAS[0], TODOS);
    expect(s[0].data).toBe('2026-07-29');
    expect(s[s.length - 1].data).toBe('2026-08-26');
  });

  it('só o mesmo tipo', () => {
    const s = serieDoTipo(QUARTAS[0], TODOS);
    expect(s).toHaveLength(5);
    expect(s.every((p) => p.data >= '2026-07-29')).toBe(true);
  });

  it('⚠️ não inclui cultos posteriores ao selecionado', () => {
    const s = serieDoTipo(QUARTAS[2], TODOS);   // 12/08
    expect(s.every((p) => p.data <= '2026-08-12')).toBe(true);
  });

  it('views soma DS + DDUS, e vira null quando os dois faltam', () => {
    const semViews = culto('2026-05-06', 'Z', 10, { online_ds: null, online_ddus: null });
    const s = serieDoTipo(semViews, [semViews]);
    expect(s[0].views).toBeNull();
  });

  it('entrada nula não quebra', () => {
    expect(serieDoTipo(QUARTAS[0], null)).toEqual([]);
    expect(compararComAnteriores(QUARTAS[0], null).linhas).toEqual([]);
  });
});
