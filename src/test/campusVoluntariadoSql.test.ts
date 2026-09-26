// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const U='10000000-0000-0000-0000-000000000001',V='10000000-0000-0000-0000-000000000002';
const MEM='20000000-0000-0000-0000-000000000001';
let db:PGlite;
async function id(sql:string,args:unknown[]=[]){return (await db.query<{id:string}>(sql+' RETURNING id',args)).rows[0].id;}
async function reject(sql:string,pattern:RegExp){await db.exec('SAVEPOINT denied');await expect(db.exec(sql)).rejects.toThrow(pattern);await db.exec('ROLLBACK TO SAVEPOINT denied');}
async function activate(){await db.exec("UPDATE app_campus_cobertura SET api_validada=true,rls_validada=true,produtores_validados=true,regressao_validada=true,evidencia='Apenas fixture Kids';UPDATE app_campus_config SET estado='ensaio'");}
async function profile(){return id("INSERT INTO vol_profiles(full_name,membresia_id) VALUES('Pessoa sintética',$1)",[MEM]);}
async function service(campus=A,type?:string){return id("INSERT INTO vol_services(name,scheduled_at,igreja_id,service_type_id) VALUES('Culto sintético','2026-09-27 13:00Z',$1,$2)",[campus,type||null]);}
async function roster(svc:string,p:string){return id("INSERT INTO vol_schedules(service_id,volunteer_id,volunteer_name,team_name) VALUES($1,$2,'Pessoa sintética',$3)",[svc,p,p]);}
async function user(uid=U){await db.exec(`SET LOCAL ROLE authenticated;SET LOCAL "test.user"='${uid}';SET LOCAL "test.level"='5';SET LOCAL "test.member"=''`);}
describe('Voluntariado: SQL real e campus operacional',()=>{
 beforeAll(async()=>{
  db=new PGlite({extensions:{unaccent,pg_trgm,pgcrypto}});
  for(const file of ['campusIntegracaoBase.sql','campusKidsBase.sql','campusVoluntariadoBase.sql']){
   const sql=readFileSync('src/test/fixtures/'+file,'utf8');try{await db.exec(sql);}catch(error){const e=error as Error&{position?:string};throw new Error(file+': '+e.message+' '+sql.slice(Number(e.position)-100,Number(e.position)+100));}
  }
  await db.exec(`INSERT INTO igrejas(id,nome,slug,tipo) VALUES('${A}','Sede','cbrio-sede','sede');
   INSERT INTO profiles(id,name,email) VALUES('${U}','Usuário A','a@example.invalid'),('${V}','Usuário B','b@example.invalid');
   INSERT INTO usuario_igrejas(usuario_id,igreja_id) VALUES('${U}','${A}');
   INSERT INTO modulos(slug,nome,escopo_campus) VALUES('voluntariado','Voluntariado','isolado'),('integracao','Integração','isolado');
   INSERT INTO mem_membros(id,nome,igreja_id) VALUES('${MEM}','Pessoa global','${A}');
   INSERT INTO mem_ministerios(nome) VALUES('Voluntariado (geral)');`);
  const files=readdirSync('supabase/migrations').filter(f=>/^2026092.*multicampus.*\.sql$/.test(f)&&(f.slice(0,14)<='20260927070000'||['20260927150000','20260927160000'].includes(f.slice(0,14)))).sort();
  for(const file of files){try{await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));}catch(error){throw new Error(file+': '+(error as Error).message);}}
  await db.exec(`INSERT INTO igrejas(id,nome,slug,tipo) VALUES('${B}','Campus B','campus-b','sede');INSERT INTO usuario_igrejas(usuario_id,igreja_id) VALUES('${V}','${B}');`);
 },30000);
 beforeEach(async()=>{await db.exec('BEGIN');});afterEach(async()=>{await db.exec('ROLLBACK;RESET ROLE');});afterAll(async()=>{await db.close();});
 it('aplica as migrations preservando dados globais',async()=>{expect((await db.query('SELECT count(*)::int AS n FROM mem_membros')).rows[0]).toEqual({n:1});});

 it('herda serviço e rejeita check-in cruzado ou pessoa divergente',async()=>{
  await activate();const p=await profile(),p2=await profile(),a=await service(),b=await service(B),r=await roster(a,p);
  await reject(`INSERT INTO vol_check_ins(schedule_id,service_id,volunteer_id,igreja_id) VALUES('${r}','${b}','${p}','${B}')`,/diverge|campi/);
  await reject(`INSERT INTO vol_check_ins(schedule_id,volunteer_id) VALUES('${r}','${p2}')`,/pessoa/);
  const ci=await id("INSERT INTO vol_check_ins(schedule_id,method) VALUES($1,'manual')",[r]);
  expect((await db.query('SELECT igreja_id,service_id,volunteer_id FROM vol_check_ins WHERE id=$1',[ci])).rows[0]).toEqual({igreja_id:A,service_id:a,volunteer_id:p});
 });
 it('uma identidade serve dois campi sem mover a base da pessoa',async()=>{
  await activate();const p=await profile();await roster(await service(),p);await roster(await service(B),p);
  expect((await db.query('SELECT igreja_id FROM mem_voluntarios WHERE membro_id=$1 ORDER BY igreja_id',[MEM])).rows).toEqual([{igreja_id:A},{igreja_id:B}]);
  expect((await db.query('SELECT igreja_id FROM mem_membros WHERE id=$1',[MEM])).rows[0]).toEqual({igreja_id:A});
 });
 it('vínculo revogado não é reativado por novo ato e histórico continua editável',async()=>{
  await activate();const p=await profile(),svc=await service(),r=await roster(svc,p);
  await db.query('UPDATE vol_profile_campi SET ativo=false WHERE profile_id=$1',[p]);
  await db.query("UPDATE vol_schedules SET notes='Histórico preservado' WHERE id=$1",[r]);
  await reject(`INSERT INTO vol_check_ins(schedule_id,method) VALUES('${r}','manual')`,/inativo/);
 });
 it('disponibilidade exige vínculo ativo e não usa campus-base',async()=>{
  await activate();const p=await profile();
  await reject(`INSERT INTO vol_availability(volunteer_profile_id,igreja_id,unavailable_from,unavailable_to) VALUES('${p}','${B}','2026-10-01','2026-10-02')`,/vínculo ativo/);
  await db.query('INSERT INTO vol_profile_campi(profile_id,igreja_id) VALUES($1,$2)',[p,B]);
  await id("INSERT INTO vol_availability(volunteer_profile_id,igreja_id,unavailable_from,unavailable_to) VALUES($1,$2,'2026-10-01','2026-10-02')",[p,B]);
 });
 it('RLS restritiva limita a leitura local mesmo com policy permissiva anterior',async()=>{
  await activate();await service();await service(B);await user();
  expect((await db.query('SELECT igreja_id FROM vol_services')).rows).toEqual([{igreja_id:A}]);
  await reject(`INSERT INTO vol_services(name,scheduled_at,igreja_id) VALUES('Negado',now(),'${B}')`,/row-level security/);
 });
 it('rejeita posição de outra equipe no mesmo campus',async()=>{
  await activate();const t=await id("INSERT INTO vol_teams(name,igreja_id) VALUES('A',$1)",[A]);const other=await id("INSERT INTO vol_teams(name,igreja_id) VALUES('B',$1)",[A]);
  const pos=await id("INSERT INTO vol_positions(name,team_id) VALUES('Posição',$1)",[other]);
  await reject(`INSERT INTO vol_team_members(team_id,position_id,volunteer_name) VALUES('${t}','${pos}','Pessoa')`,/incompatíveis/);
 });
 it('histórico idêntico e mapa de equipe podem coexistir em dois campi',async()=>{
  await activate();for(const campus of [A,B]){
   await db.query("INSERT INTO vol_servicos_historico(nome_planilha,nome_norm,data,culto_label,origem,igreja_id) VALUES('Pessoa','pessoa','2026-09-27','Domingo','teste',$1)",[campus]);
   const team=await id('INSERT INTO vol_teams(name,igreja_id) VALUES($1,$2)',['Equipe '+campus,campus]);
   await db.query("INSERT INTO vol_pco_mapa(pco_chave,pco_nome,team_id,igreja_id) VALUES('equipe','Equipe',$1,$2)",[team,campus]);
  }
  expect((await db.query('SELECT count(*)::int AS n FROM vol_servicos_historico')).rows[0]).toEqual({n:2});
 });
 it('PCO exige mapa por ID, reutiliza serviço local e não apaga escala',async()=>{
  await activate();const type=await id("INSERT INTO vol_service_types(name) VALUES('Tipo sintético')"),p=await profile(),svc=await service(A,type);const r=await roster(svc,p);
  const call=`SELECT (fn_campus_vol_resolver_servico('${A}','${type}','external-type','plan-1','Culto renomeado','Nome de exibição','2026-09-27 14:00Z')).id AS id`;
  await reject(call,/mapa explícito/);
  await db.query("INSERT INTO vol_pco_service_type_campi(pco_service_type_id,igreja_id,service_type_id) VALUES('external-type',$1,$2)",[A,type]);
  expect((await db.query(call)).rows[0]).toEqual({id:svc});expect((await db.query(call)).rows[0]).toEqual({id:svc});
  expect((await db.query('SELECT id FROM vol_schedules WHERE id=$1',[r])).rows).toEqual([{id:r}]);
  await reject(call.replace('plan-1','plan-2'),/outro plano/);
 });
 it('RPC PCO e materialização não são invocáveis por authenticated',async()=>{
  expect((await db.query("SELECT has_function_privilege('authenticated','fn_campus_vol_resolver_servico(uuid,uuid,text,text,text,text,timestamptz)','EXECUTE') AS rpc,has_function_privilege('authenticated','fn_vol_materializar_servir_campus(uuid,uuid,date)','EXECUTE') AS bridge")).rows[0]).toEqual({rpc:false,bridge:false});
 });
 it('guarda relatórios legados fora de preparação',async()=>{
  await activate();await reject('SELECT * FROM fn_dashboard_voluntariado_resumo(2026,39)',/campus explícito/i);
 });
 it('ponte NSM carimba o ato local sem mover membro nem alterar a coorte global',async()=>{
  await activate();await db.query("UPDATE mem_membros SET cpf='12345678901' WHERE id=$1",[MEM]);
  await db.query("INSERT INTO int_visitantes(nome,cpf,data_visita,fez_decisao) VALUES('Pessoa sintética','12345678901',CURRENT_DATE,true)");
  const p=await profile();await roster(await service(B),p);
  expect((await db.query("SELECT igreja_id,valor_engajado FROM nsm_eventos WHERE membro_id=$1",[MEM])).rows).toEqual([{igreja_id:B,valor_engajado:'servir'}]);
 });
 it('relatórios antigos preservam contrato em preparação',async()=>{
  expect((await db.query('SELECT * FROM fn_dashboard_voluntariado_resumo(2026,39)')).rows).toEqual([{pessoas_unicas:0,checkins_total:0,sem_identificacao:0}]);
  expect((await db.query('SELECT * FROM fn_dashboard_voluntariado_pessoas(2026,39)')).rows).toEqual([]);
  expect((await db.query('SELECT * FROM fn_dashboard_voluntariado_composicao(2026,39)')).rows).toEqual([]);
 });
 it('acesso próprio permite ler participação sem autorizar escrita em campus remoto',async()=>{
  await activate();const p=await profile(),r=await roster(await service(B),p);await user();
  await db.exec(`SET LOCAL "test.member"='${MEM}'`);
  expect((await db.query('SELECT id FROM vol_schedules')).rows).toEqual([{id:r}]);
  expect((await db.query("UPDATE vol_schedules SET notes='Não autorizado' WHERE id=$1 RETURNING id",[r])).rows).toEqual([]);
 });
 it('líder novo exige vínculo local; editar equipe histórica não depende de reativação',async()=>{
  await activate();const p=await profile();
  await reject(`INSERT INTO vol_teams(name,igreja_id,leader_profile_id) VALUES('Equipe','${B}','${p}')`,/vínculo ativo/);
  await db.query('INSERT INTO vol_profile_campi(profile_id,igreja_id) VALUES($1,$2)',[p,B]);
  const team=await id("INSERT INTO vol_teams(name,igreja_id,leader_profile_id) VALUES('Equipe',$1,$2)",[B,p]);
  await db.query('UPDATE vol_profile_campi SET ativo=false WHERE profile_id=$1',[p]);
  await db.query("UPDATE vol_teams SET name='Equipe renomeada' WHERE id=$1",[team]);
 });
 it('relatórios de campus não misturam pessoas ou totais de cultos',async()=>{
  await activate();const type=await id("INSERT INTO vol_service_types(name) VALUES('Tipo estatística')");
  const p=await profile(),q=await profile();const a=await service(A,type),b=await service(B,type);
  await db.exec("UPDATE vol_services SET service_type_name='Domingo - Manhã'");
  for(const [svc,person] of [[a,p],[b,p],[b,q]]){
   const r=await roster(svc,person);await db.query("INSERT INTO vol_check_ins(schedule_id,method) VALUES($1,'manual')",[r]);
  }
  const ca=await id("INSERT INTO cultos(nome,data,hora,service_type_id,igreja_id) VALUES('A','2026-09-27','10:00',$1,$2)",[type,A]);
  const cb=await id("INSERT INTO cultos(nome,data,hora,service_type_id,igreja_id) VALUES('B','2026-09-27','10:00',$1,$2)",[type,B]);
  for(const [campus,culto,total] of [[A,ca,1],[B,cb,2]]){
   expect((await db.query('SELECT * FROM fn_dashboard_voluntariado_resumo_campus($1,2026,39)',[campus])).rows).toEqual([{pessoas_unicas:1,checkins_total:total,sem_identificacao:0}]);
   expect((await db.query('SELECT * FROM culto_voluntarios_auto_campus($1,$2)',[campus,culto])).rows).toEqual([{escalados:total,checkin:total}]);
  }
 });
});
