// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const A='00000000-0000-0000-0000-000000000001';
const origem={igreja_id:A,service_type_id:A,pco_service_type_id:'123',estado:'ativo',campus_id:A,campi:[{id:A}]};
function env({erroEscala=false,erroProtegidos=false}={}){
 const calls:any[]=[];const equipes=vi.fn(async(..._args:any[])=>({pendentes:0}));
 const rpc=vi.fn(async(..._args:any[])=>({data:{id:A,igreja_id:A},error:null}));
 const db={rpc,from(table:string){const c:any={table};calls.push(c);const q:any={};
 for(const m of ['select','eq','not','range','upsert','order'])q[m]=(...args:any[])=>{c[m]=args;return q;};
 q.then=(resolve:any,reject:any)=>Promise.resolve({data:[],count:1,error:(erroEscala&&table==='vol_schedules')||(erroProtegidos&&table==='vol_profiles'&&!c.upsert)?new Error('offline'):null}).then(resolve,reject);return q;}};
 const mod:any={exports:{}};
 const fixtureTeamData={data:[{id:'m1',attributes:{name:'Pessoa',status:'C',team_position_name:'Câmeras'},relationships:{person:{data:{id:'42'}}}}],included:[{type:'Person',id:'42',attributes:{name:'Pessoa'}}]};
 vm.runInNewContext(readFileSync('backend/services/planningCenter.js','utf8')+'\nfetchAllTeamMembers=async()=>fixtureTeamData;',{
 module:mod,console,process:{env:{}},Buffer,fixtureTeamData,require(n:string){
 if(n==='./campusPco')return{...require('../../backend/services/campusPco.js'),sincronizarEquipesPco:equipes};
 return require('../../backend/'+(n.startsWith('../')?n.slice(3):'services/'+n.slice(2))+'.js');
 }});
 return{calls,rpc,equipes,run:()=>mod.exports.processServiceType(db,{id:'123',attributes:{name:'Domingo'}},[{id:'456',attributes:{title:'Culto',sort_date:'2026-09-27T09:00:00Z'}}],'fixture',origem)};
}
describe('PCO · produtor real de serviços e escalas',()=>{
 it('RPC resolve origem, escala recebe campus e perfil preserva estado global',async()=>{
 const e=env();expect((await e.run()).schedules).toBe(1);
 expect(e.rpc).toHaveBeenCalledWith('fn_campus_vol_resolver_servico',expect.objectContaining({p_igreja_id:A,p_scheduled_at:'2026-09-27T09:00:00-03:00'}));
 const escala=e.calls.find(c=>c.table==='vol_schedules');expect(escala.upsert[0]).toMatchObject({igreja_id:A,service_id:A,planning_center_person_id:'42'});
 const perfil=e.calls.find(c=>c.table==='vol_profiles'&&c.upsert);expect(perfil.upsert[0][0]).not.toHaveProperty('allocation_status');
 expect(e.equipes).toHaveBeenCalledWith(expect.anything(),origem,['42']);
 expect(e.calls.some(c=>c.table==='vol_services')).toBe(false);
 });
 it('erro de escala não cai para constraint antiga nem declara sucesso',async()=>{
 const e=env({erroEscala:true});await expect(e.run()).rejects.toThrow('offline');expect(e.calls.filter(c=>c.table==='vol_schedules')).toHaveLength(1);expect(e.equipes).not.toHaveBeenCalled();
 });
 it('falha na proteção de perfil aborta antes de sobrescrever cadastro humano',async()=>{
 const e=env({erroProtegidos:true});await expect(e.run()).rejects.toThrow('offline');expect(e.calls.some(c=>c.table==='vol_profiles'&&c.upsert)).toBe(false);
 });
});
