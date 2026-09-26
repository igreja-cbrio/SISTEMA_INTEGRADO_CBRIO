import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const ctx={campus_id:A,campi:[{id:A}]};
function ambiente(){
 const calls:any[]=[];let payload:any;
 const db={rpc:vi.fn(async(_name:string,args:any)=>({data:{id:args.p_inscricao_id,nome:args.p_nome,codigo_acesso:'segredo'},error:null})),from:(table:string)=>{
  const c:any={table,filters:[]};calls.push(c);const q:any={};
  for(const op of ['select','is','maybeSingle','single'])q[op]=()=>q;
  q.eq=(key:string,value:any)=>{c.filters.push([key,value]);return q;};q.insert=(p:any)=>{payload=p;return q;};q.update=(p:any)=>{payload=p;return q;};
  q.then=(resolve:any,reject:any)=>{
   const id=c.filters.find(([k]:any)=>k==='id')?.[1];const campus=c.filters.find(([k]:any)=>k==='igreja_id')?.[1];
   const data=table==='batismo_eventos'?(campus===A&&id!=='estrangeiro'?{id:'e',data:'2026-10-25'}:null):table==='batismo_horarios'?(campus===A&&id!=='estrangeiro'?{id:'h',horario:'09:30'}:null):{...payload,id:'novo',codigo_acesso:'segredo'};
   return Promise.resolve({data,error:null}).then(resolve,reject);};return q;}};
 const module={exports:{} as any};vm.runInNewContext(readFileSync(join(__dirname,'../../backend/services/campusBatismoInscricao.js'),'utf8'),{module,Date,require:(name:string)=>name==='./batismoHorarios'?{eventosAbertos:async()=>[{id:'e',data:'2026-10-25'}]}:name.startsWith('node:')?require(name):require(name.startsWith('../')?'../../backend/'+name.slice(3)+'.js':'../../backend/services/'+name.slice(2)+'.js')});
 return {db,calls,svc:module.exports,payload:()=>payload};
}
describe('Gravação administrativa de batismo',()=>{
 it('edição usa registro completo e RPC atômica sem aceitar identidade/auditoria do cliente',async()=>{
  const e=ambiente();const atual={id:'i',igreja_id:A,membro_id:'m',nome:'Ana',sobrenome:'Silva',cpf:'legado',telefone:'21999999999',email:'ana@example.org',status:'confirmado',area_kpi:'sede',eh_crianca:false,possui_deficiencia:false,evento_id:'e',horario_id:'h',observacoes:'Antes'};
  const row=await e.svc.salvar(e.db,ctx,{observacoes:'Depois',membro_id:'fora',cpf:'alterado',inscrito_por:'invasor'},{atual,usuarioId:'ator'});
  expect(e.db.rpc).toHaveBeenCalledWith('fn_campus_batismo_reservar',expect.objectContaining({p_editar:true,p_inscricao_id:'i',p_membro_id:'m',p_cpf:'legado',p_telefone:'21999999999',p_observacoes:'Depois',p_inscrito_por:'ator'}));expect(row).not.toHaveProperty('codigo_acesso');
 });
 it('criação sem agendamento normaliza e passa pelo matcher antes de inserir no campus',async()=>{
  const e=ambiente(),resolverPessoa=vi.fn(async()=> 'm');await e.svc.salvar(e.db,ctx,{nome:' Ana ',sobrenome:' Silva ',telefone:'(21) 99999-9999',email:' ANA@EXAMPLE.ORG '},{resolverPessoa,usuarioId:'ator'});
  expect(resolverPessoa).toHaveBeenCalledWith(expect.objectContaining({nome:'Ana Silva',telefone:'21999999999',email:'ana@example.org'}),ctx,'batismo_cadastro_interno',{supabase:e.db});
  expect(e.payload()).toMatchObject({membro_id:'m',igreja_id:A,inscrito_por:'ator'});expect(e.db.rpc).not.toHaveBeenCalled();
 });
 it('evento estrangeiro falha antes do matcher e de qualquer gravação',async()=>{
  const e=ambiente(),resolverPessoa=vi.fn();await expect(e.svc.salvar(e.db,ctx,{nome:'Ana',sobrenome:'Silva',evento_id:'estrangeiro',horario_id:'h'},{resolverPessoa})).rejects.toThrow('neste campus');expect(resolverPessoa).not.toHaveBeenCalled();expect(e.db.rpc).not.toHaveBeenCalled();expect(e.payload()).toBeUndefined();
 });
 it('falha do matcher não gera inscrição sem vínculo',async()=>{
  const e=ambiente();await expect(e.svc.salvar(e.db,ctx,{nome:'Ana',sobrenome:'Silva'},{resolverPessoa:async()=>{throw new Error('Identidade indisponível');}})).rejects.toThrow('Identidade');expect(e.payload()).toBeUndefined();
 });
 it('totem exige CPF e usa evento do catálogo da unidade selecionada',async()=>{
  const e=ambiente();await expect(e.svc.salvar(e.db,ctx,{nome:'Ana',sobrenome:'Silva',origem:'totem',horario_culto:'09:30'})).rejects.toThrow('CPF');
  await e.svc.salvar(e.db,ctx,{nome:'Ana',sobrenome:'Silva',origem:'totem',cpf:'52998224725',horario_culto:'09:30'},{resolverPessoa:async()=> 'm'});
  expect(e.db.rpc).toHaveBeenCalledWith('fn_campus_batismo_reservar',expect.objectContaining({p_igreja_id:A,p_evento_id:'e',p_horario_id:'h',p_editar:false}));
 });
 it('check-in usa membro do ato local e não toma identidade do payload',async()=>{
  const e=ambiente(),resolverPessoa=vi.fn(async()=> 'm');
  const atual={id:'i',igreja_id:A,membro_id:'m',nome:'Ana',sobrenome:'Silva',updated_at:'2026-09-26T00:00:00Z',checkin_em:'2026-09-25T00:00:00Z',checkin_por:'original',cpf:'legado'};
  await e.svc.registrarCheckin(e.db,ctx,atual,{membro_id:'intruso',consentiu:'true'},'ator',{resolverPessoa});
  expect(resolverPessoa).toHaveBeenCalledWith(expect.objectContaining({membro_id:'m',cpf:'legado',nome:'Ana Silva'}),ctx,'batismo_checkin',{supabase:e.db,membroVinculado:'m'});
  expect(e.payload()).toMatchObject({checkin_em:atual.checkin_em,checkin_por:'original'});
  expect(e.payload()).not.toHaveProperty('consentimento_em');
  expect(e.calls[0].filters).toEqual(expect.arrayContaining([['igreja_id',A],['id','i'],['updated_at',atual.updated_at]]));
 });
 it('check-in estrangeiro é negado antes de reconciliar identidade',async()=>{
  const e=ambiente(),resolverPessoa=vi.fn();await expect(e.svc.registrarCheckin(e.db,ctx,{id:'i',igreja_id:B},{},'ator',{resolverPessoa})).rejects.toThrow('não encontrada');expect(resolverPessoa).not.toHaveBeenCalled();expect(e.payload()).toBeUndefined();
 });

 it('edição de contato autorizada acumula na identidade vinculada e não aceita trocar CPF/membro',async()=>{
  const e=ambiente(),resolverPessoa=vi.fn(async()=> 'm');const atual={id:'i',igreja_id:A,membro_id:'m',cpf:'52998224725',nome:'Ana',sobrenome:'Silva',telefone:'21911111111',email:'original@example.org',status:'pendente',area_kpi:'sede',eh_crianca:false,possui_deficiencia:false,evento_id:'e',horario_id:'h'};
  await e.svc.salvar(e.db,ctx,{telefone:'(21) 99999-9999',email:' NOVO@EXAMPLE.ORG ',membro_id:'intruso',cpf:'outro'},{atual,editarDadosPessoa:true,resolverPessoa});
  expect(resolverPessoa).toHaveBeenCalledWith(expect.objectContaining({membro_id:'m',cpf:'52998224725',telefone:'21999999999',email:'novo@example.org'}),ctx,'batismo_cadastro_interno',{supabase:e.db,membroVinculado:'m'});
  expect(e.db.rpc).toHaveBeenCalledWith('fn_campus_batismo_reservar',expect.objectContaining({p_membro_id:'m',p_cpf:'52998224725',p_telefone:'21999999999',p_email:'novo@example.org'}));
 });

});
