// Contrato da régua que decide quando o QR do apelo para de ser oferecido.
//
// ⚠️ O `agora` é INJETADO em todo caso: teste que lê o relógio da máquina passa
// hoje e falha em outro dia (lição do faixaEtaria.test.ts).
import { describe, it, expect } from 'vitest';
import { cultoEncerrado, fimDaJanelaQr, HORAS_APOS_INICIO } from '../lib/cultoQrJanela';

/** Instante LOCAL, montado por componentes — nunca por string ISO. */
const em = (a: number, m: number, d: number, h = 0, min = 0) => new Date(a, m - 1, d, h, min, 0, 0);

describe('cultoQrJanela', () => {
  it('culto de hoje que ainda não começou NÃO está encerrado', () => {
    expect(cultoEncerrado('2026-08-30', '19:00', em(2026, 8, 30, 9, 0))).toBe(false);
  });

  it('durante o culto NÃO está encerrado — o apelo é perto do fim', () => {
    expect(cultoEncerrado('2026-08-30', '09:30', em(2026, 8, 30, 11, 15))).toBe(false);
  });

  it('encerra depois da margem posterior ao início', () => {
    expect(cultoEncerrado('2026-08-30', '09:30', em(2026, 8, 30, 13, 29))).toBe(false);
    expect(cultoEncerrado('2026-08-30', '09:30', em(2026, 8, 30, 13, 31))).toBe(true);
  });

  it('culto de semana passada está encerrado', () => {
    expect(cultoEncerrado('2026-08-16', '10:00', em(2026, 8, 27, 14, 0))).toBe(true);
  });

  it('culto de amanhã nunca está encerrado', () => {
    expect(cultoEncerrado('2026-08-28', '20:00', em(2026, 8, 27, 23, 59))).toBe(false);
  });

  // ⚠️⚠️ O FUSO É FORÇADO. O gate roda em UTC, onde interpretar a data como UTC
  // ou como local dá a MESMA resposta — sem forçar BRT este caso passaria sem
  // exercer nada, e o mutante "usar new Date(iso)" sobreviveria. Restaurar no
  // finally é obrigatório: o worker do vitest é compartilhado.
  it('⚠️ o culto da NOITE não vira "encerrado" por causa do fuso', () => {
    const tzOriginal = process.env.TZ;
    try {
      process.env.TZ = 'America/Sao_Paulo';
      expect(new Date('2026-08-30T12:00:00Z').getTimezoneOffset()).toBe(180);

      // 'YYYY-MM-DD' lido como UTC seria 21h do dia ANTERIOR no Rio. Às 20h do
      // próprio domingo o culto das 19:00 tem que estar VIVO.
      expect(cultoEncerrado('2026-08-30', '19:00', em(2026, 8, 30, 20, 0))).toBe(false);
      // E a virada acontece na MADRUGADA do dia seguinte, não às 21h do domingo.
      expect(cultoEncerrado('2026-08-30', '19:00', em(2026, 8, 30, 22, 59))).toBe(false);
      expect(cultoEncerrado('2026-08-30', '19:00', em(2026, 8, 31, 0, 30))).toBe(true);
    } finally {
      if (tzOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = tzOriginal;
    }
  });

  it('a margem atravessa a meia-noite sem quebrar', () => {
    const fim = fimDaJanelaQr('2026-08-30', '22:00');
    expect(fim?.getDate()).toBe(31);
    expect(fim?.getHours()).toBe(22 + HORAS_APOS_INICIO - 24);
  });

  it('sem hora, vale o dia INTEIRO', () => {
    expect(cultoEncerrado('2026-08-30', null, em(2026, 8, 30, 23, 0))).toBe(false);
    expect(cultoEncerrado('2026-08-30', null, em(2026, 8, 31, 0, 1))).toBe(true);
  });

  it('hora com segundos (formato do banco) é aceita', () => {
    expect(cultoEncerrado('2026-08-30', '09:30:00', em(2026, 8, 30, 11, 0))).toBe(false);
    expect(cultoEncerrado('2026-08-30', '09:30:00', em(2026, 8, 30, 14, 0))).toBe(true);
  });

  it('⚠️ FAIL-OPEN: data ilegível NÃO bloqueia', () => {
    for (const ruim of [null, undefined, '', 'ontem', '30/08/2026']) {
      expect(cultoEncerrado(ruim as string | null, '09:30', em(2030, 1, 1))).toBe(false);
      expect(fimDaJanelaQr(ruim as string | null, '09:30')).toBeNull();
    }
  });

  it('timestamp completo do banco também é aceito (usa só a data)', () => {
    expect(cultoEncerrado('2026-08-16T00:00:00.000Z', '10:00', em(2026, 8, 27))).toBe(true);
  });
});
