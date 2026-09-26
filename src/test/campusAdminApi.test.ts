import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';

function ambiente(admin = true, falha = false) {
  const calls: any[] = [];
  const rpc = vi.fn(async () => ({ data: { ok: true }, error: null }));
  const db = { rpc, from: (table: string) => {
    const call: any = { table }; calls.push(call);
    const query: any = {};
    for (const name of ['select', 'eq', 'ilike', 'order', 'limit', 'maybeSingle', 'single']) {
      query[name] = (...args: any[]) => { (call[name] ||= []).push(args); return query; };
    }
    query.then = (resolve: any) => Promise.resolve({ data: table === 'app_super_admins' ? (admin ? { email: 'admin@example.test' } : null) : [], error: falha ? { message: 'offline' } : null }).then(resolve);
    return query;
  }};
  const routes = new Map<string, Function>(); let guard: Function;
  const router: any = { use: (path: unknown, fn: Function) => { if (path === '/admin') guard = fn; } };
  for (const method of ['get', 'put']) router[method] = (path: string, fn: Function) => routes.set(method + path, fn);
  vm.runInNewContext(readFileSync(join(__dirname, '../../backend/routes/campus.js'), 'utf8'), {
    require: (name: string) => name === 'express' ? { Router: () => router } : name === '../utils/supabase' ? { supabase: db } : {}, module: { exports: {} },
  });
  async function run(method: string, path: string, extra: any = {}) {
    const req = { user: { id: '11111111-1111-1111-1111-111111111111', email: 'admin@example.test', role: 'admin' }, body: {}, query: {}, ...extra };
    const res: any = { status: vi.fn(), json: vi.fn(), set: vi.fn() }; res.status.mockReturnValue(res);
    await guard!(req, res, () => routes.get(method + path)!(req, res));
    return res;
  }
  return { calls, rpc, run };
}

describe('administração de campus · fronteira HTTP', () => {
  it('role admin genérico não concede administração de vínculos', async () => {
    const env = ambiente(false); const res = await env.run('put', '/admin/vinculos');
    expect(res.status).toHaveBeenCalledWith(403); expect(env.rpc).not.toHaveBeenCalled();
  });
  it('falha na verificação de administrador não permite leitura nominal', async () => {
    const env = ambiente(true, true); const res = await env.run('get', '/admin/usuarios', { query: { busca: 'Pessoa' } });
    expect(res.status).toHaveBeenCalledWith(503); expect(env.calls).toHaveLength(1);
  });
  it('exige busca e restringe projeção e quantidade', async () => {
    const env = ambiente(); expect((await env.run('get', '/admin/usuarios')).status).toHaveBeenCalledWith(400);
    await env.run('get', '/admin/usuarios', { query: { busca: 'Ana%_' } });
    const query = env.calls.find(c => c.table === 'profiles');
    expect(query.select).toEqual([['id,name,email']]); expect(query.limit).toEqual([[30]]);
    expect(query.ilike).toEqual([['name', '%Ana\\%\\_%']]);
  });
  it('ator da auditoria vem da sessão e IDs duplicados são normalizados', async () => {
    const env = ambiente(); const id = '22222222-2222-2222-2222-222222222222';
    await env.run('put', '/admin/vinculos', { body: { usuario_id: id, igreja_ids: [id, id], p_autor_id: id } });
    expect(env.rpc).toHaveBeenCalledWith('fn_campus_definir_acessos', { p_usuario_id: id, p_igreja_ids: [id], p_autor_id: '11111111-1111-1111-1111-111111111111' });
  });
  it('permite remover todos os vínculos, rejeita identificadores inválidos', async () => {
    const env = ambiente(); const id = '22222222-2222-2222-2222-222222222222';
    await env.run('put', '/admin/vinculos', { body: { usuario_id: id, igreja_ids: [] } });
    expect(env.rpc).toHaveBeenCalledTimes(1);
    expect((await env.run('put', '/admin/vinculos', { body: { usuario_id: id, igreja_ids: ['consolidado'] } })).status).toHaveBeenCalledWith(400);
    expect(env.rpc).toHaveBeenCalledTimes(1);
  });
});
