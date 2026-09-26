// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const A = '00000000-0000-0000-0000-000000000001';
const ID = '11111111-1111-1111-1111-111111111111';
const noop = (_q: any, _s: any, next: any) => next();
function ambiente(falha = '', ausente = '') {
  const queries: any[] = [];
  const db = { from(table: string) {
    const c: any = { table, eq: [] }; queries.push(c); const q: any = {};
    for (const method of ['select','is','order','limit','maybeSingle','single','neq','lte','gte','range']) q[method] = (...args: any[]) => { c[method] = args; return q; };
    q.eq = (...args: any[]) => { c.eq.push(args); return q; };
    q.then = (resolve: any, reject: any) => {
      const row = { id: ID, crianca_id: ID, nome: 'Local', data_nascimento: null, responsaveis: [], vol_service_types: { has_kids: true, is_active: true, recurrence_time: '09:30' }, hora: '17:00' };
      return Promise.resolve({ data: table === ausente ? null : c.maybeSingle ? row : [row], error: table === falha ? { message: 'offline' } : null }).then(resolve,reject);
    };
    return q;
  }};
  const routes = new Map<string, Function[]>(); const router: any = { use() {} };
  for (const method of ['get','post','put','patch','delete']) router[method] = (path: string, ...fns: Function[]) => routes.set(method+path,fns);
  let fake: any; fake = new Proxy(function () {}, { get: () => fake, apply: () => fake });
  vm.runInNewContext(readFileSync('backend/routes/totemKids.js','utf8'), { module: {}, console, process: { env: {} }, Buffer, Date, Intl, require(name: string) {
    if (name === 'express') return { Router: () => router };
    if (name === '../middleware/auth') return { authenticate: noop, authorizeModule: () => noop };
    if (name === '../middleware/campus') return { criarMiddlewareCampus: () => noop };
    if (name === '../utils/supabase') return { supabase: db };
    if (['../utils/campusQuery','../utils/campusPaginacao','../services/campusContexto','../services/campusKids'].includes(name)) return require('../../backend/'+name.slice(3)+'.js');
    return fake;
  }});
  async function run(path: string, query: any = {}) {
    const req: any = { method: 'GET', params: { id: ID }, query, campus: { estado: 'ensaio', campus_id: A, campi: [{ id: A }] } };
    const res: any = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
    let i = 0; const list = routes.get('get'+path)!; const next = (): any => list[i++]?.(req,res,next); await next(); return res;
  }
  return { run, queries };
}
describe('Kids · leituras autorizadas pelo campus do ato', () => {
  it.each(['/salas','/sessoes','/cultos-do-dia','/checkin/aberto','/criancas/:id/atendimentos'])('filtra todas as consultas locais em %s', async path => {
    const env = ambiente(); const res = await env.run(path,{ data: '2026-09-27', sessao_id: ID, crianca_id: ID });
    expect(res.status).not.toHaveBeenCalled();
    expect(env.queries.length).toBeGreaterThan(0);
    for (const q of env.queries) expect(q.eq).toContainEqual(['igreja_id',A]);
  });
  it('criança global exige vínculo ativo local antes de carregar dados e responsáveis', async () => {
    const env = ambiente('', 'kids_crianca_campi'); const res = await env.run('/criancas/:id');
    expect(res.status).toHaveBeenCalledWith(404); expect(env.queries).toHaveLength(1);
    expect(env.queries[0].eq).toContainEqual(['ativo',true]);
  });
  it('vínculo local dá acesso à mesma identidade sem filtrar pelo campus-base da criança', async () => {
    const env = ambiente(); const res = await env.run('/criancas/:id');
    expect(res.status).not.toHaveBeenCalled();
    expect(env.queries.map(q => q.table)).toEqual(['kids_crianca_campi','kids_criancas']);
    expect(env.queries[1].eq).toEqual([['id',ID]]);
  });
  it('sessão de outro campus bloqueia consulta de códigos de retirada', async () => {
    const env = ambiente('', 'kids_sessoes'); const res = await env.run('/checkin/aberto',{ sessao_id: ID, crianca_id: ID });
    expect(res.status).toHaveBeenCalledWith(404); expect(env.queries).toHaveLength(1);
  });
  it.each(['kids_sessoes','kids_crianca_campi','kids_checkins'])('erro de %s não expõe dados nem inventa ausência', async table => {
    const env = ambiente(table); const res = await env.run('/checkin/aberto',{ sessao_id: ID, crianca_id: ID });
    expect(res.status).toHaveBeenCalledWith(503);
  });
  it('horário do culto usa o ato local, não a recorrência global', async () => {
    const env = ambiente(); const res = await env.run('/cultos-do-dia',{ data: '2026-09-27' });
    expect(res.json.mock.calls[0][0][0].hora).toBe('17:00');
  });
});

const { exigirCriancaCampus } = require('../../backend/services/campusKids.js');
describe('Kids · compatibilidade de preparação confirmada no banco', () => {
  it.each([false,true])('somente preparação nunca ativada permite ficha sem ato: ativado=%s', async ativado => {
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({data:{estado:'preparacao',ja_ativado:ativado,campus_legado_id:A},error:null}) };
    const db = {from:vi.fn(() => q)};
    const result = exigirCriancaCampus(db,{estado:'preparacao',campus_id:A,campi:[{id:A}]},ID);
    if (ativado) await expect(result).rejects.toMatchObject({status:503});
    else await expect(result).resolves.toBeUndefined();
    expect(db.from).toHaveBeenCalledWith('app_campus_config');
  });
});
