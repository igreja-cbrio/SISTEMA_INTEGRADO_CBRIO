// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const U='10000000-0000-0000-0000-000000000001',V='10000000-0000-0000-0000-000000000002';
const CHILD='20000000-0000-0000-0000-000000000001',ORPHAN='20000000-0000-0000-0000-000000000002';
const GUARDIAN='30000000-0000-0000-0000-000000000001';
let db:PGlite;
async function id(sql:string,args:unknown[]=[]){return (await db.query<{id:string}>(sql+' RETURNING id',args)).rows[0].id;}
async function reject(sql:string,pattern:RegExp){await db.exec('SAVEPOINT denied');await expect(db.exec(sql)).rejects.toThrow(pattern);await db.exec('ROLLBACK TO SAVEPOINT denied');}
async function activate(){await db.exec("UPDATE app_campus_cobertura SET api_validada=true,rls_validada=true,produtores_validados=true,regressao_validada=true,evidencia='Apenas fixture Kids';UPDATE app_campus_config SET estado='ensaio'");}
async function user(uid=U,own=false){await db.exec(`SET LOCAL ROLE authenticated;SET LOCAL "test.user"='${uid}';SET LOCAL "test.level"='5';SET LOCAL "test.member"='${own?GUARDIAN:''}'`);}
async function context(campus=A){
 const culto=await id("INSERT INTO cultos(nome,data,hora,igreja_id) VALUES('Culto sintético',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'10:00',$1)",[campus]);
 const sessao=await id("INSERT INTO kids_sessoes(culto_id,status,abrir_em) VALUES($1,'aberta',now())",[culto]);
 const sala=await id("INSERT INTO kids_salas(nome,capacidade,igreja_id) VALUES($1,2,$2)",['Sala '+campus,campus]);
 const estacao=await id("INSERT INTO kids_estacoes(nome,tipo,sala_id) VALUES($1,'manned',$2)",['Estação '+campus,sala]);
 await db.query('INSERT INTO kids_crianca_campi(crianca_id,igreja_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[CHILD,campus]);
 return {culto,sessao,sala,estacao,campus};
}
async function checkin(ctx:Awaited<ReturnType<typeof context>>,options:{child?:string,responsavel?:string,code?:string,extras?:string[]}={}){
 return (await db.query<{result:any}>('SELECT fn_campus_kids_checkin($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result',[
  ctx.campus,ctx.sessao,options.child||CHILD,ctx.sala,ctx.estacao,options.responsavel||GUARDIAN,U,options.code||null,options.extras||[]])).rows[0].result;
}
describe('Kids: SQL real integrado, identidade global e campus operacional',()=>{
 beforeAll(async()=>{
  db=new PGlite({extensions:{unaccent,pg_trgm,pgcrypto}});
  for(const file of ['campusIntegracaoBase.sql','campusKidsBase.sql']){
   const sql=readFileSync('src/test/fixtures/'+file,'utf8');try{await db.exec(sql);}catch(error){const e=error as Error&{position?:string};throw new Error(file+': '+e.message+' '+sql.slice(Number(e.position)-100,Number(e.position)+100));}
  }
  await db.exec(`INSERT INTO igrejas(id,nome,slug,tipo) VALUES('${A}','Sede sintética','cbrio-sede','sede');
   INSERT INTO profiles(id,name,email) VALUES('${U}','Usuário A','a@example.invalid'),('${V}','Usuário B','b@example.invalid');
   INSERT INTO usuario_igrejas(usuario_id,igreja_id) VALUES('${U}','${A}');
   INSERT INTO modulos(slug,nome,escopo_campus) VALUES('kids','Kids','isolado'),('integracao','Integração','isolado');
   INSERT INTO mem_membros(id,nome,cpf,igreja_id) VALUES('${GUARDIAN}','Responsável sintético','12345678901','${A}');
   INSERT INTO kids_criancas(id,nome) VALUES('${CHILD}','Criança sintética'),('${ORPHAN}','Criança sem ato');
   INSERT INTO kids_responsaveis(crianca_id,membro_id,parentesco,autorizado_buscar) VALUES('${CHILD}','${GUARDIAN}','pai',true);
   INSERT INTO kids_atendimentos(crianca_id,tipo,descricao) VALUES('${CHILD}','pastoral','Atendimento sintético');`);
  const files=readdirSync('supabase/migrations').filter(f=>/^2026092.*multicampus.*\.sql$/.test(f)&&(f.slice(0,14)<='20260927070000'||['20260927090000','20260927100000','20260927130000'].includes(f.slice(0,14)))).sort();
  for(const file of files){try{await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));}catch(error){throw new Error(file+': '+(error as Error).message);}}
  await db.exec(`INSERT INTO igrejas(id,nome,slug,tipo) VALUES('${B}','Campus B','campus-b','sede');INSERT INTO usuario_igrejas(usuario_id,igreja_id) VALUES('${V}','${B}');`);
 },30000);
 beforeEach(async()=>{await db.exec('BEGIN');});afterEach(async()=>{await db.exec('ROLLBACK;RESET ROLE');});afterAll(async()=>{await db.close();});
 it('backfill usa atos e nunca presume campus por parentesco ou simples cadastro',async()=>{
  expect((await db.query('SELECT crianca_id,igreja_id FROM kids_crianca_campi')).rows).toEqual([{crianca_id:CHILD,igreja_id:A}]);
  await activate();await user();expect((await db.query('SELECT id FROM kids_criancas')).rows).toEqual([{id:CHILD}]);
  await user(V);expect((await db.query('SELECT id FROM kids_criancas')).rows).toHaveLength(0);
 });
 it('check-in B usa criança única e responsável global de A, com snapshots canônicos',async()=>{
  const b=await context(B);await activate();await db.exec('SET LOCAL ROLE service_role');
  const result=await checkin(b);expect(result.checkin.igreja_id).toBe(B);expect(result.checkin.responsavel_checkin_nome).toBe('Responsável sintético');
  expect((await db.query('SELECT id FROM kids_criancas WHERE id=$1',[CHILD])).rows).toHaveLength(1);
  expect((await db.query('SELECT igreja_id FROM mem_membros WHERE id=$1',[GUARDIAN])).rows).toEqual([{igreja_id:A}]);
 });
 it('responsável global não presume vínculo de criança com o campus',async()=>{
  const b=await context(B);await db.query('INSERT INTO kids_responsaveis(crianca_id,membro_id,parentesco) VALUES($1,$2,\'pai\')',[ORPHAN,GUARDIAN]);
  await activate();await db.exec('SET LOCAL ROLE service_role');
  await db.exec('SAVEPOINT attempt');await expect(checkin(b,{child:ORPHAN})).rejects.toThrow('sem vínculo');await db.exec('ROLLBACK TO SAVEPOINT attempt');
  expect((await db.query('SELECT id FROM kids_checkins')).rows).toHaveLength(0);
 });
 it('não autoriza responsável só porque seu UUID existe',async()=>{
  const b=await context(B);const other=await id("INSERT INTO mem_membros(nome,igreja_id) VALUES('Outro adulto',$1)",[B]);
  await activate();await db.exec('SET LOCAL ROLE service_role');
  await db.exec('SAVEPOINT attempt');await expect(checkin(b,{responsavel:other})).rejects.toThrow('não autorizado');await db.exec('ROLLBACK TO SAVEPOINT attempt');
  await reject(`INSERT INTO kids_checkins(sessao_id,crianca_id,sala_id,responsavel_checkin_id,responsavel_checkin_nome,codigo_seguranca,codigo_barras) VALUES('${b.sessao}','${CHILD}','${b.sala}','${other}','Outro','991001','991001')`,/não autorizado/);
 });
 it('pais remotos são rejeitados antes de criar qualquer parte do grupo',async()=>{
  const a=await context(A),b=await context(B);await activate();await db.exec('SET LOCAL ROLE service_role');
  await db.exec('SAVEPOINT attempt');await expect(checkin(a,{extras:[b.culto]})).rejects.toThrow('mesmo dia e campus');await db.exec('ROLLBACK TO SAVEPOINT attempt');
  await reject(`INSERT INTO kids_checkins(sessao_id,crianca_id,sala_id,responsavel_checkin_id,responsavel_checkin_nome,codigo_seguranca,codigo_barras) VALUES('${a.sessao}','${CHILD}','${b.sala}','${GUARDIAN}','Responsável','991001','991001')`,/campi diferentes/);
  expect((await db.query('SELECT id FROM kids_checkins')).rows).toHaveLength(0);
 });
 it('cultos extras recebem o mesmo código e grupo em uma transação',async()=>{
  const b=await context(B);const extra=await id("INSERT INTO cultos(nome,data,hora,igreja_id) VALUES('Extra',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'18:00',$1)",[B]);
  await activate();await db.exec('SET LOCAL ROLE service_role');const r=await checkin(b,{extras:[extra]});
  expect(r.extras).toHaveLength(1);expect(r.extras[0].igreja_id).toBe(B);
  expect(r.extras[0].codigo_seguranca).toBe(r.codigo_seguranca);expect(r.extras[0].checkin_grupo_id).toBe(r.checkin_grupo_id);
  expect((await db.query('SELECT count(DISTINCT crianca_id)::int AS n FROM kids_checkins')).rows).toEqual([{n:1}]);
 });
 it('capacidade nega a última vaga e reverte sessão extra criada durante a tentativa',async()=>{
  const b=await context(B);await db.query('UPDATE kids_salas SET capacidade=1 WHERE id=$1',[b.sala]);
  await db.query('INSERT INTO kids_crianca_campi(crianca_id,igreja_id) VALUES($1,$2)',[ORPHAN,B]);
  await db.query("INSERT INTO kids_responsaveis(crianca_id,membro_id,parentesco) VALUES($1,$2,'pai')",[ORPHAN,GUARDIAN]);
  const extra=await id("INSERT INTO cultos(nome,data,hora,igreja_id) VALUES('Extra',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'18:00',$1)",[B]);
  await activate();await db.exec('SET LOCAL ROLE service_role');await checkin(b);
  await db.exec('SAVEPOINT attempt');await expect(checkin(b,{child:ORPHAN,extras:[extra]})).rejects.toThrow('capacidade');await db.exec('ROLLBACK TO SAVEPOINT attempt');
  expect((await db.query('SELECT id FROM kids_sessoes WHERE culto_id=$1',[extra])).rows).toHaveLength(0);
  expect((await db.query('SELECT id FROM kids_checkins')).rows).toHaveLength(1);
 });
 it('código reservado precisa corresponder à estação, sessão e campus, e é consumido sem troca',async()=>{
  const a=await context(A),b=await context(B);
  await db.query("INSERT INTO kids_codigos_reservados(codigo,estacao_ref,estacao_id,sessao_id) VALUES('881001','fixture-a',$1,$2),('881002','fixture-b',$3,$4)",[a.estacao,a.sessao,b.estacao,b.sessao]);
  await activate();await db.exec('SET LOCAL ROLE service_role');
  await db.exec('SAVEPOINT attempt');await expect(checkin(b,{code:'881001'})).rejects.toThrow('Código reservado');await db.exec('ROLLBACK TO SAVEPOINT attempt');
  const r=await checkin(b,{code:'881002'});expect(r.codigo_seguranca).toBe('881002');
  expect((await db.query("SELECT igreja_id,status,checkin_id FROM kids_codigos_reservados WHERE codigo='881002'")).rows).toEqual([{igreja_id:B,status:'usado',checkin_id:r.checkin.id}]);
 });
 it('RLS do ato respeita campus e leitura própria não concede alteração remota',async()=>{
  const a=await context(A),b=await context(B);await activate();await db.exec('SET LOCAL ROLE service_role');await checkin(a);await checkin(b);
  await user();expect((await db.query('SELECT igreja_id FROM kids_checkins')).rows).toEqual([{igreja_id:A}]);
  await user(V);expect((await db.query('SELECT igreja_id FROM kids_checkins')).rows).toEqual([{igreja_id:B}]);
  await user(V,true);expect((await db.query('SELECT id FROM kids_checkins')).rows).toHaveLength(2);
  expect((await db.query('UPDATE kids_checkins SET observacoes_no_dia=observacoes_no_dia WHERE igreja_id=$1 RETURNING id',[A])).rows).toHaveLength(0);
 });
 it('decisão e fechamento alimentam apenas culto da sessão, com cadeia Kids original',async()=>{
  const a=await context(A),b=await context(B);await db.query('UPDATE cultos SET presencial_kids=99 WHERE id=$1',[a.culto]);
  await activate();await db.exec('SET LOCAL ROLE service_role');const r=await checkin(b);
  await db.query('UPDATE kids_checkins SET fez_decisao_jesus=true WHERE id=$1',[r.checkin.id]);
  expect((await db.query('SELECT igreja_id,kids_crianca_id,tipo_decisao FROM cultos_decisoes_pessoas')).rows).toEqual([{igreja_id:B,kids_crianca_id:CHILD,tipo_decisao:'kids'}]);
  await db.query("UPDATE kids_sessoes SET status='encerrada' WHERE id=$1",[b.sessao]);
  expect((await db.query('SELECT igreja_id,presencial_kids FROM cultos ORDER BY igreja_id')).rows).toEqual([{igreja_id:A,presencial_kids:99},{igreja_id:B,presencial_kids:1}]);
 });
 it('produtores globais e configurações ambíguas falham fechados após ativação',async()=>{
  await db.exec('INSERT INTO kids_totem_config(id) VALUES(true);INSERT INTO kids_etiqueta_config(id) VALUES(1)');
  await activate();await db.exec('SET LOCAL ROLE service_role');
  await reject("SELECT * FROM fn_kids_reservar_codigos('fixture',NULL,1,NULL)",/explícito/);
  await reject('SELECT * FROM fn_kids_checkout_forcado_pendentes()',/explícito/);
  await reject('SELECT * FROM fn_kids_ausentes_consecutivos(3)',/explícito/);
  await reject(`SELECT merge_kids_criancas('${CHILD}',ARRAY['${ORPHAN}'::uuid])`,/explícito/);
  await user();expect((await db.query('SELECT * FROM kids_totem_config')).rows).toHaveLength(0);expect((await db.query('SELECT * FROM kids_etiqueta_config')).rows).toHaveLength(0);
  await reject(`SELECT fn_campus_kids_checkin('${A}',NULL,NULL,NULL,NULL,NULL,NULL)`,/permission denied/);
 });

 it('primeiro ato legado cria vínculo apenas na mesma transação do check-in válido',async()=>{
  const a=await context(A);await db.query("INSERT INTO kids_responsaveis(crianca_id,membro_id,parentesco) VALUES($1,$2,'pai')",[ORPHAN,GUARDIAN]);
  await db.exec('SET LOCAL ROLE service_role');await checkin(a,{child:ORPHAN});
  expect((await db.query('SELECT igreja_id FROM kids_crianca_campi WHERE crianca_id=$1',[ORPHAN])).rows).toEqual([{igreja_id:A}]);
 });
 it('checkout composto fecha chamadas/pager e preserva snapshots históricos após troca de sala',async()=>{
  const b=await context(B);const extra=await id("INSERT INTO cultos(nome,data,hora,igreja_id) VALUES('Extra',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'18:00',$1)",[B]);
  await activate();await db.exec('SET LOCAL ROLE service_role');const r=await checkin(b,{extras:[extra]});
  const pager=await id("INSERT INTO kids_pagers(igreja_id,numero) VALUES($1,1)",[B]);
  await db.query("UPDATE kids_checkins SET pager_id=$1,pager_numero='1' WHERE checkin_grupo_id=$2",[pager,r.checkin_grupo_id]);
  const chamada=await id("INSERT INTO kids_chamadas(sessao_id,checkin_id,crianca_id,sala_id,codigo_seguranca) VALUES($1,$2,$3,$4,$5)",[b.sessao,r.checkin.id,CHILD,b.sala,r.codigo_seguranca]);
  await db.query("INSERT INTO kids_pager_envios(chamada_id,checkin_id,pager_id,pager_numero) VALUES($1,$2,$3,1)",[chamada,r.checkin.id,pager]);
  const novaSala=await id("INSERT INTO kids_salas(nome,igreja_id) VALUES('Outra sala B',$1)",[B]);
  await db.query('UPDATE kids_checkins SET sala_id=$1 WHERE id=$2',[novaSala,r.checkin.id]);
  await db.query('UPDATE kids_crianca_campi SET ativo=false WHERE crianca_id=$1 AND igreja_id=$2',[CHILD,B]);
  const result=(await db.query<{result:any}>("SELECT fn_campus_kids_checkout($1,$2,$3,'codigo_digitado',$4) AS result",[B,r.checkin.id,U,r.codigo_seguranca])).rows[0].result;
  expect(result.cultos_encerrados).toBe(2);
  expect((await db.query('SELECT id FROM kids_checkins WHERE checkout_at IS NULL OR pager_devolvido_at IS NULL')).rows).toHaveLength(0);
  expect((await db.query('SELECT id FROM kids_chamadas WHERE atendida_em IS NULL')).rows).toHaveLength(0);
  expect((await db.query('SELECT status,igreja_id FROM kids_pager_envios')).rows).toEqual([{status:'cancelado',igreja_id:B}]);
 });
 it('mesmo código ativo não pode representar grupos diferentes em campi distintos',async()=>{
  const a=await context(A),b=await context(B);await activate();await db.exec('SET LOCAL ROLE service_role');const r=await checkin(a);
  await reject(`INSERT INTO kids_checkins(sessao_id,crianca_id,sala_id,responsavel_checkin_id,responsavel_checkin_nome,codigo_seguranca,codigo_barras) VALUES('${b.sessao}','${CHILD}','${b.sala}','${GUARDIAN}','Responsável','${r.codigo_seguranca}','${r.codigo_seguranca}')`,/Colisão/);
 });
 it('pré-check-in não aceita atos de outra unidade em arrays sem FK',async()=>{
  const a=await context(A),b=await context(B);await activate();await db.exec('SET LOCAL ROLE service_role');const r=await checkin(a);
  await db.query("INSERT INTO kids_pre_checkins(codigo,responsavel_membro_id,responsavel_nome,crianca_ids,checkin_ids,expira_em,igreja_id) VALUES('PRE-A',$1,'Responsável',ARRAY[$2::uuid],ARRAY[$3::uuid],now()+interval '1 hour',$4)",[GUARDIAN,CHILD,r.checkin.id,A]);
  await reject(`INSERT INTO kids_pre_checkins(codigo,responsavel_membro_id,responsavel_nome,crianca_ids,checkin_ids,expira_em,igreja_id) VALUES('PRE-B','${GUARDIAN}','Responsável',ARRAY['${CHILD}'::uuid],ARRAY['${r.checkin.id}'::uuid],now()+interval '1 hour','${B}')`,/incompatíveis/);
 });

});
