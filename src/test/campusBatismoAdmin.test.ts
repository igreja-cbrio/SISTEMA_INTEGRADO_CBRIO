import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
const contexto={campus_id:A,campi:[{id:A}]};
function ambiente(falha=false) {
  const calls:any[]=[];
  const records:any={batismo_inscricoes:[{id:'local',igreja_id:A,membro_id:'m',codigo_acesso:'segredo',codigo_conferencia:'outro',data_batismo:'2026-10-25',deleted_at:null},{id:'fora',igreja_id:B,membro_id:'m',deleted_at:null}],mem_trilha_valores:[{id:'t',igreja_id:B,membro_id:'m',data_conclusao:'2026-01-01',etapa:'conversao',concluida:true,deleted_at:null},{id:'t2',igreja_id:A,membro_id:'m',data_conclusao:'2026-10-01',etapa:'conversao',concluida:true,deleted_at:null}],batismo_horarios:[{id:'h',igreja_id:A,horario:'09:30',deleted_at:null}]};
  const db={from:(table:string)=>{const c:any={table,filters:[],start:0,end:999};calls.push(c);const q:any={};
    for(const op of ['select','order'])q[op]=()=>q;
    for(const op of ['eq','is','in'])q[op]=(key:string,value:any)=>{c.filters.push({op,key,value});return q;};
    q.range=(start:number,end:number)=>{c.start=start;c.end=end;return q;};
    q.then=(resolve:any,reject:any)=>Promise.resolve({data:(records[table]||[]).filter((r:any)=>c.filters.every((f:any)=>f.op==='in'?f.value.includes(r[f.key]):r[f.key]===f.value)).slice(c.start,c.end+1),error:falha&&table==='mem_trilha_valores'?new Error('offline'):null}).then(resolve,reject);return q;}};
  const module={exports:{} as any};
  vm.runInNewContext(readFileSync(join(__dirname,'../../backend/services/campusBatismoAdmin.js'),'utf8'),{module,Date,Map,Set,require:(name:string)=>name==='./batismoHorarios'?{eventosAbertos:async()=>[{id:'e',data:'2026-10-25'}],ocupacaoPorHorario:async()=>({'09:30':3})}:require(name.startsWith('../')?'../../backend/'+name.slice(3)+'.js':'../../backend/services/'+name.slice(2)+'.js')});
  return {db,calls,svc:module.exports};
}
describe('Admin de batismo por campus',()=>{
  it('remove credenciais e não lê conversão de outro campus',async()=>{
    const e=ambiente();const result=await e.svc.listarBatismos(e.db,contexto);
    expect(result).toHaveLength(1);expect(result[0]).toMatchObject({id:'local',data_conversao:'2026-10-01',dias_conversao_batismo:24});
    expect(result[0]).not.toHaveProperty('codigo_acesso');expect(result[0]).not.toHaveProperty('codigo_conferencia');
    expect(e.calls.every(c=>c.filters.some((f:any)=>f.key==='igreja_id'&&f.value===A))).toBe(true);
  });
  it('não transforma falha na leitura de trilha em ausência de conversão',async()=>{
    const e=ambiente(true);await expect(e.svc.listarBatismos(e.db,contexto)).rejects.toThrow('offline');
  });
  it('usa evento explícito e rejeita data fora do catálogo local',async()=>{
    const e=ambiente();expect(await e.svc.listarHorarios(e.db,contexto)).toMatchObject({evento_id:'e',data_batismo:'2026-10-25',horarios:[{inscritos:3}]});
    await expect(e.svc.listarHorarios(e.db,contexto,'2026-11-22')).rejects.toThrow('neste campus');
    await expect(e.svc.listarHorarios(e.db,contexto,'2026-02-31')).rejects.toThrow('inválida');
  });
  it.each([-1,1.2,'10x',{},true,Number.MAX_SAFE_INTEGER+1])('não converte limite inválido %j em vagas ilimitadas',valor=>{
    expect(()=>ambiente().svc.validarHorario({limite:valor},false)).toThrow();
  });
  it('preserva zero, limite vazio explícito e campos editáveis',()=>{
    const {svc}=ambiente();expect(svc.validarHorario({horario:' 09:30 ',limite:0,aberto:false},true)).toEqual({horario:'09:30',label:'09:30',limite:0,aberto:false,ordem:99});
    expect(svc.validarHorario({limite:null,igreja_id:B,id:'fora'},false)).toEqual({limite:null});
  });
});
