import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolverContextoCampus } = require('../../backend/services/campusContexto.js');
const { criarMiddlewareCampus } = require('../../backend/middleware/campus.js');

const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const C = '00000000-0000-0000-0000-000000000003';
const campi = [
  { id: A, nome: 'Sede', slug: 'sede', tipo: 'sede' },
  { id: B, nome: 'Outra sede', slug: 'outra', tipo: 'sede' },
];
function banco({ estado = 'ativo', vinculos = [A], config = true, erro = '', rejeita = '', escopo = 'isolado', admin = false } = {}) {
  const filtros: unknown[] = [];
  const from = vi.fn((tabela: string) => {
    const resultado = tabela === 'app_campus_config'
      ? (config ? { estado, campus_legado_id: A } : null)
      : tabela === 'app_super_admins' ? (admin ? { email: 'pessoa@example.test' } : null) : tabela === 'modulos' ? { slug: 'grupos', escopo_campus: escopo } : tabela === 'igrejas' ? campi : vinculos.map(igreja_id => ({ igreja_id }));
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, value: unknown) => { filtros.push([tabela, col, value]); return builder; }),
      order: vi.fn(() => builder),
      maybeSingle: vi.fn(() => builder),
      then: (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
        (rejeita === tabela ? Promise.reject(new Error('rede')) : Promise.resolve({ data: resultado, error: erro === tabela ? { message: 'db' } : null })).then(resolve, reject),
    };
    return builder;
  });
  return { from, filtros };
}
function req(campus?: unknown, extra = {}) {
  return { user: { id: 'usuario', email: 'pessoa@example.test' }, method: 'GET', headers: campus === undefined ? {} : { 'x-campus-id': campus }, ...extra };
}
function options(db: ReturnType<typeof banco>, extra = {}) {
  return { supabase: db, isSuperAdminEmail: async () => false, ...extra };
}

// Exercita resolução real com respostas do banco, não só inspeção do texto fonte.
describe('Campus · autorização e transição', () => {
  it('consulta super-admin por igualdade e não esconde indisponibilidade', async () => {
    const db = banco({ admin: true });
    const result = await resolverContextoCampus(req(B), { supabase: db });
    expect(result.campus_id).toBe(B);
    expect(db.filtros).toContainEqual(['app_super_admins', 'email', 'pessoa@example.test']);
    await expect(resolverContextoCampus(req(), { supabase: banco({ erro: 'app_super_admins' }) })).rejects.toMatchObject({ status: 503 });
  });
  it('exige sessão antes de qualquer leitura', async () => {
    const db = banco();
    await expect(resolverContextoCampus(req(undefined, { user: null }), options(db))).rejects.toMatchObject({ status: 401 });
    expect(db.from).not.toHaveBeenCalled();
  });
  it('mantém somente a Sede em preparação, sem inventar vínculo permanente', async () => {
    const db = banco({ estado: 'preparacao', vinculos: [B] });
    const result = await resolverContextoCampus(req(), options(db));
    expect(result).toMatchObject({ campus_id: A, campi: [campi[0]], consolidado_permitido: false });
    expect(db.filtros).toContainEqual(['usuario_igrejas', 'usuario_id', 'usuario']);
    await expect(resolverContextoCampus(req(B), options(db))).rejects.toMatchObject({ status: 403 });
  });
  it.each(['ativo', 'ensaio'])('sem vínculo falha fechado em %s', async estado => {
    await expect(resolverContextoCampus(req(), options(banco({ estado, vinculos: [] })))).rejects.toMatchObject({ status: 403, codigo: 'campus_sem_vinculo' });
  });
  it('ignora vínculos de igreja inativa e seleciona o único campus ativo', async () => {
    const result = await resolverContextoCampus(req(), options(banco({ vinculos: [A, C] })));
    expect(result.campus_id).toBe(A);
    expect(result.campi).toEqual([campi[0]]);
  });
  it('recusa outro campus mesmo com UUID válido e papel diretor genérico', async () => {
    await expect(resolverContextoCampus(req(B, { user: { id: 'u', role: 'diretor' } }), options(banco()))).rejects.toMatchObject({ status: 403 });
  });
  it('bootstrap oferece seleção sem autorizar operação sem campus', async () => {
    const opt = options(banco({ vinculos: [A, B] }));
    await expect(resolverContextoCampus(req(), opt)).rejects.toMatchObject({ status: 409 });
    const bootstrap = await resolverContextoCampus(req(), { ...opt, exigirSelecao: false });
    expect(bootstrap.campus_id).toBeNull();
    expect(bootstrap.campi).toEqual(campi);
  });
  it.each(['', 'invalido', [A, B], `${A}, ${B}`])('recusa header inválido %j', async header => {
    await expect(resolverContextoCampus(req(header), options(banco()))).rejects.toMatchObject({ status: 400 });
  });
  it('super-admin e diretoria geral precisam escolher mas podem consolidar leitura coberta', async () => {
    for (const campo of ['is_super_admin', 'is_diretoria_geral']) {
      const user = { id: 'u', [campo]: true };
      const opt = options(banco({ vinculos: [] }), { permitirConsolidado: true });
      await expect(resolverContextoCampus(req(undefined, { user }), opt)).rejects.toMatchObject({ status: 409 });
      const result = await resolverContextoCampus(req('consolidado', { user }), opt);
      expect(result).toMatchObject({ campus_id: 'consolidado', consolidado_permitido: true, campi });
    }
  });
  it('consolidado não autoriza escrita, usuário local nem endpoint sem cobertura', async () => {
    const user = { id: 'u', is_super_admin: true };
    const opt = options(banco(), { permitirConsolidado: true });
    await expect(resolverContextoCampus(req('consolidado', { user, method: 'POST' }), opt)).rejects.toMatchObject({ status: 403 });
    await expect(resolverContextoCampus(req('consolidado'), opt)).rejects.toMatchObject({ status: 403 });
    await expect(resolverContextoCampus(req('consolidado', { user }), { ...opt, permitirConsolidado: false })).rejects.toMatchObject({ status: 403 });
  });
  it('ausência de migration/config não se transforma em Sede', async () => {
    await expect(resolverContextoCampus(req(), options(banco({ config: false })))).rejects.toMatchObject({ status: 503 });
    await expect(resolverContextoCampus(req(), options(banco({ estado: 'desconhecido' })))).rejects.toMatchObject({ status: 503 });
  });
  it.each(['app_campus_config', 'igrejas', 'usuario_igrejas'])('falha de %s nunca libera fallback', async tabela => {
    for (const modo of ['erro', 'rejeita']) {
      await expect(resolverContextoCampus(req(), options(banco({ estado: 'preparacao', [modo]: tabela })))).rejects.toMatchObject({ status: 503 });
    }
  });
  it('requests simultâneos compartilham identidade, nunca campus ou lista mutável', async () => {
    const user = Object.freeze({ id: 'u', email: 'u@example.test' });
    const opt = options(banco({ vinculos: [A, B] }));
    const [primeiro, segundo] = await Promise.all([
      resolverContextoCampus(req(A, { user }), opt), resolverContextoCampus(req(B, { user }), opt),
    ]);
    expect(primeiro.campus_id).toBe(A);
    expect(segundo.campus_id).toBe(B);
    expect(user).not.toHaveProperty('campus_id');
    expect(Object.isFrozen(primeiro)).toBe(true);
    expect(Object.isFrozen(primeiro.campi)).toBe(true);
    expect(Object.isFrozen(primeiro.campi[0])).toBe(true);
    expect(primeiro.campi).not.toBe(segundo.campi);
  });
});

describe('Campus · gate de cobertura operacional', () => {
  async function executar({ estado = 'ativo', cobertura = {}, method = 'GET', escopo = 'isolado' } = {}) {
    const request = req(A, { method });
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    const next = vi.fn();
    await criarMiddlewareCampus({ modulo: 'grupos', cobertura, ...options(banco({ estado, escopo })) })(request, res, next);
    return { request, res, next };
  }
  it('bloqueia endpoint sem contrato no ensaio e na operação ativa', async () => {
    for (const estado of ['ensaio', 'ativo']) {
      const { res, next } = await executar({ estado });
      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    }
  });
  it('contrato de leitura não libera escrita', async () => {
    const { res, next } = await executar({ cobertura: { leitura: true }, method: 'PATCH' });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
  it('passa contexto isolado ao handler coberto', async () => {
    const { request, next } = await executar({ cobertura: { leitura: true } });
    expect(next).toHaveBeenCalledOnce();
    expect(request).toHaveProperty('campus.campus_id', A);
    expect(request.user).not.toHaveProperty('campus');
  });
  it('módulo compartilhado ainda exige cobertura e escopo válido', async () => {
    const semContrato = await executar({ escopo: 'compartilhado' });
    expect(semContrato.next).not.toHaveBeenCalled();
    const coberto = await executar({ escopo: 'compartilhado', cobertura: { leitura: true } });
    expect(coberto.request).toHaveProperty('campus.escopo_modulo', 'compartilhado');
    const desconhecido = await executar({ escopo: 'inventado', cobertura: { leitura: true } });
    expect(desconhecido.res.status).toHaveBeenCalledWith(503);
    expect(desconhecido.next).not.toHaveBeenCalled();
  });
  it('preserva endpoint legado somente em preparação', async () => {
    const { next } = await executar({ estado: 'preparacao' });
    expect(next).toHaveBeenCalledOnce();
  });
});
