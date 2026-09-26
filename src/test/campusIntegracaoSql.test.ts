// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const U='10000000-0000-0000-0000-000000000001',V='10000000-0000-0000-0000-000000000002';
const TYPE='20000000-0000-0000-0000-000000000001';
let db:PGlite;
// Checkpoint deliberado: migrations posteriores em desenvolvimento não entram
// silenciosamente sem ampliar a fixture estrutural e os cenários correspondentes.
const migrations=readdirSync('supabase/migrations').filter(f=>/^2026092.*multicampus.*\.sql$/.test(f)&&f.slice(0,14)<='20260927070000').sort();
async function reject(sql:string,pattern:RegExp){await db.exec('SAVEPOINT failure');await expect(db.exec(sql)).rejects.toThrow(pattern);await db.exec('ROLLBACK TO SAVEPOINT failure');}
async function activate(){await db.exec("UPDATE app_campus_cobertura SET api_validada=true,rls_validada=true,produtores_validados=true,regressao_validada=true,evidencia='Fixture sintética: evidência exclusiva do teste'; UPDATE app_campus_config SET estado='ensaio'");}
async function user(id=U){await db.exec(`SET LOCAL ROLE authenticated;SET LOCAL "test.user"='${id}';SET LOCAL "test.level"='5';`);}
describe('integração: migrations multicampus reais em sequência',()=>{
 beforeAll(async()=>{
  db=new PGlite({extensions:{unaccent,pg_trgm,pgcrypto}});
  const fixture=readFileSync('src/test/fixtures/campusIntegracaoBase.sql','utf8');
  try{await db.exec(fixture);}catch(error){const e=error as Error & {position?:string};throw new Error(e.message+' near '+fixture.slice(Number(e.position)-150,Number(e.position)+150));}
  await db.exec(`INSERT INTO igrejas(id,nome,slug,tipo) VALUES('${A}','Sede sintética','cbrio-sede','sede');
    INSERT INTO profiles(id,name,email) VALUES('${U}','Usuário A','a@example.invalid'),('${V}','Usuário B','b@example.invalid');
    INSERT INTO usuario_igrejas(usuario_id,igreja_id) VALUES('${U}','${A}');
    INSERT INTO modulos(slug,nome,escopo_campus) VALUES('integracao','Integração','isolado'),('grupos','Grupos','isolado'),('next','Next','isolado'),('cuidados','Cuidados','isolado');
    INSERT INTO vol_service_types(id,name,recurrence_day,recurrence_time,is_active) VALUES('${TYPE}','Domingo sintético',0,'10:00',true);`);
  for(const file of migrations){try{await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));}catch(error){throw new Error(file+': '+(error as Error).message);}}
  await db.exec(`INSERT INTO igrejas(id,nome,slug,tipo) VALUES('${B}','Campus sintético','campus-b','sede');INSERT INTO usuario_igrejas(usuario_id,igreja_id) VALUES('${V}','${B}');`);
 },30000);
 beforeEach(async()=>{await db.exec('BEGIN');});afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE');});afterAll(async()=>{await db.close();});
 it('aplica toda a sequência e preserva a barreira de ativação',async()=>{
  expect(migrations).toHaveLength(11);
  await reject("UPDATE app_campus_config SET estado='ensaio'",/validação|evidência/);
  await activate();await reject("UPDATE app_campus_config SET estado='preparacao'",/legado/);
 });
 it('decisão em B mantém pessoa global de A e propaga o campus do ato a todos os destinos',async()=>{
  await activate();
  const membro=(await db.query<{id:string}>("INSERT INTO mem_membros(nome,cpf,email,igreja_id) VALUES('Pessoa Global','12345678901','principal@example.invalid',$1) RETURNING id",[A])).rows[0].id;
  const culto=(await db.query<{id:string}>("INSERT INTO cultos(nome,data,hora,service_type_id,igreja_id) VALUES('Culto B','2027-03-07','10:00',$1,$2) RETURNING id",[TYPE,B])).rows[0].id;
  await db.exec('SET LOCAL ROLE service_role');
  const decisao=(await db.query<{membro_id:string,igreja_id:string}>("INSERT INTO cultos_decisoes_pessoas(culto_id,nome,cpf,email) VALUES($1,'Pessoa Global','12345678901','secundario@example.invalid') RETURNING membro_id,igreja_id",[culto])).rows[0];
  expect(decisao).toEqual({membro_id:membro,igreja_id:B});
  expect((await db.query('SELECT valor FROM mem_contatos WHERE membro_id=$1',[membro])).rows).toEqual([{valor:'secundario@example.invalid'}]);
  expect((await db.query('SELECT email FROM mem_membros WHERE id=$1',[membro])).rows).toEqual([{email:'principal@example.invalid'}]);
  for(const table of ['cui_convertidos','mem_trilha_valores','nsm_eventos'])expect((await db.query(`SELECT igreja_id FROM ${table} WHERE membro_id=$1`,[membro])).rows).toEqual([{igreja_id:B}]);
  expect((await db.query('SELECT igreja_id FROM mem_membros WHERE id=$1',[membro])).rows).toEqual([{igreja_id:A}]);
  await user();
  expect((await db.query('SELECT id FROM cui_convertidos')).rows).toHaveLength(0);
  expect((await db.query('SELECT id FROM mem_trilha_valores')).rows).toHaveLength(0);
  await user(V);
  expect((await db.query('SELECT id FROM cui_convertidos')).rows).toHaveLength(1);
  expect((await db.query('SELECT id FROM mem_trilha_valores')).rows).toHaveLength(1);
 });
 it('matcher legado mantém EXECUTE em preparação; overload explícito continua exclusivo do serviço',async()=>{
  await user();
  const antigo=await db.query<{id:string}>("SELECT fn_link_or_create_membro(NULL,NULL,NULL,'Legado','visitante','fixture') AS id");
  expect(antigo.rows[0].id).toBeTruthy();
  await reject(`SELECT fn_link_or_create_membro(NULL,NULL,NULL,'Bloqueado','visitante','fixture','${B}'::uuid)`,/permission denied/);
  await db.exec('RESET ROLE');await activate();await user();
  await reject("SELECT fn_link_or_create_membro(NULL,NULL,NULL,'Legado','visitante','fixture')",/explícito/);
  await db.exec('SET LOCAL ROLE service_role');
  const novo=(await db.query<{id:string}>("SELECT fn_link_or_create_membro(NULL,NULL,NULL,'Novo B','visitante','fixture',$1) AS id",[B])).rows[0].id;
  expect((await db.query('SELECT igreja_id FROM mem_historico WHERE membro_id=$1',[novo])).rows).toEqual([{igreja_id:B}]);
 });
 it('Next cria duas turmas na mesma data, preserva identidade e impede presença cruzada',async()=>{
  await activate();await db.exec('SET LOCAL ROLE service_role');
  const membro=(await db.query<{id:string}>("INSERT INTO mem_membros(nome,igreja_id) VALUES('Participante global',$1) RETURNING id",[A])).rows[0].id;
  const turmas:string[]=[],matriculas:string[]=[],encontros:string[]=[];
  for(const campus of [A,B]){
   const turma=(await db.query<{id:string}>("SELECT (fn_campus_next_criar_turma($1,'Next sintético',NULL,NULL,'[{\"numero\":1,\"data\":\"2026-09-20\"}]'::jsonb,'2026-09-20',false)->>'id') AS id",[campus])).rows[0].id;
   turmas.push(turma);
   const matricula=(await db.query<{id:string}>("INSERT INTO next_matriculas(turma_id,membro_id,nome) VALUES($1,$2,'Participante global') RETURNING id",[turma,membro])).rows[0].id;
   matriculas.push(matricula);
   const encontro=(await db.query<{id:string}>('SELECT id FROM next_encontros WHERE turma_id=$1',[turma])).rows[0].id;encontros.push(encontro);
   await db.query("SELECT fn_campus_next_presencas($1,$2,ARRAY[$3::uuid],'marcar')",[encontro,campus,matricula]);
  }
  expect(new Set(turmas).size).toBe(2);
  expect((await db.query('SELECT status FROM next_matriculas ORDER BY igreja_id')).rows).toEqual([{status:'formado'},{status:'formado'}]);
  await reject(`SELECT fn_campus_next_presencas('${encontros[0]}','${A}',ARRAY['${matriculas[1]}'::uuid],'marcar')`,/fora da turma/);
  await user();expect((await db.query('SELECT igreja_id FROM next_presencas')).rows).toEqual([{igreja_id:A}]);
  await user(V);expect((await db.query('SELECT igreja_id FROM next_presencas')).rows).toEqual([{igreja_id:B}]);
  await db.exec(`SET LOCAL "test.member"='${membro}'`);
  expect((await db.query('SELECT id FROM next_presencas')).rows).toHaveLength(2);
  expect((await db.query('UPDATE next_matriculas SET nome=nome WHERE igreja_id=$1 RETURNING id',[A])).rows).toHaveLength(0);
 });
 it('Grupos consolida temporada TEXT por campus com numeradores distintos e pessoa única',async()=>{
  await activate();await db.exec('SET LOCAL ROLE service_role');
  await db.exec("INSERT INTO mem_temporadas(id,label,ano,numero,data_inicio,data_fim) VALUES('2026-2','Temporada sintética',2026,2,'2026-01-01','2026-12-31')");
  const membro=(await db.query<{id:string}>("INSERT INTO mem_membros(nome,igreja_id) VALUES('Pessoa em dois grupos',$1) RETURNING id",[A])).rows[0].id;
  for(const campus of [A,B]){
   const grupo=(await db.query<{id:string}>("INSERT INTO mem_grupos(nome,temporada,igreja_id) VALUES('Grupo sintético','2026-2',$1) RETURNING id",[campus])).rows[0].id;
   await db.query("INSERT INTO mem_grupo_membros(grupo_id,membro_id,funcao) VALUES($1,$2,'frequentador')",[grupo,membro]);
   const encontro=(await db.query<{id:string}>("INSERT INTO mem_grupo_encontros(grupo_id,data) VALUES($1,'2026-09-20') RETURNING id",[grupo])).rows[0].id;
   await db.query('INSERT INTO mem_grupo_encontro_presencas(encontro_id,membro_id,presente) VALUES($1,$2,$3)',[encontro,membro,campus===B]);
   await db.query("SELECT fn_consolidar_temporada_campus($1,'2026-2',$2,'Gestor sintético',false)",[campus,U]);
  }
  expect((await db.query('SELECT igreja_id,total_presencas,total_encontros FROM mem_temporada_consolidado ORDER BY igreja_id')).rows).toEqual([
   {igreja_id:A,total_presencas:0,total_encontros:1},{igreja_id:B,total_presencas:1,total_encontros:1}]);
  expect((await db.query('SELECT id FROM mem_membros')).rows).toHaveLength(1);
  await user();expect((await db.query('SELECT igreja_id FROM mem_grupo_membros')).rows).toEqual([{igreja_id:A}]);
  expect((await db.query('SELECT igreja_id FROM mem_temporada_consolidado')).rows).toEqual([{igreja_id:A}]);
  await reject(`SELECT fn_temporada_metricas_campus('${B}','2026-2')`,/permitido|autorizado|campus/i);
  await user(V);expect((await db.query('SELECT igreja_id FROM mem_grupo_membros')).rows).toEqual([{igreja_id:B}]);
  expect((await db.query('SELECT igreja_id FROM mem_temporada_consolidado')).rows).toEqual([{igreja_id:B}]);
 });

 it('decisão sem pessoa anterior cria identidade e todos os destinos em B após substituir helpers',async()=>{
  await activate();await db.exec('SET LOCAL ROLE service_role');
  const culto=(await db.query<{id:string}>("INSERT INTO cultos(nome,data,hora,service_type_id,igreja_id) VALUES('Culto B','2027-03-07','10:00',$1,$2) RETURNING id",[TYPE,B])).rows[0].id;
  const pessoa=(await db.query<{membro_id:string}>("INSERT INTO cultos_decisoes_pessoas(culto_id,nome) VALUES($1,'Nova pessoa sintética') RETURNING membro_id",[culto])).rows[0].membro_id;
  for(const [table,key] of [['mem_membros','id'],['cui_convertidos','membro_id'],['mem_trilha_valores','membro_id'],['nsm_eventos','membro_id']]){
   expect((await db.query(`SELECT igreja_id FROM ${table} WHERE ${key}=$1`,[pessoa])).rows).toEqual([{igreja_id:B}]);
  }
  await reject(`INSERT INTO cultos_decisoes_pessoas(culto_id,nome,igreja_id) VALUES('${culto}','Divergente','${A}')`,/diverge/);
  await reject("INSERT INTO cultos_decisoes_pessoas(nome) VALUES('Sem campus')",/explícito/);
 });
 it('grants e FK composta sobrevivem à composição sem reabrir escrita pública',async()=>{
  const grants=(await db.query<{allowed:boolean}>("SELECT has_function_privilege('authenticated','fn_link_or_create_membro(text,text,text,text,text,text,uuid)','execute') AS allowed")).rows;
  expect(grants).toEqual([{allowed:false}]);
  expect((await db.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='cultos_decisoes_pessoas'::regclass AND contype='f' AND confrelid='cultos'::regclass")).rows).toContainEqual({def:'FOREIGN KEY (culto_id, igreja_id) REFERENCES cultos(id, igreja_id) ON DELETE SET NULL (culto_id)'});
  expect((await db.query("SELECT frente FROM app_campus_cobertura WHERE api_validada AND rls_validada AND produtores_validados AND regressao_validada")).rows).toHaveLength(0);
 });

 it('Batismo mantém PK global até o cutover e reserva por campus sem ultrapassar a capacidade',async()=>{
  await activate();await db.exec('SET LOCAL ROLE service_role');
  const eventoA=(await db.query<{id:string}>("INSERT INTO batismo_eventos(data,igreja_id,aberto) VALUES('2027-03-07',$1,true) RETURNING id",[A])).rows[0].id;
  await reject(`INSERT INTO batismo_eventos(data,igreja_id,aberto) VALUES('2027-03-07','${B}',true)`,/duplicate key/);
  const eventoB=(await db.query<{id:string}>("INSERT INTO batismo_eventos(data,igreja_id,aberto) VALUES('2027-03-14',$1,true) RETURNING id",[B])).rows[0].id;
  const horarioB=(await db.query<{id:string}>("INSERT INTO batismo_horarios(horario,label,igreja_id,aberto,limite) VALUES('10:00','Horário sintético',$1,true,1) RETURNING id",[B])).rows[0].id;
  const pessoa=(await db.query<{id:string}>("INSERT INTO mem_membros(nome,igreja_id) VALUES('Pessoa global',$1) RETURNING id",[A])).rows[0].id;
  const reserva="SELECT fn_campus_batismo_reservar($1,$2,$3,gen_random_uuid(),$4,'Pessoa','Sintética')";
  await db.query(reserva,[B,eventoB,horarioB,pessoa]);
  expect((await db.query('SELECT igreja_id,membro_id FROM batismo_inscricoes')).rows).toEqual([{igreja_id:B,membro_id:pessoa}]);
  await reject(`SELECT fn_campus_batismo_reservar('${B}','${eventoB}','${horarioB}',gen_random_uuid(),NULL,'Outra','Pessoa')`,/vagas/);
  await reject(`SELECT fn_campus_batismo_reservar('${A}','${eventoA}','${horarioB}',gen_random_uuid(),NULL,'Outra','Pessoa')`,/Horário inexistente/);
  await user();expect((await db.query('SELECT id FROM batismo_inscricoes')).rows).toHaveLength(0);
  await user(V);expect((await db.query('SELECT id FROM batismo_inscricoes')).rows).toHaveLength(1);
 });

});
