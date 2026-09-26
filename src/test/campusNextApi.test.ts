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
    for (const method of ['select','is','in','order','limit','range','maybeSingle','gte','lt','not','or']) q[method] = (...args: any[]) => { call[method] = args; return q; };
    q.eq = (...args: any[]) => { call.filters.push(args); return q; };
    q.then = (resolve: any, reject: any) => {
      const selected = call.filters.find((x: any[]) => ['igreja_id','inscricao.igreja_id'].includes(x[0]))?.[1];
      const parentVisible = selected === campus;
      let data: any = [];
      if (table === 'next_turmas' || table === 'next_eventos') data = call.maybeSingle ? (parentVisible ? { id: ID } : null) : (parentVisible ? [{ id: ID, created_at: '2026-01-01' }] : []);
      else if (parentVisible) {
        const all = table === 'next_encontros' ? [{ id: ID, turma_id: ID }] : Array.from({ length: quantidade }, (_, i) => ({ id: String(i), turma_id: ID, evento_id: ID, status: 'matriculado' }));
        data = call.maybeSingle ? all[0] : call.range ? all.slice(call.range[0], call.range[1] + 1) : all;
      }
      return Promise.resolve({ data, count: parentVisible ? quantidade : 0, error: table === fail ? { message: 'offline' } : null }).then(resolve, reject);
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
  vm.runInNewContext(readFileSync(join(__dirname, '../../backend/routes/next.js'), 'utf8'), { require: localRequire, module: { exports: {} }, console, Date, Intl });
  async function run(path: string, query = {}) {
    const req: any = { method: 'GET', params: { id: ID }, query, campus: { campus_id: A, campi: [{ id: A }] } };
    const res: any = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
    const handlers = routes.get('get' + path)!; let i = 0;
    const next = (): any => handlers[i++]?.(req, res, next); await next(); return res;
  }
  return { run, queries };
}
describe('Next · leituras por campus', () => {
  it.each(['/turmas', '/turmas/:id', '/matriculas', '/lista-espera', '/eventos', '/inscricoes', '/inscricoes/:id'])('filtra cada consulta local em %s', async path => {
    const env = ambiente(); const res = await env.run(path);
    expect(res.status).not.toHaveBeenCalled();
    expect(env.queries.length).toBeGreaterThan(0);
    for (const query of env.queries) expect(query.filters).toContainEqual(['igreja_id', A]);
  });
  it('ID de turma em outro campus retorna 404 antes dos filhos', async () => {
    const env = ambiente(B); expect((await env.run('/turmas/:id')).status).toHaveBeenCalledWith(404);
    expect(env.queries).toHaveLength(1);
  });
  it('detalhe traz mais de mil matrículas e presenças sem truncamento', async () => {
    const env = ambiente(A, '', 1002); const res = await env.run('/turmas/:id');
    const data = res.json.mock.calls[0][0]; expect(data.matriculas).toHaveLength(1002); expect(data.presencas).toHaveLength(1002);
  });
  it.each(['next_matriculas','next_encontros','next_presencas'])('falha de %s não vira detalhe parcial', async table => {
    const env = ambiente(A, table); expect((await env.run('/turmas/:id')).status).toHaveBeenCalledWith(503);
  });
  it('contagens falhadas não aparecem zeradas como resultado válido', async () => {
    const env = ambiente(A, 'next_matriculas'); expect((await env.run('/turmas')).status).toHaveBeenCalledWith(503);
  });
  it('conta mais de mil inscrições sem usar a view global', async () => {
    const env = ambiente(A,'',1002); const res = await env.run('/eventos');
    expect(res.json.mock.calls[0][0][0].inscritos).toBe(1002);
    expect(env.queries.some(q => q.table.startsWith('vw_'))).toBe(false);
  });
  it('lista inscrições até o limite solicitado com paginação e filtro local', async () => {
    const env = ambiente(A,'',1500); const res = await env.run('/inscricoes',{ limit: '1200' });
    expect(res.json.mock.calls[0][0]).toHaveLength(1200);
    expect(env.queries).toHaveLength(2);
  });
  it('indicações usam inner join no ato de inscrição local, sem coluna de campus inventada', async () => {
    const env = ambiente(); await env.run('/indicacoes');
    expect(env.queries[0].select[0]).toContain('next_inscricoes!inner');
    expect(env.queries[0].filters).toContainEqual(['inscricao.igreja_id',A]);
  });
  it('dashboard usa mês BRT e filtros locais inclusive no count das indicações', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T01:30:00Z'));
    try {
      const env = ambiente(); const res = await env.run('/dashboard');
      expect(res.status).not.toHaveBeenCalled();
      const count = env.queries.find(q => q.table === 'next_inscricoes');
      expect(count.gte).toEqual(['created_at','2026-09-01T00:00:00-03:00']);
      expect(env.queries.find(q => q.table === 'next_indicacoes').filters).toContainEqual(['inscricao.igreja_id',A]);
    } finally { vi.useRealTimers(); }
  });
  it.each(['/eventos','/dashboard'])('erro de contagem não vira zero em %s', async path => {
    const env = ambiente(A,'next_inscricoes'); expect((await env.run(path)).status).toHaveBeenCalledWith(503);
  });

});
