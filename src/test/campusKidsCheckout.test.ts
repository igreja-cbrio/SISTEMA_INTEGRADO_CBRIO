// @vitest-environment node
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const { criarCheckoutKids } = createRequire(import.meta.url)('../../backend/services/campusKids.js');
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const ID = '10000000-0000-0000-0000-000000000001';
const EXTRA = '10000000-0000-0000-0000-000000000002';
const CRIANCA = '20000000-0000-0000-0000-000000000001';
const SALA = '30000000-0000-0000-0000-000000000001';
const RESP = '40000000-0000-0000-0000-000000000001';
let db: PGlite;
describe('Kids · retirada atômica por campus', () => {
  beforeAll(async () => {
    db = new PGlite();
    const catalogo = JSON.parse(readFileSync('backend/scripts/multicampus/catalogo-20260926.json','utf8'));
    const table = (Array.isArray(catalogo) ? catalogo : catalogo.tabelas).find((t: any) => t.table === 'kids_checkins');
    const columns = table.columns.map((c: any) => `${c.name} ${c.type}`).join(',');
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE kids_checkins(${columns},igreja_id uuid); ALTER TABLE kids_checkins ADD PRIMARY KEY(id);
      CREATE TABLE cultos(id uuid PRIMARY KEY); CREATE TABLE kids_sessoes(id uuid PRIMARY KEY,culto_id uuid);
      CREATE TABLE kids_criancas(id uuid PRIMARY KEY,nome text);
      CREATE TABLE kids_salas(id uuid PRIMARY KEY,nome text,igreja_id uuid);
      CREATE TABLE mem_membros(id uuid PRIMARY KEY,nome text,deleted_at timestamptz);
      CREATE TABLE kids_responsaveis(crianca_id uuid,membro_id uuid,autorizado_buscar boolean);
      INSERT INTO kids_criancas VALUES('${CRIANCA}','Criança'); INSERT INTO kids_salas VALUES('${SALA}','Sala','${A}');
      INSERT INTO mem_membros VALUES('${RESP}','Nome canônico',null);
      INSERT INTO kids_responsaveis VALUES('${CRIANCA}','${RESP}',true);
      INSERT INTO kids_checkins(id,igreja_id,crianca_id,sala_id,checkin_grupo_id,codigo_seguranca,responsavel_checkin_id,responsavel_checkin_nome,pager_numero)
        VALUES('${ID}','${A}','${CRIANCA}','${SALA}','${ID}','ABCD','${RESP}','Nome na entrega','7'),
        ('${EXTRA}','${A}','${CRIANCA}','${SALA}','${ID}','ABCD','${RESP}','Nome na entrega','7');
      GRANT USAGE ON SCHEMA public TO service_role,authenticated;
      GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
    `);
    await db.exec(readFileSync('supabase/migrations/20260927130000_multicampus_kids_checkout.sql','utf8'));
  },30_000);
  beforeEach(async () => { await db.exec('BEGIN'); });
  afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE'); });
  afterAll(async () => { await db.close(); });
  it('fecha todo o grupo e devolve pager usando snapshot, não ID arbitrário enviado pelo cliente', async () => {
    const result = (await db.query<any>(`SELECT fn_campus_kids_checkout('${A}','${ID}','${RESP}','codigo_digitado','ABCD','${B}','Nome forjado') AS retirada`)).rows[0].retirada;
    expect(result.cultos_encerrados).toBe(2); expect(result.responsavel_checkout_id).toBe(RESP); expect(result.responsavel_checkout_nome).toBe('Nome na entrega');
    const rows = (await db.query<any>('SELECT checkout_at,pager_devolvido_at FROM kids_checkins')).rows;
    expect(rows.every(r => r.checkout_at && r.pager_devolvido_at)).toBe(true);
  });
  it('código incorreto não altera presença nem pager', async () => {
    await db.exec('SAVEPOINT falha');
    await expect(db.exec(`SELECT fn_campus_kids_checkout('${A}','${ID}','${RESP}','codigo_digitado','ERRADO')`)).rejects.toThrow(/não confere/);
    await db.exec('ROLLBACK TO SAVEPOINT falha');
    expect((await db.query('SELECT id FROM kids_checkins WHERE checkout_at IS NOT NULL OR pager_devolvido_at IS NOT NULL')).rows).toHaveLength(0);
  });
  it('grupo com linha em outro campus é recusado inteiro', async () => {
    await db.exec(`UPDATE kids_checkins SET igreja_id='${B}' WHERE id='${EXTRA}'; SAVEPOINT falha`);
    await expect(db.exec(`SELECT fn_campus_kids_checkout('${A}','${ID}','${RESP}','codigo_digitado','ABCD')`)).rejects.toThrow(/origem divergente/);
    await db.exec('ROLLBACK TO SAVEPOINT falha');
    expect((await db.query('SELECT id FROM kids_checkins WHERE checkout_at IS NOT NULL')).rows).toHaveLength(0);
  });
  it('responsável precisa de vínculo autorizado com a criança', async () => {
    await db.exec('SAVEPOINT falha');
    await expect(db.exec(`SELECT fn_campus_kids_checkout('${A}','${ID}','${RESP}','responsavel_autorizado',null,'${B}')`)).rejects.toThrow(/não autorizado/);
    await db.exec('ROLLBACK TO SAVEPOINT falha');
    const result = (await db.query<any>(`SELECT fn_campus_kids_checkout('${A}','${ID}','${RESP}','responsavel_autorizado',null,'${RESP}') AS retirada`)).rows[0].retirada;
    expect(result.responsavel_checkout_nome).toBe('Nome canônico');
  });
  it('não aceita override sem autorização do servidor nem execução por authenticated', async () => {
    await db.exec('SAVEPOINT falha');
    await expect(db.exec(`SELECT fn_campus_kids_checkout('${A}','${ID}','${RESP}','override_supervisor',null,null,'Responsável','Motivo suficientemente longo',false)`)).rejects.toThrow(/supervisor/);
    await db.exec('ROLLBACK TO SAVEPOINT falha; SET ROLE authenticated; SAVEPOINT negada');
    await expect(db.exec(`SELECT fn_campus_kids_checkout('${A}','${ID}','${RESP}','painel')`)).rejects.toThrow(/permission denied/);
    await db.exec('ROLLBACK TO SAVEPOINT negada');
  });
});
describe('Kids · adapter de retirada', () => {
  it('não confia na permissão de override do corpo nem consulta liderança global', async () => {
    const rpc = vi.fn(async () => ({ data: { id: ID }, error: null }));
    const req = { campus: { estado: 'ensaio', campus_id: A, campi: [{ id: A }] }, user: { id: RESP }, body: { checkin_id: ID, metodo: 'override_supervisor', p_override_autorizado: true } };
    const res: any = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
    await criarCheckoutKids({ supabase: { rpc } })(req,res,vi.fn());
    expect(rpc).toHaveBeenCalledWith('fn_campus_kids_checkout', expect.objectContaining({ p_igreja_id: A, p_override_autorizado: false, p_usuario_id: RESP }));
  });
});
