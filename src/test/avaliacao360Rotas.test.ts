import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const fonte = readFileSync(resolve(__dirname, '../../backend/routes/avaliacao360.js'), 'utf8');
const conviteId = '12345678-1234-4567-8123-123456789012';
const eu = { id: 'funcionario-do-login', nome: 'Colaborador', area: 'Equipe' };
type Handler = (req: any, res: any) => Promise<unknown>;

function carregar(opcoes: { rpc?: any; identidade?: any; consulta?: any } = {}) {
  const rotas = new Map<string, any[]>();
  const router: any = { use: vi.fn() };
  for (const metodo of ['get', 'post']) {
    router[metodo] = (path: string, ...handlers: any[]) => rotas.set(`${metodo} ${path}`, handlers);
  }
  const authenticate = vi.fn();
  const apenasColaborador = vi.fn();
  const authorizeModule = vi.fn((modulo: string, nivel: number) => ({ modulo, nivel }));
  const funcionarioDoLogin = vi.fn().mockResolvedValue(opcoes.identidade ?? { funcionario: eu, erro: null });
  const gerarConvitesAutomaticos = vi.fn().mockResolvedValue({ ok: true });
  const filtros: any[][] = [];
  const builder: any = {};
  for (const metodo of ['select', 'eq', 'is', 'order', 'maybeSingle']) {
    builder[metodo] = (...args: any[]) => { filtros.push([metodo, ...args]); return builder; };
  }
  builder.then = (resolver: any) => Promise.resolve(opcoes.consulta ?? { data: [] }).then(resolver);
  const supabase = {
    rpc: vi.fn().mockResolvedValue(opcoes.rpc ?? { data: { ok: true } }),
    from: vi.fn().mockReturnValue(builder),
  };
  const modulo = { exports: {} };
  runInNewContext(fonte, {
    module: modulo,
    console: { error: vi.fn() },
    require: (id: string) => {
      if (id === 'express') return { Router: () => router };
      if (id === '../middleware/auth') return { authenticate, apenasColaborador, authorizeModule };
      if (id === '../utils/supabase') return { supabase };
      if (id === '../services/avaliacao360') return { funcionarioDoLogin, gerarConvitesAutomaticos, retratoDoCiclo: vi.fn() };
      throw new Error(`Import inesperado: ${id}`);
    },
  });
  async function chamar(rota: string, req: any = {}) {
    const res: any = { statusCode: 200, body: undefined };
    res.status = (status: number) => { res.statusCode = status; return res; };
    res.json = (body: any) => { res.body = body; return res; };
    const handlers = rotas.get(rota);
    if (!handlers) throw new Error(`Rota ausente: ${rota}`);
    await (handlers.at(-1) as Handler)({ params: { id: conviteId }, user: { email: 'login@example.org' }, ...req }, res);
    return res;
  }
  return { chamar, supabase, funcionarioDoLogin, gerarConvitesAutomaticos, filtros, router, rotas, authenticate, apenasColaborador };
}

describe('360: identidade e contrato das rotas do colaborador', () => {
  it('responder usa somente a identidade do login, mesmo se o corpo tentar trocá-la', async () => {
    const { chamar, supabase } = carregar({ rpc: { data: { ok: true, respostas: 1 } } });
    const notas = [{ competencia_id: 'competencia', nota: 4 }];
    const res = await chamar('post /convite/:id/responder', { body: { notas, avaliador_id: 'outro', avaliado_id: 'outro', funcionario_id: 'outro' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, respostas: 1 });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_responder', {
      p_convite_id: conviteId, p_avaliador_id: eu.id, p_notas: notas,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('GET usa a função canônica do formulário com proprietário vindo do login', async () => {
    const formulario = { convite: { id: conviteId }, competencias: [{ id: 'competencia' }], escala_max: 5 };
    const { chamar, supabase } = carregar({ rpc: { data: formulario } });
    const res = await chamar('get /convite/:id', { query: { avaliador_id: 'outro' } });
    expect(res.body).toEqual(formulario);
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_formulario', { p_convite_id: conviteId, p_avaliador_id: eu.id });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it.each(['get /convite/:id', 'post /convite/:id/responder'])('%s rejeita UUID inválido antes do banco', async (rota) => {
    const { chamar, supabase, funcionarioDoLogin } = carregar();
    const res = await chamar(rota, { params: { id: 'nao-e-uuid' } });
    expect(res.statusCode).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(funcionarioDoLogin).not.toHaveBeenCalled();
  });

  it.each(['get /minhas', 'get /convite/:id', 'post /convite/:id/responder'])('%s mantém indisponibilidade de identidade como 503 sem acessar avaliações', async (rota) => {
    const { chamar, supabase } = carregar({ identidade: { funcionario: null, erro: 'consulta_falhou' } });
    const res = await chamar(rota);
    expect(res.statusCode).toBe(503);
    expect(res.body.motivo).toBe('consulta_falhou');
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it.each([
    ['sem_email', 403], ['nao_e_funcionario', 403], ['email_ambiguo', 409],
  ])('recusa identidade %s sem chamar RPC', async (erro, status) => {
    const { chamar, supabase } = carregar({ identidade: { funcionario: null, erro } });
    expect((await chamar('post /convite/:id/responder')).statusCode).toBe(status);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('encaminha ausência de notas como null para validação transacional', async () => {
    const { chamar, supabase } = carregar();
    await chamar('post /convite/:id/responder');
    expect(supabase.rpc.mock.calls[0][1].p_notas).toBeNull();
  });
});

describe('360: erros não expõem detalhes internos nem anunciam sucesso', () => {
  it.each([
    ['P0400', 400], ['P0403', 403], ['P0409', 409],
  ])('traduz erro de domínio %s nas duas rotas de convite', async (code, status) => {
    for (const rota of ['get /convite/:id', 'post /convite/:id/responder']) {
      const { chamar } = carregar({ rpc: { error: { code, message: 'Condição de domínio recusada.' } } });
      const res = await chamar(rota);
      expect(res.statusCode).toBe(status);
      expect(res.body).toEqual({ error: 'Condição de domínio recusada.' });
    }
  });

  it.each(['get /convite/:id', 'post /convite/:id/responder'])('%s devolve 500 genérico na falha inesperada', async (rota) => {
    const { chamar } = carregar({ rpc: { error: { code: 'XX000', message: 'senha SQL e detalhes internos', detail: 'privado' } } });
    const res = await chamar(rota);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/^Não foi possível/);
    expect(res.body).not.toHaveProperty('detalhe');
    expect(JSON.stringify(res.body)).not.toMatch(/senha|SQL|privado/);
  });

  it('lista não devolve vazio se o banco falhar', async () => {
    const { chamar } = carregar({ consulta: { error: { message: 'detalhe privado' } } });
    const res = await chamar('get /minhas');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Não foi possível carregar suas avaliações.' });
  });

  it('conflito da geração é 409 e falha inesperada permanece genérica', async () => {
    const { chamar, gerarConvitesAutomaticos } = carregar();
    gerarConvitesAutomaticos.mockRejectedValueOnce({ code: 'P0409', message: 'Equipe alterada.' });
    const conflito = await chamar('post /ciclos/:id/convites');
    expect(conflito.statusCode).toBe(409);
    expect(conflito.body.error).toBe('Equipe alterada.');
    gerarConvitesAutomaticos.mockRejectedValueOnce(new Error('segredo interno'));
    const falha = await chamar('post /ciclos/:id/convites');
    expect(falha.statusCode).toBe(500);
    expect(falha.body).toEqual({ error: 'Não foi possível gerar os convites.' });
  });
});

describe('360: escopo da lista e registro de guards', () => {
  it('lista filtra pelo login e exclui ciclos expirados/excluídos e pares não aprovados', async () => {
    const aberto = { status: 'coleta', coleta_ate: '2999-01-01', deleted_at: null };
    const registros = [
      { id: 'valido', papel: 'auto', ciclo: aberto },
      { id: 'respondido', papel: 'gestor', respondido_em: '2026-01-01', ciclo: aberto },
      { id: 'sem-aprovacao', papel: 'par', ciclo: aberto },
      { id: 'excluido', papel: 'auto', ciclo: { ...aberto, deleted_at: '2026-01-01' } },
      { id: 'expirado', papel: 'auto', ciclo: { ...aberto, coleta_ate: '2000-01-01' } },
      { id: 'fechado', papel: 'auto', ciclo: { ...aberto, status: 'apuracao' } },
    ];
    const { chamar, filtros } = carregar({ consulta: { data: registros } });
    const res = await chamar('get /minhas');
    expect(res.body.pendentes.map((r: any) => r.id)).toEqual(['valido']);
    expect(res.body.respondidos.map((r: any) => r.id)).toEqual(['respondido']);
    expect(filtros).toContainEqual(['eq', 'avaliador_id', eu.id]);
    expect(filtros).toContainEqual(['is', 'deleted_at', null]);
    expect(filtros).toContainEqual(['is', 'suprimido_em', null]);
  });

  it('login e colaborador guardam todas as rotas; RH nível 3 guarda apenas administração', () => {
    const { router, rotas, authenticate, apenasColaborador } = carregar();
    expect(router.use).toHaveBeenCalledExactlyOnceWith(authenticate, apenasColaborador);
    for (const rota of ['get /ciclos', 'get /ciclos/:id/retrato', 'post /ciclos/:id/convites']) {
      expect(rotas.get(rota)?.[0]).toEqual({ modulo: 'rh', nivel: 3 });
    }
    for (const rota of ['get /minhas', 'get /convite/:id', 'post /convite/:id/responder']) {
      expect(rotas.get(rota)).toHaveLength(1);
    }
  });
});
