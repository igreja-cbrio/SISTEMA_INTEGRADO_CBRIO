// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
let db:PGlite;
async function reject(sql:string, pattern:RegExp) {
 await db.exec('SAVEPOINT attempt'); await expect(db.exec(sql)).rejects.toThrow(pattern); await db.exec('ROLLBACK TO SAVEPOINT attempt');
}
describe('Batismo: preparação aditiva e cutover controlado',()=>{
 beforeAll(async()=>{
  db=new PGlite(); await db.exec(`
   CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE TABLE igrejas(id uuid PRIMARY KEY,tipo text,ativa boolean); INSERT INTO igrejas VALUES('${A}','sede',true);
   CREATE TABLE app_campus_config(id boolean,estado text,campus_legado_id uuid,ja_ativado boolean);
   INSERT INTO app_campus_config VALUES(true,'preparacao','${A}',false);
   CREATE TABLE app_campus_cobertura(frente text,api_validada boolean,rls_validada boolean,produtores_validados boolean,regressao_validada boolean,evidencia text);
   INSERT INTO app_campus_cobertura VALUES('batismo',true,true,true,true,'anterior');
   CREATE FUNCTION fn_campus_legado_escrita() RETURNS uuid LANGUAGE plpgsql STABLE AS $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM app_campus_config WHERE estado='preparacao' AND NOT ja_ativado) THEN RAISE EXCEPTION 'Campus explícito obrigatório.'; END IF; RETURN '${A}'; END $$;
   CREATE FUNCTION fn_campus_dado_pessoal_permitido(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p=nullif(current_setting('test.campus',true),'')::uuid $$;
   CREATE FUNCTION current_user_membro_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.membro',true),'')::uuid $$;
   CREATE TABLE batismo_eventos(data date PRIMARY KEY,aberto boolean NOT NULL DEFAULT true);
   CREATE TABLE batismo_horarios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),horario text NOT NULL,aberto boolean DEFAULT true,limite integer,deleted_at timestamptz);
   CREATE UNIQUE INDEX uq_batismo_horarios_horario ON batismo_horarios(horario) WHERE deleted_at IS NULL;
   CREATE TABLE batismo_inscricoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),igreja_id uuid REFERENCES igrejas(id),membro_id uuid,data_batismo date,horario_culto text,status text,deleted_at timestamptz);
   INSERT INTO batismo_eventos(data) VALUES('2099-09-20'); INSERT INTO batismo_horarios(horario,limite) VALUES('10:00',2);
   INSERT INTO batismo_inscricoes(data_batismo,horario_culto,status) VALUES('2099-09-20','10:00','pendente');
   GRANT USAGE ON SCHEMA public TO authenticated,service_role;
   GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
   CREATE POLICY baseline ON batismo_inscricoes FOR ALL TO authenticated USING(true) WITH CHECK(true);
  `); await db.exec(readFileSync('supabase/migrations/20260927050000_multicampus_batismo.sql','utf8'));
  await db.exec(`INSERT INTO igrejas VALUES('${B}','sede',true); ALTER TABLE batismo_inscricoes ADD COLUMN nome text, ADD COLUMN sobrenome text, ADD COLUMN cpf text, ADD COLUMN telefone text, ADD COLUMN email text, ADD COLUMN data_nascimento date, ADD COLUMN origem text, ADD COLUMN area_kpi text, ADD COLUMN tamanho_camisa text, ADD COLUMN eh_crianca boolean, ADD COLUMN possui_deficiencia boolean, ADD COLUMN deficiencia_descricao text, ADD COLUMN endereco text, ADD COLUMN cep text, ADD COLUMN sexo text, ADD COLUMN fez_next boolean, ADD COLUMN observacoes text, ADD COLUMN updated_at timestamptz, ADD COLUMN inscrito_por uuid;`);
  await db.exec(readFileSync('supabase/migrations/20260927070000_multicampus_batismo_reserva.sql','utf8'));
  await db.exec(`CREATE FUNCTION app_soft_deletable_tables() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['outra_tabela']::text[] $$;
    CREATE FUNCTION app_soft_delete(t text,i text,u uuid) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN
      IF NOT t=ANY(app_soft_deletable_tables()) THEN RAISE EXCEPTION 'Tabela não permitida'; END IF;
      EXECUTE format('UPDATE %I SET deleted_at=now() WHERE id=$1::uuid',t) USING i; RETURN true; END $$;`);
  await db.exec(readFileSync('supabase/migrations/20260927110000_multicampus_batismo_admin.sql','utf8'));
 },30000);
 beforeEach(async()=>{await db.exec('BEGIN');}); afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE');}); afterAll(async()=>{await db.close();});
 it('preserva PK data e campos legados enquanto vincula o histórico',async()=>{
  expect((await db.query<{igreja_id:string;evento_id:string;horario_id:string}>('SELECT * FROM batismo_inscricoes')).rows[0]).toMatchObject({igreja_id:A,evento_id:expect.any(String),horario_id:expect.any(String)});
  expect((await db.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='batismo_eventos'::regclass AND contype='p'")).rows).toEqual([{def:'PRIMARY KEY (data)'}]);
  await reject(`INSERT INTO batismo_eventos(data,igreja_id) VALUES('2099-09-20','${B}')`,/duplicate key/);
 });
 it('herda campus do evento sem default legado e rejeita horário alheio',async()=>{
  const id=(await db.query<{id:string}>(`INSERT INTO batismo_eventos(data,igreja_id) VALUES('2099-10-20','${B}') RETURNING id`)).rows[0].id;
  expect((await db.query<{igreja_id:string}>(`INSERT INTO batismo_inscricoes(evento_id) VALUES('${id}') RETURNING igreja_id`)).rows[0].igreja_id).toBe(B);
  await reject(`INSERT INTO batismo_inscricoes(evento_id,horario_culto) VALUES('${id}','10:00')`,/Horário não cadastrado/);
 });
 it('recusa campus ausente fora da preparação e mudança de campus histórico',async()=>{
  await db.exec("UPDATE app_campus_config SET estado='ensaio'");
  await reject("INSERT INTO batismo_eventos(data) VALUES('2099-10-20')",/Campus explícito/);
  await reject(`UPDATE batismo_inscricoes SET igreja_id='${B}'`,/diverge do evento|histórico/);
 });
 it('sincroniza escrita legada e bloqueia datas fora do catálogo local',async()=>{
  await db.exec(`INSERT INTO batismo_eventos(data,igreja_id) VALUES('2099-10-20','${A}'); UPDATE batismo_inscricoes SET data_batismo='2099-10-20';`);
  expect((await db.query("SELECT e.data::text FROM batismo_inscricoes i JOIN batismo_eventos e ON e.id=i.evento_id")).rows).toEqual([{data:'2099-10-20'}]);
  await reject("UPDATE batismo_inscricoes SET data_batismo='2099-11-20'",/não cadastrada/);
 });
 it('RLS limita acesso a campus e conserva leitura própria',async()=>{
  await db.exec(`SELECT set_config('test.campus','${B}',true); SET ROLE authenticated`);
  expect((await db.query('SELECT * FROM batismo_inscricoes')).rows).toHaveLength(0);
  await db.exec(`RESET ROLE; UPDATE batismo_inscricoes SET membro_id='${A}'; SELECT set_config('test.membro','${A}',true); SET ROLE authenticated`);
  expect((await db.query('SELECT * FROM batismo_inscricoes')).rows).toHaveLength(1);
 });
 it('catálogo e ocupação exigem correspondência de campus e evento',async()=>{
  const id=(await db.query<{id:string}>('SELECT id FROM batismo_eventos')).rows[0].id;
  expect((await db.query(`SELECT * FROM fn_campus_batismo_ocupacao('${A}','${id}')`)).rows).toMatchObject([{horario:'10:00',ocupados:1}]);
  expect((await db.query(`SELECT * FROM fn_campus_batismo_ocupacao('${B}','${id}')`)).rows).toHaveLength(0);
 });
 it('reserva última vaga uma vez e permite editar sem contar a própria inscrição',async()=>{
  const e=(await db.query<{id:string}>('SELECT id FROM batismo_eventos')).rows[0].id;
  const h=(await db.query<{id:string}>('SELECT id FROM batismo_horarios')).rows[0].id;
  const call=`SELECT id FROM fn_campus_batismo_reservar('${A}','${e}','${h}','${A}',null,'Pessoa','Teste')`;
  await db.exec(call); await db.exec(call);
  expect((await db.query('SELECT * FROM batismo_inscricoes')).rows).toHaveLength(2);
  await db.exec(call.replace(")",",p_editar=>true)"));
  await reject(call.replace(`'${A}',null`, `'${B}',null`),/Não há vagas/);
 });
 it('rejeitado não ocupa vaga nem impede uma nova inscrição',async()=>{
  await db.exec("UPDATE batismo_inscricoes SET status='rejeitado'; UPDATE batismo_horarios SET limite=1");
  const e=(await db.query<{id:string}>('SELECT id FROM batismo_eventos')).rows[0].id;
  const h=(await db.query<{id:string}>('SELECT id FROM batismo_horarios')).rows[0].id;
  expect((await db.query(`SELECT ocupados FROM fn_campus_batismo_ocupacao('${A}','${e}')`)).rows).toEqual([{ocupados:0}]);
  await db.exec(`SELECT fn_campus_batismo_reservar('${A}','${e}','${h}','${A}',null,'Pessoa','Teste')`);
 });
 it('reserva recusa duplicação de membro e horário de outra unidade',async()=>{
  const e=(await db.query<{id:string}>('SELECT id FROM batismo_eventos')).rows[0].id;
  const h=(await db.query<{id:string}>('SELECT id FROM batismo_horarios')).rows[0].id;
  await db.exec(`SELECT fn_campus_batismo_reservar('${A}','${e}','${h}','${A}','${A}','Pessoa','Teste')`);
  await reject(`SELECT fn_campus_batismo_reservar('${A}','${e}','${h}','${B}','${A}','Pessoa','Teste')`,/já inscrita/);
  await reject(`SELECT fn_campus_batismo_reservar('${B}','${e}','${h}','${B}',null,'Pessoa','Teste')`,/Evento inexistente/);
 });
 it('edição de vaga existente tolera redução posterior de capacidade sem admitir nova reserva',async()=>{
  const e=(await db.query<{id:string}>('SELECT id FROM batismo_eventos')).rows[0].id;
  const h=(await db.query<{id:string}>('SELECT id FROM batismo_horarios')).rows[0].id;
  await db.exec(`SELECT fn_campus_batismo_reservar('${A}','${e}','${h}','${A}',null,'Pessoa','Teste'); UPDATE batismo_horarios SET limite=0;`);
  await db.exec(`SELECT fn_campus_batismo_reservar('${A}','${e}','${h}','${A}',null,'Pessoa','Teste',p_editar=>true,p_observacoes=>'Corrigida')`);
  await reject(`SELECT fn_campus_batismo_reservar('${A}','${e}','${h}','${B}',null,'Outra','Pessoa')`,/Não há vagas/);
 });
 it('status em lote rejeita ID alheio sem alterar nenhuma inscrição',async()=>{
  const id=(await db.query<{id:string}>('SELECT id FROM batismo_inscricoes')).rows[0].id;
  await reject(`SELECT fn_campus_batismo_status_lote('${A}',ARRAY['${id}','${B}']::uuid[],'cancelado')`,/neste campus/);
  expect((await db.query<{status:string}>('SELECT status FROM batismo_inscricoes')).rows[0].status).toBe('pendente');
 });
 it('reativação em lote respeita capacidade e reverte todo lote ao lotar',async()=>{
  const e=(await db.query<{id:string}>('SELECT id FROM batismo_eventos')).rows[0].id;
  const h=(await db.query<{id:string}>('SELECT id FROM batismo_horarios')).rows[0].id;
  await db.exec(`UPDATE batismo_horarios SET limite=1; UPDATE batismo_inscricoes SET status='cancelado';
   SELECT fn_campus_batismo_reservar('${A}','${e}','${h}','${A}',null,'Uma','Pessoa',p_status=>'cancelado');
   SELECT fn_campus_batismo_reservar('${A}','${e}','${h}','${B}',null,'Outra','Pessoa',p_status=>'cancelado');`);
  await reject(`SELECT fn_campus_batismo_status_lote('${A}',ARRAY['${A}','${B}']::uuid[],'confirmado')`,/Não há vagas/);
  expect((await db.query<{status:string}>('SELECT status FROM batismo_inscricoes')).rows.every(r=>r.status==='cancelado')).toBe(true);
 });
 it('exclusão lógica preserva whitelist e recusa horário com reservas',async()=>{
  const h=(await db.query<{id:string}>('SELECT id FROM batismo_horarios')).rows[0].id;
  expect((await db.query<{v:string[]}>('SELECT app_soft_deletable_tables() v')).rows[0].v).toEqual(['batismo_horarios','outra_tabela']);
  await reject(`SELECT fn_campus_batismo_excluir_horario('${A}','${h}','${A}')`,/Há inscrições/);
  await reject(`SELECT fn_campus_batismo_excluir_horario('${B}','${h}','${A}')`,/neste campus/);
  await db.exec(`UPDATE batismo_inscricoes SET status='cancelado'; SELECT fn_campus_batismo_excluir_horario('${A}','${h}','${A}')`);
  expect((await db.query<{deleted_at:string}>('SELECT deleted_at FROM batismo_horarios')).rows[0].deleted_at).toBeTruthy();
 });
 it('cutover só libera mesma data e horário após evidência específica',async()=>{
  const sql=readFileSync('backend/scripts/multicampus/cutover-batismo.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
  await reject(sql,/Cutover do batismo exige/);
  await db.exec("UPDATE app_campus_cobertura SET api_validada=true,rls_validada=true,produtores_validados=true,regressao_validada=true,evidencia='batismo-cutover-revisado'");
  await db.exec(sql);
  await db.exec(`INSERT INTO batismo_eventos(data,igreja_id) VALUES('2099-09-20','${B}'); INSERT INTO batismo_horarios(horario,igreja_id) VALUES('10:00','${B}')`);
  expect((await db.query('SELECT * FROM batismo_eventos')).rows).toHaveLength(2);
  await reject(`INSERT INTO batismo_eventos(data,igreja_id) VALUES('2099-09-20','${B}')`,/duplicate key/);
 });
});
