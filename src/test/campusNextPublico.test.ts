// @vitest-environment node
import {describe,it,expect,vi,beforeEach,afterAll} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',T='00000000-0000-0000-0000-000000000003';
const ctx={campus_id:B,campi:[{id:B}],estado:'ativo'};
const dbModule=require('../../backend/utils/supabase');
const dbOriginal=dbModule.supabase;
const db={from:vi.fn()};dbModule.supabase=db;
const token=vi.spyOn(require('../../backend/services/nextDirecionar'),'contextoDirecionarToken').mockResolvedValue(ctx);
const contexto=vi.spyOn(require('../../backend/services/campusBatismoPorta'),'contextoPublico').mockResolvedValue(ctx);
const match=vi.spyOn(require('../../backend/services/membroMatch'),'acharOuCriarGuardado').mockResolvedValue({membro_id:A});
vi.spyOn(require('../../backend/services/identidadeProgressiva'),'registrarObservacaoSegura').mockResolvedValue({});
vi.spyOn(require('../../backend/services/inscricaoContrato'),'registrarConsentimentos').mockResolvedValue({});
const notificar=vi.spyOn(require('../../backend/services/notificar'),'notificar').mockResolvedValue({});
const router=require('../../backend/routes/publicNext');
let calls:any[]=[],falhaPagina=false,matriculaEstrangeira=false;
vi.spyOn(db,'from').mockImplementation((table:string)=>{
 const c:any={table,filtros:[],operacao:'read'};calls.push(c);const q:any={};
 for(const op of ['select','order','limit','single','maybeSingle'])q[op]=()=>q;
 for(const op of ['eq','is','gte','lt'])q[op]=(...args:any[])=>{c.filtros.push([op,...args]);return q;};
 q.range=(de:number)=>{c.inicio=de;return q;};
 for(const op of ['insert','update'])q[op]=(dados:any)=>{c.operacao=op;c.dados=dados;return q;};
 q.then=(ok:any,err:any)=>{
  const data=table==='next_turmas'?(falhaPagina?(c.inicio===0?Array.from({length:1000},(_,i)=>({id:`t${i}`,nome:'Turma',next_encontros:[{data:'2099-12-01'}]})):null):[{id:T,nome:'Turma',next_encontros:[{data:'2099-12-01'}]}]):table==='mem_membros'?{batizado:false}:table==='mem_voluntarios'?null:c.operacao!=='read'?{id:'novo'}:c.filtros.some((f:any)=>f[1]==='id')?(matriculaEstrangeira?null:{id:A,turma_id:T}):c.inicio!==undefined?[]:null;
  return Promise.resolve({data,error:falhaPagina&&c.inicio>0?new Error('Falhou'):null,count:0}).then(ok,err);
 };return q;
});
function req(body:any={}){return {body,query:{campus:B},params:{token:'token'},headers:{'x-campus-id':A},ip:'127.0.0.1'};}
function res(){const r:any={status:vi.fn(),json:vi.fn()};r.status.mockReturnValue(r);return r;}
async function chamar(path:string,metodo:string,request:any,response:any){const route=router.stack.find((l:any)=>l.route?.path===path&&l.route.methods[metodo]);expect(route).toBeTruthy();for(const h of route.route.stack){let continuar=false;await h.handle(request,response,()=>{continuar=true;});if(!continuar)break;}}
const body={nome_completo:'Pessoa Completa',telefone:'21999999999',email:'PESSOA@EXAMPLE.COM',cpf:'52998224725',data_nascimento:'1990-01-01',sexo:'feminino',aceita_termos:true,campus:B,turma_id:T};
beforeEach(()=>{vi.clearAllMocks();calls=[];falhaPagina=false;matriculaEstrangeira=false;contexto.mockResolvedValue(ctx);token.mockResolvedValue(ctx);match.mockResolvedValue({membro_id:A});});
afterAll(()=>{vi.restoreAllMocks();dbModule.supabase=dbOriginal;});
describe('Porta pública do Next',()=>{
 it('catálogo usa campus público e pagina, sem herdar cabeçalho ERP',async()=>{
  const request=req(),r=res();await chamar('/turmas','get',request,r);
  expect(contexto).toHaveBeenCalledWith(db,B);expect(r.json).toHaveBeenCalledWith(expect.objectContaining({turmas:[{id:T,nome:'Turma',data:'2099-12-01'}]}));
  expect(calls[0].filtros).toContainEqual(['eq','igreja_id',B]);
 });
 it('catálogo com segunda página quebrada não vira lista de espera',async()=>{
  falhaPagina=true;const r=res();await chamar('/turmas','get',req(),r);expect(r.status).toHaveBeenCalledWith(500);expect(r.json.mock.calls[0][0]).not.toHaveProperty('turmas');
 });
 it('turma estrangeira falha antes de matcher ou inscrição',async()=>{
  const r=res();await chamar('/inscrever','post',req({...body,turma_id:A}),r);
  expect(match).not.toHaveBeenCalled();expect(calls.some(c=>c.operacao!=='read')).toBe(false);expect(r.json.mock.calls[0][0].error).toContain('neste campus');
 });
 it('matcher indisponível não grava matrícula órfã',async()=>{
  match.mockRejectedValue(new Error('Identidade indisponível'));const r=res();await chamar('/inscrever','post',req(body),r);
  expect(calls.some(c=>c.operacao==='insert')).toBe(false);expect(notificar).not.toHaveBeenCalled();
 });
 it('grava matrícula local, normaliza contato e notifica responsáveis da origem',async()=>{
  const r=res();await chamar('/inscrever','post',req({...body,membro_id:'intruso',igreja_id:A}),r);
  expect(match).toHaveBeenCalledWith(expect.objectContaining({email:'pessoa@example.com',telefone:'21999999999',extra:{igreja_id:B}}));
  expect(calls.find(c=>c.operacao==='insert').dados).toMatchObject({igreja_id:B,membro_id:A,turma_id:T});
  expect(notificar).toHaveBeenCalledWith(expect.objectContaining({campus:ctx}));
  expect(r.json).toHaveBeenCalledWith({ok:true,id:'novo'});
 });
 it('QR inválido não executa nenhuma consulta de matrícula',async()=>{
  token.mockRejectedValue(new Error('Token inválido'));const r=res();await chamar('/checkin/:token','get',req(),r);expect(calls).toHaveLength(0);
 });
 it('lista de presença fica na unidade assinada, independentemente do cabeçalho',async()=>{
  const r=res();await chamar('/checkin/:token','get',req(),r);
  expect(calls.filter(c=>['next_turmas','next_matriculas'].includes(c.table)).every(c=>c.filtros.some((f:any)=>f[1]==='igreja_id'&&f[2]===B))).toBe(true);
 });
 it('presença não altera matrícula de outro campus',async()=>{
  matriculaEstrangeira=true;const r=res();await chamar('/checkin/:token','post',req({matricula_id:A,presente:true}),r);
  expect(r.status).toHaveBeenCalledWith(403);expect(calls.some(c=>c.operacao==='update')).toBe(false);
 });
});
