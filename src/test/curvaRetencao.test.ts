// Curva de audiência da transmissão (aba Online).
//
// ⚠️⚠️ O que este arquivo protege, em ordem de dano:
//   1. ⚠️⚠️ o eixo voltar a "% do vídeo". "32% do vídeo" não diz nada a quem
//      produz o culto; "24 min de transmissão" diz;
//   2. ⚠️⚠️ a ABERTURA ser tratada como queda de audiência. No culto de
//      26/08/2026 a curva vale 0,77 em 1%, despenca para 0,06 em 5% e sobe até
//      um platô de ~0,46. Aquele vale é a tela de espera antes do culto — se
//      entrar na média, a transmissão parece um desastre quando tem platô;
//   3. ⚠️ a detecção de abertura disparar num vídeo que só decai (o formato
//      normal), pintando uma linha amarela de "culto começa" no meio do nada;
//   4. a métrica ser descrita como "% ainda assistindo". `audienceWatchRatio` é
//      views do trecho ÷ views totais — pode SUBIR e pode passar de 1,0.
import { describe, it, expect } from 'vitest';
import { lerCurva, acharAbertura } from '@/lib/curvaRetencao';

// Curva REAL do culto de 26/08/2026 (Quarta com Deus, 1h16), medida no banco.
const REAL: [number, number][] = [
  [1, 0.77], [2, 0.12], [3, 0.08], [5, 0.06], [8, 0.08], [10, 0.10],
  [15, 0.20], [20, 0.21], [25, 0.25], [30, 0.38], [35, 0.38], [40, 0.45],
  [45, 0.46], [47, 0.46], [50, 0.45], [55, 0.46], [60, 0.46], [65, 0.43],
  [70, 0.43], [75, 0.41], [80, 0.42], [85, 0.40], [90, 0.38], [95, 0.33],
  [100, 0.16],
];
const curva = REAL.map(([ratio_pct, audience_watch_ratio]) => ({ ratio_pct, audience_watch_ratio }));

describe('⚠️⚠️ o eixo vira MINUTOS quando a duração é conhecida', () => {
  it('converte % do vídeo em minutos reais', () => {
    const r = lerCurva(curva, 76); // 1h16
    expect(r.emMinutos).toBe(true);
    expect(r.max).toBe(76);
    // 50% de 76 min = 38 min
    const meio = r.pontos.find((p) => Math.round(p.x) === 38);
    expect(meio?.y).toBe(0.45);
  });

  it('rotula em minutos, e em horas quando passa de 60', () => {
    const r = lerCurva(curva, 76);
    expect(r.fmtRotulo(24)).toBe('24 min de transmissão');
    expect(r.fmtEixo(70)).toBe('1h10');
  });

  it('⚠️ sem duração cai para % — mas nunca inventa minuto', () => {
    const r = lerCurva(curva, null);
    expect(r.emMinutos).toBe(false);
    expect(r.max).toBe(100);
    expect(r.fmtRotulo(32)).toBe('32% do vídeo');
  });
});

describe('⚠️⚠️ a abertura é reconhecida e fica fora da média', () => {
  it('acha o vale da espera antes do culto', () => {
    const i = acharAbertura(curva);
    expect(i).not.toBeNull();
    expect(curva[i!].ratio_pct).toBe(5);     // o vale medido
    expect(curva[i!].audience_watch_ratio).toBe(0.06);
  });

  it('a média é a do CULTO, não a do vídeo inteiro', () => {
    const r = lerCurva(curva, 76);
    const todos = curva.reduce((s, p) => s + p.audience_watch_ratio, 0) / curva.length;
    expect(r.media).toBeGreaterThan(todos);          // a abertura puxava pra baixo
    expect(r.media).toBeGreaterThan(0.3);
    expect(r.media).toBeLessThan(0.4);
  });

  it('marca onde o culto começa, em minutos', () => {
    const r = lerCurva(curva, 76);
    expect(Math.round(r.inicioCulto!)).toBe(4);      // 5% de 76 min
    expect(r.abertura).toBe('os 4 primeiros min');
  });
});

describe('⚠️ a abertura NÃO é inventada num vídeo que só decai', () => {
  it('curva monotônica decrescente não tem abertura', () => {
    const decai = Array.from({ length: 20 }, (_, i) => ({
      ratio_pct: (i + 1) * 5, audience_watch_ratio: 1 - i * 0.04,
    }));
    expect(acharAbertura(decai)).toBeNull();
    const r = lerCurva(decai, 60);
    expect(r.inicioCulto).toBeNull();
    expect(r.abertura).toBeNull();
  });

  it('⚠️ recuperação FRACA não conta como abertura (precisa dobrar o vale)', () => {
    // Cai a 0,40 e só volta a 0,50 — é oscilação, não tela de espera.
    const fraca = [
      { ratio_pct: 5, audience_watch_ratio: 0.9 },
      { ratio_pct: 20, audience_watch_ratio: 0.4 },
      { ratio_pct: 40, audience_watch_ratio: 0.5 },
      { ratio_pct: 60, audience_watch_ratio: 0.5 },
      { ratio_pct: 80, audience_watch_ratio: 0.45 },
      { ratio_pct: 100, audience_watch_ratio: 0.4 },
    ];
    expect(acharAbertura(fraca)).toBeNull();
  });

  it('vale no ponto 0 não é abertura (não houve queda)', () => {
    const semQueda = Array.from({ length: 10 }, (_, i) => ({
      ratio_pct: (i + 1) * 10, audience_watch_ratio: 0.1 + i * 0.05,
    }));
    expect(acharAbertura(semQueda)).toBeNull();
  });
});

describe('⚠️ o resumo numérico bate com a curva', () => {
  it('pico, fim e posição do pico', () => {
    const r = lerCurva(curva, 76);
    expect(r.pico).toBe(0.77);          // o 1%, a tela de espera
    expect(Math.round(r.picoX)).toBe(1);
    expect(r.fim).toBe(0.16);           // encerramento
  });

  it('⚠️ o platô da segunda metade EXISTE — era o que o corte escondia', () => {
    // O bug do PostgREST cortava em 47%; tudo abaixo só era visível depois.
    const r = lerCurva(curva, 76);
    const segundaMetade = r.pontos.filter((p) => p.x > 38);
    expect(segundaMetade.length).toBeGreaterThan(8);
    const mediaPlato = segundaMetade.reduce((s, p) => s + p.y, 0) / segundaMetade.length;
    expect(mediaPlato).toBeGreaterThan(0.35);
  });
});

describe('⚠️ entrada hostil não derruba a tela', () => {
  it('vazio, nulo e indefinido', () => {
    for (const v of [null, undefined, []]) {
      const r = lerCurva(v as never, 76);
      expect(r.pontos).toEqual([]);
      expect(r.media).toBe(0);
      expect(r.abertura).toBeNull();
    }
  });

  it('pontos com NaN são descartados, não propagados', () => {
    const sujo = [
      { ratio_pct: 10, audience_watch_ratio: NaN },
      { ratio_pct: NaN, audience_watch_ratio: 0.5 },
      { ratio_pct: 50, audience_watch_ratio: 0.4 },
    ];
    const r = lerCurva(sujo as never, 60);
    expect(r.pontos).toHaveLength(1);
    expect(r.media).toBe(0.4);
  });

  it('duração zero ou negativa não vira eixo em minutos', () => {
    for (const d of [0, -5]) expect(lerCurva(curva, d).emMinutos).toBe(false);
  });

  it('ordena por ratio_pct mesmo se vier fora de ordem', () => {
    const fora = [...curva].reverse();
    const r = lerCurva(fora, 76);
    expect(r.pontos[0].x).toBeCloseTo(0.76, 1);
    expect(r.pontos[r.pontos.length - 1].x).toBe(76);
  });
});
