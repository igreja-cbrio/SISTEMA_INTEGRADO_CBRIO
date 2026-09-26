// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const A='00000000-0000-0000-0000-000000000001';
function env(estado='ativo',falha='') {
 const calls:any[]=[];
 const db={from(table:string){const c:any={table,eq:[]};calls.push(c);const q:any={};
 for(const m of ['select','range','order','gte','in','upsert','maybeSingle'])q[m]=(...args:any[])=>{c[m]=args;return q;};
 q.eq=(...args:any[])=>{c.eq.push(args);return q;};
 q.then=(resolve:any,reject:any)=>{
 const rows:any={app_campus_config:{estado,ja_ativado:estado!=='preparacao',campus_legado_id:A},vol_services:[{id:A,scheduled_at:'2020-01-05T12:00:00Z'}],vol_schedules:[{id:A,service_id:A,volunteer_name:'Pessoa local',planning_center_person_id:'123',confirmation_status:'confirmed'}],vol_profiles:[{id:A,planning_center_id:'123'}],vol_servicos_historico:[]};
 return Promise.resolve({data:rows[table],error:table===falha?new Error('offline'):null}).then(resolve,reject);};return q;}};
 const mod:any={exports:{}};
 vm.runInNewContext(readFileSync('backend/services/voluntariadoFreqPCO.js','utf8'),{module:mod,console,Date,require(n:string){if(n==='../utils/supabase')return{supabase:db};return require('../../backend/'+(n.startsWith('../')?n.slice(3):'services/'+n.slice(2))+'.js');}});
 return{calls,run:(ctx:any)=>mod.exports.bridgeFrequenciaPCO('2020-01-01',ctx,db)};
}
const ctx={estado:'ativo',campus_id:A,campi:[{id:A}]};
describe('Voluntariado · produtor de frequência local',()=>{
 it('estampa origem e conflito composto, sem usar campus-base da identidade',async()=>{
 const e=env();await e.run(ctx);
 for(const c of e.calls.filter(x=>['vol_services','vol_schedules'].includes(x.table)))expect(c.eq).toContainEqual(['igreja_id',A]);
 const write=e.calls.find(c=>c.table==='vol_servicos_historico');expect(write.upsert[0][0].igreja_id).toBe(A);
 expect(write.upsert[1].onConflict).toBe('igreja_id,nome_norm,data,culto_label,origem');
 });
 it('produtor antigo sem origem falha antes de ler atos quando ativo',async()=>{
 const e=env();await expect(e.run(undefined)).rejects.toMatchObject({status:503});expect(e.calls.map(c=>c.table)).toEqual(['app_campus_config']);
 });
 it('preparação confirmada mantém origem legada explícita',async()=>{
 const e=env('preparacao');await e.run(undefined);expect(e.calls.find(c=>c.table==='vol_servicos_historico').upsert[0][0].igreja_id).toBe(A);
 });
 it.each(['vol_profiles','vol_servicos_historico'])('falha em %s não relata sucesso parcial',async falha=>{
 await expect(env('ativo',falha).run(ctx)).rejects.toThrow('offline');
 });
});
