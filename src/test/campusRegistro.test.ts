// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const { criarGuardasRegistro } = createRequire(import.meta.url)('../../backend/services/campusRegistro.js');
const A = '00000000-0000-0000-0000-000000000001';
const ID = '11111111-1111-1111-1111-111111111111';
const P = '22222222-2222-2222-2222-222222222222';
function env(presente = true) {
  const filtros: any[] = [];
  const q: any = {};
  for (const m of ['select','eq','is']) q[m] = (...args: any[]) => { filtros.push([m,...args]); return q; };
  q.maybeSingle = async () => ({ data: presente ? { id: ID, membro_id: P } : null, error: null });
  const db = { from: vi.fn(() => q) };
  const guard = criarGuardasRegistro({ tabela: 'cui_visitas', modulo: 'cuidados', supabase: db });
  const req: any = { params: { id: ID }, body: { membro_id: P }, campus: { campus_id: A, campi: [{ id: A }] } };
  const res: any = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
  return { req, res, guard, db, filtros };
}
describe('Registro local como prova de vínculo histórico', () => {
  it('reutiliza membro histórico apenas depois da leitura local bem-sucedida', async () => {
    const e = env(); await e.guard.registro(e.req,e.res,vi.fn());
    expect(Object.isFrozen(e.req.registroCampus)).toBe(true);
    await e.guard.membro(e.req,e.res,vi.fn());
    expect(e.db.from).toHaveBeenCalledTimes(1); expect(e.filtros).toContainEqual(['eq','igreja_id',A]);
  });
  it('novo ID sem ato validado exige campus-base e ausência não é autorização', async () => {
    const e = env(false); await e.guard.membro(e.req,e.res,vi.fn());
    expect(e.res.status).toHaveBeenCalledWith(404);
    expect(e.filtros).toContainEqual(['eq','igreja_id',A]);
  });
});
