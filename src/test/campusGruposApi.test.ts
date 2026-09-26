import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const G1='10000000-0000-0000-0000-000000000001',G2='10000000-0000-0000-0000-000000000002';
const L1='20000000-0000-0000-0000-000000000001',L2='20000000-0000-0000-0000-000000000002';
const noop=(_req:any,_res:any,next:any)=>next();
function ambiente(total=1,fail=''){
  const queries:any[]=[];
  const grupos=[{id:G1,igreja_id:A,nome:'Grupo A',lider_id:L1,ativo:true,temporada:'t'},{id:G2,igreja_id:B,nome:'Grupo B',lider_id:L2,ativo:true,temporada:'t'}];
  const roster=Array.from({length:total},(_,i)=>({id:'r'+i,grupo_id:G1,membro_id:'m'+i,saiu_em:null,mem_membros:{id:'m'+i,nome:'Participante'}}));
  const db:any={};
  function query(table:string,args?:any){
    const call:any={table,args,filters:[]};queries.push(call);const q:any={};
    for(const method of ['select','order','range','single','maybeSingle','limit'])q[method]=(...values:any[])=>{call[method]=values;return q;};
    for(const method of ['eq','in','is','not'])q[method]=(...values:any[])=>{call.filters.push({method,values});return q;};
    q.then=(resolve:any,reject:any)=>{
      let rows:any=[];
      if(table==='mem_grupos')rows=grupos;
      if(table==='mem_grupo_membros')rows=[...roster,{id:'other',grupo_id:G2,membro_id:'other',saiu_em:null}];
      if(table==='mem_membros')rows=[{id:L1,nome:'Líder vinculado',telefone:'referência legítima'},{id:L2,nome:'Outro líder',telefone:'não pode vazar'}];
      if(table==='mem_temporadas')rows=[{id:'t',ativa:true}];
      if(table==='mem_temporada_consolidado')rows=[{id:G1,igreja_id:A,temporada:'t'},{id:G2,igreja_id:B,temporada:'t'}];
      if(table==='fn_grupos_ultima_frequencia_campus')rows=roster.map(r=>({membro_id:r.membro_id}));
      if(table==='fn_temporada_metricas_campus')rows=[{num_grupos:1}];
      if(['fn_grupos_kpis_relatorio_campus','fn_temporada_series_campus','fn_consolidar_temporada_campus'].includes(table))rows={ok:true};
      if(Array.isArray(rows)){
        rows=rows.filter(row=>call.filters.every(({method,values}:any)=>{
          const [field,value,third]=values;
          if(method==='eq')return row[field]===value;
          if(method==='in')return value.includes(row[field]);
          if(method==='is')return row[field]==value;
          if(method==='not'&&value==='is')return row[field]!=third;
          return true;
        }));
        if(call.range)rows=rows.slice(call.range[0],call.range[1]+1);
        if(call.limit)rows=rows.slice(0,call.limit[0]);
        if(call.single||call.maybeSingle)rows=rows[0]||null;
      }
      return Promise.resolve({data:rows,error:table===fail?{message:'Falha simulada'}:null}).then(resolve,reject);
    };return q;
  }
  db.from=(table:string)=>query(table);db.rpc=(name:string,args:any)=>query(name,args);
  const routes=new Map<string,any[]>();const router:any={use:vi.fn()};
  for(const method of ['get','post','put','patch','delete'])router[method]=(path:string,...handlers:any[])=>routes.set(method+path,handlers);
  const localRequire=(name:string)=>{
    if(name==='express')return {Router:()=>router};
    if(name==='../utils/supabase')return {supabase:db};
    if(name==='../middleware/auth')return {authenticate:noop,authorizeModule:(_module:string,nivel:number)=>Object.assign((_req:any,_res:any,next:any)=>next(),{nivel})};
    if(name==='../middleware/campus')return {criarMiddlewareCampus:(options:any)=>Object.assign((_req:any,_res:any,next:any)=>next(),{campus:options})};
    if(name==='multer')return Object.assign(()=>({single:()=>noop}),{memoryStorage:()=>({})});
    if(['../utils/campusQuery','../utils/campusPaginacao','../services/gruposCampusLeitura'].includes(name))return require('../../backend/'+name.slice(3)+'.js');
    return new Proxy({}, {get:()=>()=>undefined});
  };
  vm.runInNewContext(readFileSync('backend/routes/grupos.js','utf8'),{require:localRequire,module:{exports:{}},console:{...console,error:vi.fn()},setImmediate});
  async function run(path:string,options:any={}){
    const method=options.method||'get';const req:any={method:method.toUpperCase(),query:{temporada:'t',...options.query},params:{id:options.id||G1},body:options.body||{},user:{userId:L1,name:'Gestor'},campus:{campus_id:A,campi:[{id:A}]}};
    // Listagem de grupos não usa temporada por padrão nesta fixture.
    if(['/', '/buscar'].includes(path))req.query=options.query||{};
    const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);
    const handlers=routes.get(method+path)!;let index=0;const next=():any=>handlers[index++]?.(req,res,next);await next();return res;
  }
  return {run,queries,routes};
}
describe('Grupos API por campus',()=>{
  it.each(['/','/buscar'])('%s limita pais e hidrata somente o líder explicitamente vinculado',async(path)=>{
    const env=ambiente();const res=await env.run(path);
    expect(res.status).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0]).toHaveLength(1);
    expect(env.queries.filter(q=>q.table==='mem_grupos').every(q=>q.filters.some((f:any)=>f.method==='eq'&&f.values[0]==='igreja_id'&&f.values[1]===A))).toBe(true);
    expect(env.queries.find(q=>q.table==='mem_membros').filters).toContainEqual({method:'in',values:['id',[L1]]});
  });
  it('lista conta vínculos além da primeira página, sempre ligados a pais autorizados',async()=>{
    const env=ambiente(1002);const res=await env.run('/');expect(res.json.mock.calls[0][0][0].membros_count).toBe(1002);
    expect(env.queries.filter(q=>q.table==='mem_grupo_membros').every(q=>q.filters.some((f:any)=>f.method==='in'&&f.values[0]==='grupo_id'&&f.values[1].length===1&&f.values[1][0]===G1))).toBe(true);
  });
  it('404 do pai remoto acontece antes de qualquer consulta nominal de filhos',async()=>{
    const env=ambiente();expect((await env.run('/:id',{id:G2})).status).toHaveBeenCalledWith(404);
    expect(env.queries).toHaveLength(1);expect(env.queries[0].table).toBe('mem_grupos');
  });
  it('detalhe pagina o roster e não mascara falha de consulta como lista vazia',async()=>{
    const env=ambiente(1002);expect((await env.run('/:id')).json.mock.calls[0][0].membros).toHaveLength(1002);
    const failed=ambiente(1,'mem_grupo_membros');expect((await failed.run('/:id')).status).toHaveBeenCalledWith(500);
  });
  it.each([['/kpis/relatorio','fn_grupos_kpis_relatorio_campus'],['/kpis/temporada-series','fn_temporada_series_campus'],['/kpis/sem-presenca','fn_temporada_sem_presenca_campus']])('%s usa RPC explicitamente recortada',async(path,rpc)=>{
    const env=ambiente();await env.run(path,{query:{igreja_id:B}});expect(env.queries.find(q=>q.table===rpc).args.p_igreja_id).toBe(A);
  });
  it('métricas derivadas paginam roster e última frequência no mesmo campus',async()=>{
    const env=ambiente(1002);const res=await env.run('/kpis/temporada-metricas');
    expect(res.status).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].frequentadores).toBe(1002);
    expect(env.queries.filter(q=>q.table==='fn_grupos_ultima_frequencia_campus')).toHaveLength(2);
    expect(env.queries.filter(q=>q.table.startsWith('fn_')).every(q=>q.args.p_igreja_id===A)).toBe(true);
  });
  it('comparativo filtra snapshots e consolidação ignora campus/autor forjados no corpo',async()=>{
    const env=ambiente();const list=await env.run('/temporadas/consolidado');expect(list.json.mock.calls[0][0].consolidados).toHaveLength(1);
    await env.run('/temporadas/:id/consolidar',{method:'post',body:{igreja_id:B,p_por:L2}});
    const rpc=env.queries.find(q=>q.table==='fn_consolidar_temporada_campus');expect(rpc.args).toMatchObject({p_igreja_id:A,p_por:L1});
    expect(env.routes.get('post/temporadas/:id/consolidar')![0].nivel).toBe(5);
  });
  it('certificação só aparece nos handlers testados, após guard de módulo',()=>{
    const env=ambiente();expect(env.routes.get('get/')![1].campus.cobertura).toEqual({leitura:true,escrita:false});
    expect(env.routes.get('get/kpis/taticos')!.some(h=>h.campus)).toBe(false);
    expect(env.routes.get('post/')!.some(h=>h.campus)).toBe(false);
  });
});
