// @vitest-environment node
import {describe,it,expect,vi,afterEach} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {direcionarMatricula,signDirecionarToken,verifyDirecionarToken,contextoDirecionarToken}=require('../../backend/services/nextDirecionar.js');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',M='00000000-0000-0000-0000-000000000003';
const ctx={campus_id:A,campi:[{id:A}],estado:'ativo'};
function banco(options:any={}){
 const calls:any[]=[];const db={calls,rpc:vi.fn(async()=>options.falhaRpc?{data:null,error:{code:'23514',message:'Sem vaga'}}:{data:{ok:true,criados:{batismo:true},turma_id:'t'},error:null}),from:(table:string)=>{
 const c:any={table,filtros:[],operacao:'read'};calls.push(c);const q:any={};for(const m of ['select','maybeSingle'])q[m]=()=>q;
 for(const m of ['eq','is'])q[m]=(...args:any[])=>{c.filtros.push([m,...args]);return q;};q.update=(d:any)=>{c.operacao='update';c.dados=d;return q;};
 q.then=(ok:any,fail:any)=>Promise.resolve({data:table==='app_campus_config'?{estado:options.estado||'ativo',campus_legado_id:A,ja_ativado:options.estado!=='preparacao'}:table==='igrejas'?{id:A}:options.estrangeira?null:c.operacao==='update'?options.concorrencia?null:{id:M}:{id:M,igreja_id:A,membro_id:options.semMembro?null:B,nome:'Ana',sobrenome:'Silva',turma_id:'t'},error:null}).then(ok,fail);return q;
 }};return db;
}
const dependencias=(db:any)=>({db,resolverPessoa:vi.fn(async()=>B),notificar:vi.fn(async()=>({})),horarios:{eventosAbertos:vi.fn(async()=>[{id:'e'}]),horariosConfigurados:vi.fn(async()=>[{id:'h',horario:'09:30',aberto:true}])}});
afterEach(()=>vi.unstubAllEnvs());
describe('Next direciona atos com campus e transação única',()=>{
 it('recusa matrícula estrangeira antes de tocar identidade ou destino',async()=>{
  const db=banco({estrangeira:true}),deps=dependencias(db);
  await expect(direcionarMatricula({matriculaId:M,destinos:['batismo'],campus:ctx},deps)).rejects.toThrow('neste campus');
  expect(deps.resolverPessoa).not.toHaveBeenCalled();expect(db.rpc).not.toHaveBeenCalled();expect(db.calls[0].filtros).toContainEqual(['eq','igreja_id',A]);
 });
 it('escolha inválida falha antes de resolver pessoa ou marcar flags',async()=>{
  const db=banco(),deps=dependencias(db);
  await expect(direcionarMatricula({matriculaId:M,destinos:['batismo'],campus:ctx,horarioBatismo:'fora'},deps)).rejects.toThrow('horário aberto');
  expect(deps.resolverPessoa).not.toHaveBeenCalled();expect(db.rpc).not.toHaveBeenCalled();expect(db.calls.every(c=>c.operacao==='read')).toBe(true);
 });
 it('RPC recebe unidade autorizada e catálogo local; capacidade não depende de contagem JS',async()=>{
  const db=banco(),deps=dependencias(db);
  await direcionarMatricula({matriculaId:M,destinos:['batismo'],campus:ctx,horarioBatismo:'09:30'},deps);
  expect(db.rpc).toHaveBeenCalledWith('fn_campus_next_direcionar',expect.objectContaining({p_igreja_id:A,p_matricula_id:M,p_evento_batismo_id:'e',p_horario_batismo_id:'h'}));
  expect(deps.resolverPessoa).toHaveBeenCalledWith(expect.objectContaining({membro_id:B}),ctx,'next_direcionamento',{supabase:db,membroVinculado:B});
  expect(deps.notificar).toHaveBeenCalledWith(expect.objectContaining({campus:ctx,chaveDedup:`next_direcionamento:${A}:${M}:batismo`}));
  expect(db.calls.some(c=>c.dados?.indicou_batismo)).toBe(false);
 });
 it('falha de capacidade não notifica nem grava flags antecipadas',async()=>{
  const db=banco({falhaRpc:true}),deps=dependencias(db);
  await expect(direcionarMatricula({matriculaId:M,destinos:['batismo','grupos'],campus:ctx,horarioBatismo:'09:30'},deps)).rejects.toThrow('Sem vaga');
  expect(deps.notificar).not.toHaveBeenCalled();expect(db.calls.every(c=>c.operacao==='read')).toBe(true);
 });
 it('CAS de identidade falha se matrícula mudou, antes da RPC',async()=>{
  const db=banco({semMembro:true,concorrencia:true}),deps=dependencias(db);
  await expect(direcionarMatricula({matriculaId:M,destinos:['grupos'],campus:ctx},deps)).rejects.toThrow('alterada');
  expect(db.rpc).not.toHaveBeenCalled();expect(db.calls[1].filtros).toContainEqual(['is','membro_id',null]);
 });
 it('token v2 vincula campus; adulteração e componentes extras são rejeitados',async()=>{
  vi.stubEnv('CRON_SECRET','segredo-sintetico');const token=signDirecionarToken(ctx);
  expect(verifyDirecionarToken(token)).toBe(true);
  const raw=Buffer.from(token,'base64url').toString();
  expect(verifyDirecionarToken(Buffer.from(raw.replace(A,B)).toString('base64url'))).toBe(false);
  expect(verifyDirecionarToken(Buffer.from(raw+'.extra').toString('base64url'))).toBe(false);
  expect(await contextoDirecionarToken(token,banco())).toMatchObject({campus_id:A,estado:'ativo'});
 });
 it('QR legado só resolve unidade na preparação',async()=>{
  vi.stubEnv('CRON_SECRET','segredo-sintetico');const token=signDirecionarToken();
  await expect(contextoDirecionarToken(token,banco())).rejects.toThrow('campus');
  expect(await contextoDirecionarToken(token,banco({estado:'preparacao'}))).toMatchObject({campus_id:A,estado:'preparacao'});
 });
 it('QR sem segredo não é emitido nem aceito',()=>{
  vi.stubEnv('CRON_SECRET','');expect(signDirecionarToken(ctx)).toBe(null);expect(verifyDirecionarToken('abc')).toBe(false);
 });
});
