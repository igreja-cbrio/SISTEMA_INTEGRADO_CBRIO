// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const { criarCheckinKids } = createRequire(import.meta.url)('../../backend/services/campusKids.js');
const A = '00000000-0000-0000-0000-000000000001';
const ID = '10000000-0000-0000-0000-000000000001';
const RESP = '20000000-0000-0000-0000-000000000001';
function env({ ausente = '', falha = '', colisao = false, cpf = '52998224725' } = {}) {
  const queries: any[] = [];
  const rpc = vi.fn(async () => colisao ? { data: null, error: { code: '23505', message: 'Colisão de código de segurança ativo' } } : { data: { checkin: { id: ID }, codigo_seguranca: 'ABCD', extras: [] }, error: null });
  const db = { rpc, from(table: string) {
    const c: any = { table, eq: [] }; queries.push(c); const q: any = {};
    for (const m of ['select','is','in','maybeSingle']) q[m] = (...args: any[]) => { c[m] = args; return q; };
    q.eq = (...args: any[]) => { c.eq.push(args); return q; };
    q.then = (resolve: any, reject: any) => {
      let data: any = { id: ID, culto_id: ID, nome: 'Local', data_nascimento: '2020-01-01', culto: { id: ID, nome: 'Culto', data: '2026-09-27' } };
      if (table === 'cultos') data = [data];
      if (table === 'kids_responsaveis') data = { parentesco: 'mae', membro: { id: RESP, nome: 'Nome canônico', telefone: '21999999999', cpf } };
      return Promise.resolve({ data: table === ausente ? null : data, error: table === falha ? { message: 'offline' } : null }).then(resolve,reject);
    };
    return q;
  }};
  const reconciliarCpf = vi.fn(async () => ({ acao: 'conflito_pendencia' }));
  async function run(body: any = {}) {
    const req = { campus: { estado: 'ensaio', campus_id: A, campi: [{ id: A }] }, user: { id: RESP }, body: { sessao_id: ID, crianca_id: ID, sala_id: ID, responsavel_id: RESP, ...body } };
    const res: any = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
    await criarCheckinKids({ supabase: db, reconciliarCpf })(req,res,vi.fn()); return res;
  }
  return { run, queries, rpc, reconciliarCpf };
}
describe('Kids · check-in com responsável canônico e ato local', () => {
  it('usa apenas IDs validados e snapshots canônicos na resposta', async () => {
    const e = env(); const res = await e.run({ responsavel_nome_manual: 'Forjado' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(e.rpc).toHaveBeenCalledWith('fn_campus_kids_checkin', expect.objectContaining({ p_igreja_id: A, p_responsavel_id: RESP, p_usuario_id: RESP }));
    expect(res.json.mock.calls[0][0].responsavel.nome).toBe('Nome canônico');
  });
  it('criança sem vínculo no campus não dispara consultas de ficha ou responsável', async () => {
    const e = env({ ausente: 'kids_crianca_campi' }); expect((await e.run()).status).toHaveBeenCalledWith(404);
    expect(e.queries.map(q => q.table)).toEqual(['kids_crianca_campi']); expect(e.rpc).not.toHaveBeenCalled();
  });
  it('responsável arbitrário sem vínculo autorizado não cria relação automática', async () => {
    const e = env({ ausente: 'kids_responsaveis' }); expect((await e.run()).status).toHaveBeenCalledWith(403); expect(e.rpc).not.toHaveBeenCalled();
  });
  it('CPF conflitante vai à revisão e nunca religa a criança à outra identidade', async () => {
    const e = env({ cpf: '' }); expect((await e.run({ responsavel_cpf: '52998224725' })).status).toHaveBeenCalledWith(409);
    expect(e.reconciliarCpf).toHaveBeenCalled(); expect(e.rpc).not.toHaveBeenCalled();
  });
  it('erro de consulta não autoriza check-in nem vira ausência', async () => {
    const e = env({ falha: 'kids_salas' }); expect((await e.run()).status).toHaveBeenCalledWith(503); expect(e.rpc).not.toHaveBeenCalled();
  });
  it('código reservado impresso nunca é trocado ou tentado novamente', async () => {
    const e = env({ colisao: true }); expect((await e.run({ codigo_reservado: 'abcd', estacao_ref:'totem-00000000-0000-0000-0000-000000000001', checkin_at:'2026-09-27T12:00:00Z' })).status).toHaveBeenCalledWith(409);
    expect(e.rpc).toHaveBeenCalledTimes(1); expect(e.rpc).toHaveBeenCalledWith('fn_campus_kids_checkin_offline', expect.objectContaining({ p_codigo: 'ABCD', p_usuario_id:RESP, p_igreja_id:A }));
  });
  it('colisão online sem etiqueta impressa permite nova tentativa atômica', async () => {
    const e = env({ colisao: true }); await e.run(); expect(e.rpc).toHaveBeenCalledTimes(5);
  });
  it.each([{ permitir_sem_cpf: true }, { responsavel_id: null }, { enviar_wpp: true }])('fluxo ainda não isolado falha fechado %j', async b => {
    const e = env(); expect((await e.run(b)).status).toHaveBeenCalledWith(503); expect(e.queries).toHaveLength(0);
  });
});
