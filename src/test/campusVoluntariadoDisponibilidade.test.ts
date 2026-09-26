// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const {criarDisponibilidadeVoluntariado}=createRequire(import.meta.url)('../../backend/services/campusVoluntariado.js');
const A='00000000-0000-0000-0000-000000000001';
const B='00000000-0000-0000-0000-000000000002';
function env(ausente='',falha=''){
 const calls:any[]=[];
 const db={from(table:string){const c:any={table,eq:[]};calls.push(c);const q:any={};
 for(const m of ['select','insert','delete','maybeSingle','single'])q[m]=(...args:any[])=>{c[m]=args;return q;};q.eq=(...args:any[])=>{c.eq.push(args);return q;};
 q.then=(resolve:any,reject:any)=>Promise.resolve({data:table===ausente?null:{id:A,scheduled_at:'2026-09-27T01:00:00Z'},error:table===falha?{message:'offline'}:null}).then(resolve,reject);return q;}};
 async function run(body:any={},excluir=false){const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);
 await criarDisponibilidadeVoluntariado({supabase:db,excluir})({body,params:{id:A},user:{id:A},campus:{estado:'ativo',campus_id:A,campi:[{id:A}]}},res);return res;}
 return{calls,run};
}
describe('Voluntariado · indisponibilidade própria',()=>{
 it('usa identidade do token e data BRT do serviço local, sem aceitar perfil injetado',async()=>{
 const e=env();const r=await e.run({service_id:A,volunteer_profile_id:B,unavailable_from:'2030-01-01'});expect(r.status).not.toHaveBeenCalled();
 expect(e.calls[0].eq).toEqual([['auth_user_id',A]]);
 expect(e.calls.find(c=>c.table==='vol_services').eq).toContainEqual(['igreja_id',A]);
 expect(e.calls.find(c=>c.insert).insert[0]).toMatchObject({igreja_id:A,volunteer_profile_id:A,unavailable_from:'2026-09-26',unavailable_to:'2026-09-26'});
 });
 it.each([['vol_profile_campi',403],['vol_services',404]])('origem ausente %s não escreve',async(t,status)=>{
 const e=env(String(t));expect((await e.run({service_id:A})).status).toHaveBeenCalledWith(status);expect(e.calls.some(c=>c.insert)).toBe(false);
 });
 it('exclusão combina ID, proprietário e campus na mesma operação',async()=>{
 const e=env();await e.run({},true);expect(e.calls[1].eq).toEqual([['igreja_id',A],['id',A],['volunteer_profile_id',A]]);expect(e.calls[1].delete).toEqual([]);
 });
 it('ID de outra pessoa/campus ausente não produz falso sucesso',async()=>{
 expect((await env('vol_availability').run({},true)).status).toHaveBeenCalledWith(404);
 });
 it.each([{igreja_id:B},{unavailable_from:'2026-02-30'}])('payload inválido não escreve',async body=>{
 const e=env();await e.run(body);expect(e.calls.some(c=>c.insert)).toBe(false);
 });
 it('erro de vínculo não é autorização',async()=>{
 const e=env('','vol_profile_campi');expect((await e.run({service_id:A})).status).toHaveBeenCalledWith(503);expect(e.calls.some(c=>c.insert)).toBe(false);
 });
});
