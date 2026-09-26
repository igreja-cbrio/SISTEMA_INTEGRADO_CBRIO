// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';let db:PGlite;
async function reject(sql:string,p:RegExp){await db.exec('SAVEPOINT teste');await expect(db.exec(sql)).rejects.toThrow(p);await db.exec('ROLLBACK TO SAVEPOINT teste');}
describe('configuração e storage de batismo em PostgreSQL',()=>{
 beforeAll(async()=>{db=new PGlite();await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE igrejas(id uuid PRIMARY KEY);INSERT INTO igrejas VALUES('${A}'),('${B}');
 CREATE TABLE profiles(id uuid PRIMARY KEY);
 CREATE TABLE app_campus_config(id boolean,estado text,ja_ativado boolean,campus_legado_id uuid);
 INSERT INTO app_campus_config VALUES(true,'preparacao',false,'${A}');
 CREATE TABLE app_campus_cobertura(frente text,api_validada boolean,rls_validada boolean,produtores_validados boolean,regressao_validada boolean,evidencia text);
 INSERT INTO app_campus_cobertura VALUES('arquivos-exportacoes',true,true,true,true,'antiga'),('batismo',true,true,true,true,'antiga');
 CREATE FUNCTION fn_campus_legado_escrita() RETURNS uuid LANGUAGE plpgsql STABLE AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM app_campus_config WHERE estado='preparacao' AND NOT ja_ativado) THEN RAISE EXCEPTION 'Campus explícito obrigatório.'; END IF; RETURN '${A}'; END $$;
 CREATE TABLE batismo_config(id smallint PRIMARY KEY CHECK(id=1),grupo_url text,updated_by uuid,updated_at timestamptz DEFAULT now());
 INSERT INTO batismo_config(id,grupo_url) VALUES(1,'https://chat.whatsapp.com/legado');
 CREATE TABLE batismo_inscricoes(id uuid PRIMARY KEY,membro_id uuid,igreja_id uuid,data_batismo date,status text,deleted_at timestamptz,checkin_em timestamptz,updated_at timestamptz);
 INSERT INTO batismo_inscricoes VALUES('${A}','${A}','${B}',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'confirmado',null,null,null);
 CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 INSERT INTO storage.buckets(id,name,public) VALUES('batismos','batismos',true),('batismos-biometria','batismos-biometria',false);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE POLICY baseline ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
 GRANT USAGE ON SCHEMA storage,public TO authenticated;GRANT ALL ON ALL TABLES IN SCHEMA storage,public TO authenticated;
 `);await db.exec(readFileSync('supabase/migrations/20260927120000_multicampus_batismo_config_storage.sql','utf8'));},30000);
 beforeEach(async()=>{await db.exec('BEGIN');});afterEach(async()=>{await db.exec('ROLLBACK;RESET ROLE');});afterAll(async()=>{await db.close();});
 it('cria config local e bucket novo privado sem anunciar privatização do legado',async()=>{
  expect((await db.query('SELECT igreja_id,grupo_url FROM batismo_config_campus')).rows).toEqual([{igreja_id:A,grupo_url:'https://chat.whatsapp.com/legado'}]);
  expect((await db.query("SELECT public FROM storage.buckets WHERE id='batismos-campi'")).rows).toEqual([{public:false}]);
  expect((await db.query("SELECT public FROM storage.buckets WHERE id='batismos'")).rows).toEqual([{public:true}]);
 });
 it('ponte preserva leitores legados só na preparação e não copia config do campus B',async()=>{
  await db.exec("UPDATE batismo_config SET grupo_url='https://chat.whatsapp.com/novo'");
  expect((await db.query('SELECT grupo_url FROM batismo_config_campus')).rows[0]).toEqual({grupo_url:'https://chat.whatsapp.com/novo'});
  await db.exec(`INSERT INTO batismo_config_campus(igreja_id,grupo_url) VALUES('${B}','https://chat.whatsapp.com/B'); UPDATE batismo_config_campus SET grupo_url='https://chat.whatsapp.com/A' WHERE igreja_id='${A}'`);
  expect((await db.query('SELECT grupo_url FROM batismo_config')).rows[0]).toEqual({grupo_url:'https://chat.whatsapp.com/A'});
  await db.exec("UPDATE app_campus_config SET estado='ativo',ja_ativado=true");
  await reject("UPDATE batismo_config SET grupo_url=null",/Campus explícito/);
 });
 it('policy genérica permissiva não dá acesso direto ao bucket novo nem à biometria',async()=>{
  await db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES('batismos-campi','novo'),('batismos-biometria','rosto'),('outro','permitido');SET ROLE authenticated");
  expect((await db.query('SELECT name FROM storage.objects')).rows).toEqual([{name:'permitido'}]);
  await reject("INSERT INTO storage.objects(bucket_id,name) VALUES('batismos','nova')",/row-level security/);
  await reject("INSERT INTO storage.objects(bucket_id,name) VALUES('batismos-campi','nova')",/row-level security/);
 });
 it('check-in próprio exige membro e campus do ato, preserva idempotência',async()=>{
  const bad=(await db.query<{r:any}>(`SELECT fn_campus_batismo_checkin_proprio('${A}','${B}','${B}') r`)).rows[0].r;expect(bad.ok).toBe(false);
  const good=(await db.query<{r:any}>(`SELECT fn_campus_batismo_checkin_proprio('${A}','${A}','${B}') r`)).rows[0].r;expect(good.ok).toBe(true);
  expect((await db.query<{r:any}>(`SELECT fn_campus_batismo_checkin_proprio('${A}','${A}','${B}') r`)).rows[0].r).toMatchObject({ok:true,ja_checkado:true,checkin_em:good.checkin_em});
 });
 it('cutover legado depende de evidência específica',async()=>{
  const sql=readFileSync('backend/scripts/multicampus/cutover-batismo-storage.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
  await reject(sql,/Privatização do legado exige/);
  await db.exec("UPDATE app_campus_cobertura SET api_validada=true,rls_validada=true,produtores_validados=true,regressao_validada=true,evidencia='batismo-storage-privado-revisado' WHERE frente='arquivos-exportacoes'");
  await db.exec(sql);expect((await db.query("SELECT public FROM storage.buckets WHERE id='batismos'")).rows[0]).toEqual({public:false});
 });
});
