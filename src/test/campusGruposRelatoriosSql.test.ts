// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const G1='10000000-0000-0000-0000-000000000001',G2='10000000-0000-0000-0000-000000000002';
const E1='20000000-0000-0000-0000-000000000001',E2='20000000-0000-0000-0000-000000000002',E3='20000000-0000-0000-0000-000000000003';
const M1='30000000-0000-0000-0000-000000000001',M2='30000000-0000-0000-0000-000000000002',M3='30000000-0000-0000-0000-000000000003';
let db:PGlite;
async function service(){await db.exec('SET LOCAL ROLE service_role');}
async function user(campus=A,level='1'){await db.exec(`SET LOCAL ROLE authenticated;SET LOCAL "test.campus"='${campus}';SET LOCAL "test.level"='${level}'`);}
async function active(){await db.exec("UPDATE app_campus_config SET estado='ensaio',ja_ativado=true");}
describe('RPCs de Grupos: numeradores, denominadores e autorização',()=>{
  beforeAll(async()=>{
    db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
      CREATE TABLE igrejas(id uuid PRIMARY KEY,ativa boolean,tipo text);INSERT INTO igrejas VALUES('${A}',true,'sede');
      CREATE TABLE app_campus_config(id boolean,estado text,ja_ativado boolean,campus_legado_id uuid);
      INSERT INTO app_campus_config VALUES(true,'preparacao',false,'${A}');
      CREATE TABLE app_campus_cobertura(frente text,api_validada boolean,regressao_validada boolean);
      CREATE FUNCTION fn_campus_legado_escrita() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$BEGIN
        IF EXISTS(SELECT 1 FROM app_campus_config WHERE estado='preparacao' AND NOT ja_ativado) THEN RETURN '${A}'::uuid;END IF;
        RAISE EXCEPTION 'Campus explícito obrigatório.';END $$;
      CREATE FUNCTION current_user_module_level(text) RETURNS integer LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.level',true),'')::integer$$;
      CREATE FUNCTION fn_campus_dado_pessoal_permitido(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
        SELECT estado='preparacao' OR $1::text=current_setting('test.campus',true) FROM app_campus_config$$;
      CREATE TYPE grupo_funcao AS ENUM('frequentador','lider','lider_treinamento','co_lider');
      CREATE TABLE mem_grupos(id uuid PRIMARY KEY,igreja_id uuid,nome text,codigo text,lider_id uuid,supervisor_id uuid,
        ativo boolean DEFAULT true,temporada text,deleted_at timestamptz,categoria text,local text,dia_semana int,horario time,bairro text,status_temporada text);
      CREATE TABLE mem_membros(id uuid PRIMARY KEY,nome text,telefone text,foto_url text);
      CREATE TABLE mem_grupo_membros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),grupo_id uuid,membro_id uuid,funcao grupo_funcao,
        entrou_em date DEFAULT current_date,saiu_em date,deleted_at timestamptz);
      CREATE TABLE mem_grupo_encontros(id uuid PRIMARY KEY,grupo_id uuid,data date,deleted_at timestamptz);
      CREATE TABLE mem_grupo_encontro_presencas(encontro_id uuid,membro_id uuid,presente boolean);
      CREATE TABLE mem_grupo_pedidos(grupo_id uuid,created_at timestamptz DEFAULT now(),deleted_at timestamptz);
      CREATE TABLE grupo_supervisao_visitas(grupo_id uuid,status text,data_visita date);
      CREATE TABLE mem_temporadas(id text PRIMARY KEY,label text,data_inicio date,data_fim date);
      CREATE TABLE dados_brutos(tipo_id text,valor numeric,data date);
      CREATE TABLE mem_temporada_consolidado(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),temporada text UNIQUE,temporada_label text,
        data_inicio date,data_fim date,num_grupos int,num_inscricoes int,num_membros int,num_lideres int,num_lideres_treinamento int,
        satisfacao_lideres numeric,satisfacao_lideres_data date,total_encontros int,total_presencas int,frequencia_media numeric,
        metricas_extra jsonb DEFAULT '{}',consolidado_em timestamptz,consolidado_por uuid,consolidado_por_nome text);
      CREATE VIEW vw_kpi_trajetoria_atual AS SELECT 1 AS exemplo;
      GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
      ALTER TABLE mem_grupos ENABLE ROW LEVEL SECURITY;
      CREATE POLICY grupos_select ON mem_grupos FOR SELECT TO authenticated USING(fn_campus_dado_pessoal_permitido(igreja_id));
    `);
    await db.exec(`CREATE VIEW vw_grupos_supervisao AS  SELECT g.id,
    g.nome,
    g.categoria,
    g.local,
    g.dia_semana,
    g.horario,
    g.bairro,
    g.ativo,
    g.temporada,
    g.status_temporada,
    g.lider_id,
    l.nome AS lider_nome,
    g.supervisor_id,
    s.nome AS supervisor_nome,
    ( SELECT count(*) AS count
           FROM mem_grupo_membros m
          WHERE m.grupo_id = g.id AND m.saiu_em IS NULL) AS total_membros,
    ( SELECT count(*) AS count
           FROM mem_grupo_membros m
          WHERE m.grupo_id = g.id AND m.saiu_em IS NULL AND m.funcao = 'lider_treinamento'::grupo_funcao) AS total_lider_treinamento,
    ( SELECT max(v.data_visita) AS max
           FROM grupo_supervisao_visitas v
          WHERE v.grupo_id = g.id AND v.status = 'realizada'::text) AS ultima_visita,
    ( SELECT count(*) AS count
           FROM grupo_supervisao_visitas v
          WHERE v.grupo_id = g.id AND v.status = 'realizada'::text AND v.data_visita >= date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)::date) AS visitas_mes_atual,
    ( SELECT min(v.data_visita) AS min
           FROM grupo_supervisao_visitas v
          WHERE v.grupo_id = g.id AND v.status = 'agendada'::text AND v.data_visita >= CURRENT_DATE) AS proxima_visita
   FROM mem_grupos g
     LEFT JOIN mem_membros l ON l.id = g.lider_id
     LEFT JOIN mem_membros s ON s.id = g.supervisor_id
  WHERE g.ativo = true AND g.deleted_at IS NULL;`);
    await db.exec(readFileSync('supabase/migrations/20260927040000_multicampus_grupos_relatorios.sql','utf8'));
    await db.exec(`GRANT SELECT ON vw_grupos_supervisao TO authenticated;
      INSERT INTO igrejas VALUES('${B}',true,'sede');
      INSERT INTO mem_temporadas VALUES('t','Temporada',date_trunc('month',current_date)::date,current_date);
      INSERT INTO mem_grupos(id,igreja_id,nome,codigo,temporada) VALUES('${G1}','${A}','Grupo A','A','t'),('${G2}','${B}','Grupo B','B','t');
      INSERT INTO mem_membros VALUES('${M1}','Membro A','telefone-a',NULL),('${M2}','Membro B','telefone-b',NULL),('${M3}','Ausente B','telefone-ausente-b',NULL);
      INSERT INTO mem_grupo_membros(grupo_id,membro_id,funcao) VALUES('${G1}','${M1}','frequentador'),('${G2}','${M2}','frequentador'),('${G2}','${M3}','frequentador');
      INSERT INTO mem_grupo_encontros VALUES('${E1}','${G1}',current_date,NULL),('${E2}','${G1}',current_date,NULL),('${E3}','${G2}',current_date,NULL);
      INSERT INTO mem_grupo_encontro_presencas VALUES('${E1}','${M1}',true),('${E1}',NULL,true),('${E2}','${M1}',true),
        ('${E3}','${M2}',true),('${E3}',NULL,true),('${E3}',NULL,true),('${E3}',NULL,true);
      INSERT INTO mem_grupo_pedidos(grupo_id) VALUES('${G1}'),('${G2}'),('${G2}');
      INSERT INTO dados_brutos VALUES('nps_lideres',8,current_date,'${A}'),('nps_lideres',6,current_date,'${B}');`);
  },30000);
  beforeEach(async()=>{await db.exec('BEGIN');});afterEach(async()=>{await db.exec('ROLLBACK');});afterAll(async()=>{await db.close();});
  it('métricas separam numerador, denominador, inscrições e NPS por campus',async()=>{
    await service();
    const a=(await db.query('SELECT * FROM fn_temporada_metricas_campus($1,$2)',[A,'t'])).rows[0];
    const b=(await db.query('SELECT * FROM fn_temporada_metricas_campus($1,$2)',[B,'t'])).rows[0];
    expect(a).toMatchObject({num_grupos:1,num_inscricoes:1,total_encontros:2,total_presencas:3,frequencia_media:'1.5',satisfacao_lideres:'8'});
    expect(b).toMatchObject({num_grupos:1,num_inscricoes:2,total_encontros:1,total_presencas:4,frequencia_media:'4.0',satisfacao_lideres:'6'});
  });
  it('NPS sem campus conhecido não contamina resultado local',async()=>{
    await db.exec("INSERT INTO dados_brutos(tipo_id,valor,data) VALUES('nps_lideres',99,current_date+1)");await service();
    const {rows}=await db.query<{resultado:{satisfacao_lideres:{valor:number}}}>('SELECT fn_grupos_kpis_relatorio_campus($1,NULL,12) AS resultado',[A]);
    expect(rows[0].resultado.satisfacao_lideres.valor).toBe(8);
  });
  it('campus sem NPS recebe desconhecido, nunca NPS de outra unidade',async()=>{
    await db.query('DELETE FROM dados_brutos WHERE igreja_id=$1',[B]);await service();
    const {rows}=await db.query<{resultado:{satisfacao_lideres:null}}>('SELECT fn_grupos_kpis_relatorio_campus($1,NULL,12) AS resultado',[B]);
    expect(rows[0].resultado.satisfacao_lideres).toBeNull();
  });
  it('série usa inscrições e frequência da mesma temporada/campus',async()=>{
    await service();
    const {rows}=await db.query<{resultado:{serie:Array<{inscricoes:number;presencas:number;encontros:number}>}}>('SELECT fn_temporada_series_campus($1,$2) AS resultado',[A,'t']);
    expect(rows[0].resultado.serie[0]).toMatchObject({inscricoes:1,presencas:3,encontros:2});
  });
  it('lista nominal sem presença nunca inclui ausente de outro campus',async()=>{
    await service();
    expect((await db.query('SELECT fn_temporada_sem_presenca_campus($1,$2) AS dados',[A,'t'])).rows).toEqual([{dados:[]}]);
    const b=await db.query<{dados:Array<{grupo_id:string;membros:Array<{membro_id:string}>}>}>('SELECT fn_temporada_sem_presenca_campus($1,$2) AS dados',[B,'t']);
    expect(b.rows[0].dados[0].grupo_id).toBe(G2);expect(b.rows[0].dados[0].membros[0].membro_id).toBe(M3);
  });
  it('última frequência nominal é restrita ao campus informado',async()=>{
    await service();const {rows}=await db.query<{membro_id:string|null}>('SELECT * FROM fn_grupos_ultima_frequencia_campus($1)',[A]);
    expect(rows.filter(r=>r.membro_id).map(r=>r.membro_id)).toEqual([M1]);
  });
  it('consolidados da mesma temporada coexistem e reexecução não sobrescreve outro campus',async()=>{
    await service();await db.query('SELECT fn_consolidar_temporada_campus($1,$2)',[A,'t']);await db.query('SELECT fn_consolidar_temporada_campus($1,$2)',[B,'t']);
    await db.query('SELECT fn_consolidar_temporada_campus($1,$2)',[A,'t']);
    const {rows}=await db.query('SELECT igreja_id,total_presencas FROM mem_temporada_consolidado ORDER BY igreja_id');
    expect(rows).toEqual([{igreja_id:A,total_presencas:3},{igreja_id:B,total_presencas:4}]);
  });
  it('authenticated precisa de vínculo e nível no módulo',async()=>{
    await active();await user(A);expect((await db.query('SELECT * FROM fn_temporada_metricas_campus($1,$2)',[A,'t'])).rows).toHaveLength(1);
    await expect(db.query('SELECT * FROM fn_temporada_metricas_campus($1,$2)',[B,'t'])).rejects.toThrow('Sem acesso');
  });
  it('nível insuficiente não consolida mesmo no campus permitido',async()=>{
    await active();await user(A,'1');await expect(db.query('SELECT fn_consolidar_temporada_campus($1,$2)',[A,'t'])).rejects.toThrow('Sem acesso');
  });
  it('lista nominal exige nível 3 como a rota existente',async()=>{
    await active();await user(A,'1');await expect(db.query('SELECT fn_temporada_sem_presenca_campus($1,$2)',[A,'t'])).rejects.toThrow('Sem acesso');
  });
  it('consolidação preserva nível 5 exigido pela rota existente',async()=>{
    await active();await user(A,'3');await expect(db.query('SELECT fn_consolidar_temporada_campus($1,$2)',[A,'t'])).rejects.toThrow('nível 5');
  });
  it('nível nulo não passa silenciosamente pela autorização',async()=>{
    await active();await user(A,'');await expect(db.query('SELECT * FROM fn_temporada_metricas_campus($1,$2)',[A,'t'])).rejects.toThrow('Sem acesso');
  });
  it('wrapper antigo funciona em preparação e exige origem depois de ensaio',async()=>{
    await service();expect((await db.query("SELECT * FROM fn_temporada_metricas('t')")).rows).toHaveLength(1);
    await db.exec('RESET ROLE');await active();await service();await expect(db.query("SELECT * FROM fn_temporada_metricas('t')")).rejects.toThrow('Campus explícito');
  });
  it('view supervisionada respeita RLS e explicita campus',async()=>{
    await active();await user(A);expect((await db.query('SELECT igreja_id FROM vw_grupos_supervisao')).rows).toEqual([{igreja_id:A}]);
  });
});
