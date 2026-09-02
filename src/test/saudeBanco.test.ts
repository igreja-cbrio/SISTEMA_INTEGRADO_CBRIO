import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const { sondar, respostaSaude } = req('../../backend/utils/saudeBanco.js');

const clienteQue = (resultado: any, atraso = 0) => ({
  from: () => ({ select: () => ({ limit: () => new Promise((res, rej) => setTimeout(() => {
    if (resultado instanceof Error) rej(resultado); else res(resultado);
  }, atraso)) }) }),
});

describe('sonda do banco', () => {
  it('banco respondendo → ok', async () => {
    const s = await sondar(clienteQue({ error: null }));
    expect(s.ok).toBe(true);
    expect(s.erro).toBe(null);
  });

  it('⚠️ erro do PostgREST → NÃO é ok', async () => {
    const s = await sondar(clienteQue({ error: { message: 'connection terminated' } }));
    expect(s.ok).toBe(false);
    expect(s.erro).toContain('connection terminated');
  });

  it('⚠️⚠️ banco MUDO (nunca responde) → corta no timeout, não pendura', async () => {
    // É o caso do incidente: a consulta não volta NUNCA. Sem o teto, a sonda
    // trava — e sonda travada produz SILÊNCIO, que parece saúde.
    const t0 = Date.now();
    const s = await sondar(clienteQue({ error: null }, 60_000), { timeoutMs: 300 });
    const dt = Date.now() - t0;
    expect(s.ok).toBe(false);
    expect(s.erro).toContain('timeout');
    expect(dt).toBeLessThan(2000);
  });

  it('sem client → down, nunca "ok por omissão"', async () => {
    expect((await sondar(null)).ok).toBe(false);
    expect((await sondar(undefined)).erro).toBe('sem_client');
  });
});

describe('resposta HTTP', () => {
  it('vivo → 200', () => {
    expect(respostaSaude({ ok: true, ms: 12 }).status).toBe(200);
  });

  it('⚠️⚠️ fora → 503, NUNCA 200 com "down" no corpo', () => {
    // Monitor externo decide por STATUS. 200 com {"status":"down"} é o mesmo
    // health check que mente, só que com mais passos — foi exatamente esse
    // desenho que deixou a queda de 02/09 invisível por 1h34.
    const r = respostaSaude({ ok: false, ms: 5000, erro: 'timeout' });
    expect(r.status).toBe(503);
    expect(r.retryApos).toBe(30);
  });

  it('sonda ausente → 503 (fail-closed)', () => {
    expect(respostaSaude(null).status).toBe(503);
    expect(respostaSaude(undefined).status).toBe(503);
  });
});
