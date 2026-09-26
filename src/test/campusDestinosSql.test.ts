// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const A='00000000-0000-0000-0000-000000000001';
const B='00000000-0000-0000-0000-000000000002';
const U1='10000000-0000-0000-0000-000000000001';
const U2='10000000-0000-0000-0000-000000000002';
const M1='20000000-0000-0000-0000-000000000001';
const M2='20000000-0000-0000-0000-000000000002';
const M3='20000000-0000-0000-0000-000000000003';
const tables=['mem_membros','cui_convertidos','nsm_eventos','mem_trilha_valores'];
const migration=readFileSync('supabase/migrations/20260926220000_multicampus_destinos_decisao.sql','utf8');
let db: PGlite;
async function usuario(id: string) { await db.exec(`SET LOCAL ROLE authenticated; SET LOCAL "test.user"='${id}'`); }
async function ensaio() { await db.exec("UPDATE app_campus_config SET estado='ensaio',ja_ativado=true"); }

describe('destinos nominais: restrição de campus e leitura própria',()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
      CREATE TABLE igrejas(id uuid PRIMARY KEY,slug text,tipo text,ativa boolean);
      INSERT INTO igrejas VALUES('${A}','cbrio-sede','sede',true);
      CREATE TABLE app_campus_config(id boolean PRIMARY KEY,estado text,ja_ativado boolean,campus_legado_id uuid);
      INSERT INTO app_campus_config VALUES(true,'preparacao',false,'${A}');
      CREATE TABLE app_campus_cobertura(frente text,rls_validada boolean,regressao_validada boolean);
      INSERT INTO app_campus_cobertura VALUES('pessoas',false,false),('cuidados',false,false),('indicadores',false,false);
      CREATE TABLE usuario_igrejas(usuario_id uuid,igreja_id uuid);
      INSERT INTO usuario_igrejas VALUES('${U1}','${A}'),('${U2}','${B}');
      CREATE TABLE profiles(id uuid PRIMARY KEY,membro_id uuid);
      INSERT INTO profiles VALUES('${U1}','${M2}'),('${U2}','${M3}');
      CREATE TABLE modulos(slug text,escopo_campus text);
      INSERT INTO modulos VALUES('membresia','compartilhado'),('cuidados','compartilhado');
      CREATE FUNCTION current_user_igreja_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth
        AS $$ SELECT array(SELECT igreja_id FROM usuario_igrejas WHERE usuario_id=auth.uid()) $$;
      CREATE FUNCTION current_user_membro_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth
        AS $$ SELECT membro_id FROM profiles WHERE id=auth.uid() $$;
      CREATE FUNCTION fn_campus_legado_escrita() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
        DECLARE v uuid; BEGIN SELECT campus_legado_id INTO v FROM app_campus_config WHERE estado='preparacao' AND NOT ja_ativado;
        IF v IS NULL THEN RAISE EXCEPTION 'Campus explícito obrigatório.'; END IF; RETURN v; END $$;
      CREATE TABLE mem_membros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text,cpf text,igreja_id uuid DEFAULT '${A}');
      CREATE TABLE cultos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),igreja_id uuid,data date);
      CREATE TABLE cui_convertidos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid,nome text,igreja_id uuid DEFAULT '${A}',culto_id uuid);
      CREATE TABLE mem_trilha_valores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid,etapa text,
        concluida boolean,data_conclusao date,observacoes text,deleted_at timestamptz);
      CREATE TABLE nsm_eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid,visitante_id uuid,cpf text,nome text,
        igreja_id uuid,data_decisao date,valor_engajado text,data_engajamento date,origem text,origem_id uuid,observacao text);
      CREATE UNIQUE INDEX nsm_pessoa_valor ON nsm_eventos((coalesce(membro_id::text,visitante_id::text,cpf)),valor_engajado);
      CREATE TABLE cultos_decisoes_pessoas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid,igreja_id uuid,culto_id uuid,
        nome text,cpf text,tipo_decisao text DEFAULT 'presencial');
      INSERT INTO mem_membros(id,nome,cpf) VALUES('${M1}','Pessoa A','11111111111'),('${M2}','Pessoa própria','22222222222'),('${M3}','Pessoa B','33333333333');
      INSERT INTO mem_trilha_valores(membro_id,etapa) VALUES('${M1}','conversao');
    `);
    for(const table of tables) await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY permissao_original ON ${table} FOR ALL TO authenticated USING(true) WITH CHECK(true);
      GRANT SELECT,INSERT,UPDATE ON ${table} TO authenticated,service_role;`);
    await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role');
    await db.exec(migration);
    await db.exec(`INSERT INTO igrejas VALUES('${B}','campus-b','sede',true);
      UPDATE mem_membros SET igreja_id='${B}' WHERE id IN ('${M2}','${M3}');
      INSERT INTO cui_convertidos(membro_id,nome,igreja_id) SELECT id,nome,igreja_id FROM mem_membros;
      INSERT INTO nsm_eventos(membro_id,nome,igreja_id,valor_engajado) SELECT id,nome,igreja_id,'seguir' FROM mem_membros;
      INSERT INTO mem_trilha_valores(membro_id,etapa,igreja_id) SELECT id,'conversao',igreja_id FROM mem_membros WHERE id<>'${M1}';
      CREATE TRIGGER cultos_dec_pessoas_jornada AFTER INSERT ON cultos_decisoes_pessoas
        FOR EACH ROW EXECUTE FUNCTION tg_cultos_dec_pessoas_jornada();
    `);
  },30000);
  beforeEach(async()=>{await db.exec('BEGIN');});
  afterEach(async()=>{await db.exec('ROLLBACK');});
  afterAll(async()=>{await db.close();});

  it('usuário A vê seu campus e sua própria identidade/atos em B, nunca terceiros de B',async()=>{
    await ensaio();await usuario(U1);
    for(const table of tables){
      const column=table==='mem_membros'?'id':'membro_id';
      expect((await db.query<{pessoa:string}>(`SELECT ${column} AS pessoa FROM ${table} ORDER BY ${column}`)).rows.map(r=>r.pessoa)).toEqual([M1,M2]);
    }
  });
  it('usuário B vê apenas B, apesar de módulo compartilhado e policies permissivas',async()=>{
    await ensaio();await usuario(U2);
    for(const table of tables) expect((await db.query<{igreja_id:string}>(`SELECT igreja_id FROM ${table}`)).rows.map(r=>r.igreja_id)).toEqual([B,B]);
  });
  it('sem vínculo de campus resta somente a leitura própria',async()=>{
    await db.exec(`DELETE FROM usuario_igrejas WHERE usuario_id='${U1}'`);
    await ensaio();await usuario(U1);
    expect((await db.query('SELECT id FROM mem_membros')).rows).toEqual([{id:M2}]);
  });
  it('exceção de leitura própria não permite atualizar ficha em campus não autorizado',async()=>{
    await ensaio();await usuario(U1);
    expect((await db.query('UPDATE mem_membros SET nome=$1 WHERE id=$2 RETURNING id',['Não deve mudar',M2])).rows).toEqual([]);
  });
  it('restringe INSERT explícito em campus alheio',async()=>{
    await ensaio();await usuario(U1);
    await expect(db.query('INSERT INTO mem_membros(nome,igreja_id) VALUES($1,$2)',['Terceiro',B])).rejects.toThrow('row-level security');
  });
  for(const table of tables) it(`${table}: DEFAULT legado não carimba Sede após ensaio`,async()=>{
    await ensaio();
    await expect(db.exec(`INSERT INTO ${table} DEFAULT VALUES`)).rejects.toThrow('Campus explícito obrigatório');
  });
  it('NULL explícito também não contorna o contrato de campus',async()=>{
    await ensaio();await usuario(U1);
    await expect(db.exec("INSERT INTO mem_membros(nome,igreja_id) VALUES('Sem origem',NULL)")).rejects.toThrow('Campus explícito obrigatório');
  });
  it('policy restritiva não concede leitura quando permissão original é removida',async()=>{
    await db.exec('DROP POLICY permissao_original ON mem_membros');
    await ensaio();await usuario(U1);
    expect((await db.query('SELECT id FROM mem_membros')).rows).toEqual([]);
  });
  it('identidade global continua pesquisável pelo serviço sem expô-la ao usuário de outro campus',async()=>{
    await ensaio();await usuario(U1);
    expect((await db.query('SELECT id FROM mem_membros WHERE cpf=$1',['33333333333'])).rows).toEqual([]);
    await db.exec('RESET ROLE; SET LOCAL ROLE service_role');
    expect((await db.query('SELECT id FROM mem_membros WHERE cpf=$1',['33333333333'])).rows).toEqual([{id:M3}]);
  });
  it('mudança de campus-base da pessoa não move os atos históricos',async()=>{
    await db.query('UPDATE mem_membros SET igreja_id=$1 WHERE id=$2',[B,M1]);
    for(const table of tables.filter(t=>t!=='mem_membros')) expect((await db.query(`SELECT igreja_id FROM ${table} WHERE membro_id=$1`,[M1])).rows).toEqual([{igreja_id:A}]);
  });
  it('decisão em B cria trilha de B sem duplicar a etapa global já existente',async()=>{
    const novo='20000000-0000-0000-0000-000000000004';
    await db.query('INSERT INTO mem_membros(id,nome,igreja_id) VALUES($1,$2,$3)',[novo,'Novo',B]);
    await db.query('INSERT INTO cultos_decisoes_pessoas(membro_id,nome,igreja_id) VALUES($1,$2,$3),($4,$5,$3)',[novo,'Novo',B,M1,'Pessoa A']);
    expect((await db.query('SELECT igreja_id FROM mem_trilha_valores WHERE membro_id=$1',[novo])).rows).toEqual([{igreja_id:B}]);
    expect((await db.query('SELECT igreja_id FROM mem_trilha_valores WHERE membro_id=$1',[M1])).rows).toEqual([{igreja_id:A}]);
  });
  it('recusa campus divergente do culto ao gravar convertido',async()=>{
    const c=await db.query<{id:string}>('INSERT INTO cultos(igreja_id) VALUES($1) RETURNING id',[B]);
    await expect(db.query('INSERT INTO cui_convertidos(culto_id,igreja_id) VALUES($1,$2)',[c.rows[0].id,A])).rejects.toThrow('diverge');
  });
  it('não marca as frentes como concluídas',async()=>{
    expect((await db.query<{rls_validada:boolean}>('SELECT rls_validada FROM app_campus_cobertura')).rows.every(r=>!r.rls_validada)).toBe(true);
  });
});
