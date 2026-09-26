// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {unaccent} from '@electric-sql/pglite/contrib/unaccent';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync,readdirSync} from 'node:fs';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',U='10000000-0000-0000-0000-000000000001',V='10000000-0000-0000-0000-000000000002',C='20000000-0000-0000-0000-000000000001',R='30000000-0000-0000-0000-000000000001';
const REF='totem-40000000-0000-0000-0000-000000000001';let db:PGlite;
async function id(sql:string,args:unknown[]=[]){return(await db.query<{id:string}>(sql+' RETURNING id',args)).rows[0].id;}
async function negar(sql:string,args:unknown[],texto:RegExp){await db.exec('SAVEPOINT tentativa');await expect(db.query(sql,args)).rejects.toThrow(texto);await db.exec('ROLLBACK TO SAVEPOINT tentativa');}
async function contexto(campus=B){const culto=await id("INSERT INTO cultos(nome,data,hora,igreja_id) VALUES('Sintético',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'10:00',$1)",[campus]);const sessao=await id("INSERT INTO kids_sessoes(culto_id,status,abrir_em) VALUES($1,'aberta',now())",[culto]);const sala=await id('INSERT INTO kids_salas(nome,capacidade,igreja_id) VALUES($1,10,$2)',['Sala '+campus,campus]);await db.query('INSERT INTO kids_crianca_campi(crianca_id,igreja_id) VALUES($1,$2)',[C,campus]);return {campus,culto,sessao,sala};}
async function reservar(ctx:Awaited<ReturnType<typeof contexto>>,user=U){return(await db.query<{codigo:string}>('SELECT * FROM fn_campus_kids_reservar_codigos($1,$2,$3,$4,2)',[ctx.campus,user,REF,ctx.sessao])).rows.map(r=>r.codigo);}
async function replay(ctx:Awaited<ReturnType<typeof contexto>>,codigo:string,user=U,crianca=C){return(await db.query<{r:any}>('SELECT fn_campus_kids_checkin_offline($1,$2,$3,$4,$5,$6,$7,$8,now()-interval \'1 minute\') AS r',[ctx.campus,user,REF,ctx.sessao,crianca,ctx.sala,R,codigo])).rows[0].r;}
describe('configuração e reserva Kids reais por campus',()=>{
 beforeAll(async()=>{
  db=new PGlite({extensions:{unaccent,pg_trgm,pgcrypto}});
  for(const f of ['campusIntegracaoBase.sql','campusKidsBase.sql'])await db.exec(readFileSync('src/test/fixtures/'+f,'utf8'));
  await db.exec(`INSERT INTO igrejas(id,nome,slug,tipo) VALUES('${A}','Sede','cbrio-sede','sede');INSERT INTO profiles(id,name,email) VALUES('${U}','Operador A','a@example.invalid'),('${V}','Operador B','b@example.invalid');INSERT INTO usuario_igrejas(usuario_id,igreja_id) VALUES('${U}','${A}');INSERT INTO modulos(slug,nome,escopo_campus) VALUES('kids','Kids','isolado');INSERT INTO mem_membros(id,nome,igreja_id) VALUES('${R}','Responsável','${A}');INSERT INTO kids_criancas(id,nome) VALUES('${C}','Criança');INSERT INTO kids_responsaveis(crianca_id,membro_id,autorizado_buscar) VALUES('${C}','${R}',true);INSERT INTO kids_totem_config(id,edit_senha_hash) VALUES(true,'hash-legado');INSERT INTO kids_etiqueta_config(id,fonte) VALUES(1,'mono');`);
  const arquivos=readdirSync('supabase/migrations').filter(f=>/^2026092.*multicampus.*\.sql$/.test(f)&&(f.slice(0,14)<='20260927070000'||['20260927090000','20260927100000','20260927130000','20260927190000'].includes(f.slice(0,14)))).sort();
  for(const f of arquivos){try{await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));}catch(e){throw new Error(f+': '+(e as Error).message);}}
  await db.exec(`INSERT INTO igrejas(id,nome,slug,tipo) VALUES('${B}','Campus B','campus-b','sede')`);
 },30000);
 beforeEach(async()=>{await db.exec('BEGIN');});afterEach(async()=>{await db.exec('ROLLBACK;RESET ROLE');});afterAll(async()=>{await db.close();});
 it('migra configuração apenas à Sede e mantém ponte bidirecional em preparação',async()=>{
  expect((await db.query('SELECT igreja_id,edit_senha_hash FROM kids_totem_config_campus')).rows).toEqual([{igreja_id:A,edit_senha_hash:'hash-legado'}]);
  await db.exec("UPDATE kids_totem_config SET edit_senha_hash='hash-novo'");expect((await db.query('SELECT edit_senha_hash FROM kids_totem_config_campus')).rows[0]).toEqual({edit_senha_hash:'hash-novo'});
  await db.query("UPDATE kids_etiqueta_config_campus SET fonte='sans' WHERE igreja_id=$1",[A]);expect((await db.query('SELECT fonte FROM kids_etiqueta_config')).rows[0]).toEqual({fonte:'sans'});
  await db.query('INSERT INTO kids_totem_config_campus(igreja_id) VALUES($1)',[B]);expect((await db.query('SELECT edit_senha_hash FROM kids_totem_config_campus WHERE igreja_id=$1',[B])).rows[0]).toEqual({edit_senha_hash:null});
 });
 it('clientes não leem hashes nem chamam reserva, apesar das políticas antigas permissivas',async()=>{
  await db.exec('SET LOCAL ROLE authenticated');await negar('SELECT * FROM kids_totem_config_campus',[],/permission denied/);await negar('SELECT * FROM fn_campus_kids_reservar_codigos($1,$2,$3,$4,2)',[A,U,REF,A],/permission denied/);
 });
 it('reserva é idempotente por usuário/campus/sessão e não compartilha códigos entre operadores',async()=>{
  const ctx=await contexto();const primeiro=await reservar(ctx);expect(primeiro).toHaveLength(2);expect(await reservar(ctx)).toEqual(primeiro);const outro=await reservar(ctx,V);expect(outro.every(c=>!primeiro.includes(c))).toBe(true);
  await negar('SELECT * FROM fn_campus_kids_reservar_codigos($1,$2,$3,$4,2)',[A,U,REF,ctx.sessao],/Sessão indisponível/);
 });
 it('replay comprova código e criança e preserva o horário que ocorreu',async()=>{
  const ctx=await contexto();const [codigo]=await reservar(ctx);const primeiro=await replay(ctx,codigo);const segundo=await replay(ctx,codigo);expect(segundo.replay).toBe(true);expect(segundo.checkin.id).toBe(primeiro.checkin.id);expect((await db.query('SELECT count(*)::int AS n FROM kids_checkins')).rows).toEqual([{n:1}]);
  expect((await db.query("SELECT checkin_at<now()-interval '50 seconds' AS historico FROM kids_checkins")).rows[0]).toEqual({historico:true});
 });
 it('nega outro usuário/campus/criança e não consome a reserva recusada',async()=>{
  const ctx=await contexto();const [codigo]=await reservar(ctx);
  await db.exec('SAVEPOINT recusa');await expect(replay(ctx,codigo,V)).rejects.toThrow(/não pertence/);await db.exec('ROLLBACK TO SAVEPOINT recusa');
  await replay(ctx,codigo);await db.exec('SAVEPOINT recusa2');await expect(replay(ctx,codigo,U,V)).rejects.toThrow(/outro atendimento/);await db.exec('ROLLBACK TO SAVEPOINT recusa2');
  expect((await db.query('SELECT count(*)::int AS n FROM kids_checkins')).rows).toEqual([{n:1}]);
 });
 it('outro código impresso para a mesma criança vira conflito explícito, sem sucesso falso',async()=>{
  const ctx=await contexto();const codigos=await reservar(ctx);await replay(ctx,codigos[0]);await db.exec('SAVEPOINT recusa');await expect(replay(ctx,codigos[1])).rejects.toThrow(/Outro código/);await db.exec('ROLLBACK TO SAVEPOINT recusa');expect((await db.query('SELECT status FROM kids_codigos_reservados WHERE codigo=$1',[codigos[1]])).rows).toEqual([{status:'reservado'}]);
 });
 it('RPC básica não pode consumir reserva de outro operador e NULL nunca valida replay',async()=>{
  const ctx=await contexto();const [codigo]=await reservar(ctx);
  await negar('SELECT fn_campus_kids_checkin($1,$2,$3,$4,NULL,$5,$6,$7)',[ctx.campus,ctx.sessao,C,ctx.sala,R,V,codigo],/preservar autor/);
  expect((await db.query('SELECT count(*)::int AS n FROM kids_checkins')).rows).toEqual([{n:0}]);
  await replay(ctx,codigo);
  await negar("SELECT fn_campus_kids_checkin_offline($1,$2,$3,$4,$5,NULL,$6,$7,now())",[ctx.campus,U,REF,ctx.sessao,C,R,codigo],/identificação completa/);
 });
 it('linha consumida com autor adulterado não recebe sucesso de replay',async()=>{
  const ctx=await contexto();const [codigo]=await reservar(ctx);const r=await replay(ctx,codigo);
  await db.query('UPDATE kids_checkins SET checkin_por=$1 WHERE id=$2',[V,r.checkin.id]);
  await db.exec('SAVEPOINT recusa');await expect(replay(ctx,codigo)).rejects.toThrow(/outro atendimento/);await db.exec('ROLLBACK TO SAVEPOINT recusa');
 });

});
