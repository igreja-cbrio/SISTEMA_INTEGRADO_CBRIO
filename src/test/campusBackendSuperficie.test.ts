import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
  it('temporada textual tem contrato próprio sem alargar UUID ou rota filha', async () => {
    const guard = criarCampusSuperficie({ supabase: banco(), cobertura: [
      { metodo: 'POST', caminho: '/api/grupos/temporadas/:temporada/consolidar' },
      { metodo: 'GET', caminho: '/api/grupos' },
    ] });
    expect((await chamar(guard, '/api/grupos/temporadas/T1-2026/consolidar', 'POST')).next).toHaveBeenCalledOnce();
    expect((await chamar(guard, '/api/grupos/')).next).toHaveBeenCalledOnce();
    for (const path of ['/api/grupos/temporadas/T1-2026/consolidar/extra','/api/grupos/temporadas/T1-2026/editar','/api/grupos/temporadas/a.b/consolidar'])
      expect((await chamar(guard,path,'POST')).next).not.toHaveBeenCalled();
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
  it('certificação Next instalada permite somente as novas rotas comprovadas', async () => {
    const source = readFileSync('backend/server.js','utf8');
    const cobertura = [...source.matchAll(/\{ metodo: '([^']+)', caminho: '([^']+)' \}/g)].map(m => ({ metodo: m[1], caminho: m[2] }));
    const guard = criarCampusSuperficie({ supabase: banco(), cobertura });
    for (const [metodo,caminho] of [
      ['GET','/api/next/pessoas'], ['GET','/api/next/curso'], ['PUT',`/api/next/pessoa/${A}/aulas`],
      ['PUT',`/api/next/inscricoes/${A}`], ['POST',`/api/next/convertidos/${A}/resolver`], ['DELETE',`/api/next/convertidos/${A}/resolver`],
    ]) expect((await chamar(guard,caminho,metodo)).next).toHaveBeenCalledOnce();
    for (const [metodo,caminho] of [
      ['POST','/api/next/pessoas'], ['GET',`/api/next/pessoa/${A}/aulas`], ['PUT','/api/next/pessoa/qualquer/aulas'],
      ['POST',`/api/next/inscricoes/${A}/indicacoes`], ['PUT',`/api/next/indicacoes/${A}`], ['GET','/api/next/satisfacao'],
    ]) expect((await chamar(guard,caminho,metodo)).next).not.toHaveBeenCalled();
  });

  it('portas Batismo certificadas não liberam acesso, fotos ou inscrições genéricas do App', async () => {
    const source = readFileSync('backend/server.js','utf8');
    const cobertura = [...source.matchAll(/\{ metodo: '([^']+)', caminho: '([^']+)' \}/g)].map(m => ({ metodo: m[1], caminho: m[2] }));
    const guard = criarCampusSuperficie({ supabase: banco(), cobertura });
    for (const [method,path] of [
      ['GET','/api/public/batismo/campi'], ['GET','/api/public/batismo/horarios'], ['GET','/api/public/batismo/proxima-data'], ['GET','/api/public/batismo/textos'],
      ['POST','/api/public/batismo'], ['GET','/api/app/campus/batismo/horarios'], ['POST','/api/app/campus/batismo/inscricoes'],
    ]) expect((await chamar(guard,path,method)).next).toHaveBeenCalledOnce();
    for (const [method,path] of [
      ['POST','/api/app/inscricoes'], ['POST','/api/public/batismo/acesso'], ['GET','/api/public/batismo/fotos'], ['POST','/api/public/batismo/campi'],
    ]) expect((await chamar(guard,path,method)).next).not.toHaveBeenCalled();
  });

});

it('Kids certifica somente leituras e transações verificadas', async () => {
  const source = readFileSync('backend/server.js','utf8');
  const cobertura = [...source.matchAll(/\{ metodo: '([^']+)', caminho: '([^']+)' \}/g)].map(m => ({metodo:m[1],caminho:m[2]}));
  const guard = criarCampusSuperficie({supabase:banco(),cobertura});
  for (const path of ['salas','sessoes','cultos-do-dia','checkin/aberto',`criancas/${A}`,`criancas/${A}/atendimentos`]) expect((await chamar(guard,`/api/totem-kids/${path}`)).next).toHaveBeenCalledOnce();
  for (const path of ['checkin','checkout']) expect((await chamar(guard,`/api/totem-kids/${path}`,'POST')).next).toHaveBeenCalledOnce();
  for (const path of ['criancas','dashboard',`sessoes/${A}/criancas-presentes`,'display-sala','cron/encerrar-sessoes']) expect((await chamar(guard,`/api/totem-kids/${path}`)).next).not.toHaveBeenCalled();
  expect((await chamar(guard,'/api/totem-kids/sessoes','POST')).next).not.toHaveBeenCalled();
});
