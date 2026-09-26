// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const G1='10000000-0000-0000-0000-000000000001',G2='10000000-0000-0000-0000-000000000002';
const M='20000000-0000-0000-0000-000000000001';
const direct=['mem_grupo_link','mem_grupo_documentos','grupo_supervisao_visitas','grupo_supervisao_observacoes','mem_grupo_renovacoes','mem_grupo_conferencias','mem_grupo_agenda_excecoes','mem_grupo_encontros','mem_grupo_pedidos','mem_grupos_historico'];
const indirect=['mem_grupo_pedido_eventos','mem_grupo_encontro_presencas','mem_grupo_membros_historico'];
let db:PGlite;
async function user(campus=A,member:string|null=null){await db.exec(`SET LOCAL ROLE authenticated;SET LOCAL "test.campus"='${campus}';SET LOCAL "test.member"='${member||''}'`);}
async function ensaio(){await db.exec("UPDATE app_campus_config SET estado='ensaio',ja_ativado=true");}
describe('Grupos multicampus e matcher com origem explícita',()=>{
  beforeAll(async()=>{
    db=new PGlite();await db.exec(`
      CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE igrejas(id uuid PRIMARY KEY,ativa boolean,tipo text);
      INSERT INTO igrejas VALUES('${A}',true,'sede');
      CREATE TABLE app_campus_config(id boolean,estado text,ja_ativado boolean,campus_legado_id uuid);
      INSERT INTO app_campus_config VALUES(true,'preparacao',false,'${A}');
      CREATE TABLE app_campus_cobertura(frente text,rls_validada boolean,produtores_validados boolean,regressao_validada boolean);
      INSERT INTO app_campus_cobertura VALUES('grupos',false,false,false);
      CREATE FUNCTION current_user_membro_id() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.member',true),'')::uuid$$;
      CREATE FUNCTION fn_campus_dado_pessoal_permitido(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
        SELECT estado='preparacao' OR p_id::text=ANY(string_to_array(current_setting('test.campus',true),',')) FROM app_campus_config$$;
      CREATE FUNCTION fn_campus_legado_escrita() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$BEGIN
        IF EXISTS(SELECT 1 FROM app_campus_config WHERE estado='preparacao' AND NOT ja_ativado) THEN RETURN '${A}'::uuid;END IF;
        RAISE EXCEPTION 'Campus explícito obrigatório.';END $$;
      CREATE FUNCTION tg_campus_destino_explicito() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
        IF TG_OP='INSERT' AND NEW.igreja_id IS NULL THEN NEW.igreja_id:=fn_campus_legado_escrita();END IF;
        IF TG_OP='UPDATE' AND NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN RAISE EXCEPTION 'Campus histórico';END IF;RETURN NEW;END $$;
      CREATE TABLE mem_grupos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),igreja_id uuid);
      CREATE TABLE mem_membros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text,cpf text,email text,telefone text,status text,
        active boolean DEFAULT true,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz,igreja_id uuid);
      CREATE TABLE mem_historico(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid,tipo text,descricao text,created_at timestamptz,igreja_id uuid);
      CREATE TABLE mem_grupo_membros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),grupo_id uuid NOT NULL REFERENCES mem_grupos(id),membro_id uuid,igreja_id uuid DEFAULT '${A}');
      CREATE TABLE mem_cadastros_pendentes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid);
      CREATE TABLE mem_grupo_transferencias(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),grupo_origem_id uuid,grupo_destino_id uuid);
      CREATE FUNCTION fn_identidade_nomes_compativeis(a text,b text) RETURNS boolean LANGUAGE sql AS $$SELECT lower(a)=lower(b)$$;
      CREATE FUNCTION fn_registrar_contato(a uuid,b text,c text,d text) RETURNS void LANGUAGE sql AS $$SELECT$$;
      GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    `);
    for(const t of direct)await db.exec(`CREATE TABLE ${t}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),grupo_id uuid NOT NULL REFERENCES mem_grupos(id),membro_id uuid,lider_membro_id uuid)`);
    await db.exec(`CREATE TABLE mem_grupo_pedido_eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pedido_id uuid REFERENCES mem_grupo_pedidos(id));
      CREATE TABLE mem_grupo_encontro_presencas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),encontro_id uuid REFERENCES mem_grupo_encontros(id),membro_id uuid);
      CREATE TABLE mem_grupo_membros_historico(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),participacao_id uuid);`);
    for(const t of [...direct,...indirect,'mem_grupos','mem_grupo_membros','mem_cadastros_pendentes','mem_grupo_transferencias'])await db.exec(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY original ON ${t} FOR ALL TO authenticated USING(true) WITH CHECK(true);
      GRANT SELECT,INSERT,UPDATE ON ${t} TO authenticated,service_role;`);
    await db.exec(readFileSync('supabase/migrations/20260927010000_multicampus_grupos.sql','utf8'));
    await db.exec(`INSERT INTO igrejas VALUES('${B}',true,'sede');
      INSERT INTO mem_grupos VALUES('${G1}','${A}'),('${G2}','${B}');
      INSERT INTO mem_membros(id,nome,cpf,igreja_id) VALUES('${M}','Pessoa global','11111111111','${A}');
      INSERT INTO mem_grupo_membros(id,grupo_id,membro_id) VALUES('${G1}','${G1}','${M}'),('${G2}','${G2}','${M}');`);
    for(const t of direct)await db.exec(`INSERT INTO ${t}(id,grupo_id) VALUES('${G1}','${G1}'),('${G2}','${G2}')`);
    await db.exec(`INSERT INTO mem_grupo_pedido_eventos(pedido_id) VALUES('${G1}'),('${G2}');
      INSERT INTO mem_grupo_encontro_presencas(encontro_id,membro_id) VALUES('${G1}','${M}'),('${G2}','${M}');
      INSERT INTO mem_grupo_membros_historico(participacao_id) VALUES('${G1}'),('${G2}');
      INSERT INTO mem_grupo_transferencias(grupo_origem_id,grupo_destino_id) VALUES('${G1}','${G2}');`);
  },30000);
  beforeEach(async()=>{await db.exec('BEGIN');});afterEach(async()=>{await db.exec('ROLLBACK');});afterAll(async()=>{await db.close();});
  it('filhos e históricos respeitam o campus do grupo',async()=>{
    await ensaio();await user();
    for(const t of [...direct,...indirect])expect((await db.query(`SELECT * FROM ${t}`)).rows).toHaveLength(1);
  });
  it('participante mantém identidade global e pode ter vínculos em dois campi',async()=>{
    expect((await db.query('SELECT membro_id,igreja_id FROM mem_grupo_membros ORDER BY igreja_id')).rows).toEqual([{membro_id:M,igreja_id:A},{membro_id:M,igreja_id:B}]);
    expect((await db.query('SELECT igreja_id FROM mem_membros WHERE id=$1',[M])).rows).toEqual([{igreja_id:A}]);
  });
  it('membro vê os próprios vínculos, sem obter escrita em campus alheio',async()=>{
    await ensaio();await user(A,M);
    expect((await db.query('SELECT id FROM mem_grupo_membros')).rows).toHaveLength(2);
    expect((await db.query('UPDATE mem_grupo_membros SET membro_id=$1 WHERE id=$2 RETURNING id',[M,G2])).rows).toHaveLength(0);
  });
  it('vínculo com campus explícito divergente é recusado',async()=>{
    await expect(db.query('INSERT INTO mem_grupo_membros(grupo_id,igreja_id) VALUES($1,$2)',[G2,A])).rejects.toThrow('diverge');
  });
  it('não transfere campus histórico de grupo',async()=>{
    await expect(db.query('UPDATE mem_grupos SET igreja_id=$1 WHERE id=$2',[B,G1])).rejects.toThrow('histórico');
  });
  it('não move vínculo para outro campus sobrescrevendo a história',async()=>{
    await expect(db.query('UPDATE mem_grupo_membros SET grupo_id=$1,igreja_id=$2 WHERE id=$3',[G2,B,G1])).rejects.toThrow('novo vínculo');
  });
  it('cadastro pendente sem origem explícita falha após ensaio',async()=>{
    await ensaio();await expect(db.exec('INSERT INTO mem_cadastros_pendentes DEFAULT VALUES')).rejects.toThrow('Campus explícito');
  });
  it('transferência exige acesso a origem e destino',async()=>{
    await ensaio();await user();expect((await db.query('SELECT id FROM mem_grupo_transferencias')).rows).toHaveLength(0);
    await db.exec(`SET LOCAL "test.campus"='${A},${B}'`);expect((await db.query('SELECT id FROM mem_grupo_transferencias')).rows).toHaveLength(1);
  });
  it('matcher explícito carimba pessoa nova e histórico pelo ato, nunca pelo membro anterior',async()=>{
    await ensaio();
    const novo=await db.query<{id:string}>("SELECT fn_link_or_create_membro(NULL,NULL,NULL,'Pessoa nova','visitante','teste',$1) AS id",[B]);
    expect((await db.query('SELECT igreja_id FROM mem_membros WHERE id=$1',[novo.rows[0].id])).rows).toEqual([{igreja_id:B}]);
    expect((await db.query('SELECT igreja_id FROM mem_historico WHERE membro_id=$1',[novo.rows[0].id])).rows).toEqual([{igreja_id:B}]);
    expect((await db.query('SELECT fn_link_or_create_membro($1,NULL,NULL,$2,$3,$4,$5) AS id',['11111111111','Pessoa global','visitante','teste',B])).rows).toEqual([{id:M}]);
    expect((await db.query('SELECT igreja_id FROM mem_membros WHERE id=$1',[M])).rows).toEqual([{igreja_id:A}]);
  });
  it('assinatura antiga do matcher continua em preparação e falha após ensaio',async()=>{
    expect((await db.query("SELECT fn_link_or_create_membro(NULL,NULL,NULL,'Legado') AS id")).rows).toHaveLength(1);
    await ensaio();await expect(db.query("SELECT fn_link_or_create_membro(NULL,NULL,NULL,'Sem origem')")).rejects.toThrow('Campus explícito');
  });
  it('assinatura antiga mantém execução authenticated em preparação sem liberar overload',async()=>{
    await db.exec('GRANT SELECT ON igrejas TO authenticated; GRANT SELECT,INSERT ON mem_membros,mem_historico TO authenticated');
    await user();
    const { rows } = await db.query<{id:string}>("SELECT fn_link_or_create_membro(NULL,NULL,NULL,'Legado autenticado') AS id");
    expect(rows[0].id).toBeTruthy();
  });
  it('matcher explícito não é exposto às roles públicas',async()=>{
    expect((await db.query("SELECT has_function_privilege('authenticated','fn_link_or_create_membro(text,text,text,text,text,text,uuid)','EXECUTE') AS permitido")).rows).toEqual([{permitido:false}]);
  });
});
