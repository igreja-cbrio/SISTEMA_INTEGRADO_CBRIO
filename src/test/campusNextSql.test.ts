// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const migration = readFileSync('supabase/migrations/20260927000000_multicampus_next.sql', 'utf8');
const SEDE = '00000000-0000-0000-0000-000000000001';
const OUTRO = '00000000-0000-0000-0000-000000000002';
const MEMBRO = '10000000-0000-0000-0000-000000000001';
const TURMA = '20000000-0000-0000-0000-000000000001';
const MATRICULA = '30000000-0000-0000-0000-000000000001';
const ENCONTRO = '40000000-0000-0000-0000-000000000001';
const EVENTO = '50000000-0000-0000-0000-000000000001';
let db: PGlite;
async function rejeitar(sql: string, pattern: RegExp) {
  await db.exec('SAVEPOINT tentativa');
  await expect(db.exec(sql)).rejects.toThrow(pattern);
  await db.exec('ROLLBACK TO SAVEPOINT tentativa');
}
describe('Next multicampus: migration real em PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE igrejas(id uuid PRIMARY KEY,tipo text,ativa boolean);
      INSERT INTO igrejas VALUES('${SEDE}','sede',true);
      CREATE TABLE app_campus_config(id boolean PRIMARY KEY,estado text,campus_legado_id uuid,ja_ativado boolean);
      INSERT INTO app_campus_config VALUES(true,'preparacao','${SEDE}',false);
      CREATE TABLE app_campus_cobertura(frente text,rls_validada boolean,produtores_validados boolean,regressao_validada boolean);
      INSERT INTO app_campus_cobertura VALUES('next',true,true,true);
      CREATE FUNCTION fn_campus_legado_escrita() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
        DECLARE v uuid; BEGIN SELECT campus_legado_id INTO v FROM app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado;
        IF v IS NULL THEN RAISE EXCEPTION 'Campus explícito obrigatório.' USING ERRCODE='23514'; END IF; RETURN v; END $$;
      CREATE FUNCTION current_user_membro_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.membro',true),'')::uuid $$;
      CREATE FUNCTION fn_campus_dado_pessoal_permitido(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT COALESCE((SELECT estado='preparacao' OR p=nullif(current_setting('test.campus',true),'')::uuid FROM app_campus_config WHERE id),false) $$;
      CREATE TABLE mem_membros(id uuid PRIMARY KEY,igreja_id uuid REFERENCES igrejas(id));
      INSERT INTO mem_membros VALUES('${MEMBRO}','${SEDE}');
      CREATE TABLE next_eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data date NOT NULL,CONSTRAINT next_eventos_data_key UNIQUE(data));
      CREATE TABLE next_turmas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text,origem_evento_id uuid REFERENCES next_eventos(id) ON DELETE SET NULL,origem_mes text,auto_domingo date,deleted_at timestamptz);
      CREATE UNIQUE INDEX uq_next_turmas_auto_domingo ON next_turmas(auto_domingo);
      CREATE UNIQUE INDEX uq_next_turmas_origem_mes ON next_turmas(origem_mes) WHERE origem_mes IS NOT NULL;
      CREATE TABLE next_encontros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),turma_id uuid NOT NULL REFERENCES next_turmas(id) ON DELETE CASCADE,numero int);
      CREATE TABLE next_inscricoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evento_id uuid REFERENCES next_eventos(id) ON DELETE SET NULL,membro_id uuid REFERENCES mem_membros(id),igreja_id uuid DEFAULT '${SEDE}' REFERENCES igrejas(id));
      CREATE TABLE next_matriculas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),turma_id uuid REFERENCES next_turmas(id),membro_id uuid REFERENCES mem_membros(id),origem_inscricao_id uuid REFERENCES next_inscricoes(id),origem_mes_key text,deleted_at timestamptz);
      CREATE UNIQUE INDEX uq_next_matriculas_origem_mes_key ON next_matriculas(origem_mes_key) WHERE origem_mes_key IS NOT NULL;
      CREATE UNIQUE INDEX uq_next_matriculas_espera_membro ON next_matriculas(membro_id) WHERE turma_id IS NULL AND deleted_at IS NULL AND membro_id IS NOT NULL;
      CREATE TABLE next_presencas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),encontro_id uuid NOT NULL REFERENCES next_encontros(id),matricula_id uuid NOT NULL REFERENCES next_matriculas(id),presente boolean DEFAULT true);
      CREATE TABLE next_indicacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inscricao_id uuid NOT NULL REFERENCES next_inscricoes(id));
      INSERT INTO next_eventos VALUES('${EVENTO}','2026-09-20');
      INSERT INTO next_turmas(id,nome,origem_evento_id) VALUES('${TURMA}','Histórica','${EVENTO}');
      INSERT INTO next_encontros(id,turma_id,numero) VALUES('${ENCONTRO}','${TURMA}',1);
      INSERT INTO next_matriculas(id,turma_id,membro_id) VALUES('${MATRICULA}','${TURMA}','${MEMBRO}');
      INSERT INTO next_presencas(encontro_id,matricula_id) VALUES('${ENCONTRO}','${MATRICULA}');
      GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
    `);
    for (const table of ['next_eventos','next_turmas','next_encontros','next_inscricoes','next_matriculas','next_presencas','next_indicacoes']) {
      await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; CREATE POLICY baseline ON ${table} FOR ALL TO authenticated USING(true) WITH CHECK(true)`);
    }
    await db.exec(`
      ALTER TABLE next_turmas ADD COLUMN status text DEFAULT 'aberta', ADD COLUMN responsavel_id uuid, ADD COLUMN observacoes text, ADD COLUMN updated_at timestamptz;
      ALTER TABLE next_encontros ADD COLUMN data date, ADD COLUMN tema text, ADD CONSTRAINT encontro_numero CHECK(numero BETWEEN 1 AND 6), ADD UNIQUE(turma_id,numero);
      ALTER TABLE next_matriculas ADD COLUMN status text DEFAULT 'matriculado', ADD COLUMN updated_at timestamptz, ADD COLUMN check_in_at timestamptz;
      ALTER TABLE next_presencas ADD UNIQUE(encontro_id,matricula_id);
      CREATE TABLE usuario_igrejas(usuario_id uuid,igreja_id uuid);
      CREATE FUNCTION app_soft_delete(t text,i text,u uuid) RETURNS boolean LANGUAGE plpgsql AS $$
        BEGIN EXECUTE format('UPDATE %I SET deleted_at=now() WHERE id=$1::uuid',t) USING i; RETURN true; END $$;
    `);
    await db.exec(migration);
    await db.exec(readFileSync('supabase/migrations/20260927020000_multicampus_next_operacoes.sql','utf8'));
    await db.exec(`INSERT INTO igrejas VALUES('${OUTRO}','sede',true)`);
  }, 30_000);
  beforeEach(async () => { await db.exec("BEGIN; UPDATE app_campus_config SET estado='ensaio'; SELECT set_config('test.membro','',false);"); });
  afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE;'); });
  afterAll(async () => { await db.close(); });

  it('carimba o histórico sem transferir a identidade global ou a presença', async () => {
    const { rows } = await db.query<{ igreja_id: string }>('SELECT igreja_id FROM next_presencas');
    expect(rows).toEqual([{ igreja_id: SEDE }]);
    expect((await db.query<{ igreja_id: string }>('SELECT igreja_id FROM mem_membros')).rows[0].igreja_id).toBe(SEDE);
    expect((await db.query('SELECT * FROM app_campus_cobertura WHERE rls_validada OR produtores_validados OR regressao_validada')).rows).toHaveLength(0);
  });
  it('exige campus explícito em espera e raízes fora da preparação', async () => {
    await rejeitar(`INSERT INTO next_matriculas(membro_id) VALUES('${MEMBRO}')`, /Campus explícito/);
    await rejeitar("INSERT INTO next_eventos(data) VALUES('2027-03-07')", /Campus explícito/);
  });
  it('herda campus do pai sem default Sede, inclusive durante preparação', async () => {
    await db.exec("UPDATE app_campus_config SET estado='preparacao'");
    const event = (await db.query<{ id: string }>(`INSERT INTO next_eventos(data,igreja_id) VALUES('2027-03-07','${OUTRO}') RETURNING id`)).rows[0].id;
    const inscription = (await db.query<{ igreja_id: string }>(`INSERT INTO next_inscricoes(evento_id,membro_id) VALUES('${event}','${MEMBRO}') RETURNING igreja_id`)).rows[0];
    expect(inscription.igreja_id).toBe(OUTRO);
  });
  it('permite atos na mesma data em campi diferentes e fila local com membro único', async () => {
    await db.exec(`INSERT INTO next_eventos(data,igreja_id) VALUES('2027-03-07','${SEDE}'),('2027-03-07','${OUTRO}');
      INSERT INTO next_turmas(nome,auto_domingo,igreja_id) VALUES('A','2027-03-07','${SEDE}'),('B','2027-03-07','${OUTRO}');
      INSERT INTO next_matriculas(membro_id,igreja_id) VALUES('${MEMBRO}','${SEDE}'),('${MEMBRO}','${OUTRO}');`);
    expect((await db.query('SELECT * FROM next_matriculas WHERE turma_id IS NULL')).rows).toHaveLength(2);
    await rejeitar(`INSERT INTO next_matriculas(membro_id,igreja_id) VALUES('${MEMBRO}','${SEDE}')`, /duplicate key/);
  });
  it('recusa campus divergente do pai e presença em outra turma mesmo no mesmo campus', async () => {
    await rejeitar(`INSERT INTO next_encontros(turma_id,igreja_id) VALUES('${TURMA}','${OUTRO}')`, /diverge/);
    const otherClass = (await db.query<{ id: string }>(`INSERT INTO next_turmas(nome,igreja_id) VALUES('Outra','${SEDE}') RETURNING id`)).rows[0].id;
    const encounter = (await db.query<{ id: string }>(`INSERT INTO next_encontros(turma_id) VALUES('${otherClass}') RETURNING id`)).rows[0].id;
    await rejeitar(`INSERT INTO next_presencas(encontro_id,matricula_id) VALUES('${encounter}','${MATRICULA}')`, /mesma turma/);
  });
  it('não muda campus ou turma de matrícula com histórico', async () => {
    const other = (await db.query<{ id: string }>(`INSERT INTO next_turmas(nome,igreja_id) VALUES('Outra','${SEDE}') RETURNING id`)).rows[0].id;
    await rejeitar(`UPDATE next_matriculas SET turma_id='${other}' WHERE id='${MATRICULA}'`, /nova matrícula/);
    await rejeitar(`UPDATE next_eventos SET igreja_id='${OUTRO}' WHERE id='${EVENTO}'`, /histórico/);
    expect((await db.query<{ turma_id: string }>(`SELECT turma_id FROM next_matriculas WHERE id='${MATRICULA}'`)).rows[0].turma_id).toBe(TURMA);
    expect((await db.query('SELECT * FROM next_presencas')).rows).toHaveLength(1);
  });
  it('RLS impede leitura e escrita cruzadas mesmo com policy permissiva anterior', async () => {
    await db.exec(`INSERT INTO next_eventos(data,igreja_id) VALUES('2027-03-07','${OUTRO}');
      SELECT set_config('test.campus','${SEDE}',false); SET ROLE authenticated;`);
    expect((await db.query('SELECT * FROM next_eventos')).rows).toHaveLength(1);
    await rejeitar(`INSERT INTO next_eventos(data,igreja_id) VALUES('2027-03-14','${OUTRO}')`, /row-level security/);
  });
  it('mantém leitura própria sem conceder escrita ou acesso de funcionário', async () => {
    await db.exec(`SELECT set_config('test.campus','${OUTRO}',false); SELECT set_config('test.membro','${MEMBRO}',false); SET ROLE authenticated;`);
    expect((await db.query('SELECT * FROM next_matriculas')).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM next_presencas')).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM next_eventos')).rows).toHaveLength(0);
    expect((await db.query(`UPDATE next_matriculas SET origem_mes_key='alterada' WHERE id='${MATRICULA}' RETURNING id`)).rows).toHaveLength(0);
  });
  it('nega atualização de encontro com presenças e conserva o registro histórico', async () => {
    const other = (await db.query<{ id: string }>(`INSERT INTO next_turmas(nome,igreja_id) VALUES('Outra','${SEDE}') RETURNING id`)).rows[0].id;
    await rejeitar(`UPDATE next_encontros SET turma_id='${other}' WHERE id='${ENCONTRO}'`, /presenças não pode/);
    expect((await db.query<{ turma_id: string }>(`SELECT turma_id FROM next_encontros WHERE id='${ENCONTRO}'`)).rows[0].turma_id).toBe(TURMA);
  });
  it('o guard de backfill detecta divergência histórica antes de alterar colunas', async () => {
    await db.exec(`UPDATE app_campus_config SET estado='preparacao'; UPDATE igrejas SET ativa=false WHERE id='${OUTRO}';
      ALTER TABLE next_matriculas DISABLE TRIGGER aa_next_campus_do_ato;
      UPDATE next_matriculas SET turma_id=null WHERE id='${MATRICULA}';`);
    const guard = migration.slice(migration.indexOf('DO $$ BEGIN'), migration.indexOf('\n\nDO $$ DECLARE'));
    await rejeitar(guard, /revisão histórica/);
  });
  it('indicações herdam a restrição da inscrição e não expõem outro campus', async () => {
    const event = (await db.query<{ id: string }>(`INSERT INTO next_eventos(data,igreja_id) VALUES('2027-03-07','${OUTRO}') RETURNING id`)).rows[0].id;
    const inscription = (await db.query<{ id: string }>(`INSERT INTO next_inscricoes(evento_id,membro_id) VALUES('${event}','${MEMBRO}') RETURNING id`)).rows[0].id;
    await db.exec(`INSERT INTO next_indicacoes(inscricao_id) VALUES('${inscription}');
      SELECT set_config('test.campus','${SEDE}',false); SET ROLE authenticated;`);
    expect((await db.query('SELECT * FROM next_indicacoes')).rows).toHaveLength(0);
    await rejeitar(`INSERT INTO next_indicacoes(inscricao_id) VALUES('${inscription}')`, /row-level security/);
  });

  it('cria turma e encontros atomicamente e repete a chave por campus', async () => {
    const call = (campus: string) => `SELECT fn_campus_next_criar_turma('${campus}','Domingo',null,null,'[{"numero":1}]','2027-03-07',false) AS turma`;
    const a = (await db.query<any>(call(SEDE))).rows[0].turma;
    expect(a.ja_existia).toBe(false);
    expect((await db.query<any>(call(SEDE))).rows[0].turma).toMatchObject({ id: a.id, ja_existia: true });
    expect((await db.query<any>(call(OUTRO))).rows[0].turma.id).not.toBe(a.id);
    await rejeitar(`SELECT fn_campus_next_criar_turma('${SEDE}','Inválida',null,null,'[{"numero":99}]','2027-04-04',false)`, /encontro_numero/);
    expect((await db.query("SELECT id FROM next_turmas WHERE nome='Inválida'")).rows).toHaveLength(0);
  });
  it('puxa apenas a espera do mesmo campus', async () => {
    await db.exec(`UPDATE next_turmas SET status='encerrada'; INSERT INTO next_matriculas(membro_id,igreja_id) VALUES('${MEMBRO}','${SEDE}'),('${MEMBRO}','${OUTRO}')`);
    const turma = (await db.query<any>(`SELECT fn_campus_next_criar_turma('${SEDE}','Nova',null,null,'[{"numero":1}]',null,true) AS turma`)).rows[0].turma;
    expect(turma.puxados_da_espera).toBe(1);
    expect((await db.query(`SELECT id FROM next_matriculas WHERE igreja_id='${OUTRO}' AND turma_id IS NULL`)).rows).toHaveLength(1);
  });
  it('nega lote misto de presenças sem apagar ou alterar a presença anterior', async () => {
    const turma = (await db.query<any>(`SELECT fn_campus_next_criar_turma('${OUTRO}','Outra',null,null,'[{"numero":1}]',null,false) AS turma`)).rows[0].turma;
    const matricula = (await db.query<any>(`INSERT INTO next_matriculas(turma_id,membro_id) VALUES('${turma.id}','${MEMBRO}') RETURNING id`)).rows[0].id;
    await rejeitar(`SELECT fn_campus_next_presencas('${ENCONTRO}','${SEDE}',ARRAY['${MATRICULA}'::uuid,'${matricula}'::uuid],'substituir')`, /fora da turma/);
    expect((await db.query<any>('SELECT presente FROM next_presencas')).rows).toEqual([{ presente: true }]);
    await db.exec(`SELECT fn_campus_next_presencas('${ENCONTRO}','${SEDE}','{}','substituir')`);
    expect((await db.query<any>('SELECT presente FROM next_presencas')).rows).toEqual([{ presente: false }]);
    await db.exec(`SELECT fn_campus_next_presencas('${ENCONTRO}','${SEDE}',ARRAY['${MATRICULA}'::uuid],'marcar')`);
    expect((await db.query<any>(`SELECT status FROM next_matriculas WHERE id='${MATRICULA}'`)).rows[0].status).toBe('formado');
  });
  it('soft-delete exige campus e RPCs são restritas ao servidor', async () => {
    expect((await db.query<any>(`SELECT fn_campus_soft_delete_next('next_turmas','${TURMA}','${OUTRO}','${MEMBRO}') AS ok`)).rows[0].ok).toBe(false);
    expect((await db.query(`SELECT id FROM next_turmas WHERE deleted_at IS NULL`)).rows).toHaveLength(1);
    expect((await db.query<any>(`SELECT fn_campus_soft_delete_next('next_turmas','${TURMA}','${SEDE}','${MEMBRO}') AS ok`)).rows[0].ok).toBe(true);
    await db.exec('SET ROLE authenticated');
    await rejeitar(`SELECT fn_campus_next_recomputar('${TURMA}','${SEDE}')`, /permission denied/);
    await rejeitar(`SELECT fn_campus_next_criar_turma('${SEDE}','Nova',null,null,'[{"numero":1}]',null,false)`, /permission denied/);
  });

  it('fechar e reabrir turma atualiza apenas as matrículas locais na mesma transação', async () => {
    const outra = (await db.query<any>(`SELECT fn_campus_next_criar_turma('${OUTRO}','Outra',null,null,'[{"numero":1}]',null,false) AS turma`)).rows[0].turma;
    await db.exec(`INSERT INTO next_matriculas(turma_id,membro_id) VALUES('${outra.id}','${MEMBRO}');
      SELECT fn_campus_next_atualizar_turma('${TURMA}','${SEDE}','{"status":"encerrada"}')`);
    expect((await db.query<any>(`SELECT status FROM next_matriculas WHERE id='${MATRICULA}'`)).rows[0].status).toBe('formado');
    expect((await db.query<any>(`SELECT status FROM next_matriculas WHERE igreja_id='${OUTRO}'`)).rows[0].status).toBe('matriculado');
    await rejeitar(`SELECT fn_campus_next_atualizar_turma('${TURMA}','${OUTRO}','{"status":"aberta"}')`, /não encontrada/);
  });
  it('transferência conserva presenças e aceita somente matrícula sem história no mesmo campus', async () => {
    const outra = (await db.query<any>(`SELECT fn_campus_next_criar_turma('${SEDE}','Outra',null,null,'[{"numero":1}]',null,false) AS turma`)).rows[0].turma;
    await rejeitar(`SELECT fn_campus_next_transferir('${MATRICULA}','${SEDE}','${outra.id}')`, /preservar o histórico/);
    expect((await db.query('SELECT id FROM next_presencas')).rows).toHaveLength(1);
    const semHistoria = (await db.query<any>(`INSERT INTO next_matriculas(membro_id,igreja_id) VALUES('${MEMBRO}','${SEDE}') RETURNING id`)).rows[0].id;
    const nova = (await db.query<any>(`SELECT fn_campus_next_transferir('${semHistoria}','${SEDE}','${outra.id}') AS matricula`)).rows[0].matricula;
    expect(nova.turma_id).toBe(outra.id);
    expect(nova.turma_destino_nome).toBe('Outra');
  });

});
