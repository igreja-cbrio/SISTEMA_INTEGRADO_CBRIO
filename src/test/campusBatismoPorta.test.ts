// @vitest-environment node
import { describe,it,expect,vi } from 'vitest';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {contextoPublico,catalogo,reservar,membroConfirmado}=require('../../backend/services/campusBatismoPorta');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const E='10000000-0000-0000-0000-000000000001',H='20000000-0000-0000-0000-000000000001';
function banco(estado='ativo') {
 const calls:any[]=[];
 const rows:any={app_campus_config:{id:true,estado,campus_legado_id:A,ja_ativado:estado!=='preparacao'},igrejas:[{id:A,slug:'sede',nome:'Sede',tipo:'sede',ativa:true},{id:B,slug:'nova',nome:'Nova',tipo:'sede',ativa:true},{id:E,slug:'cba',nome:'CBA',tipo:'cba_acompanhada',ativa:true}],batismo_horarios:[{id:H,igreja_id:B,horario:'10:00',label:'10h',aberto:true,limite:2,deleted_at:null}],batismo_inscricoes:[],profiles:[{id:A,membro_id:H}],mem_membros:[{id:H,nome:'Pessoa Confirmada',deleted_at:null}],batismo_config:{grupo_url:'global'}};
 const db:any={calls,rows,rpc:vi.fn(async(name:string,args:any)=>({data:name==='fn_campus_batismo_datas_abertas'?[{id:E,data:'2099-09-20'}]:{id:args.p_inscricao_id},error:null})),from:vi.fn((table:string)=>{
   const c:any={table,filters:[],range:null,single:false};calls.push(c);const q:any={};
   for(const k of ['select','order','limit'])q[k]=()=>q;
   for(const k of ['eq','is','not'])q[k]=(...args:any[])=>{c.filters.push([k,...args]);return q;};
   q.range=(a:number,b:number)=>{c.range=[a,b];return q;};q.maybeSingle=()=>{c.single=true;return q;};
   q.then=(ok:any,no:any)=>{
     let data=rows[table]; if(Array.isArray(data)){data=data.filter(x=>c.filters.every(([op,k,v]:any[])=>op==='not'?true:x[k]===v));if(c.range)data=data.slice(c.range[0],c.range[1]+1);if(c.single)data=data[0]||null;}
     return Promise.resolve({data,error:null}).then(ok,no);
   };return q;
 })};return db;
}
describe('porta pública/App de batismo por campus',()=>{
 it('catálogo público só oferece sedes e exige seleção explícita fora de preparação',async()=>{
  const db=banco();expect((await contextoPublico(db,null,false)).campi).toHaveLength(2);
  await expect(contextoPublico(db,null)).rejects.toMatchObject({status:409});
  expect((await contextoPublico(db,'nova')).campus_id).toBe(B);
  await expect(contextoPublico(db,'cba')).rejects.toMatchObject({status:404});
  await expect(contextoPublico(db,[B])).rejects.toMatchObject({status:400});
 });
 it('somente preparação admite legado sem escolha',async()=>{
  const db=banco('preparacao');expect((await contextoPublico(db,null)).campus_id).toBe(A);
  await expect(contextoPublico(db,B)).rejects.toMatchObject({status:404});
 });
 it('identidade App vem somente de profiles.membro_id, sem e-mail ou CPF do cliente',async()=>{
  const db=banco();expect((await membroConfirmado(db,A)).id).toBe(H);
  db.rows.profiles=[];await expect(membroConfirmado(db,A)).rejects.toMatchObject({status:403});
  expect(db.calls.filter((c:any)=>c.table==='mem_membros')).toHaveLength(1);
  db.rows.profiles=[{id:A,membro_id:H}];db.rows.mem_membros[0].deleted_at='2026-09-27';
  await expect(membroConfirmado(db,A)).rejects.toMatchObject({status:403});
 });
 it('catálogo inclui IDs locais, termos e não reaproveita grupo global em ensaio/ativo',async()=>{
  const db=banco();const r=await catalogo(db,await contextoPublico(db,B));
  expect(r).toMatchObject({campus_id:B,grupo_url:null,datas:[{evento_id:E,horarios:[{horario_id:H}]}]});
  expect(r.termos_lgpd).toBeTruthy();
  expect(db.calls.filter((c:any)=>['batismo_horarios','batismo_inscricoes'].includes(c.table)).every((c:any)=>c.filters.some((f:any)=>f[1]==='igreja_id'&&f[2]===B))).toBe(true);
 });
 it('reserva usa RPC atômica e descarta campos de edição/permissão injetados',async()=>{
  const db=banco(),ctx=await contextoPublico(db,B);
  await reservar(db,ctx,{nome:'Pessoa',sobrenome:'Teste',membro_id:H,data_batismo:'2099-09-20',horario_culto:'10:00',status:'pendente',origem:'app'},{evento_id:E,horario_id:H,inscricao_id:A,p_editar:true,igreja_id:A,checkin_por:A});
  expect(db.rpc).toHaveBeenCalledWith('fn_campus_batismo_reservar',expect.objectContaining({p_igreja_id:B,p_evento_id:E,p_horario_id:H,p_inscricao_id:A,p_editar:false}));
  const args=db.rpc.mock.calls.find((c:any)=>c[0]==='fn_campus_batismo_reservar')[1];
  expect(args).not.toHaveProperty('p_checkin_por');
 });
 it('recusa evento/horário divergentes e erro na RPC não vira sucesso',async()=>{
  const db=banco(),ctx=await contextoPublico(db,B),p={data_batismo:'2099-09-20',horario_culto:'10:00'};
  await expect(reservar(db,ctx,p,{evento_id:A,horario_id:H})).rejects.toMatchObject({status:409});
  const rpc=db.rpc;db.rpc=vi.fn((name:string,args:any)=>name==='fn_campus_batismo_reservar'?Promise.resolve({error:{code:'23514',message:'Não há vagas.'}}):rpc(name,args));
  await expect(reservar(db,ctx,p,{evento_id:E,horario_id:H})).rejects.toMatchObject({status:409});
 });
});
