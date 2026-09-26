// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const {criarLeituraVoluntariado} = createRequire(import.meta.url)('../../backend/services/campusVoluntariado.js');
const A='00000000-0000-0000-0000-000000000001';
function env(tipo:string,{falha='',paginar=false,semPerfil=false}={}) {
 const queries:any[]=[];
 const db={from(table:string){
  const c:any={table,eq:[]}; queries.push(c);const q:any={};
  for(const m of ['select','in','order','limit','range','gte','lte','lt','not','maybeSingle']) q[m]=(...a:any[])=>{c[m]=a;return q;};
  q.eq=(...a:any[])=>{c.eq.push(a);return q;};
  q.then=(resolve:any,reject:any)=>{
   let data:any=[{id:A,service_id:A,schedule_id:A}];
   if(table==='vol_profiles') data=semPerfil?null:{id:A,planning_center_id:'123'};
   if(paginar&&table==='vol_schedules') data=c.range?.[0]===0?Array.from({length:1000},(_,i)=>({id:String(i),service_id:A})): [{id:'1000',service_id:A}];
   return Promise.resolve({data,error:falha===table?{message:'offline'}:null}).then(resolve,reject);
  };return q;
 }};
 async function run(query:any={}){const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);
 await criarLeituraVoluntariado({supabase:db,tipo,agora:()=>new Date('2026-09-27T01:30:00Z')})({query,user:{id:A},campus:{estado:'ensaio',campus_id:A,campi:[{id:A}]}},res);return res;}
 return {run,queries};
}
describe('Voluntariado · leituras locais completas',()=>{
 it.each(['services','upcoming','today','window','report','schedules','checkins'])('%s filtra todo acesso a atos e seus filhos',async tipo=>{
  const e=env(tipo);const r=await e.run(tipo==='report'?{desde:'2026-09-01',ate:'2026-09-30'}:{});
  expect(r.status).not.toHaveBeenCalled();expect(e.queries.length).toBeGreaterThan(0);
  for(const q of e.queries) expect(q.eq).toContainEqual(['igreja_id',A]);
 });
 it('contagem atravessa teto1000 sem publicar total parcial',async()=>{
  const e=env('services',{paginar:true});const r=await e.run();expect(r.json).toHaveBeenCalledWith([expect.objectContaining({scheduled_count:1001})]);
 });
 it.each(['vol_services','vol_schedules'])('falha em %s devolve503, nunca contagem zero',async falha=>{
  expect((await env('services',{falha}).run()).status).toHaveBeenCalledWith(503);
 });
 it('hoje respeita BRT na virada UTC',async()=>{
  const e=env('today');await e.run();expect(e.queries[0].gte).toEqual(['scheduled_at','2026-09-26T00:00:00-03:00']);expect(e.queries[0].lt).toEqual(['scheduled_at','2026-09-27T00:00:00-03:00']);
 });
 it.each([{service_id:'id,injetado'},{volunteer_id:'x'},{service_id:[A]}])('filtro inválido não inicia consulta',async query=>{
  const e=env('schedules');expect((await e.run(query)).status).toHaveBeenCalledWith(400);expect(e.queries).toHaveLength(0);
 });
 it.each([{desde:'2026-02-30',ate:'2026-03-02'},{desde:'2026-09-30',ate:'2026-09-01'}])('período inválido não consulta',async query=>{
  const e=env('report');expect((await e.run(query)).status).toHaveBeenCalledWith(400);expect(e.queries).toHaveLength(0);
 });
 it('check-ins de escala são carregados apenas pelos IDs derivados da leitura local',async()=>{
  const e=env('schedules');await e.run();expect(e.queries[1].in).toEqual(['schedule_id',[A]]);
 });
});

describe('Voluntariado · leituras próprias',()=>{
 it.each(['my-services','my-availability','my-checkins','my-schedules'])('%s comprova perfil pelo token e filtra atos locais',async tipo=>{
  const e=env(tipo);const r=await e.run({volunteer_id:'00000000-0000-0000-0000-000000000002'});
  expect(r.status).not.toHaveBeenCalled();
  expect(e.queries[0].eq).toEqual([['auth_user_id',A]]);
  for(const q of e.queries.slice(1)) expect(q.eq).toContainEqual(['igreja_id',A]);
  expect(JSON.stringify(e.queries)).not.toContain('00000000-0000-0000-0000-000000000002');
 });
 it('busca PCO estruturada deduplica própria escala e não usa or interpolado',async()=>{
  const e=env('my-schedules');const r=await e.run();expect(r.json).toHaveBeenCalledWith([expect.objectContaining({id:A,has_checkin:true})]);
  expect(e.queries[2].eq).toContainEqual(['planning_center_person_id','123']);
 });
 it('perfil ausente não consulta atos; erro não vira perfil ausente',async()=>{
  const e=env('my-schedules',{semPerfil:true});expect((await e.run()).json).toHaveBeenCalledWith([]);expect(e.queries).toHaveLength(1);
  expect((await env('my-schedules',{falha:'vol_profiles'}).run()).status).toHaveBeenCalledWith(503);
 });
});
