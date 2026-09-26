import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const {listarPendentesPorCampus}=require('../../backend/services/campusWhatsappFila.js');
const {lembretesBatismo,amanhaBrt}=require('../../backend/services/campusBatismoLembrete.js');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const campi=[A,B].map((id,i)=>({campus_id:id,campi:[{id}],nome:i?'Zona Sul':'Sede',estado:'ativo'}));
function banco(resolver:(c:any)=>any){const calls:any[]=[];return {calls,from:(table:string)=>{const c:any={table,filtros:[],operacao:'leitura'};calls.push(c);const q:any={};for(const op of ['select','order','maybeSingle','single'])q[op]=()=>q;for(const op of ['eq','is','in','not','lte'])q[op]=(...args:any[])=>{c.filtros.push([op,...args]);return q;};q.range=(de:number,ate:number)=>{c.range=[de,ate];return q;};q.limit=(n:number)=>{c.limite=n;return q;};for(const op of ['insert','update'])q[op]=(dados:any)=>{c.operacao=op;c.dados=dados;return q;};q.then=(ok:any,erro:any)=>Promise.resolve(resolver(c)).then(ok,erro);return q;}};}
const filtro=(c:any,k:string)=>c.filtros.find((f:any)=>f[1]===k)?.[2];
function fila(db:any,opcoes:any={}){
 const sendTemplate=vi.fn(async()=>({sent:true,messageId:'meta'})),sendText=vi.fn(),escopo=vi.fn(async()=>({igreja_id:A,escopo_campus:'campus'}));
 const module={exports:{} as any};
 vm.runInNewContext(readFileSync(join(__dirname,'../../backend/services/whatsappFila.js'),'utf8'),{module,process,console,Date,Map,Set,require:(nome:string)=>{
  if(nome==='../utils/supabase')return {supabase:db};
  if(nome==='./whatsappService')return {sendTemplate,sendText,configurado:()=>opcoes.habilitado??false};
  if(nome==='./waSender')return {isConfigured:()=>true};
  if(nome==='./notificar')return {notificar:vi.fn()};
  if(nome==='./campusNotificacaoEscopo')return {escopoNotificacao:escopo,contextoEventoArmazenado:async()=>{if(opcoes.origemInvalida)throw new Error('Origem');return campi[0];}};
  if(nome==='../utils/whatsappModulo')return require('../../backend/utils/whatsappModulo.js');
  throw new Error(nome);
 }});return {svc:module.exports,sendTemplate,sendText,escopo};
}
describe('Fila WhatsApp por campus',()=>{
 it('cada partição tem orçamento independente e nenhuma busca usa fila global',async()=>{
  const db=banco(c=>({data:Array.from({length:c.limite},(_,i)=>({id:`${filtro(c,'igreja_id')}-${i}`})),error:null}));
  const rows=await listarPendentesPorCampus(db,{limite:8,listarCampi:async()=>campi});
  expect(rows).toHaveLength(8);expect(db.calls.map(c=>c.limite).sort()).toEqual([2,3,3]);
  expect(new Set(db.calls.map(c=>filtro(c,'igreja_id')))).toEqual(new Set([A,B,null]));
  expect(db.calls.every(c=>['campus','central'].includes(filtro(c,'escopo_campus')))).toBe(true);
 });
 it('erro de uma partição invalida a rodada antes de qualquer envio',async()=>{
  const db=banco(c=>filtro(c,'igreja_id')===B?{data:null,error:new Error('Banco indisponível')}:{data:[],error:null});
  await expect(listarPendentesPorCampus(db,{listarCampi:async()=>campi})).rejects.toThrow('indisponível');
 });
 it('deduplicação consulta somente mesma chave e mesmo campus sem reenviar',async()=>{
  const db=banco(c=>c.table==='wa_templates'?{data:[],error:null}:c.operacao==='insert'?{data:null,error:{code:'23505'}}:{data:{id:'existente',status:'pendente'},error:null});
  const e=fila(db),r=await e.svc.enfileirar({telefone:'21999999999',template:'batismo_lembrete',contexto:'batismo.lembrete',campus:campi[0],chaveDedup:'ato'});
  expect(r).toMatchObject({queued:true,reason:'ja_registrado'});expect(e.sendTemplate).not.toHaveBeenCalled();
  const consulta=db.calls.find(c=>c.table==='whatsapp_envios'&&c.operacao==='leitura');expect(filtro(consulta,'igreja_id')).toBe(A);expect(filtro(consulta,'chave_dedup')).toBe('ato');
 });
 it('falha da fila com origem isolada nunca degrada para envio sem registro',async()=>{
  const db=banco(c=>c.table==='wa_templates'?{data:[],error:null}:{data:null,error:{code:'XX000'}}),e=fila(db);
  expect(await e.svc.enfileirar({telefone:'21999999999',texto:'Texto',campus:campi[0]})).toMatchObject({queued:false,reason:'fila_indisponivel'});
  expect(e.sendText).not.toHaveBeenCalled();
 });
 it('origem inválida bloqueia reenvio antes de chamar a Meta',async()=>{
  const db=banco(()=>({data:{id:'e',status:'pendente'},error:null})),e=fila(db,{origemInvalida:true});
  expect(await e.svc.tentarEnvio('e')).toMatchObject({reason:'campus_indisponivel'});expect(e.sendTemplate).not.toHaveBeenCalled();
 });
 it('CAS impede dois workers de enviar a mesma linha ao mesmo tempo',async()=>{
  let tomada=false;
  const db=banco(c=>{
   if(c.table==='wa_templates')return {data:[],error:null};
   if(c.operacao==='update'&&!c.dados.status){if(tomada)return {data:null,error:null};tomada=true;return {data:{id:'e'},error:null};}
   return {data:{id:'e',status:'pendente',tipo:'template',template:'lembrete',tentativas:0,proxima_tentativa_em:'2026-01-01T00:00:00Z'},error:null};
  }),e=fila(db,{habilitado:true});
  const respostas=await Promise.all([e.svc.tentarEnvio('e'),e.svc.tentarEnvio('e')]);
  expect(e.sendTemplate).toHaveBeenCalledTimes(1);expect(respostas.some(r=>r.reason==='envio_em_processamento')).toBe(true);
  expect(db.calls.filter(c=>c.operacao==='update'&&!c.dados.status).every(c=>filtro(c,'proxima_tentativa_em')==='2026-01-01T00:00:00Z')).toBe(true);
 });
});
describe('Lembrete de Batismo por ato local',()=>{
 it('amanhã respeita meia-noite em Brasília e virada de mês',()=>{
  expect(amanhaBrt(new Date('2026-10-01T02:00:00Z'))).toBe('2026-10-01');
  expect(amanhaBrt(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10-02');
 });
 it('pagina todos os inscritos e preserva origem e chave do ato em cada envio',async()=>{
  const db=banco(c=>({data:filtro(c,'igreja_id')===B?[]:Array.from({length:c.range[0]===0?1000:1},(_,i)=>({id:`i${c.range[0]+i}`,membro_id:'m',evento_id:'e',horario_culto:'09:30'})),error:null}));
  const enviar=vi.fn(async()=>({queued:true})),r=await lembretesBatismo({db,notificarMembro:enviar,listarCampi:async()=>campi,agora:new Date('2026-09-26T12:00:00Z')});
  expect(r).toMatchObject({ok:true,alvo:1001});expect(enviar).toHaveBeenCalledTimes(1001);
  expect(enviar).toHaveBeenLastCalledWith('m','batismo_lembrete',['27/09/2026','09:30 · Sede'],expect.objectContaining({campus:campi[0],chaveDedup:'batismo_lembrete:i1000:e:2026-09-27'}));
  expect(db.calls.every(c=>filtro(c,'data_batismo')==='2026-09-27'&&filtro(c,'deleted_at')===null)).toBe(true);
 });
 it('segunda página com erro não envia lista parcial; outro campus continua',async()=>{
  const db=banco(c=>filtro(c,'igreja_id')===A?(c.range[0]?{data:null,error:new Error('Página')}:{data:Array(1000).fill({id:'a'}),error:null}):{data:[{id:'b',membro_id:'mb',evento_id:'eb'}],error:null});
  const enviar=vi.fn(async()=>({queued:true})),r=await lembretesBatismo({db,notificarMembro:enviar,listarCampi:async()=>campi});
  expect(r.ok).toBe(false);expect(enviar).toHaveBeenCalledTimes(1);expect(enviar).toHaveBeenCalledWith('mb',expect.anything(),expect.anything(),expect.objectContaining({campus:campi[1]}));
 });
 it('inscrição sem evento e falha de fila aparecem como erro, nunca sucesso falso',async()=>{
  const db=banco(()=>({data:[{id:'a',membro_id:'m',evento_id:null},{id:'b',membro_id:'m',evento_id:'e'}],error:null}));
  const enviar=vi.fn(async()=>({reason:'fila_indisponivel'})),r=await lembretesBatismo({db,notificarMembro:enviar,listarCampi:async()=>[campi[0]]});
  expect(r).toMatchObject({ok:false,campi:[{erros:2}]});expect(enviar).toHaveBeenCalledTimes(1);
 });
});
