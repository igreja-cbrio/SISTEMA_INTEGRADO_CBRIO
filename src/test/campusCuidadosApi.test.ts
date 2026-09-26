import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const ID = '11111111-1111-1111-1111-111111111111';
const noop = (_req: any, _res: any, next: any) => next();
function ambiente(campus = A, fail = '', quantidade = 1) {
  const queries: any[] = [];
  const db = { from: (table: string) => {
    const call: any = { table, filters: [] }; queries.push(call);
    const q: any = {};
    for (const method of ['select','is','in','order','limit','range','maybeSingle','gte','lte','contains']) q[method] = (...args: any[]) => { call[method] = args; return q; };
    q.eq = (...args: any[]) => { call.filters.push(args); return q; };
    q.then = (resolve: any, reject: any) => {
      const selected = call.filters.find((x: any[]) => x[0] === 'igreja_id')?.[1];
      const parentVisible = selected ? selected === campus : true;
      let data: any = [];
      if (table === 'cui_j180_turmas') data = call.maybeSingle ? (parentVisible ? { id: ID } : null) : (parentVisible ? [{ id: ID, created_at: '2026-01-01' }] : []);
      else if (parentVisible) {
        const all = table === 'cui_j180_encontros' ? [{ id: ID, turma_id: ID }] : Array.from({ length: quantidade }, (_, i) => ({ id: String(i), turma_id: ID, status: 'matriculado' }));
        data = call.range ? all.slice(call.range[0], call.range[1] + 1) : all;
      }
      return Promise.resolve({ data, error: table === fail ? { message: 'offline' } : null }).then(resolve, reject);
    };
    return q;
  }};
  const routes = new Map<string, Function[]>();
  const router: any = { use: vi.fn() };
  for (const method of ['get','post','put','patch','delete']) router[method] = (path: string, ...handlers: Function[]) => routes.set(method + path, handlers);
  const localRequire = (name: string) => {
    if (name === 'express') return { Router: () => router };
    if (name === '../utils/supabase') return { supabase: db };
    if (name === '../middleware/auth') return { authenticate: noop, authorizeModule: () => noop };
    if (name === '../middleware/campus') return { criarMiddlewareCampus: () => noop };
    if (['../utils/campusQuery','../utils/campusPaginacao','../utils/nextGuardNivel'].includes(name)) return require('../../backend/' + name.slice(3) + '.js');
    return new Proxy({}, { get: () => () => undefined });
  };
  vm.runInNewContext(readFileSync(join(__dirname, '../../backend/routes/cuidados.js'), 'utf8'), { require: localRequire, module: { exports: {} }, console });
  async function run(path: string) {
    const req: any = { method: 'GET', params: { id: ID }, query: {}, campus: { campus_id: A, campi: [{ id: A }] } };
    const res: any = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
    const handlers = routes.get('get' + path)!; let i = 0;
    const next = (): any => handlers[i++]?.(req, res, next); await next(); return res;
  }
  return { run, queries };
}
describe('Cuidados · leituras por campus e pelo pai', () => {
  it.each(['/acompanhamentos','/convertidos','/jornada180','/visitas','/pedidos'])('filtra registros nominais em %s', async path => {
    const env = ambiente(); const res = await env.run(path);
    expect(res.status).not.toHaveBeenCalled();
    expect(env.queries[0].filters).toContainEqual(['igreja_id', A]);
  });
  it.each(['/j180/turmas/:id','/j180/turmas/:id/encontros'])('não consulta filhos de turma de outro campus em %s', async path => {
    const env = ambiente(B); expect((await env.run(path)).status).toHaveBeenCalledWith(404);
    expect(env.queries).toHaveLength(1);
  });
  it('contagem J180 inclui participantes depois da primeira página', async () => {
    const env = ambiente(A, '', 1002); const res = await env.run('/j180/turmas');
    expect(res.json.mock.calls[0][0][0].participantes_count).toBe(1002);
  });
  it('falha de filhos não aparece como turma vazia', async () => {
    const env = ambiente(A, 'cui_j180_turma_membros');
    expect((await env.run('/j180/turmas/:id')).status).toHaveBeenCalledWith(500);
  });
});
