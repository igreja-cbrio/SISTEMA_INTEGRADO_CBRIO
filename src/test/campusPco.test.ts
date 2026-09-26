// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const {carregarOrigensPco,resolverServicoPco,sincronizarEquipesPco}=createRequire(import.meta.url)('../../backend/services/campusPco.js');
const A='00000000-0000-0000-0000-000000000001';
const B='00000000-0000-0000-0000-000000000002';
const origem={igreja_id:A,service_type_id:A,pco_service_type_id:'123',estado:'ativo',campus_id:A,campi:[{id:A}]};
function env(overrides:any={}){
 const calls:any[]=[];
 const rows:any={app_campus_config:{estado:'ativo',ja_ativado:true,campus_legado_id:A},vol_pco_service_type_campi:[{...origem,igrejas:{id:A,ativa:true}}],vol_schedules:[{id:A,planning_center_person_id:'42',volunteer_name:'Pessoa',team_name:'Câmeras',team_id:null}],vol_pco_mapa:[{id:A,pco_chave:'cameras',team_id:A,position_id:A}],vol_profiles:[{id:A,planning_center_id:'42'}],vol_team_members:[],...overrides};
 const rpc=vi.fn(async(..._args:any[])=>({data:{id:A,igreja_id:A},error:null}));
 const db={rpc,from(table:string){const c:any={table,eq:[]};calls.push(c);const q:any={};
 for(const m of ['select','order','range','in','is','maybeSingle','insert','update'])q[m]=(...args:any[])=>{c[m]=args;return q;};q.eq=(...args:any[])=>{c.eq.push(args);return q;};
 q.then=(resolve:any,reject:any)=>Promise.resolve({data:c.update?[{id:A}]:rows[table],error:rows[table] instanceof Error?rows[table]:null}).then(resolve,reject);return q;}};
 return{db,calls,rpc};
}
describe('PCO · origem e fanout locais',()=>{
 it('carrega mapa por ID externo sem inferir nome',async()=>{
 const e=env();const {mapa}=await carregarOrigensPco(e.db);expect(mapa.get('123').igreja_id).toBe(A);expect(mapa.has('Domingo')).toBe(false);
 });
 it('duplicidade ou origem inválida bloqueia produtor inteiro',async()=>{
 const row={...origem,igrejas:{id:A,ativa:true}};
 await expect(carregarOrigensPco(env({vol_pco_service_type_campi:[row,row]}).db)).rejects.toMatchObject({status:503});
 await expect(carregarOrigensPco(env({vol_pco_service_type_campi:[{...row,igrejas:{id:B,ativa:true}}]}).db)).rejects.toMatchObject({status:503});
 });
 it('consulta indisponível não vira mapa vazio',async()=>{
 await expect(carregarOrigensPco(env({vol_pco_service_type_campi:new Error('offline')}).db)).rejects.toThrow('offline');
 });
 it('resolve serviço via RPC atômica com origem explícita',async()=>{
 const e=env();await resolverServicoPco(e.db,origem,{id:'123',attributes:{name:'Nome'}},{id:'456',attributes:{title:'Culto'}},'2026-09-27T12:00:00Z');
 expect(e.rpc).toHaveBeenCalledWith('fn_campus_vol_resolver_servico',expect.objectContaining({p_igreja_id:A,p_service_type_id:A,p_pco_service_type_id:'123',p_pco_plan_id:'456'}));
 expect(e.calls).toHaveLength(0);
 });
 it('tipo externo divergente não executa RPC',async()=>{
 const e=env();await expect(resolverServicoPco(e.db,origem,{id:'outro'},{})).rejects.toMatchObject({status:503});expect(e.rpc).not.toHaveBeenCalled();
 });
 it('equipes e escalas usam somente mapa local sem escrever status global da pessoa',async()=>{
 const e=env();expect(await sincronizarEquipesPco(e.db,origem,['42'])).toMatchObject({assigned:1,religadas:1});
 for(const c of e.calls.filter(c=>!['vol_profiles'].includes(c.table)&&!c.insert))expect(c.eq).toContainEqual(['igreja_id',A]);
 expect(e.calls.find(c=>c.insert).insert[0]).toMatchObject({igreja_id:A,volunteer_profile_id:A,team_id:A});
 expect(e.calls.filter(c=>c.table==='vol_profiles').some(c=>c.update)).toBe(false);
 });
 it('nome fora do mapa vira pendência e nunca cria equipe',async()=>{
 const e=env({vol_pco_mapa:[]});expect(await sincronizarEquipesPco(e.db,origem,['42'])).toMatchObject({assigned:0,pendentes:1});expect(e.calls.some(c=>c.insert)).toBe(false);
 });
});
