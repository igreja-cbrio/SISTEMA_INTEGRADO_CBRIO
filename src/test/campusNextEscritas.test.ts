// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const ID = '11111111-1111-1111-1111-111111111111';
const noop = (_q: any, _s: any, next: any) => next();
function ambiente({ ausente = false, falha = false, erroRpc = null as any, atual = {} as any } = {}) {
  const queries: any[] = [], calls: any[] = [];
  const matcher = vi.fn(async () => ({ membro_id: ID }));
  const coletar = vi.fn();
  const db = { rpc: vi.fn(async (fn, args) => { calls.push({ fn, args }); return { data: { ok: true }, error: erroRpc }; }), from(table: string) {
    const c: any = { table, eq: [] }; queries.push(c); const q: any = {};
    for (const key of ['select','is','single','maybeSingle','insert','update','upsert']) q[key] = (...args: any[]) => { c[key] = args; return q; };
    q.eq = (...args: any[]) => { c.eq.push(args); return q; };
    q.then = (resolve: any, reject: any) => Promise.resolve({ data: ausente ? null : { id: ID, turma_id: ID, ...atual }, error: falha ? { message: 'offline' } : null }).then(resolve, reject);
    return q;
  }};
  const routes = new Map<string, Function[]>(); const router: any = { use() {} };
  for (const method of ['get','post','patch','put','delete']) router[method] = (path: string, ...fns: Function[]) => routes.set(method + path, fns);
  vm.runInNewContext(readFileSync('backend/routes/next.js','utf8'), { console, setImmediate: vi.fn(), module: {}, require(name: string) {
    if (name === 'express') return { Router: () => router };
    if (name === '../utils/supabase') return { supabase: db };
    if (name === '../middleware/auth') return { authenticate: noop, authorizeModule: () => noop };
    if (name === '../middleware/campus') return { criarMiddlewareCampus: () => noop };
    if (name === '../services/membroMatch') return { acharOuCriarGuardado: matcher };
    if (name === '../services/kpiAutoCollector') return { coletarTodos: coletar };
    if (['../utils/campusQuery','../utils/campusPaginacao','../utils/nextGuardNivel','../utils/cpf','../services/campusContexto'].includes(name)) return require('../../backend/' + name.slice(3) + '.js');
    return new Proxy({}, { get: () => () => undefined });
  }});
  async function run(method: string, path: string, body: any = {}, campus = A) {
    const req: any = { method: method.toUpperCase(), params: { id: ID }, body, user: { id: ID }, campus: { estado: 'ensaio', campus_id: campus, campi: [{ id: campus }] } };
    const res: any = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
    let i = 0; const handlers = routes.get(method + path)!;
    const next = (): any => handlers[i++]?.(req, res, next); await next(); return res;
  }
  return { run, queries, calls, matcher, coletar };
}
describe('Next · escritas locais', () => {
  it.each([
    ['put','/eventos/:id'], ['post','/inscricoes/:id/checkin'], ['delete','/inscricoes/:id/checkin'],
    ['patch','/encontros/:id'], ['patch','/turmas/:id'], ['patch','/matriculas/:id'], ['post','/matriculas/:id/transferir'], ['patch','/matriculas/:id/contato'], ['delete','/turmas/:id'], ['delete','/matriculas/:id'],
  ])('%s %s rejeita pai invisível antes da mutação', async (method, path) => {
    const env = ambiente({ ausente: true }); const res = await env.run(method, path);
    expect(res.status).toHaveBeenCalledWith(404); expect(env.calls).toHaveLength(0);
    expect(env.queries).toHaveLength(1); expect(env.queries[0].eq).toContainEqual(['igreja_id', A]);
    expect(env.queries[0].update).toBeUndefined();
  });
  it.each([['post','/eventos'], ['post','/turmas'], ['post','/matriculas'], ['post','/inscricoes']])('nega campus forjado em %s %s antes do matcher', async (method, path) => {
    const env = ambiente(); const res = await env.run(method, path, { igreja_id: B, nome: 'Pessoa', evento_id: ID });
    expect(res.status).toHaveBeenCalledWith(403); expect(env.queries).toHaveLength(0); expect(env.matcher).not.toHaveBeenCalled();
  });
  it('recusa evento externo antes de procurar ou criar pessoa', async () => {
    const env = ambiente({ ausente: true }); const res = await env.run('post','/inscricoes',{ evento_id: ID, nome: 'Pessoa' });
    expect(res.status).toHaveBeenCalledWith(404); expect(env.matcher).not.toHaveBeenCalled();
  });
  it('matrícula normaliza contatos e apenas pessoa nova recebe campus no matcher', async () => {
    const env = ambiente(); await env.run('post','/matriculas',{ nome: 'Pessoa', telefone: '(21) 99999-1111', email: ' A@B.COM ' });
    expect(env.matcher.mock.calls[0][0].extra).toEqual({ igreja_id: A });
    expect(env.queries.find(q => q.insert).insert[0]).toMatchObject({ igreja_id: A, membro_id: ID, telefone: '21999991111', email: 'a@b.com' });
    expect(env.coletar).not.toHaveBeenCalled();
  });
  it('escrita de inscrição usa campus mesmo quando matcher reutiliza identidade global', async () => {
    const env = ambiente(); await env.run('post','/inscricoes',{ evento_id: ID, nome: 'Pessoa' }, B);
    expect(env.queries.find(q => q.insert).insert[0]).toMatchObject({ igreja_id: B, membro_id: ID });
  });
  it.each([['put','/eventos/:id'],['patch','/encontros/:id'],['post','/inscricoes/:id/checkin'],['delete','/inscricoes/:id/checkin'],['patch','/matriculas/:id/contato']])('mutação %s %s repete o filtro no UPDATE', async (method, path) => {
    const env = ambiente(); await env.run(method, path, { titulo: 'Novo', tema: 'Novo' });
    const update = env.queries.find(q => q.update); expect(update.eq).toContainEqual(['igreja_id', A]); expect(update.eq).toContainEqual(['id', ID]);
  });
  it.each([['delete','/turmas/:id','fn_campus_soft_delete_next'], ['delete','/matriculas/:id','fn_campus_soft_delete_next'], ['post','/turmas','fn_campus_next_criar_turma'], ['put','/encontros/:id/presencas','fn_campus_next_presencas'], ['post','/encontros/:id/presenca','fn_campus_next_presencas']])('%s %s usa a transação escopada', async (method, path, fn) => {
    const env = ambiente(); await env.run(method, path, { nome: 'Turma', matricula_ids: [ID], matricula_id: ID });
    expect(env.calls).toHaveLength(1); expect(env.calls[0]).toMatchObject({ fn, args: { p_igreja_id: A } });
  });
  it('erro de permissão atômico não produz sucesso ou recálculo global', async () => {
    const env = ambiente({ erroRpc: { code: 'P0403', message: 'Matrícula fora da turma.' } });
    expect((await env.run('put','/encontros/:id/presencas',{ matricula_ids: [ID] })).status).toHaveBeenCalledWith(403);
    expect(env.coletar).not.toHaveBeenCalled();
  });
  it('erro de consulta do pai não vira registro ausente', async () => {
    const env = ambiente({ falha: true }); expect((await env.run('patch','/encontros/:id')).status).toHaveBeenCalledWith(503);
    expect(env.calls).toHaveLength(0);
  });
  it('duas requisições usam campi separados sem estado mutável do usuário', async () => {
    const env = ambiente(); await env.run('post','/turmas',{ nome: 'Uma' }, A); await env.run('post','/turmas',{ nome: 'Duas' }, B);
    expect(env.calls.map(c => c.args.p_igreja_id)).toEqual([A,B]);
  });
  it('eventos novos e recorrentes carimbam a chave local', async () => {
    const env = ambiente(); await env.run('post','/eventos',{ data: '2026-11-01' }, B);
    expect(env.queries[0].insert[0]).toMatchObject({ igreja_id: B });
    await env.run('post','/eventos/auto-create-mes',{ ano: 2026, mes: 11 }, B);
    const upserts = env.queries.filter(q => q.upsert); expect(upserts).toHaveLength(3);
    for (const q of upserts) { expect(q.upsert[0].igreja_id).toBe(B); expect(q.upsert[1].onConflict).toBe('igreja_id,data'); }
  });
  it('mês inválido não entra em laço ou grava dados', async () => {
    const env = ambiente(); expect((await env.run('post','/eventos/auto-create-mes',{ ano: 2026, mes: 'abc' })).status).toHaveBeenCalledWith(400);
    expect(env.queries).toHaveLength(0);
  });

  it('transferência e alteração da turma usam RPCs com campus explícito', async () => {
    const env = ambiente(); await env.run('patch','/turmas/:id',{ status: 'encerrada' });
    await env.run('post','/matriculas/:id/transferir',{ turma_id: ID });
    expect(env.calls.map(c => c.fn)).toEqual(['fn_campus_next_atualizar_turma','fn_campus_next_transferir']);
    expect(env.calls.every(c => c.args.p_igreja_id === A)).toBe(true);
  });
  it('edição mantém CPF legado idêntico e normaliza contatos sem tocar o principal', async () => {
    const env = ambiente({ atual: { cpf: '12345678900', membro_id: ID } });
    const res = await env.run('patch','/matriculas/:id',{ cpf: '123.456.789-00', telefone: '(21) 99999-1111', email: ' A@B.COM ' });
    expect(res.status).not.toHaveBeenCalled();
    const update = env.queries.find(q => q.update); expect(update.update[0]).toMatchObject({ cpf: '12345678900', telefone: '21999991111', email: 'a@b.com' });
    expect(update.eq).toContainEqual(['igreja_id', A]);
    expect(env.calls[0]).toMatchObject({ fn: 'fn_registrar_contato', args: { p_membro_id: ID } });
    expect(env.queries.some(q => q.table === 'mem_membros' && q.update)).toBe(false);
  });
  it('edição rejeita CPF inválido novo antes de alterar identidade ou matrícula', async () => {
    const env = ambiente(); const res = await env.run('patch','/matriculas/:id',{ cpf: '12345678900' });
    expect(res.status).toHaveBeenCalledWith(400); expect(env.matcher).not.toHaveBeenCalled();
    expect(env.queries.some(q => q.update)).toBe(false);
  });

});
