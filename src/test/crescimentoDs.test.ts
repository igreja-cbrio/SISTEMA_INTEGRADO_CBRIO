// ⚠️⚠️ ONL-11 PELO DS — "% crescimento da frequência em relação a semana anterior".
//
// Pedido do Matheus (23/09/2026): *"esse aqui eu gostaria que fosse o valor do
// DS"*. Escolha dele: o card guarda o crescimento %, a ficha abre em partes.
//
// ⚠️⚠️ O que o KPI media antes: `cultos.online_freq` soma `online_pico` —
// espectadores SIMULTÂNEOS. O card mostrava "1032" contra meta "30". Medido em
// 23/09: W35 1.146 · W36 1.262 · W37 1.400 · W38 1.032.
//
// ⚠️⚠️ A guarda que este arquivo existe para proteger: semana sem NENHUM culto
// com DS vale SEM DADO, nunca zero. O DS é lido na manhã seguinte ao culto, e
// somar zero ali produziria "−100% de crescimento" — mentira com cara de
// alarme. Foi esse zero que encheu o ONL-11 de "0%" em W39..W52.
import { describe, it, expect } from 'vitest';
import { somarDs, crescimentoPct, semanaFechada, resultadoSemana } from '../../backend/utils/crescimentoDs.js';

// Medido no banco em 23/09/2026 (soma de cultos.online_ds por semana ISO).
const W37 = 5107;
const W38 = 4638;

describe('a soma do DS da semana', () => {
  it('soma os cultos que têm DS e conta quantos são', () => {
    const s = somarDs([{ online_ds: 1000 }, { online_ds: 638 }, { online_ds: 3000 }]);
    expect(s.total).toBe(4638);
    expect(s.com_ds).toBe(3);
    expect(s.cultos).toBe(3);
  });

  it('culto sem DS não conta, mas aparece no total de cultos', () => {
    const s = somarDs([{ online_ds: 4638 }, { online_ds: null }]);
    expect(s.total).toBe(4638);
    expect(s.com_ds).toBe(1);
    expect(s.cultos).toBe(2);
  });

  // ⚠️⚠️ O CORAÇÃO. "Somou zero" e "não há o que somar" são coisas diferentes.
  it('semana sem NENHUM DS vale null, não zero', () => {
    expect(somarDs([{ online_ds: null }, { online_ds: null }]).total).toBeNull();
    expect(somarDs([]).total).toBeNull();
  });

  it('aceita texto numérico do Postgres', () => {
    expect(somarDs([{ online_ds: '4638' }]).total).toBe(4638);
  });
});

describe('o crescimento contra a semana anterior', () => {
  it('W38 contra W37 dá −9,18%', () => {
    expect(crescimentoPct(W38, W37).valor).toBe(-9.18);
  });

  it('crescimento positivo sai positivo', () => {
    expect(crescimentoPct(5107, 3545).valor).toBe(44.06);
  });

  // ⚠️ Mesma régua do `delta_pct` do SQL: base zero devolve NULL, não infinito
  // nem 100. Divergir faria o mesmo KPI ter dois comportamentos conforme o
  // motor que calculou.
  it('base zero é sem dado, não infinito', () => {
    expect(crescimentoPct(4638, 0)).toEqual({ valor: null, motivo: 'base_zero' });
  });

  it('distingue falta de dado na semana e na anterior', () => {
    expect(crescimentoPct(null, W37).motivo).toBe('sem_dado_no_periodo');
    expect(crescimentoPct(W38, null).motivo).toBe('sem_dado_no_periodo_anterior');
  });

  it('arredonda em 2 casas, sem erro de ponto flutuante', () => {
    expect(crescimentoPct(4638, 5107).valor).toBe(-9.18);
    expect(String(crescimentoPct(1, 3).valor)).toBe('-66.67');
  });
});

describe('⚠️⚠️ o resultado que vai para o KPI', () => {
  it('semana vazia NÃO vira −100%', () => {
    const r = resultadoSemana([{ online_ds: null }, { online_ds: null }], [{ online_ds: W37 }]);
    expect(r.valor).toBeNull();
    expect(r.motivo).toBe('sem_dado_no_periodo');
  });

  it('a observação carrega as PARTES — o registro guarda só o valor', () => {
    const r = resultadoSemana([{ online_ds: W38 }], [{ online_ds: W37 }]);
    expect(r.valor).toBe(-9.18);
    expect(r.observacao).toContain('4.638');
    expect(r.observacao).toContain('5.107');
  });

  it('devolve as partes para a ficha montar a tabela', () => {
    const r = resultadoSemana([{ online_ds: W38 }], [{ online_ds: W37 }]);
    expect(r.atual.total).toBe(W38);
    expect(r.anterior.total).toBe(W37);
  });
});

// ⚠️⚠️ SEMANA INTEIRA ZERADA É FALHA DE COLETA, NÃO QUEDA DE 100%.
//
// Descoberto no ENSAIO do backfill (24/09/2026): duas semanas davam −100%. Em
// 2025-W30 os SEIS cultos tinham `online_ds = 0` — e `online_pico` de 553, 443,
// 365, 321, 260 e 25, com `online_ddus` chegando a 1.181. Gente assistiu; o DS
// é que não foi gravado. Medido desde 2024: **17 cultos com DS = 0 tendo
// audiência comprovada**, contra 758 com DS > 0. Houve uma pane de coleta de
// TRÊS semanas em dez/2024 (W50–W52) e outra em jul/2025 (W30).
describe('⚠️⚠️ semana zerada é ausência, não queda', () => {
  it('todos os cultos com DS 0 vale sem dado', () => {
    const s = somarDs([{ online_ds: 0 }, { online_ds: 0 }, { online_ds: 0 }]);
    expect(s.total).toBeNull();
    expect(s.ausencia).toBe('tudo_zerado');
    expect(s.com_ds).toBe(3);
  });

  it('distingue "não coletamos" de "não teve culto"', () => {
    expect(somarDs([{ online_ds: null }]).ausencia).toBe('sem_coleta');
    expect(somarDs([{ online_ds: 0 }]).ausencia).toBe('tudo_zerado');
    expect(somarDs([{ online_ds: 10 }]).ausencia).toBeNull();
  });

  it('⚠️ o −100% não acontece mais (2025-W30 contra W29)', () => {
    const r = resultadoSemana(
      [{ online_ds: 0 }, { online_ds: 0 }, { online_ds: 0 },
       { online_ds: 0 }, { online_ds: 0 }, { online_ds: 0 }],
      [{ online_ds: 6330 }]);
    expect(r.valor).toBeNull();
    expect(r.motivo).toBe('ds_zerado_na_semana');
  });

  it('um zero no meio de cultos com DS não zera a semana', () => {
    const s = somarDs([{ online_ds: 0 }, { online_ds: 4638 }]);
    expect(s.total).toBe(4638);
    expect(s.ausencia).toBeNull();
  });
});

// ⚠️⚠️ A SEMANA EM CURSO NÃO VALE.
//
// Descoberto ao rodar o backfill (24/09/2026): a semana corrente entrou com
// **−94,09%**. Não houve queda — W39 tinha UM culto com DS coletado (a quarta
// de 23/09) contra SEIS da semana anterior. Comparar semana pela metade com
// semana inteira é catástrofe falsa, e apareceria no card de terça a sábado,
// toda semana, para sempre.
describe('⚠️⚠️ só semana fechada é gravada', () => {
  it('semana em curso não fecha (fim depois de hoje)', () => {
    expect(semanaFechada('2026-09-28', '2026-09-24')).toBe(false);
  });

  it('semana passada fecha', () => {
    expect(semanaFechada('2026-09-21', '2026-09-24')).toBe(true);
  });

  // `fim` é EXCLUSIVO — é a segunda-feira seguinte. Quando ela chega, a semana
  // anterior acabou de verdade.
  it('o próprio dia do fim exclusivo já conta como fechada', () => {
    expect(semanaFechada('2026-09-21', '2026-09-21')).toBe(true);
  });

  it('entrada faltando não é tratada como fechada', () => {
    expect(semanaFechada(null as never, '2026-09-24')).toBe(false);
    expect(semanaFechada('2026-09-21', null as never)).toBe(false);
  });

  // ⚠️ Comparação de TEXTO só funciona com ISO zero-padded — a mesma armadilha
  // do corte de período futuro na ficha.
  it('a virada de ano não inverte a comparação', () => {
    expect(semanaFechada('2027-01-04', '2026-12-31')).toBe(false);
    expect(semanaFechada('2026-12-29', '2027-01-02')).toBe(true);
  });
});
