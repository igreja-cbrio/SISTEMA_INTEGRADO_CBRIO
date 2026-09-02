import { describe, it, expect } from 'vitest';
import { proximoIntervalo, deveRecuar, INTERVALO_BASE_MS, INTERVALO_MAX_MS } from '../lib/pollingResiliente';

describe('recuo do polling', () => {
  it('sem falha, o ritmo é o de sempre', () => {
    expect(proximoIntervalo(0)).toBe(INTERVALO_BASE_MS);
    expect(proximoIntervalo(-1)).toBe(INTERVALO_BASE_MS);
  });

  it('cada falha seguida dobra a espera', () => {
    expect(proximoIntervalo(1)).toBe(60_000);
    expect(proximoIntervalo(2)).toBe(120_000);
    expect(proximoIntervalo(3)).toBe(240_000);
  });

  it('⚠️ o recuo tem TETO — não vira "nunca mais tenta"', () => {
    expect(proximoIntervalo(4)).toBe(INTERVALO_MAX_MS);
    expect(proximoIntervalo(50)).toBe(INTERVALO_MAX_MS);
  });

  it('⚠️⚠️ falha absurda NÃO vira Infinity (que dispararia na hora)', () => {
    // 2**1024 é Infinity e setTimeout(Infinity) executa IMEDIATAMENTE:
    // o recuo viraria exatamente o martelo que ele existe pra evitar.
    const v = proximoIntervalo(5000);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(INTERVALO_MAX_MS);
  });

  it('⚠️ sucesso ZERA o recuo na hora', () => {
    expect(proximoIntervalo(4)).toBe(INTERVALO_MAX_MS);
    expect(proximoIntervalo(0)).toBe(INTERVALO_BASE_MS);
  });
});

describe('quando recuar', () => {
  it('⚠️⚠️ banco fora (503/522/504) recua', () => {
    for (const s of [500, 502, 503, 504, 522, 429]) {
      expect(deveRecuar({ status: s })).toBe(true);
    }
  });

  it('⚠️⚠️ SEM PERMISSÃO (401/403) NÃO recua', () => {
    // 403 é "você não tem esse módulo" — o servidor está ótimo. Recuar aqui
    // degradaria o sino de quem simplesmente não tem acesso.
    for (const s of [400, 401, 403, 404, 409]) {
      expect(deveRecuar({ status: s })).toBe(false);
    }
  });

  it('rede caída (sem status) recua', () => {
    expect(deveRecuar({ message: 'Failed to fetch' })).toBe(true);
    expect(deveRecuar({ message: 'The operation was aborted due to timeout' })).toBe(true);
    expect(deveRecuar(null)).toBe(true);
    expect(deveRecuar(undefined)).toBe(true);
  });
});
