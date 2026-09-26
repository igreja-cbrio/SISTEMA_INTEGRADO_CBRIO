import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { criarCampusSuperficie } = require('../../backend/middleware/campusSuperficie.js');
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
function banco(estado = 'ativo') {
  const resposta = { data: { estado, campus_legado_id: A }, error: null as unknown };
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => resposta) };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { from: vi.fn(() => query), resposta };
}
async function chamar(guard: ReturnType<typeof criarCampusSuperficie>, path = '/api/grupos', method = 'GET', header?: unknown) {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const next = vi.fn();
  const req = { originalUrl: path, method, headers: header === undefined ? {} : { 'x-campus-id': header } };
  await guard(req, res, next);
  return { res, next };
}
describe('Campus · superfície global', () => {
  it('mantém comportamento legado somente em preparação, recusa campus novo e consolidado', async () => {
    const guard = criarCampusSuperficie({ supabase: banco('preparacao') });
    for (const header of [undefined, A]) expect((await chamar(guard, '/api/grupos', 'POST', header)).next).toHaveBeenCalledOnce();
    for (const header of [B, 'consolidado', '', [A]]) {
      const { res, next } = await chamar(guard, '/api/grupos', 'GET', header);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(next).not.toHaveBeenCalled();
    }
  });
  it.each(['ativo', 'ensaio'])('bloqueia rotas não certificadas em %s, mesmo públicas e jobs', async estado => {
    const guard = criarCampusSuperficie({ supabase: banco(estado) });
    for (const path of ['/api/grupos', '/api/app/perfil', '/api/public/grupos', '/api/cron/processar', '/api/auth/users', '/api/campus/segredo', '/api/financeiro-falso', '/api/telemetry/pessoas']) {
      const { res, next } = await chamar(guard, path);
      expect(res.status, path).toHaveBeenCalledWith(503);
      expect(next, path).not.toHaveBeenCalled();
    }
  });
  it('libera bootstrap somente com método e caminho exatos', async () => {
    const guard = criarCampusSuperficie({ supabase: banco() });
    for (const path of ['/api/campus/contexto', '/api/auth/me', '/api/auth/my-permissions', '/api/health', '/api/health/db']) {
      expect((await chamar(guard, `${path}?semEfeito=1`)).next).toHaveBeenCalledOnce();
      expect((await chamar(guard, path, 'DELETE')).next).not.toHaveBeenCalled();
    }
    expect((await chamar(guard, '/api/telemetry/web-vitals', 'POST')).next).toHaveBeenCalledOnce();
  });
  it('preserva domínios administrativos centrais sem ampliar para nomes parecidos', async () => {
    const guard = criarCampusSuperficie({ supabase: banco() });
    for (const path of ['/api/rh/funcionarios', '/api/financeiro', '/api/financeiro-v2/dre', '/api/patrimonio/itens']) {
      expect((await chamar(guard, path)).next).toHaveBeenCalledOnce();
    }
    expect((await chamar(guard, '/api/rh-vazamento')).next).not.toHaveBeenCalled();
  });
  it('cobertura adicional não libera outras operações nem rotas filhas', async () => {
    const guard = criarCampusSuperficie({ supabase: banco(), cobertura: [{ metodo: 'GET', caminho: '/api/grupos/catalogo' }] });
    expect((await chamar(guard, '/api/grupos/catalogo')).next).toHaveBeenCalledOnce();
    expect((await chamar(guard, '/api/grupos/catalogo', 'POST')).next).not.toHaveBeenCalled();
    expect((await chamar(guard, '/api/grupos/catalogo/pessoas')).next).not.toHaveBeenCalled();
    expect(() => criarCampusSuperficie({ cobertura: [{ metodo: 'GET', caminho: '/api/grupos/*' }] })).toThrow();
  });
  it('certifica parâmetro UUID sem liberar um prefixo inteiro', async () => {
    const guard = criarCampusSuperficie({supabase:banco(),cobertura:[{metodo:'PUT',caminho:'/api/kpis/cultos/:id'}]});
    expect((await chamar(guard,`/api/kpis/cultos/${A}`,'PUT')).next).toHaveBeenCalledOnce();
    for(const path of ['/api/kpis/cultos/auto-create',`/api/kpis/cultos/${A}/decisoes-pessoas`])
      expect((await chamar(guard,path,'PUT')).next).not.toHaveBeenCalled();
    expect((await chamar(guard,`/api/kpis/cultos/${A}`,'GET')).next).not.toHaveBeenCalled();
  });
  it('reconsulta o estado e não reutiliza preparação após ativação', async () => {
    const db = banco('preparacao');
    const guard = criarCampusSuperficie({ supabase: db });
    expect((await chamar(guard)).next).toHaveBeenCalledOnce();
    db.resposta.data.estado = 'ativo';
    expect((await chamar(guard)).next).not.toHaveBeenCalled();
    expect(db.from).toHaveBeenCalledTimes(2);
  });
  it('não libera nem bootstrap quando configuração falha ou desaparece', async () => {
    const db = banco();
    const guard = criarCampusSuperficie({ supabase: db });
    db.resposta.error = { code: '42P01' };
    const erro = await chamar(guard, '/api/campus/contexto');
    expect(erro.res.status).toHaveBeenCalledWith(503);
    expect(erro.next).not.toHaveBeenCalled();
    db.resposta.error = null;
    db.resposta.data = null as never;
    expect((await chamar(guard)).next).not.toHaveBeenCalled();
  });
});
