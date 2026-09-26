import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const A = '00000000-0000-0000-0000-000000000001', B = '00000000-0000-0000-0000-000000000002';
function ambiente(estado = 'ativo', segundaPaginaFalha = false) {
  const chamadas: any[] = [];
  const db = { rpc: vi.fn(async () => ({ data: [{ id: 'evento', data: '2026-10-25' }], error: null })), from: (table: string) => {
    const c: any = { table, filters: [] }; chamadas.push(c); const q: any = {};
    for (const method of ['select','is','not','order','range','maybeSingle']) q[method] = (...args: any[]) => { c[method] = args; return q; };
    q.eq = (...args: any[]) => { c.filters.push(args); return q; };
    q.then = (resolve: any, reject: any) => {
      let data: any = [];
      if (table === 'app_campus_config') data = { estado, campus_legado_id: A, ja_ativado: estado !== 'preparacao' };
      if (table === 'igrejas') data = { id: A };
      if (table === 'batismo_horarios') data = [{ id: 'h', horario: '09:30', aberto: true, limite: 1200 }];
      if (table === 'batismo_inscricoes') data = Array.from({length:1002},()=>({horario_culto:'09:30'})).slice(c.range[0],c.range[1]+1);
      const error = table === 'batismo_inscricoes' && segundaPaginaFalha && c.range[0] > 0 ? { message:'offline' } : null;
      return Promise.resolve({data,error}).then(resolve,reject);
    };return q;
  }};
  const module = { exports: {} as any };
  vm.runInNewContext(readFileSync(join(__dirname,'../../backend/services/batismoHorarios.js'),'utf8'), { module, console, require: (name: string) => name === '../utils/supabase' ? {supabase:db} : require(name.startsWith('../') ? '../../backend/'+name.slice(3)+'.js' : '../../backend/services/'+name.slice(2)+'.js') });
  return { db, chamadas, svc: module.exports };
}
describe('Batismo · catálogo e capacidade por campus',()=>{
  it('catálogo e ocupação aplicam unidade e exclusões canônicas',async()=>{
    const e=ambiente(); await e.svc.horariosConfigurados({campusId:B});
    expect(await e.svc.ocupacaoPorHorario('2026-10-25',{campusId:B})).toEqual({'09:30':1002});
    for(const c of e.chamadas.filter(c=>c.table.startsWith('batismo_'))) expect(c.filters).toContainEqual(['igreja_id',B]);
    expect(e.chamadas.find(c=>c.table==='batismo_inscricoes').not).toEqual(['status','in','(cancelado,rejeitado)']);
  });
  it('falha em página posterior impede decisão com ocupação parcial',async()=>{
    const e=ambiente('ativo',true); await expect(e.svc.ocupacaoPorHorario('2026-10-25',{campusId:A})).rejects.toBeTruthy();
  });
  it('datas são do catálogo explícito, sem RPC global ou fórmula substituta',async()=>{
    const e=ambiente(); expect(await e.svc.datasAbertas(3,{campusId:B})).toEqual(['2026-10-25']);
    expect(e.db.rpc).toHaveBeenCalledWith('fn_campus_batismo_datas_abertas',{p_igreja_id:B,p_n:3});
  });
  it('cliente legado só escolhe Sede em preparação',async()=>{
    const antigo=ambiente('preparacao'); expect(await antigo.svc.dataProximoBatismo()).toBe('2026-10-25');
    expect(antigo.db.rpc).toHaveBeenCalledWith('fn_campus_batismo_datas_abertas',{p_igreja_id:A,p_n:1});
    const ativo=ambiente(); expect(await ativo.svc.dataProximoBatismo()).toBeNull(); expect(ativo.db.rpc).not.toHaveBeenCalled();
    expect(await antigo.svc.horariosConfigurados({campusId:B})).toBeNull();
  });
  it('data inválida não consulta inscrições',async()=>{
    const e=ambiente(); await expect(e.svc.ocupacaoPorHorario('2026-02-31',{campusId:A})).rejects.toThrow('Data');
    expect(e.chamadas).toHaveLength(0);
  });
});
