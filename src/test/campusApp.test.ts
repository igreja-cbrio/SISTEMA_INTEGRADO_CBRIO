import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { criarCampusApp } = require('../../backend/services/campusApp.js');
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const C = '11111111-1111-1111-1111-111111111111';
const MEMBER = '22222222-2222-2222-2222-222222222222';
const tipo = { name: 'Domingo', description: 'Culto', color: '#00B39D', has_online_stream: true, has_kids: true, interno: 'NÃO EXPOR' };
function culto(id = C, igreja_id = A, data = '2026-09-27', hora = '19:00:00') {
  return { id, igreja_id, data, hora, nome: 'Culto teste', vol_service_types: tipo, deleted_at: null, youtube_video_id: 'video', observacoes: 'DADO INTERNO', inserido_por: MEMBER };
}
function banco({ estado = 'ativo', configErro = false, tabelaErro = '', cultos = [culto()], pendentes = [] as any[] } = {}) {
  const calls: any[] = [];
  const rows: any = {
    app_campus_config: { estado, campus_legado_id: A, ja_ativado: estado !== 'preparacao' },
    igrejas: [{ id: A, nome: 'Sede', slug: 'sede', tipo: 'sede', ativa: true }, { id: B, nome: 'Nova sede', slug: 'nova', tipo: 'sede', ativa: true }, { id: MEMBER, nome: 'CBA', slug: 'cba', tipo: 'cba_acompanhada', ativa: true }],
    cultos, app_decisoes: pendentes,
  };
  return {
    calls, rows,
    from: vi.fn((table: string) => {
      const call: any = { table, filters: [], range: null, projection: '', orders: [], single: false, limit: null }; calls.push(call);
      const query: any = {};
      query.select = (s: string) => { call.projection = s; return query; };
      query.order = (s: string) => { call.orders.push(s); return query; };
      query.range = (a: number, b: number) => { call.range = [a, b]; return query; };
      query.limit = (n: number) => { call.limit = n; return query; };
      query.maybeSingle = () => { call.single = true; return query; };
      for (const op of ['eq', 'is', 'gte', 'lte', 'lt']) query[op] = (col: string, val: unknown) => { call.filters.push([op, col, val]); return query; };
      query.then = (resolve: any, reject: any) => {
        let data = rows[table];
        if (Array.isArray(data)) {
          data = data.filter(row => call.filters.every(([op, col, val]: any[]) => op === 'gte' ? row[col] >= val : op === 'lte' ? row[col] <= val : op === 'lt' ? row[col] < val : row[col] === val));
          data = [...data].sort((a, b) => { for (const col of call.orders) { const cmp = String(a[col]).localeCompare(String(b[col])); if (cmp) return cmp; } return 0; });
          if (call.range) data = data.slice(call.range[0], call.range[1] + 1);
          if (call.limit) data = data.slice(0, call.limit);
          if (call.single) data = data[0] || null;
        }
        return Promise.resolve({ data, error: (configErro && table === 'app_campus_config') || tabelaErro === table ? { message: 'segredo do banco' } : null }).then(resolve, reject);
      };
      return query;
    }),
  };
}
async function executar(db: ReturnType<typeof banco>, handler = 'agenda', { header = A as any, query = {}, params = { id: C }, user = { id: 'user' } as any, agora = '2026-09-28T00:30:00Z', membro = { id: MEMBER } as any } = {}) {
  const res: any = { json: vi.fn(), status: vi.fn() }; res.status.mockReturnValue(res);
  const api = criarCampusApp({ supabase: db, agora: () => new Date(agora).getTime(), resolverMembro: async () => membro, channelId: 'canal-institucional' });
  await api[handler]({ headers: header === undefined ? {} : { 'x-campus-id': header }, user, query, params }, res);
  return res;
}

describe('App · agenda pública de campus com autenticação', () => {
  it('membro comum escolhe campus sem precisar de vínculo de funcionário', async () => {
    const db = banco(); const res = await executar(db, 'contexto', { header: B });
    expect(res.json.mock.calls[0][0].campus_id).toBe(B);
    expect(db.calls.some(c => c.table === 'usuario_igrejas')).toBe(false);
    expect(res.json.mock.calls[0][0].campi).toHaveLength(2);
  });
  it('bootstrap pode pedir escolha, preparação só oferece o legado', async () => {
    const db = banco();
    const handlers = criarCampusApp({ supabase: db }); const res: any = { json: vi.fn(), status: vi.fn() }; res.status.mockReturnValue(res);
    await handlers.contexto({ user: { id: 'u' }, headers: {} }, res);
    expect(res.json.mock.calls[0][0].campus_id).toBeNull();
    const legado = await executar(banco({ estado: 'preparacao' }), 'contexto');
    expect(legado.json.mock.calls[0][0].campi).toHaveLength(1);
    expect((await executar(banco({ estado: 'preparacao' }), 'contexto', { header: B })).status).toHaveBeenCalledWith(403);
  });
  it('nega sessão ausente, campus inválido, injeção de header e campus fora do catálogo', async () => {
    expect((await executar(banco(), 'agenda', { user: null })).status).toHaveBeenCalledWith(401);
    for (const header of ['', 'consolidado', `${A},${B}`, [A], `eq.${A}`]) {
      expect((await executar(banco(), 'agenda', { header })).status).toHaveBeenCalledWith(400);
    }
    expect((await executar(banco(), 'agenda', { header: MEMBER })).status).toHaveBeenCalledWith(403);
  });
  it('agenda valida período em vez de aceitar filtros arbitrários', async () => {
    for (const dias of ['32', '-1', '1 or true', ['7'], '1.5', 7]) {
      expect((await executar(banco(), 'agenda', { query: { dias } })).status).toHaveBeenCalledWith(400);
    }
  });
  it('projeção pública nunca devolve observações, campus interno ou campos extras do tipo', async () => {
    const db = banco(); const res = await executar(db);
    expect(res.json.mock.calls[0][0]).toEqual([{ id: C, nome: 'Culto teste', data: '2026-09-27', hora: '19:00:00', cor: '#00B39D', has_online: true, has_kids: true }]);
    expect(db.calls.find(c => c.table === 'cultos').projection).not.toMatch(/observacoes|inserido_por|\*/);
    const detalhe = await executar(db, 'detalhe');
    expect(detalhe.json.mock.calls[0][0].service_type).not.toHaveProperty('interno');
    expect(detalhe.json.mock.calls[0][0]).not.toHaveProperty('observacoes');
  });
  it('detalhe de outro campus/excluído não revela o registro', async () => {
    expect((await executar(banco({ cultos: [culto(C, B)] }), 'detalhe')).json).toHaveBeenCalledWith(null);
    expect((await executar(banco({ cultos: [{ ...culto(), deleted_at: '2026-09-01' }] as any }), 'detalhe')).json).toHaveBeenCalledWith(null);
    expect((await executar(banco(), 'detalhe', { params: { id: 'invalido' } })).status).toHaveBeenCalledWith(400);
  });
  it('usa data BRT na virada UTC e pagina mais de mil cultos', async () => {
    const cultos = Array.from({ length: 1001 }, (_, n) => culto(`${String(n).padStart(8, '0')}-0000-0000-0000-000000000001`));
    const db = banco({ cultos }); const res = await executar(db);
    expect(res.json.mock.calls[0][0]).toHaveLength(1001);
    const calls = db.calls.filter(c => c.table === 'cultos');
    expect(calls.map(c => c.range)).toEqual([[0, 999], [1000, 1999]]);
    expect(calls[0].filters).toContainEqual(['gte', 'data', '2026-09-27']);
    expect(calls[0].filters).toContainEqual(['lte', 'data', '2026-10-04']);
  });
  it('falha de banco não vira agenda vazia nem resultado parcial', async () => {
    for (const db of [banco({ configErro: true }), banco({ tabelaErro: 'cultos' })]) {
      const res = await executar(db); expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json.mock.calls[0][0].error).not.toContain('segredo');
    }
  });
});

describe('App · banner do culto atual', () => {
  it('consulta só o campus escolhido e não revela campos operacionais', async () => {
    const db = banco({ cultos: [culto(C, A), culto(B, B)] }); const res = await executar(db, 'agora');
    expect(res.json.mock.calls[0][0]).toEqual({ culto: { id: C, nome: 'Culto teste', data: '2026-09-27', hora: '19:00:00' }, ao_vivo: true, jaRegistrou: false, canal_live: 'https://www.youtube.com/channel/canal-institucional/live' });
    expect(db.calls.find(c => c.table === 'cultos').filters).toContainEqual(['eq', 'igreja_id', A]);
  });
  it('mais recente iniciado vence, depois aplica antecedência de30min', async () => {
    const db = banco({ cultos: [culto(C, A, '2026-09-27', '08:30:00'), culto(B, A, '2026-09-27', '10:00:00')] });
    expect((await executar(db, 'agora', { agora: '2026-09-27T13:30:00Z' })).json.mock.calls[0][0].culto.id).toBe(B);
    const cedo = await executar(db, 'agora', { agora: '2026-09-27T11:05:00Z' });
    expect(cedo.json.mock.calls[0][0]).toMatchObject({ ao_vivo: true, culto: { id: C } });
  });
  it('decisão pendente de outro culto/campus não marca o banner atual', async () => {
    const pendente = { id: C, membro_id: MEMBER, culto_id: B, status: 'pendente', deleted_at: null, criada_em: '2026-09-27T22:00:00-03:00' };
    const db = banco({ pendentes: [pendente] });
    expect((await executar(db, 'agora')).json.mock.calls[0][0].jaRegistrou).toBe(false);
    db.rows.app_decisoes[0].culto_id = C;
    expect((await executar(db, 'agora')).json.mock.calls[0][0].jaRegistrou).toBe(true);
    expect(db.calls.find(c => c.table === 'app_decisoes').filters).toEqual(expect.arrayContaining([['eq', 'membro_id', MEMBER], ['eq', 'culto_id', C], ['gte', 'criada_em', '2026-09-27T00:00:00-03:00']]));
  });
  it('sem culto não lê decisões e erro de decisões não é falso negativo', async () => {
    const semCulto = banco({ cultos: [] }); expect((await executar(semCulto, 'agora')).json.mock.calls[0][0].culto).toBeNull();
    expect(semCulto.calls.some(c => c.table === 'app_decisoes')).toBe(false);
    expect((await executar(banco({ tabelaErro: 'app_decisoes' }), 'agora')).status).toHaveBeenCalledWith(503);
  });
  it('resolução do banner lê somente vínculo confirmado, sem fallback de contato', async () => {
    const db = banco(); db.rows.profiles = [{ id: 'user', membro_id: MEMBER }]; db.rows.mem_membros = [{ id: MEMBER, deleted_at: null }];
    const api = criarCampusApp({ supabase: db, agora: () => new Date('2026-09-28T00:30:00Z').getTime() });
    const res: any = { json: vi.fn(), status: vi.fn() }; res.status.mockReturnValue(res);
    await api.agora({ user: { id: 'user', email: 'compartilhado@example.test' }, headers: { 'x-campus-id': A } }, res);
    expect(db.calls.find(c => c.table === 'profiles').projection).toBe('membro_id');
    expect(db.calls.find(c => c.table === 'mem_membros').projection).toBe('id');
    expect(db.calls.some(c => c.filters.some((f: any[]) => ['email', 'cpf'].includes(f[1])))).toBe(false);
    const erro = banco({ tabelaErro: 'profiles' });
    const apiErro = criarCampusApp({ supabase: erro, agora: () => new Date('2026-09-28T00:30:00Z').getTime() });
    await apiErro.agora({ user: { id: 'user' }, headers: { 'x-campus-id': A } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

});
