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
import { somarDs, crescimentoPct, resultadoSemana } from '../../backend/utils/crescimentoDs.js';

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
