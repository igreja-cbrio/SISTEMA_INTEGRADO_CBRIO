// @vitest-environment node
// Executa a migration real em PostgreSQL/WASM. Fixture mínima espelha os tipos e
// constraints auditados em produção (culto_id nullable e ON DELETE SET NULL).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const SEDE = '00000000-0000-0000-0000-000000000001';
const CAMPUS2 = '00000000-0000-0000-0000-000000000002';
const TIPO = '10000000-0000-0000-0000-000000000001';
const CULTO = '20000000-0000-0000-0000-000000000001';
const USER = '30000000-0000-0000-0000-000000000001';
const foundation = readFileSync('supabase/migrations/20260926200000_multicampus_contexto_e_ativacao.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20260926210000_multicampus_cultos_agenda.sql', 'utf8');
let db: PGlite;
const gerar = (campus: string, data = '2027-03-07') => db.query<{out_status: string}>(
  'SELECT * FROM gerar_cultos_recorrentes_campus($1,$2::date,$2::date)', [campus, data]);

describe('cultos multicampus: integridade e agenda no PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
      CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE TABLE igrejas(id uuid PRIMARY KEY,slug text,tipo text,ativa boolean NOT NULL);
      CREATE TABLE profiles(id uuid PRIMARY KEY,is_diretoria_geral boolean DEFAULT false);
      CREATE TABLE usuario_igrejas(usuario_id uuid REFERENCES profiles(id),igreja_id uuid REFERENCES igrejas(id));
      CREATE TABLE modulos(slug text PRIMARY KEY,escopo_campus text,ativo boolean DEFAULT true);
      INSERT INTO igrejas VALUES('${SEDE}','cbrio-sede','sede',true);
      INSERT INTO profiles(id) VALUES('${USER}');
      INSERT INTO usuario_igrejas VALUES('${USER}','${SEDE}');
      INSERT INTO modulos(slug,escopo_campus) VALUES('integracao','isolado');
      CREATE TABLE vol_service_types(id uuid PRIMARY KEY,name text NOT NULL,recurrence_day smallint,
        recurrence_time time,is_active boolean NOT NULL,vigente_de date,vigente_ate date);
      INSERT INTO vol_service_types VALUES('${TIPO}','Domingo',0,'10:00',true,null,null);
      CREATE TABLE cultos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),service_type_id uuid REFERENCES vol_service_types(id) ON DELETE SET NULL,
        nome text NOT NULL,data date NOT NULL,hora time NOT NULL,presencial_adulto integer,presencial_kids integer,
        decisoes_presenciais integer,decisoes_online integer,visitantes integer,visitantes_online integer,voluntarios integer,
        CONSTRAINT uniq_culto_service_data UNIQUE(service_type_id,data));
      CREATE TABLE cultos_decisoes_pessoas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        culto_id uuid REFERENCES cultos(id) ON DELETE SET NULL,nome text NOT NULL);
      INSERT INTO cultos(id,service_type_id,nome,data,hora) VALUES('${CULTO}','${TIPO}','Histórico','2026-09-20','10:00');
      INSERT INTO cultos_decisoes_pessoas(culto_id,nome) VALUES('${CULTO}','Pessoa sintética'),(null,'Órfã sintética');
      ALTER TABLE cultos ENABLE ROW LEVEL SECURITY;
      ALTER TABLE cultos_decisoes_pessoas ENABLE ROW LEVEL SECURITY;
      CREATE POLICY permissao_original ON cultos FOR ALL TO authenticated USING(true) WITH CHECK(true);
      CREATE POLICY permissao_original ON cultos_decisoes_pessoas FOR ALL TO authenticated USING(true) WITH CHECK(true);
      GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
      GRANT SELECT,INSERT,UPDATE ON cultos,cultos_decisoes_pessoas TO authenticated,service_role;
      GRANT SELECT ON igrejas,vol_service_types TO service_role;
      CREATE FUNCTION gerar_cultos_recorrentes(p_data_inicio date,p_data_fim date)
        RETURNS TABLE(out_service_type text,out_data date,out_status text)
        LANGUAGE sql AS $$ SELECT 'legado'::text,p_data_inicio,'criado'::text $$;
      REVOKE ALL ON FUNCTION gerar_cultos_recorrentes(date,date) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION gerar_cultos_recorrentes(date,date) TO service_role;
    `);
    await db.exec(`
      ALTER TABLE cultos ADD COLUMN youtube_video_id text;
      ALTER TABLE cultos ADD COLUMN online_pico integer;
      ALTER TABLE cultos ADD COLUMN online_ds integer;
      ALTER TABLE cultos ADD COLUMN online_ddus integer;
      ALTER TABLE cultos ADD COLUMN ds_coletado_em timestamp with time zone;
      ALTER TABLE cultos ADD COLUMN ddus_coletado_em timestamp with time zone;
      ALTER TABLE cultos ADD COLUMN inserido_por uuid;
      ALTER TABLE cultos ADD COLUMN created_at timestamp with time zone;
      ALTER TABLE cultos ADD COLUMN updated_at timestamp with time zone;
      ALTER TABLE cultos ADD COLUMN decisoes_kids integer;
      ALTER TABLE cultos ADD COLUMN observacoes text;
      ALTER TABLE cultos ADD COLUMN online_watch_minutes_ds integer;
      ALTER TABLE cultos ADD COLUMN online_watch_minutes_ddus integer;
      ALTER TABLE cultos ADD COLUMN online_retencao_pct_ds numeric(5,2);
      ALTER TABLE cultos ADD COLUMN online_retencao_pct_ddus numeric(5,2);
      ALTER TABLE cultos ADD COLUMN online_subs_ganhos integer;
      ALTER TABLE cultos ADD COLUMN online_subs_perdidos integer;
      ALTER TABLE cultos ADD COLUMN online_views_inscritos integer;
      ALTER TABLE cultos ADD COLUMN online_views_nao_inscritos integer;
      ALTER TABLE cultos ADD COLUMN deleted_at timestamp with time zone;
      ALTER TABLE cultos ADD COLUMN voluntarios_escalados integer;
      ALTER TABLE cultos ADD COLUMN voluntarios_checkin integer;
      ALTER TABLE cultos ADD COLUMN online_decisoes_chat integer;
      ALTER TABLE cultos ADD COLUMN online_chat_page_token text;
      ALTER TABLE cultos ADD COLUMN frequencia_lancada boolean;
      ALTER TABLE cultos ADD COLUMN decisoes_lancadas boolean;
      ALTER TABLE cultos ADD COLUMN kids_resumo_enviado_at timestamp with time zone;
      ALTER TABLE cultos ADD COLUMN online_pico_verificado boolean;
      ALTER TABLE cultos ADD COLUMN online_views_live integer;
      ALTER TABLE cultos ADD COLUMN decisoes_online_extra integer;
      ALTER TABLE vol_service_types ADD COLUMN color text;
      ALTER TABLE vol_service_types ADD COLUMN presencial_label text;
      ALTER TABLE vol_service_types ADD COLUMN has_kids boolean;
      ALTER TABLE vol_service_types ADD COLUMN has_online boolean;
      ALTER TABLE cultos_decisoes_pessoas ADD COLUMN membro_id uuid;
      ALTER TABLE cultos_decisoes_pessoas ADD COLUMN cpf text;
      ALTER TABLE cultos_decisoes_pessoas ADD COLUMN responsavel_cpf text;
      ALTER TABLE cultos_decisoes_pessoas ADD COLUMN telefone text;
      ALTER TABLE cultos_decisoes_pessoas ADD COLUMN email text;
      ALTER TABLE cultos_decisoes_pessoas ADD COLUMN data_nascimento date;
      ALTER TABLE cultos_decisoes_pessoas ADD COLUMN tipo_decisao text DEFAULT 'presencial';
      CREATE TABLE mem_membros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text,email text,telefone text,cpf text,
        data_nascimento date,status text,deleted_at timestamptz,igreja_id uuid DEFAULT '${SEDE}');
      CREATE FUNCTION fn_identidade_nomes_compativeis(a text,b text) RETURNS boolean LANGUAGE sql AS $$ SELECT lower(a)=lower(b) $$;
      CREATE FUNCTION fn_registrar_contato(a uuid,b text,c text,d text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION tg_cultos_dec_pessoas_resolve_membro() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TRIGGER cultos_dec_pessoas_resolve_membro BEFORE INSERT ON cultos_decisoes_pessoas
        FOR EACH ROW EXECUTE FUNCTION tg_cultos_dec_pessoas_resolve_membro();
      ALTER TABLE cultos_decisoes_pessoas ADD COLUMN decidiu_em date;
      ALTER TABLE cultos_decisoes_pessoas ADD COLUMN observacoes text;
      CREATE TABLE cui_convertidos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data_culto date,culto_id uuid,
        membro_id uuid,nome text,telefone text,cpf text,atendido_apos_culto boolean,cadastrado boolean,observacoes text,
        area text,igreja_id uuid DEFAULT '${SEDE}');
      CREATE TABLE mem_trilha_valores(membro_id uuid,etapa text,concluida boolean,data_conclusao date,observacoes text);
      CREATE TABLE nsm_eventos(membro_id uuid,visitante_id uuid,cpf text,nome text,data_decisao date,valor_engajado text,
        data_engajamento date,origem text,origem_id uuid,observacao text,igreja_id uuid);
      CREATE UNIQUE INDEX nsm_dedup ON nsm_eventos((coalesce(membro_id::text,visitante_id::text,cpf)),valor_engajado);
      CREATE FUNCTION tg_cultos_dec_pessoas_jornada() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE FUNCTION tg_cultos_dec_pessoas_to_cuidados() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TRIGGER cultos_dec_pessoas_jornada AFTER INSERT ON cultos_decisoes_pessoas FOR EACH ROW EXECUTE FUNCTION tg_cultos_dec_pessoas_jornada();
      CREATE TRIGGER z_dec_pessoas_to_cuidados AFTER INSERT ON cultos_decisoes_pessoas FOR EACH ROW EXECUTE FUNCTION tg_cultos_dec_pessoas_to_cuidados();
      CREATE FUNCTION app_soft_delete(p_table_name text,p_row_id text,p_deleted_by uuid)
        RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN
          UPDATE cultos SET deleted_at=now() WHERE id=p_row_id::uuid AND deleted_at IS NULL;
          RETURN FOUND;
        END $$;
    `);
    await db.exec(`CREATE VIEW vw_culto_stats AS  SELECT c.id,
    c.service_type_id,
    c.nome,
    c.data,
    c.hora,
    c.presencial_adulto,
    c.presencial_kids,
    c.decisoes_presenciais,
    c.decisoes_online,
    c.youtube_video_id,
    c.online_pico,
    c.online_ds,
    c.online_ddus,
    c.ds_coletado_em,
    c.ddus_coletado_em,
    c.inserido_por,
    c.created_at,
    c.updated_at,
    c.visitantes,
    c.visitantes_online,
    c.voluntarios,
    c.decisoes_kids,
    c.observacoes,
    c.online_watch_minutes_ds,
    c.online_watch_minutes_ddus,
    c.online_retencao_pct_ds,
    c.online_retencao_pct_ddus,
    c.online_subs_ganhos,
    c.online_subs_perdidos,
    c.online_views_inscritos,
    c.online_views_nao_inscritos,
    c.deleted_at,
    c.voluntarios_escalados,
    c.voluntarios_checkin,
    c.online_decisoes_chat,
    c.online_chat_page_token,
    c.frequencia_lancada,
    c.decisoes_lancadas,
    vst.name AS service_type_name,
    vst.color AS service_type_color,
    vst.presencial_label AS service_type_presencial_label,
    vst.has_kids AS service_type_has_kids,
    vst.has_online AS service_type_has_online,
    round(c.presencial_adulto::numeric / 1300::numeric * 100::numeric, 1) AS taxa_ocupacao,
    c.presencial_adulto + c.presencial_kids AS total_presencial,
    COALESCE(c.decisoes_presenciais, 0) + COALESCE(c.decisoes_online, 0) AS total_decisoes
   FROM cultos c
     LEFT JOIN vol_service_types vst ON c.service_type_id = vst.id;`);
    await db.exec(foundation);
    await db.exec(migration);
    await db.exec('GRANT SELECT ON vw_culto_stats,vol_service_types TO authenticated');
    // Somente nesta fixture: representa as outras frentes já verificadas para testar o piloto em ensaio.
    await db.exec("UPDATE app_campus_cobertura SET api_validada=true,rls_validada=true,produtores_validados=true,regressao_validada=true,evidencia='Fixture sintética: cobertura externa ao piloto'");
    await db.exec(`INSERT INTO igrejas VALUES('${CAMPUS2}','campus-2','sede',true);
      INSERT INTO vol_campus_service_types(igreja_id,service_type_id) VALUES('${CAMPUS2}','${TIPO}');`);
  }, 30000);
  beforeEach(async () => { await db.exec('BEGIN'); });
  afterEach(async () => { await db.exec('ROLLBACK'); });
  afterAll(async () => { await db.close(); });

  it('backfill mantém decisões sem culto e classifica o histórico', async () => {
    const { rows } = await db.query<{ igreja_id: string; culto_id: string | null }>('SELECT igreja_id,culto_id FROM cultos_decisoes_pessoas');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.igreja_id === SEDE)).toBe(true);
    expect(rows.some((r) => r.culto_id === null)).toBe(true);
  });
  it('dois campi coexistem no mesmo tipo/data/horário e repetição é idempotente', async () => {
    expect((await gerar(SEDE)).rows[0].out_status).toBe('criado');
    expect((await gerar(CAMPUS2)).rows[0].out_status).toBe('criado');
    expect((await gerar(CAMPUS2)).rows[0].out_status).toBe('ja_existia');
    const { rows } = await db.query("SELECT igreja_id,hora::text FROM cultos WHERE data='2027-03-07' ORDER BY igreja_id");
    expect(rows).toEqual([{ igreja_id: SEDE, hora: '10:00:00' }, { igreja_id: CAMPUS2, hora: '10:00:00' }]);
  });
  it('override local de dia/horário não altera a agenda da Sede', async () => {
    await db.query('UPDATE vol_campus_service_types SET recurrence_day=6,recurrence_time=$1 WHERE igreja_id=$2', ['18:00', CAMPUS2]);
    expect((await gerar(CAMPUS2)).rows).toHaveLength(0);
    expect((await gerar(CAMPUS2, '2027-03-06')).rows).toHaveLength(1);
    expect((await gerar(SEDE)).rows).toHaveLength(1);
    const { rows } = await db.query<{hora: string}>('SELECT hora::text FROM cultos WHERE igreja_id=$1', [CAMPUS2]);
    expect(rows[0].hora).toBe('18:00:00');
  });
  it('agenda desativada não gera culto', async () => {
    await db.query('UPDATE vol_campus_service_types SET is_active=false WHERE igreja_id=$1', [CAMPUS2]);
    expect((await gerar(CAMPUS2)).rows).toHaveLength(0);
  });
  it('decisão herda o campus do pai e a exclusão do pai conserva seu campus', async () => {
    await gerar(CAMPUS2);
    const inserted = await db.query<{id: string; igreja_id: string}>(`INSERT INTO cultos_decisoes_pessoas(culto_id,nome)
      SELECT id,'Pessoa sintética 2' FROM cultos WHERE igreja_id=$1 RETURNING id,igreja_id`, [CAMPUS2]);
    expect(inserted.rows[0].igreja_id).toBe(CAMPUS2);
    await db.query('DELETE FROM cultos WHERE igreja_id=$1', [CAMPUS2]);
    const { rows } = await db.query('SELECT igreja_id,culto_id FROM cultos_decisoes_pessoas WHERE id=$1', [inserted.rows[0].id]);
    expect(rows).toEqual([{ igreja_id: CAMPUS2, culto_id: null }]);
  });
  it('recusa decisão explicitamente associada a campus diferente do culto', async () => {
    await expect(db.query('INSERT INTO cultos_decisoes_pessoas(culto_id,igreja_id,nome) VALUES($1,$2,$3)', [CULTO, CAMPUS2, 'Pessoa sintética'])).rejects.toThrow('diverge');
  });
  it('não permite mover campus histórico de culto', async () => {
    await expect(db.query('UPDATE cultos SET igreja_id=$1 WHERE id=$2', [CAMPUS2, CULTO])).rejects.toThrow('histórico');
  });
  it('não permite mover campus histórico de decisão', async () => {
    await expect(db.query('UPDATE cultos_decisoes_pessoas SET igreja_id=$1 WHERE culto_id IS NULL', [CAMPUS2])).rejects.toThrow('histórico');
  });
  it('fallback legado e wrapper antigo funcionam somente em preparação', async () => {
    expect((await db.query<{id: string}>('SELECT fn_campus_legado_escrita() AS id')).rows[0].id).toBe(SEDE);
    expect((await db.query("SELECT * FROM gerar_cultos_recorrentes('2027-03-07','2027-03-07')")).rows).toHaveLength(1);
    await db.exec("UPDATE app_campus_config SET estado='ensaio'");
    await expect(db.query("SELECT * FROM gerar_cultos_recorrentes('2027-03-14','2027-03-14')")).rejects.toThrow('Campus explícito obrigatório');
  });
  it('após ensaio, INSERT sem campus falha fechado', async () => {
    await db.exec("UPDATE app_campus_config SET estado='ensaio'");
    await expect(db.query("INSERT INTO cultos(nome,data,hora) VALUES('Sem campus','2027-03-07','10:00')")).rejects.toThrow('Campus explícito obrigatório');
  });
  it('policy restritiva bloqueia leitura cruzada apesar da policy permissiva anterior', async () => {
    await gerar(CAMPUS2);
    await db.exec(`UPDATE app_campus_config SET estado='ensaio'; SET LOCAL ROLE authenticated; SET LOCAL "test.user"='${USER}';`);
    const { rows } = await db.query<{igreja_id: string}>('SELECT igreja_id FROM cultos');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.igreja_id === SEDE)).toBe(true);
  });
  it('policy restritiva bloqueia INSERT cruzado', async () => {
    await db.exec(`UPDATE app_campus_config SET estado='ensaio'; SET LOCAL ROLE authenticated; SET LOCAL "test.user"='${USER}';`);
    await expect(db.query("INSERT INTO cultos(igreja_id,nome,data,hora) VALUES($1,'Outro campus','2027-03-07','10:00')", [CAMPUS2])).rejects.toThrow('row-level security');
  });
  it('ocupação usa capacidade local e campus sem capacidade permanece sem taxa', async () => {
    await gerar(CAMPUS2);
    await db.exec('UPDATE cultos SET presencial_adulto=650');
    const antes = await db.query<{igreja_id: string; taxa_ocupacao: string | null}>('SELECT igreja_id,taxa_ocupacao FROM vw_culto_stats ORDER BY igreja_id');
    expect(antes.rows).toEqual([{ igreja_id: SEDE, taxa_ocupacao: '50.0' }, { igreja_id: CAMPUS2, taxa_ocupacao: null }]);
    await db.query('UPDATE vol_campus_service_types SET capacidade_lugares=1000 WHERE igreja_id=$1', [CAMPUS2]);
    expect((await db.query<{taxa_ocupacao: string}>('SELECT taxa_ocupacao FROM vw_culto_stats WHERE igreja_id=$1', [CAMPUS2])).rows[0].taxa_ocupacao).toBe('65.0');
  });
  it('view respeita RLS do invocador', async () => {
    await gerar(CAMPUS2);
    await db.exec(`UPDATE app_campus_config SET estado='ensaio'; SET LOCAL ROLE authenticated; SET LOCAL "test.user"='${USER}';`);
    const { rows } = await db.query<{igreja_id: string}>('SELECT igreja_id FROM vw_culto_stats');
    expect(rows).toEqual([{ igreja_id: SEDE }]);
  });
  it('soft-delete atômico recusa campus errado e preserva o registro', async () => {
    expect((await db.query<{ok: boolean}>('SELECT fn_campus_soft_delete_culto($1,$2,$3) AS ok', [CULTO,CAMPUS2,USER])).rows[0].ok).toBe(false);
    expect((await db.query<{ok: boolean}>('SELECT fn_campus_soft_delete_culto($1,$2,$3) AS ok', [CULTO,SEDE,USER])).rows[0].ok).toBe(true);
    const { rows } = await db.query<{deleted_at: string | null}>('SELECT deleted_at FROM cultos WHERE id=$1', [CULTO]);
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
  });
  it('não vincula decisão a culto excluído logicamente', async () => {
    await db.query('UPDATE cultos SET deleted_at=now() WHERE id=$1', [CULTO]);
    await expect(db.query("INSERT INTO cultos_decisoes_pessoas(culto_id,nome) VALUES($1,'Sintético')", [CULTO])).rejects.toThrow('indisponível');
  });
  it('matcher cria pessoa no campus do ato, sem mudar campus de pessoa já existente', async () => {
    await gerar(CAMPUS2);
    await db.exec(`INSERT INTO mem_membros(nome,cpf,igreja_id) VALUES('Existente sintético','11111111111','${SEDE}')`);
    await db.query(`INSERT INTO cultos_decisoes_pessoas(culto_id,nome,cpf)
      SELECT id,'Existente sintético','11111111111' FROM cultos WHERE igreja_id=$1`, [CAMPUS2]);
    await db.query(`INSERT INTO cultos_decisoes_pessoas(culto_id,nome)
      SELECT id,'Novo sintético' FROM cultos WHERE igreja_id=$1`, [CAMPUS2]);
    const { rows } = await db.query('SELECT nome,igreja_id FROM mem_membros ORDER BY nome');
    expect(rows).toEqual([{ nome: 'Existente sintético', igreja_id: SEDE }, { nome: 'Novo sintético', igreja_id: CAMPUS2 }]);
    expect((await db.query('SELECT DISTINCT igreja_id FROM cui_convertidos')).rows).toEqual([{ igreja_id: CAMPUS2 }]);
    expect((await db.query('SELECT DISTINCT igreja_id FROM nsm_eventos')).rows).toEqual([{ igreja_id: CAMPUS2 }]);
  });
  it('migration recusa backfill se uma segunda sede já está ativa', async () => {
    await expect(db.exec(migration)).rejects.toThrow('uma única Sede legada');
  });
  it('campus ativo recebe escrita explícita mesmo depois de retirar o fallback', async () => {
    await db.exec("UPDATE app_campus_config SET estado='ensaio'");
    expect((await gerar(CAMPUS2)).rows[0].out_status).toBe('criado');
    const { rows } = await db.query(`INSERT INTO cultos_decisoes_pessoas(culto_id,nome)
      SELECT id,'Decisão explícita' FROM cultos WHERE igreja_id=$1 RETURNING igreja_id`, [CAMPUS2]);
    expect(rows).toEqual([{ igreja_id: CAMPUS2 }]);
  });
  it('RPC nova é exclusiva do serviço e grants da antiga permanecem restritos', async () => {
    const { rows } = await db.query(`SELECT
      has_function_privilege('authenticated','gerar_cultos_recorrentes_campus(uuid,date,date)','EXECUTE') AS nova_auth,
      has_function_privilege('anon','gerar_cultos_recorrentes_campus(uuid,date,date)','EXECUTE') AS nova_anon,
      has_function_privilege('service_role','gerar_cultos_recorrentes_campus(uuid,date,date)','EXECUTE') AS nova_service,
      has_function_privilege('authenticated','gerar_cultos_recorrentes(date,date)','EXECUTE') AS antiga_auth`);
    expect(rows).toEqual([{ nova_auth: false, nova_anon: false, nova_service: true, antiga_auth: false }]);
  });
  it('resumo SQL conta mais de mil cultos e permanece idempotente sem lista truncada', async () => {
    await db.exec(`INSERT INTO vol_service_types(id,name,recurrence_day,recurrence_time,is_active)
      SELECT md5('campus-agenda-'||i::text)::uuid,'Tipo sintético '||i,0,'10:00',true FROM generate_series(1,1001) i;
      INSERT INTO vol_campus_service_types(igreja_id,service_type_id)
      SELECT '${CAMPUS2}',id FROM vol_service_types WHERE name LIKE 'Tipo sintético %';`);
    const sql = "SELECT fn_campus_gerar_cultos_resumo($1,'2027-03-07','2027-03-07') AS resumo";
    expect((await db.query(sql, [CAMPUS2])).rows).toEqual([{ resumo: { total: 1002, criados: 1002, ja_existia: 0 } }]);
    expect((await db.query(sql, [CAMPUS2])).rows).toEqual([{ resumo: { total: 1002, criados: 0, ja_existia: 1002 } }]);
  });
  it('resumo da geração só pode ser executado pelo serviço', async () => {
    const { rows } = await db.query(`SELECT
      has_function_privilege('anon','fn_campus_gerar_cultos_resumo(uuid,date,date)','EXECUTE') AS anon,
      has_function_privilege('authenticated','fn_campus_gerar_cultos_resumo(uuid,date,date)','EXECUTE') AS autenticado,
      has_function_privilege('service_role','fn_campus_gerar_cultos_resumo(uuid,date,date)','EXECUTE') AS servico`);
    expect(rows).toEqual([{ anon: false, autenticado: false, servico: true }]);
  });

});
