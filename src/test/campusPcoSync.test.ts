// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const A='00000000-0000-0000-0000-000000000001';
const origem={igreja_id:A,service_type_id:A,pco_service_type_id:'123',estado:'ativo',campus_id:A,campi:[{id:A}]};
function env({semMapa=false,erroMapa=false,rosterFalha=false}={}){
 const processar=vi.fn(async(..._args:any[])=>({services:1,schedules:1,membersFound:1,membersProcessed:1,volunteers:new Map([['42',{planning_center_person_id:'42'}]])}));
 const arquivar=vi.fn();const perfis=vi.fn(async(..._args:any[])=>({count:1,dbError:null}));const pessoas=vi.fn();const bridge=vi.fn(async(..._args:any[])=>({inseridos:1}));
 const planning={getPCCredentials:()=>({basic:'fixture'}),fetchAllServiceTypes:async()=>[{id:'123'},{id:'999'}],fetchAllPlans:async()=>[],fetchAllTeamPersons:async()=>{if(rosterFalha)throw new Error('offline');return new Map();},fetchAllServicesPeople:pessoas,processServiceType:processar,upsertVolunteerQrCodes:async()=>0,upsertVolunteerProfiles:perfis,reconcilePlanningCenterProfiles:arquivar};
 const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{pco_ativo:true},error:null})};const db={from:()=>q};
 const mod:any={exports:{}};
 vm.runInNewContext(readFileSync('backend/services/voluntariadoSync.js','utf8'),{module:mod,console,Date,require(n:string){
 if(n==='./campusPco')return{carregarOrigensPco:async()=>{if(erroMapa)throw new Error('mapa offline');return{estado:'ativo',mapa:new Map(semMapa?[]:[['123',origem]])};}};
 if(n==='../utils/supabase')return{supabase:db};if(n==='./planningCenter')return planning;
 if(n==='../utils/volSyncIntegrity')return{decidirReconciliacao:(r:any)=>({podeReconciliar:r.pessoasCompletas,motivo:'roster parcial'})};
 if(n==='./voluntariadoFreqPCO')return{bridgeFrequenciaPCO:bridge};throw new Error(n);
 }});
 return{run:mod.exports.executarSyncCompleto,processar,arquivar,perfis,pessoas,bridge};
}
describe('PCO · execução com mapa completo de origem',()=>{
 it('importa somente tipo mapeado e informa tipo pendente sem reativar/arquivar perfil global',async()=>{
 const e=env();const result=await e.run();expect(result.tiposSemOrigem).toEqual(['999']);expect(result.tiposComFalha).toBe(1);
 expect(e.processar).toHaveBeenCalledTimes(1);expect(e.processar.mock.calls[0][4]).toEqual(origem);
 expect(e.perfis).toHaveBeenCalledWith(expect.anything(),expect.anything(),{preservarStatus:true,estrito:true});
 expect(e.arquivar).not.toHaveBeenCalled();expect(e.pessoas).not.toHaveBeenCalled();expect(e.bridge).toHaveBeenCalledWith(expect.any(String),origem);
 });
 it('nenhum mapa não autoriza fallback global',async()=>{
 const e=env({semMapa:true});expect((await e.run()).tiposComFalha).toBe(2);expect(e.processar).not.toHaveBeenCalled();expect(e.arquivar).not.toHaveBeenCalled();
 });
 it('erro do mapa interrompe antes de qualquer importação',async()=>{
 const e=env({erroMapa:true});await expect(e.run()).rejects.toThrow('mapa offline');expect(e.processar).not.toHaveBeenCalled();expect(e.perfis).not.toHaveBeenCalled();
 });
 it('roster parcial permite ingestão aditiva, mas nunca arquiva identidade global',async()=>{
 const e=env({rosterFalha:true});expect((await e.run()).tiposComFalha).toBe(2);expect(e.processar).toHaveBeenCalledTimes(1);expect(e.arquivar).not.toHaveBeenCalled();
 });
});
