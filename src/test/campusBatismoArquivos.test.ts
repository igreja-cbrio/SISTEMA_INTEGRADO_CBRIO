// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const arquivos=require('../../backend/services/campusBatismoArquivos');
const {criarBatismoProprio}=require('../../backend/services/campusBatismoProprio');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',E='10000000-0000-0000-0000-000000000001';
function banco(){
 const calls:any[]=[],storageCalls:any[]=[];
 const rows:any={app_campus_config:[{id:true,estado:'ativo',ja_ativado:true,campus_legado_id:A}],igrejas:[{id:A,ativa:true,tipo:'sede'},{id:B,ativa:true,tipo:'sede'}],batismo_eventos:[{id:E,igreja_id:B,data:'2099-09-20'}],batismo_inscricoes:[{id:A,membro_id:A,igreja_id:B,evento_id:E,status:'realizado',data_batismo:'2099-09-20',deleted_at:null,consentimento_em:'2026-09-27'}],batismo_config_campus:[{igreja_id:A,grupo_url:'https://chat.whatsapp.com/A'}]};
 const db:any={calls,storageCalls,rows,writeFail:false,rpc:vi.fn(async()=>({data:{ok:true},error:null})),from:(table:string)=>{
  const c:any={table,filters:[],single:false,write:null};calls.push(c);const q:any={};
  for(const op of ['select','order','range','limit'])q[op]=()=>q;
  for(const op of ['eq','is','not'])q[op]=(...args:any[])=>{c.filters.push([op,...args]);return q;};
  for(const op of ['maybeSingle','single'])q[op]=()=>{c.single=true;return q;};
  q.update=(v:any)=>{c.write=v;return q;};q.upsert=(v:any)=>{c.write=v;return q;};
  q.then=(ok:any,no:any)=>{let data=(rows[table]||[]).filter((r:any)=>c.filters.every(([op,k,v]:any[])=>op==='not'?true:r[k]===v));if(c.write&&!db.writeFail)data=data.map((r:any)=>Object.assign(r,c.write));if(c.single)data=data[0]||null;return Promise.resolve({data,error:c.write&&db.writeFail?{message:'falha'}:null}).then(ok,no);};return q;
 },storage:{from:(bucket:string)=>({
  list:vi.fn(async(path:string)=>{storageCalls.push(['list',bucket,path]);return {data:[{id:'file',name:'foto.jpg'}],error:null};}),
  createSignedUrls:vi.fn(async(paths:string[],ttl:number)=>{storageCalls.push(['sign',bucket,paths,ttl]);return {data:paths.map(path=>({path,signedUrl:`https://signed.test/${path}`})),error:null};}),
  upload:vi.fn(async(path:string,_data:unknown,options:any)=>{storageCalls.push(['upload',bucket,path,options]);return {data:{path},error:null};}),
  remove:vi.fn(async(paths:string[])=>{storageCalls.push(['remove',bucket,paths]);return {data:[],error:null};}),
 })}};return db;
}
const evento={id:E,igreja_id:B,data:'2099-09-20'};
describe('arquivos de batismo isolados e autorizados',()=>{
 it('usa URLs assinadas por campus/evento e nunca a pasta legada de outro campus',async()=>{
  const db=banco();expect(await arquivos.listarFotos(db,evento)).toHaveLength(1);
  expect(db.storageCalls).toEqual([['list','batismos-campi',`${B}/${E}`],['sign','batismos-campi',[`${B}/${E}/foto.jpg`],900]]);
 });
 it('histórico da Sede usa URL assinada também no legado',async()=>{
  const db=banco();await arquivos.listarFotos(db,{...evento,igreja_id:A});
  expect(db.storageCalls).toContainEqual(['sign','batismos',['2099-09-20/foto.jpg'],900]);
 });
 it('resolução por data recusa evento de outro campus antes de tocar storage',async()=>{
  const db=banco();await expect(arquivos.eventoPorData(db,A,'2099-09-20')).rejects.toMatchObject({status:404});expect(db.storageCalls).toHaveLength(0);
 });
 it('upload e exclusão constroem paths locais e recusam traversal ou legado alheio',async()=>{
  const db=banco();await arquivos.enviarFotos(db,evento,[{mimetype:'image/jpeg',buffer:Buffer.from('imagem')}]);
  expect(db.storageCalls[0][2]).toMatch(new RegExp(`^${B}/${E}/[0-9a-f-]+\\.jpg$`));
  await expect(arquivos.removerFoto(db,evento,'../outro.jpg')).rejects.toMatchObject({status:400});
  await expect(arquivos.removerFoto(db,evento,'foto.jpg','legado')).rejects.toMatchObject({status:404});
 });
 it('biometria exige consentimento e limpa o upload se gravação do vínculo falhar',async()=>{
  const db=banco(),file={mimetype:'image/png',buffer:Buffer.from('imagem')};
  db.rows.batismo_inscricoes[0].consentimento_em=null;
  await expect(arquivos.salvarFotoReferencia(db,B,A,file)).rejects.toMatchObject({status:409});expect(db.storageCalls).toHaveLength(0);
  db.rows.batismo_inscricoes[0].consentimento_em='2026-09-27';db.writeFail=true;
  await expect(arquivos.salvarFotoReferencia(db,B,A,file)).rejects.toBeTruthy();
  expect(db.storageCalls[0][2]).toMatch(new RegExp(`^${B}/referencia/${A}/`));
  expect(db.storageCalls[1]).toEqual(['remove','batismos-biometria',[db.storageCalls[0][2]]]);
 });
 it('config do campus B não herda grupo global nem o da Sede',async()=>{
  const db=banco();expect(await arquivos.lerConfigBatismo(db,B)).toEqual({grupo_url:null,updated_at:null});
  expect(db.calls.some((c:any)=>c.table==='batismo_config')).toBe(false);
 });
});
describe('histórico próprio no App',()=>{
 const req={user:{id:A},params:{id:A},query:{},headers:{'x-campus-id':A}};
 function res(){const r:any={json:vi.fn(),status:vi.fn()};r.status.mockReturnValue(r);return r;}
 it('permite fotos históricas do próprio membro em B mesmo com A selecionado',async()=>{
  const db=banco(),fotosEvento=vi.fn().mockResolvedValue([{url:'assinada'}]);const r=res();
  await criarBatismoProprio({db,resolverMembro:async()=>({id:A}),fotosEvento}).fotos(req,r);
  expect(fotosEvento).toHaveBeenCalledWith(evento);expect(r.json).toHaveBeenCalledWith([{url:'assinada'}]);
 });
 it('não permite outra pessoa usar a inscrição pelo ID, mesmo no mesmo campus',async()=>{
  const db=banco(),fotosEvento=vi.fn(),r=res();
  await criarBatismoProprio({db,resolverMembro:async()=>({id:B}),fotosEvento}).fotos(req,r);
  expect(r.status).toHaveBeenCalledWith(404);expect(fotosEvento).not.toHaveBeenCalled();
 });
 it('check-in passa membro confirmado e campus do ato, ignorando payload adulterado',async()=>{
  const db=banco(),r=res();await criarBatismoProprio({db,resolverMembro:async()=>({id:A})}).checkin({...req,body:{membro_id:B,igreja_id:A}},r);
  expect(db.rpc).toHaveBeenCalledWith('fn_campus_batismo_checkin_proprio',{p_inscricao_id:A,p_membro_id:A,p_igreja_id:B});
 });
});
