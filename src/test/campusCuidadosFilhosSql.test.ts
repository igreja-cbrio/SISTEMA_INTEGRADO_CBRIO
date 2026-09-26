// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
const M1='10000000-0000-0000-0000-000000000001', M2='10000000-0000-0000-0000-000000000002';
const migration=readFileSync('supabase/migrations/20260926230000_multicampus_cuidados_filhos.sql','utf8');
const roots=['cui_pedidos','cui_visitas','cui_j180_turmas','mem_historico','cui_acompanhamentos','cui_jornada180'];
const children=['mem_contatos','cui_primeiro_contato_fila','cui_batismo_next_fila','cui_j180_turma_membros','cui_j180_encontros','cui_atendimento_comentarios','cui_j180_encontro_presencas'];
let db:PGlite;
async function user(campus=A,member:string|null=null){await db.exec(`SET LOCAL ROLE authenticated; SET LOCAL "test.campus"='${campus}'; SET LOCAL "test.member"='${member||''}';`);}
async function prepare(){await db.exec("UPDATE app_campus_config SET estado='ensaio',ja_ativado=true");}
describe('Cuidados: campus herdado dos vínculos reais',()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE igrejas(id uuid PRIMARY KEY,ativa boolean,tipo text);
      INSERT INTO igrejas VALUES('${A}',true,'sede');
      CREATE TABLE app_campus_config(id boolean,estado text,ja_ativado boolean,campus_legado_id uuid);
      INSERT INTO app_campus_config VALUES(true,'preparacao',false,'${A}');
      CREATE TABLE app_campus_cobertura(frente text,rls_validada boolean,regressao_validada boolean);
      INSERT INTO app_campus_cobertura VALUES('pessoas',false,false),('cuidados',false,false);
      CREATE FUNCTION current_user_membro_id() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.member',true),'')::uuid$$;
      CREATE FUNCTION fn_campus_dado_pessoal_permitido(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
        SELECT estado='preparacao' OR p_id=nullif(current_setting('test.campus',true),'')::uuid FROM app_campus_config$$;
      CREATE FUNCTION fn_campus_legado_escrita() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
        BEGIN IF EXISTS(SELECT 1 FROM app_campus_config WHERE estado='preparacao' AND NOT ja_ativado) THEN RETURN '${A}'::uuid; END IF;
        RAISE EXCEPTION 'Campus explícito obrigatório.'; END $$;
      CREATE FUNCTION tg_campus_destino_explicito() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF TG_OP='INSERT' AND NEW.igreja_id IS NULL THEN NEW.igreja_id:=fn_campus_legado_escrita(); END IF;
        IF TG_OP='UPDATE' AND NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN RAISE EXCEPTION 'Campus histórico'; END IF;
        RETURN NEW; END $$;
      CREATE TABLE mem_membros(id uuid PRIMARY KEY,igreja_id uuid);
      CREATE TABLE cui_convertidos(id uuid PRIMARY KEY,membro_id uuid,igreja_id uuid);
      CREATE TABLE cui_acompanhamentos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid,igreja_id uuid);
      CREATE TABLE cui_jornada180(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid,igreja_id uuid);
      CREATE TABLE cui_pedidos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid);
      CREATE TABLE cui_visitas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid);
      CREATE TABLE mem_historico(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid);
      CREATE TABLE cui_j180_turmas(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE mem_contatos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),membro_id uuid REFERENCES mem_membros(id),valor text);
      CREATE TABLE cui_primeiro_contato_fila(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),convertido_id uuid REFERENCES cui_convertidos(id));
      CREATE TABLE cui_batismo_next_fila(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),convertido_id uuid REFERENCES cui_convertidos(id));
      CREATE TABLE cui_j180_turma_membros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),turma_id uuid REFERENCES cui_j180_turmas(id),membro_id uuid);
      CREATE TABLE cui_j180_encontros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),turma_id uuid REFERENCES cui_j180_turmas(id));
      CREATE TABLE cui_atendimento_comentarios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ref_tipo text,ref_id uuid);
      CREATE TABLE cui_j180_encontro_presencas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),encontro_id uuid REFERENCES cui_j180_encontros(id),
        turma_membro_id uuid REFERENCES cui_j180_turma_membros(id),UNIQUE(encontro_id,turma_membro_id));
      GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    `);
    for(const t of [...roots,...children])await db.exec(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY original ON ${t} FOR ALL TO authenticated USING(true) WITH CHECK(true);
      GRANT SELECT,INSERT,UPDATE ON ${t} TO authenticated,service_role;`);
    await db.exec(migration);
    await db.exec(`INSERT INTO igrejas VALUES('${B}',true,'sede');
      INSERT INTO mem_membros VALUES('${M1}','${A}'),('${M2}','${B}');
      INSERT INTO cui_convertidos VALUES('${M1}','${M1}','${A}'),('${M2}','${M2}','${B}');`);
    for(const t of roots)await db.exec(`INSERT INTO ${t}(id,igreja_id) VALUES('${M1}','${A}'),('${M2}','${B}')`);
    await db.exec(`INSERT INTO mem_contatos(membro_id,valor) VALUES('${M1}','sintético-a'),('${M2}','sintético-b');
      INSERT INTO cui_primeiro_contato_fila(convertido_id) VALUES('${M1}'),('${M2}');
      INSERT INTO cui_batismo_next_fila(convertido_id) VALUES('${M1}'),('${M2}');
      INSERT INTO cui_j180_turma_membros(id,turma_id,membro_id) VALUES('${M1}','${M1}','${M1}'),('${M2}','${M2}','${M2}');
      INSERT INTO cui_j180_encontros(id,turma_id) VALUES('${M1}','${M1}'),('${M2}','${M2}');
      INSERT INTO cui_j180_encontro_presencas(encontro_id,turma_membro_id) VALUES('${M1}','${M1}'),('${M2}','${M2}');
      INSERT INTO cui_atendimento_comentarios(ref_tipo,ref_id) VALUES('visita','${M1}'),('visita','${M2}'),('acompanhamento','${M1}'),('acompanhamento','${M2}');`);
  },30000);
  beforeEach(async()=>{await db.exec('BEGIN');});
  afterEach(async()=>{await db.exec('ROLLBACK');});
  afterAll(async()=>{await db.close();});
  it('raízes não vazam para o outro campus apesar da policy original permissiva',async()=>{
    await prepare();await user();
    for(const t of roots)expect((await db.query(`SELECT igreja_id FROM ${t}`)).rows).toEqual([{igreja_id:A}]);
  });
  it('filas e filhos de turma herdam o campus do pai, comentários resolvem cada tipo real',async()=>{
    await prepare();await user();
    for(const t of children.filter(t=>t!=='cui_atendimento_comentarios'))expect((await db.query(`SELECT id FROM ${t}`)).rows).toHaveLength(1);
    expect((await db.query('SELECT ref_id FROM cui_atendimento_comentarios')).rows).toEqual([{ref_id:M1},{ref_id:M1}]);
  });
  it('usuário do segundo campus vê seus filhos sem dados do primeiro',async()=>{
    await prepare();await user(B);
    expect((await db.query('SELECT convertido_id FROM cui_primeiro_contato_fila')).rows).toEqual([{convertido_id:M2}]);
    expect((await db.query('SELECT encontro_id FROM cui_j180_encontro_presencas')).rows).toEqual([{encontro_id:M2}]);
  });
  it('ownmember conserva leitura de contatos e presença própria, sem liberar escrita',async()=>{
    await prepare();await user(A,M2);
    expect((await db.query('SELECT membro_id FROM mem_contatos ORDER BY membro_id')).rows).toEqual([{membro_id:M1},{membro_id:M2}]);
    expect((await db.query('SELECT encontro_id FROM cui_j180_encontro_presencas ORDER BY encontro_id')).rows).toEqual([{encontro_id:M1},{encontro_id:M2}]);
    expect((await db.query("UPDATE mem_contatos SET valor='bloqueado' WHERE membro_id=$1 RETURNING id",[M2])).rows).toEqual([]);
  });
  it('não permite inserir comentário em pai alheio',async()=>{
    await prepare();await user();
    await expect(db.query("INSERT INTO cui_atendimento_comentarios(ref_tipo,ref_id) VALUES('visita',$1)",[M2])).rejects.toThrow('row-level security');
  });
  it('tipos arbitrários e referências órfãs falham fechado',async()=>{
    await prepare();await user();
    expect((await db.query('SELECT fn_campus_cuidados_ref_permitido($1,$2,true) AS ok',['profiles',M1])).rows).toEqual([{ok:false}]);
    expect((await db.query("SELECT fn_campus_cuidados_ref_permitido('visita','90000000-0000-0000-0000-000000000009',true) AS ok")).rows).toEqual([{ok:false}]);
  });
  it('presença não mistura participante e encontro de turmas diferentes',async()=>{
    await expect(db.query('INSERT INTO cui_j180_encontro_presencas(encontro_id,turma_membro_id) VALUES($1,$2)',[M1,M2])).rejects.toThrow('mesma turma');
  });
  it('mesmo campus não autoriza misturar duas turmas distintas',async()=>{
    const outro='90000000-0000-0000-0000-000000000009';
    await db.query('INSERT INTO cui_j180_turmas(id,igreja_id) VALUES($1,$2)',[outro,A]);
    await db.query('INSERT INTO cui_j180_turma_membros(id,turma_id) VALUES($1,$1)',[outro]);
    await expect(db.query('INSERT INTO cui_j180_encontro_presencas(encontro_id,turma_membro_id) VALUES($1,$2)',[M1,outro])).rejects.toThrow('mesma turma');
  });
  for(const t of roots)it(`${t}: exige origem explícita após preparação`,async()=>{
    await prepare();await expect(db.exec(`INSERT INTO ${t} DEFAULT VALUES`)).rejects.toThrow('Campus explícito obrigatório');
  });
  it('serviço segue acessando contatos globais para o matcher',async()=>{
    await prepare();await db.exec('SET LOCAL ROLE service_role');
    expect((await db.query('SELECT membro_id FROM mem_contatos ORDER BY membro_id')).rows).toEqual([{membro_id:M1},{membro_id:M2}]);
  });
  it('não concede acesso onde a policy original não permitia',async()=>{
    await db.exec('DROP POLICY original ON mem_contatos');await prepare();await user(A,M1);
    expect((await db.query('SELECT id FROM mem_contatos')).rows).toEqual([]);
  });
});
