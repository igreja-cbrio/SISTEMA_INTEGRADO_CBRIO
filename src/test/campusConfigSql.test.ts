// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
let db: PGlite;
const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function public.is_super_admin() returns boolean language sql as $$select false$$;
    create table igrejas(id uuid primary key,slug text,ativa boolean);
    create table profiles(id uuid primary key,is_diretoria_geral boolean,email text);
    create table app_super_admins(email text,ativo boolean);
    create table app_audit_log(table_name text,row_id text,action text,user_id uuid,user_email text,changes jsonb);
    create table usuario_igrejas(usuario_id uuid,igreja_id uuid,primary key(usuario_id,igreja_id));
    create table modulos(slug text,escopo_campus text,ativo boolean);
    insert into igrejas values('${a}','cbrio-sede',true),('${b}','campus-2',true);
    insert into profiles values('${a}',false,'admin@example.test'),('${b}',false,'usuario@example.test');
    insert into app_super_admins values('admin@example.test',true);
    insert into usuario_igrejas values('${a}','${a}');
    insert into modulos values('integracao','isolado',true),('rh','compartilhado',true),('inativo','compartilhado',false);`);
  await db.exec(readFileSync(resolve(__dirname,'../../supabase/migrations/20260926200000_multicampus_contexto_e_ativacao.sql'),'utf8'));
  await db.exec(`set test.uid='${a}'`);
},30000);
afterAll(async () => { await db.close(); });
describe.sequential('estado persistido de campus', () => {
  it('instala em preparação sem criar permissões novas', async () => {
    expect((await db.query('select estado,ja_ativado from app_campus_config')).rows).toEqual([{ estado: 'preparacao', ja_ativado: false }]);
    expect((await db.query('select count(*)::int n from usuario_igrejas')).rows[0]).toEqual({ n: 1 });
  });
  it('exige evidência de todas as frentes antes de ativar', async () => {
    await expect(db.exec("update app_campus_config set estado='ativo'")).rejects.toThrow('Existem frentes');
  });
  it('ensaio remove fallback e não permite voltar à preparação', async () => {
    await expect(db.exec("update app_campus_config set estado='ensaio'")).rejects.toThrow('Existem frentes');
    await db.exec("update app_campus_cobertura set api_validada=true,rls_validada=true,produtores_validados=true,regressao_validada=true,evidencia='Fixture sintética local validada'; update app_campus_config set estado='ensaio'");
    await expect(db.exec("update app_campus_config set estado='preparacao'")).rejects.toThrow('acesso legado');
    expect((await db.query('select fn_campus_permitido($1,$2) ok',[b,'integracao'])).rows[0]).toEqual({ ok: false });
    expect((await db.query('select fn_campus_permitido($1,$2) ok',[a,'integracao'])).rows[0]).toEqual({ ok: true });
    expect((await db.query('select fn_campus_permitido($1,$2) ok',[b,'rh'])).rows[0]).toEqual({ ok: true });
    expect((await db.query('select fn_campus_permitido($1,$2) ok',[a,'inativo'])).rows[0]).toEqual({ ok: false });
  });
  it('retira igreja inativa do acesso e não permite mudar o legado', async () => {
    await db.exec(`update igrejas set ativa=false where id='${a}'`);
    expect((await db.query('select current_user_igreja_ids() ids')).rows[0]).toEqual({ ids: [] });
    await expect(db.exec(`update app_campus_config set campus_legado_id='${b}'`)).rejects.toThrow('histórico');
  });
  it('altera vínculos atomicamente e registra auditoria sem depender do cliente', async () => {
    await db.exec(`update igrejas set ativa=true where id='${a}'`);
    await expect(db.query('select fn_campus_definir_acessos($1,$2,$3)',[b,[b],b])).rejects.toMatchObject({code:'P0403'});
    await db.query('select fn_campus_definir_acessos($1,$2,$3)',[b,[b],a]);
    expect((await db.query('select igreja_id from usuario_igrejas where usuario_id=$1',[b])).rows).toEqual([{igreja_id:b}]);
    await db.query('select fn_campus_definir_acessos($1,$2,$3)',[b,[],a]);
    expect((await db.query('select count(*)::int n from usuario_igrejas where usuario_id=$1',[b])).rows[0]).toEqual({n:0});
    expect((await db.query('select count(*)::int n from app_audit_log')).rows[0]).toEqual({n:2});
  });
  it('clientes não podem editar implantação ou apagar as evidências', async () => {
    const r = await db.query("select has_table_privilege('authenticated','app_campus_config','update') cliente, has_table_privilege('service_role','app_campus_cobertura','delete') apagar");
    expect(r.rows[0]).toEqual({ cliente: false, apagar: false });
    await expect(db.exec('delete from app_campus_config')).rejects.toThrow('removida');
  });
});
