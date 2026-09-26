import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const { filtrarCampus, carimbarCampus, chaveCacheCampus } = createRequire(import.meta.url)('../../backend/utils/campusQuery.js');
const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002';
const ctx = { campus_id: a, campi: [{ id: a }, { id: b }] };
describe('contrato de consultas por campus', () => {
  it('aplica campus na própria consulta e restringe consolidado aos permitidos', () => {
    const q = { eq: vi.fn(), in: vi.fn() };
    filtrarCampus(q, ctx); expect(q.eq).toHaveBeenCalledWith('igreja_id', a);
    filtrarCampus(q, { ...ctx, campus_id: 'consolidado', consolidado_permitido: true });
    expect(q.in).toHaveBeenCalledWith('igreja_id', [a,b]);
    expect(() => filtrarCampus(q, null)).toThrow();
  });
  it('recusa forjar campus e lotes mistos sem modificar o payload', () => {
    const payload = { nome: 'Teste' };
    expect(carimbarCampus(payload, ctx)).toEqual({ nome: 'Teste', igreja_id: a });
    expect(payload).not.toHaveProperty('igreja_id');
    expect(() => carimbarCampus([{ nome: 'A' }, { igreja_id: b }], ctx)).toThrow();
    expect(() => carimbarCampus(payload, { ...ctx, campus_id: 'consolidado', consolidado_permitido: true })).toThrow();
  });
  it('não reutiliza cache entre campus, usuários e concessões', () => {
    const chave = chaveCacheCampus('painel', ctx, a);
    expect(chaveCacheCampus('painel', { ...ctx, campus_id: b }, a)).not.toBe(chave);
    expect(chaveCacheCampus('painel', ctx, b)).not.toBe(chave);
    expect(chaveCacheCampus('painel', { ...ctx, campi: [{ id: a }] }, a)).not.toBe(chave);
  });
});
