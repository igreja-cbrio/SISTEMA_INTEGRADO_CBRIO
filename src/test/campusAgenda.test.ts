import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const agenda = require('../../backend/services/campusAgenda.js');
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const C = '00000000-0000-0000-0000-000000000003';
const entrada = (id: string, tipo = 'sede', ativa = true) => ({ igreja_id: id, service_type_id: A, is_active: true, igrejas: { id, nome: `Campus ${id}`, tipo, ativa } });
function banco({ estado = 'ativo', linhas = [entrada(A), entrada(B)], falhaPagina = -1, falhaCampus = '', configErro = false, jaAtivado = estado !== 'preparacao' } = {}) {
  const chamadas: any[] = [];
  const criados = new Set<string>();
  return {
    chamadas,
    from: vi.fn((tabela: string) => {
      const call: any = { tabela, filtros: [], range: [0, 999] }; chamadas.push(call);
      const q: any = {};
      q.select = () => q; q.order = () => q; q.maybeSingle = () => q;
      q.eq = (col: string, val: unknown) => { call.filtros.push([col, val]); return q; };
      q.range = (inicio: number, fim: number) => { call.range = [inicio, fim]; return q; };
      q.then = (resolve: any, reject: any) => {
        let resposta: any;
        if (tabela === 'app_campus_config') resposta = { data: { estado, campus_legado_id: A, ja_ativado: jaAtivado }, error: configErro ? { message: 'db' } : null };
        else {
          const filtradas = linhas.filter(l => call.filtros.every(([col, val]: any[]) => col.includes('.') ? l.igrejas[col.split('.')[1] as keyof typeof l.igrejas] === val : l[col as keyof typeof l] === val));
          resposta = { data: filtradas.slice(call.range[0], call.range[1] + 1), error: call.range[0] / 1000 === falhaPagina ? { message: 'db' } : null };
        }
        return Promise.resolve(resposta).then(resolve, reject);
      };
      return q;
    }),
    rpc: vi.fn(async (_nome: string, args: any) => {
      if (args.p_igreja_id === falhaCampus) return { data: null, error: { message: 'Falha privada do banco' } };
      const novo = !criados.has(args.p_igreja_id); criados.add(args.p_igreja_id);
      return { data: { total: 1300, criados: novo ? 1300 : 0, ja_existia: novo ? 0 : 1300 }, error: null };
    }),
  };
}

describe('Agenda por campus · geração recorrente', () => {
  it('calcula três meses em BRT inclusive virada UTC e fim de mês', () => {
    expect(agenda.janelaAgenda(new Date('2026-02-01T01:00:00Z'))).toEqual({ inicio: '2026-01-31', fim: '2026-04-30' });
    expect(agenda.janelaAgenda(new Date('2026-11-30T15:00:00Z'))).toEqual({ inicio: '2026-11-30', fim: '2027-02-28' });
  });
  it('preparação processa apenas legado e não outras sedes ou CBAs', async () => {
    const db = banco({ estado: 'preparacao', linhas: [entrada(A), entrada(B), entrada(C, 'cba_acompanhada')] });
    const result = await agenda.gerarAgendaDosCampi({ supabase: db });
    expect(result.campi.map((c: any) => c.igreja_id)).toEqual([A]);
    expect(db.rpc).toHaveBeenCalledOnce();
  });
  it('ativa processa apenas sedes ativas com agenda, uma vez por campus', async () => {
    const db = banco({ linhas: [entrada(A), entrada(A), entrada(B), entrada(C, 'online'), entrada(C, 'sede', false)] });
    const result = await agenda.gerarAgendaDosCampi({ supabase: db });
    expect(result.campi.map((c: any) => c.igreja_id)).toEqual([A, B]);
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });
  it('pagina agendas além do teto de mil sem perder campus da próxima página', async () => {
    const db = banco({ linhas: [...Array.from({ length: 1000 }, () => entrada(A)), entrada(B)] });
    await agenda.gerarAgendaDosCampi({ supabase: db });
    expect(db.chamadas.filter(c => c.tabela === 'vol_campus_service_types').map(c => c.range)).toEqual([[0, 999], [1000, 1999]]);
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });
  it('não começa mutações com inventário paginado incompleto', async () => {
    const db = banco({ linhas: Array.from({ length: 1001 }, () => entrada(A)), falhaPagina: 1 });
    await expect(agenda.gerarAgendaDosCampi({ supabase: db })).rejects.toMatchObject({ status: 503 });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('continua depois da falha de uma sede e declara resultado parcial', async () => {
    const db = banco({ falhaCampus: A });
    const result = await agenda.gerarAgendaDosCampi({ supabase: db });
    expect(result).toMatchObject({ ok: false, total: 1300, criados: 1300 });
    expect(result.campi).toEqual([
      { igreja_id: A, ok: false, error: 'Não foi possível gerar os cultos deste campus.' },
      { igreja_id: B, ok: true, total: 1300, criados: 1300, ja_existia: 0 },
    ]);
  });
  it('retry chama RPC idempotente por campus e preserva contagens acima de mil', async () => {
    const db = banco();
    const primeira = await agenda.gerarAgendaDosCampi({ supabase: db });
    const segunda = await agenda.gerarAgendaDosCampi({ supabase: db });
    expect(primeira.criados).toBe(2600);
    expect(segunda).toMatchObject({ ok: true, total: 2600, criados: 0 });
    expect(db.rpc).toHaveBeenCalledWith('fn_campus_gerar_cultos_resumo', expect.objectContaining({ p_igreja_id: A }));
  });
  it('não volta ao legado por falha de config nem por estado inconsistente', async () => {
    for (const db of [banco({ configErro: true }), banco({ estado: 'preparacao', jaAtivado: true }), banco({ estado: 'ativo', jaAtivado: false })]) {
      await expect(agenda.gerarAgendaDosCampi({ supabase: db })).rejects.toMatchObject({ status: 503 });
      expect(db.rpc).not.toHaveBeenCalled();
    }
  });
});

describe('Cron Integração · handler real sem credenciais', () => {
  function carregar(autorizado: boolean, db: ReturnType<typeof banco>) {
    const rotas = new Map<string, Function>();
    const router: any = { use: vi.fn() };
    for (const method of ['get', 'put', 'post', 'patch', 'delete']) router[method] = (path: string, ...handlers: Function[]) => rotas.set(`${method} ${path}`, handlers.at(-1)!);
    const localRequire = (nome: string) => {
      if (nome === 'express') return { Router: () => router };
      if (nome === '../utils/supabase') return { supabase: db };
      if (nome === '../utils/cronAuth') return { isAuthorizedCron: () => autorizado };
      if (nome === '../services/campusAgenda') return agenda;
      return new Proxy({}, { get: () => () => undefined });
    };
    vm.runInNewContext(readFileSync(join(__dirname, '../../backend/routes/integracao.js'), 'utf8'), { require: localRequire, module: { exports: {} }, console: { log: vi.fn(), error: vi.fn() } });
    return async () => {
      const res: any = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
      await rotas.get('get /cron/gerar-cultos-recorrentes')!({ headers: { 'x-campus-id': C } }, res);
      return res;
    };
  }
  it('nega cron sem segredo antes de ler banco ou gerar dados', async () => {
    const db = banco(); const res = await carregar(false, db)();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.from).not.toHaveBeenCalled(); expect(db.rpc).not.toHaveBeenCalled();
  });
  it('header de campus não controla a seleção do cron e falha parcial retorna503', async () => {
    const db = banco({ falhaCampus: A }); const res = await carregar(true, db)();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(db.rpc.mock.calls.map(([, args]) => args.p_igreja_id)).toEqual([A, B]);
  });
});
