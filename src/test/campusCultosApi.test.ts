import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const helpers = require('../../backend/services/campusCultos.js');
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const ID = '11111111-1111-1111-1111-111111111111';
const MEMBER = '22222222-2222-2222-2222-222222222222';
const noop = (_req: unknown, _res: unknown, next: () => unknown) => next();

function ambiente({ cultoCampus = A, membroCampus = A, erroTabela = '', rpcResult = true } = {}) {
  const chamadas: any[] = [];
  const db = {
    from: (tabela: string) => {
      const call: any = { tabela, filtros: [], operacao: 'select' }; chamadas.push(call);
      const builder: any = {};
      for (const method of ['eq', 'is', 'gte', 'lte', 'in']) builder[method] = (col: string, value: unknown) => { call.filtros.push([method, col, value]); return builder; };
      for (const method of ['select', 'order', 'range', 'single', 'maybeSingle']) builder[method] = (...args: unknown[]) => { call[method] = args; return builder; };
      for (const method of ['insert', 'update', 'delete']) builder[method] = (payload: unknown) => { call.operacao = method; call.payload = payload; return builder; };
      builder.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const filterCampus = call.filtros.find((f: any[]) => f[1] === 'igreja_id')?.[2];
        let data: unknown = [];
        if (tabela === 'modulos') data = { slug: 'integracao', escopo_campus: 'isolado' };
        if (tabela === 'cultos') data = (filterCampus && filterCampus !== cultoCampus) ? null : { id: ID, igreja_id: cultoCampus, ...(call.payload || {}) };
        if (tabela === 'mem_membros') data = filterCampus !== membroCampus ? null : { id: MEMBER, cpf: null, data_nascimento: null };
        if (tabela === 'cultos_decisoes_pessoas') data = call.operacao === 'insert' ? { id: ID, ...call.payload } : [{ id: ID }];
        if (tabela === 'usuario_igrejas') data = [{ usuario_id: 'mesmo-campus' }];
        return Promise.resolve({ data, error: tabela === erroTabela ? { message: 'falha simulada' } : null }).then(resolve, reject);
      };
      return builder;
    },
    rpc: vi.fn(async () => ({ data: rpcResult, error: null })),
  };
  const rotas = new Map<string, Function[]>();
  const router: any = { use: vi.fn() };
  for (const method of ['get', 'post', 'put', 'delete', 'patch']) router[method] = (path: string, ...handlers: Function[]) => { rotas.set(`${method.toUpperCase()} ${path}`, handlers); return router; };
  const multer = Object.assign(() => ({ single: () => noop }), { memoryStorage: () => ({}) });
  const localRequire = (nome: string) => {
    if (nome === 'express') return { Router: () => router };
    if (nome === 'multer') return multer;
    if (nome === '../utils/supabase') return { supabase: db };
    if (nome === '../middleware/auth') return { authenticate: noop, authorize: () => noop, authorizeModule: () => noop, getEffectiveLevel: () => 5 };
    if (nome === '../services/campusCultos') return { ...helpers, criarGuardasCultos: () => helpers.criarGuardasCultos({ supabase: db, resolver: async (req: any) => req.campus }) };
    if (nome === '../services/campusRegistro') return { criarGuardasRegistro: () => ({ contexto: noop, payload: noop, registro: noop, membro: noop }) };
    if (nome === '../utils/cpf') return { cpfValido: () => true };
    if (nome === '../services/painelCache') return { bust: vi.fn() };
    return new Proxy({}, { get: () => () => undefined });
  };
  vm.runInNewContext(readFileSync(join(__dirname, '../../backend/routes/kpis.js'), 'utf8'), { require: localRequire, module: { exports: {} }, console, Date, Number, String, Object, Set, process: { env: {} } });
  async function executar(method: string, path: string, body: any = {}, extra = {}) {
    const req: any = { method, params: { id: ID }, query: {}, body, user: { id: 'user', userId: 'user' }, campus: { estado: 'ativo', campus_id: A, campus_legado_id: A, campi: [{ id: A }] }, ...extra };
    const res: any = { status: vi.fn(), json: vi.fn(), send: vi.fn() }; res.status.mockReturnValue(res);
    const handlers = rotas.get(`${method} ${path}`)!;
    let i = 0;
    const next = (): any => { const handler = handlers[i++]; return handler ? handler(req, res, next) : undefined; };
    await next();
    return { req, res };
  }
  return { db, chamadas, executar };
}

describe('Cultos · handlers com campus', () => {
  it('lista a view apenas no campus selecionado e sem registros excluídos', async () => {
    const env = ambiente(); await env.executar('GET', '/cultos');
    const query = env.chamadas.find(c => c.tabela === 'vw_culto_stats');
    expect(query.filtros).toContainEqual(['eq', 'igreja_id', A]);
    expect(query.filtros).toContainEqual(['is', 'deleted_at', null]);
  });
  it('carimba a criação no servidor e rejeita divergência do payload', async () => {
    const env = ambiente(); await env.executar('POST', '/cultos', { nome: 'Culto', data: '2026-10-01', hora: '10:00' });
    expect(env.chamadas.find(c => c.operacao === 'insert').payload.igreja_id).toBe(A);
    const errado = ambiente(); const { res } = await errado.executar('POST', '/cultos', { igreja_id: B });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(errado.chamadas.some(c => c.operacao === 'insert')).toBe(false);
  });
  it('edição protege a própria mutação por ID, campus e soft-delete', async () => {
    const env = ambiente(); await env.executar('PUT', '/cultos/:id', { presencial_adulto: 12 });
    const update = env.chamadas.find(c => c.operacao === 'update');
    expect(update.filtros).toEqual(expect.arrayContaining([['eq', 'id', ID], ['eq', 'igreja_id', A], ['is', 'deleted_at', null]]));
  });
  it('culto de outro campus não permite edição, leitura nominal nem criação de decisão', async () => {
    for (const [method, path] of [['PUT', '/cultos/:id'], ['GET', '/cultos/:id/decisoes-pessoas'], ['POST', '/cultos/:id/decisoes-pessoas']]) {
      const env = ambiente({ cultoCampus: B }); const { res } = await env.executar(method, path);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(env.chamadas.some(c => c.tabela === 'cultos_decisoes_pessoas')).toBe(false);
    }
  });
  it('exclusão usa RPC atômica com campus, nunca DELETE', async () => {
    const env = ambiente(); await env.executar('DELETE', '/cultos/:id');
    expect(env.db.rpc).toHaveBeenCalledWith('fn_campus_soft_delete_culto', { p_culto_id: ID, p_igreja_id: A, p_usuario_id: 'user' });
    expect(env.chamadas.some(c => c.operacao === 'delete')).toBe(false);
    const perdido = ambiente({ rpcResult: false });
    expect((await perdido.executar('DELETE', '/cultos/:id')).res.status).toHaveBeenCalledWith(404);
  });
  it('referência global de membro não copia CPF/nascimento de outro campus', async () => {
    const env = ambiente({ membroCampus: B });
    const { res } = await env.executar('POST', '/cultos/:id/decisoes-pessoas', { membro_id: MEMBER });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(env.chamadas.filter(c => c.tabela === 'mem_membros')).toHaveLength(1);
    expect(env.chamadas.some(c => c.operacao === 'insert')).toBe(false);
  });
  it('referência Wi-Fi sem origem de campus é bloqueada antes de hidratar PII', async () => {
    const env = ambiente();
    const { res } = await env.executar('POST', '/cultos/:id/decisoes-pessoas', { wifi_id: ID });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(env.chamadas.some(c => c.tabela === 'wifi_visitantes')).toBe(false);
  });
  it('decisão Kids recebe campus do ato sem ligação de membro global', async () => {
    const env = ambiente();
    const { res } = await env.executar('POST', '/cultos/:id/decisoes-pessoas', { tipo_decisao: 'kids', nome: 'Criança Teste', responsavel_nome: 'Pessoa Teste', responsavel_telefone: '21999999999', membro_id: MEMBER });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(env.chamadas.find(c => c.operacao === 'insert').payload).toMatchObject({ igreja_id: A, culto_id: ID, membro_id: null });
  });
  it('indisponibilidade do pai não é ausência nem autorização', async () => {
    const env = ambiente({ erroTabela: 'cultos' });
    expect((await env.executar('GET', '/cultos/:id/decisoes-pessoas')).res.status).toHaveBeenCalledWith(503);
  });
  it('notificação nominal intersecta destinatários com o campus do ato', async () => {
    const env = ambiente();
    expect(await helpers.destinatariosDecisaoCampus(env.db, { estado: 'ativo', campus_id: A }, ['mesmo-campus', 'outro-campus'])).toEqual(['mesmo-campus']);
    const falha = ambiente({ erroTabela: 'usuario_igrejas' });
    await expect(helpers.destinatariosDecisaoCampus(falha.db, { estado: 'ativo', campus_id: A }, ['user'])).rejects.toThrow();
  });
});
