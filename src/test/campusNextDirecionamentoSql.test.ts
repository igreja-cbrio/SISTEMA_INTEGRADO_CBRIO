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
async function matricula(campus=B,member:string|null=MEM){
 const turma=await id("INSERT INTO next_turmas(nome,igreja_id) VALUES('Next sintético',$1)",[campus]);
 return id("INSERT INTO next_matriculas(turma_id,nome,sobrenome,membro_id,sexo) VALUES($1,'Pessoa','Sintética',$2,'feminino')",[turma,member]);
}
async function slot(campus=B,limite=2){
 const evento=await id("INSERT INTO batismo_eventos(data,igreja_id,aberto) VALUES($1,$2,true)",[campus===B?'2027-03-14':'2027-03-07',campus]);
 const horario=await id("INSERT INTO batismo_horarios(horario,label,igreja_id,limite) VALUES($1,'Horário sintético',$2,$3)",[campus===B?'10:00':'11:00',campus,limite]);
 return {evento,horario};
}
async function call(m:string,destinos=['grupos'],areas:string[]=[],bath?:{evento:string,horario:string},campus=B){return (await db.query<{r:any}>('SELECT fn_campus_next_direcionar($1,$2,$3,$4,$5,$6,$7) AS r',[campus,m,destinos,areas,bath?.evento||null,bath?.horario||null,U])).rows[0].r;}
describe('Next: direcionamento transacional entre módulos e campi',()=>{
 beforeAll(async()=>{
  db=new PGlite({extensions:{unaccent,pg_trgm,pgcrypto}});
  for(const file of ['campusIntegracaoBase.sql','campusKidsBase.sql','campusVoluntariadoBase.sql','campusIntegracaoComplemento.sql','campusNextDirecionamentoBase.sql']){
   const sql=readFileSync('src/test/fixtures/'+file,'utf8');try{await db.exec(sql);}catch(error){const e=error as Error&{position?:string};throw new Error(file+': '+e.message+' '+sql.slice(Number(e.position)-100,Number(e.position)+100));}
  }
  await db.exec(`INSERT INTO igrejas(id,nome,slug,tipo) VALUES('${A}','Sede','cbrio-sede','sede');
   INSERT INTO profiles(id,name,email) VALUES('${U}','Usuário A','a@example.invalid'),('${V}','Usuário B','b@example.invalid');
   INSERT INTO usuario_igrejas(usuario_id,igreja_id) VALUES('${U}','${A}');
   INSERT INTO modulos(slug,nome,escopo_campus) VALUES('voluntariado','Voluntariado','isolado'),('integracao','Integração','isolado'),('next','Next','isolado'),('grupos','Grupos','isolado');
   INSERT INTO mem_membros(id,nome,igreja_id) VALUES('${MEM}','Pessoa global','${A}');
   INSERT INTO mem_ministerios(nome) VALUES('Voluntariado (geral)');`);
  const files=readdirSync('supabase/migrations').filter(f=>/^2026092.*multicampus.*\.sql$/.test(f)&&(f.slice(0,14)<='20260927180000'||f.slice(0,14)==='20260927210000')).sort();
  for(const file of files){try{await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));}catch(error){throw new Error(file+': '+(error as Error).message);}}
  await db.exec(`INSERT INTO igrejas(id,nome,slug,tipo) VALUES('${B}','Campus B','campus-b','sede');INSERT INTO usuario_igrejas(usuario_id,igreja_id) VALUES('${V}','${B}');`);
 },30000);
 beforeEach(async()=>{await db.exec('BEGIN');});afterEach(async()=>{await db.exec('ROLLBACK;RESET ROLE');});afterAll(async()=>{await db.close();});
 it('deduplica encaminhamento e flag após sucesso, preservando pessoa global',async()=>{
  await activate();const m=await matricula();const first=await call(m);const second=await call(m);
  expect(first.criados.grupos).toBe(true);expect(second.criados).toEqual({});expect(second.registros).toEqual(first.registros);
  expect((await db.query('SELECT igreja_id,membro_id FROM jornada_encaminhamentos')).rows).toEqual([{igreja_id:B,membro_id:MEM}]);
  expect((await db.query('SELECT indicou_grupo FROM next_matriculas WHERE id=$1',[m])).rows[0]).toEqual({indicou_grupo:true});
  expect((await db.query('SELECT igreja_id FROM mem_membros WHERE id=$1',[MEM])).rows[0]).toEqual({igreja_id:A});
 });
 it('sem identidade canônica falha fechado sem flag, mas devocional só registra intenção',async()=>{
  await activate();const m=await matricula(B,null);
  await reject(`SELECT fn_campus_next_direcionar('${B}','${m}',ARRAY['grupos'])`,/identidade canônica/);
  expect((await db.query('SELECT indicou_grupo FROM next_matriculas WHERE id=$1',[m])).rows[0]).toEqual({indicou_grupo:false});
  expect((await call(m,['devocional'])).criados).toEqual({devocional:true});
 });
 it('reserva Batismo e cria inscrição Voluntariado do mesmo ato atomicamente',async()=>{
  await activate();const m=await matricula(),bath=await slot();
  await db.exec("INSERT INTO vol_form_opcoes(label,area_canonica) VALUES('Kids','kids')");
  const result=await call(m,['grupos','voluntarios','batismo','devocional'],['Kids'],bath);
  expect(result.criados).toEqual({grupos:true,voluntarios:true,batismo:true,devocional:true});
  expect(Object.keys(result).sort()).toEqual(['criados','destinos','ok','registros','turma_id']);
  expect((await db.query('SELECT igreja_id,sexo FROM batismo_inscricoes WHERE id=$1',[result.registros.batismo])).rows[0]).toEqual({igreja_id:B,sexo:'F'});
  expect((await db.query('SELECT igreja_id,membro_id,sexo,area FROM vol_inscricoes')).rows).toEqual([{igreja_id:B,membro_id:MEM,sexo:'feminino',area:'kids'}]);
  expect((await call(m,['grupos','voluntarios','batismo','devocional'],['Kids'],bath)).criados).toEqual({});
 });
 it('horário lotado reverte todo fanout e todas as flags',async()=>{
  await activate();const m=await matricula(),bath=await slot(B,0);
  await reject(`SELECT fn_campus_next_direcionar('${B}','${m}',ARRAY['grupos','batismo'],ARRAY[]::text[],'${bath.evento}','${bath.horario}','${U}')`,/vagas/);
  expect((await db.query('SELECT id FROM jornada_encaminhamentos')).rows).toEqual([]);
  expect((await db.query('SELECT indicou_grupo,indicou_batismo FROM next_matriculas WHERE id=$1',[m])).rows[0]).toEqual({indicou_grupo:false,indicou_batismo:false});
 });
 it('preserva inscrição de Batismo já agendada e seus contatos humanos',async()=>{
  await activate();const m=await matricula(),bath=await slot();
  const old=(await db.query<{r:any}>("SELECT to_jsonb(fn_campus_batismo_reservar($1,$2,$3,gen_random_uuid(),$4,'Nome','Anterior',NULL,'21999999999','anterior@example.invalid')) AS r",[B,bath.evento,bath.horario,MEM])).rows[0].r;
  const result=await call(m,['batismo'],[],bath);
  expect(result.criados).toEqual({});expect(result.registros.batismo).toBe(old.id);expect((await db.query('SELECT email,nome FROM batismo_inscricoes WHERE id=$1',[old.id])).rows[0]).toEqual({email:'anterior@example.invalid',nome:'Nome'});
 });
 it('rejeita origem remota e áreas inativas sem flag nem destino',async()=>{
  await activate();const m=await matricula(),remote=await slot(A);
  await reject(`SELECT fn_campus_next_direcionar('${B}','${m}',ARRAY['batismo'],ARRAY[]::text[],'${remote.evento}','${remote.horario}')`,/neste campus/);
  await db.exec("INSERT INTO vol_form_opcoes(label,area_canonica,ativo) VALUES('Desativada','kids',false)");
  await reject(`SELECT fn_campus_next_direcionar('${B}','${m}',ARRAY['voluntarios'],ARRAY['Desativada'])`,/Área/);
  await reject(`SELECT fn_campus_next_direcionar('${A}','${m}',ARRAY['grupos'])`,/Matrícula não encontrada/);
 });
 it('encaminhamentos herdam e restringem campus mesmo com policy antiga permissiva',async()=>{
  await activate();const m=await matricula();await call(m);
  await reject(`INSERT INTO jornada_encaminhamentos(origem,next_matricula_id,nome,destino,igreja_id) VALUES('next','${m}','Pessoa','grupos','${A}')`,/diverge/);
  await db.exec(`SET LOCAL ROLE authenticated;SET LOCAL "test.user"='${U}';SET LOCAL "test.level"='5';`);
  expect((await db.query('SELECT id FROM jornada_encaminhamentos')).rows).toEqual([]);
  await reject(`SELECT fn_campus_next_direcionar('${B}','${m}',ARRAY['grupos'])`,/permission denied/);
 });
 it('falha posterior à reserva reverte a vaga e impede flags parciais',async()=>{
  await activate();const m=await matricula(),bath=await slot();
  const other=await id("INSERT INTO mem_membros(nome,igreja_id) VALUES('Outra pessoa',$1)",[B]);
  await db.query("INSERT INTO vol_inscricoes(nome,sobrenome,nome_completo,membro_id,next_matricula_id,igreja_id,data_inscricao,area,status) VALUES('Outra','Pessoa','Outra pessoa',$1,$2,$3,now(),'sede','inscrito')",[other,m,B]);
  await reject(`SELECT fn_campus_next_direcionar('${B}','${m}',ARRAY['batismo','voluntarios'],ARRAY[]::text[],'${bath.evento}','${bath.horario}')`,/outra pessoa/);
  expect((await db.query('SELECT id FROM batismo_inscricoes')).rows).toEqual([]);
  expect((await db.query('SELECT indicou_batismo,indicou_servir FROM next_matriculas WHERE id=$1',[m])).rows[0]).toEqual({indicou_batismo:false,indicou_servir:false});
 });
 it('enriquece vínculo canônico vazio do encaminhamento sem criar segunda linha',async()=>{
  await activate();const m=await matricula();
  const old=await id("INSERT INTO jornada_encaminhamentos(origem,next_matricula_id,nome,destino) VALUES('next',$1,'Pessoa sintética','grupos')",[m]);
  const result=await call(m);expect(result.criados).toEqual({});expect(result.registros.grupos).toBe(old);
  expect((await db.query('SELECT membro_id FROM jornada_encaminhamentos WHERE id=$1',[old])).rows[0]).toEqual({membro_id:MEM});
 });
 it('preenche apenas o horário vazio da inscrição anterior',async()=>{
  await activate();const m=await matricula(),bath=await slot();
  const old=await id("INSERT INTO batismo_inscricoes(nome,sobrenome,membro_id,igreja_id,status,email) VALUES('Nome','Anterior',$1,$2,'pendente','anterior@example.invalid')",[MEM,B]);
  const result=await call(m,['batismo'],[],bath);
  expect(result.criados).toEqual({batismo_horario_atualizado:true});expect(result.registros.batismo).toBe(old);
  expect((await db.query('SELECT email,horario_id FROM batismo_inscricoes WHERE id=$1',[old])).rows[0]).toEqual({email:'anterior@example.invalid',horario_id:bath.horario});
 });
});
