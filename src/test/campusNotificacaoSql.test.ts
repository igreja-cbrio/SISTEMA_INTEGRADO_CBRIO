// @vitest-environment node
import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
let db:PGlite;
describe('RLS notificações · destinatário e origem',()=>{
 beforeAll(async()=>{db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE igrejas(id uuid PRIMARY KEY);INSERT INTO igrejas VALUES('${A}'),('${B}');
 CREATE TABLE notificacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),usuario_id uuid,modulo text,lida boolean DEFAULT false,created_at timestamptz DEFAULT now());
 CREATE TABLE app_campus_cobertura(frente text,api_validada boolean,rls_validada boolean,produtores_validados boolean,regressao_validada boolean);
 CREATE FUNCTION fn_campus_legado_escrita() RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.ativo',true)='true' THEN RAISE EXCEPTION 'Campus explícito obrigatório';END IF;RETURN '${A}';END $$;
 CREATE FUNCTION fn_campus_dado_pessoal_permitido(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT p=nullif(current_setting('test.campus',true),'')::uuid$$;
 INSERT INTO notificacoes(usuario_id,modulo) VALUES('${A}','kids'),('${A}','rh'),('${B}','rh');
 ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;CREATE POLICY own_select ON notificacoes FOR SELECT TO authenticated USING(usuario_id=nullif(current_setting('test.user',true),'')::uuid);
 CREATE POLICY own_update ON notificacoes FOR UPDATE TO authenticated USING(usuario_id=nullif(current_setting('test.user',true),'')::uuid);
 GRANT SELECT,UPDATE ON notificacoes TO authenticated;`);
 await db.exec(readFileSync('supabase/migrations/20260927170000_multicampus_notificacoes.sql','utf8'));},30000);
 afterAll(async()=>{await db.close();});
 it('backfill central explícito e campus histórico sem vazar outro destinatário',async()=>{
  await db.exec(`SET ROLE authenticated;SET "test.user"='${A}';SET "test.campus"='${B}'`);
  try {expect((await db.query('SELECT modulo,escopo_campus,igreja_id FROM notificacoes')).rows).toEqual([{modulo:'rh',escopo_campus:'central',igreja_id:null}]);}
  finally {await db.exec('RESET ROLE');}
 });
 it('rejeita produtor sem origem fora de preparação e não altera origem histórica',async()=>{
  await db.exec('SET "test.ativo"=true');
  await expect(db.exec("INSERT INTO notificacoes(modulo) VALUES('kids')")).rejects.toThrow('explícito');
  await expect(db.exec(`UPDATE notificacoes SET igreja_id='${B}' WHERE modulo='kids'`)).rejects.toThrow('origem');
  await db.exec("INSERT INTO notificacoes(modulo) VALUES('financeiro')");
 });
 it('usuário só marca lida a notificação própria acessível',async()=>{
  await db.exec(`SET ROLE authenticated;SET "test.user"='${A}';SET "test.campus"='${B}'`);
  try {expect((await db.query('UPDATE notificacoes SET lida=true RETURNING modulo')).rows).toEqual([{modulo:'rh'}]);}
  finally {await db.exec('RESET ROLE');}
 });
});
