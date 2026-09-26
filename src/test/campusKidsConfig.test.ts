// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const config=createRequire(import.meta.url)('../../backend/services/campusKidsConfig');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const ctx={campus_id:B,campi:[{id:B}],estado:'ativo'};
function banco(){const calls:any[]=[],storage:any[]=[];const rows:any={kids_totem_config_campus:[{igreja_id:A,edit_senha_hash:'hash-Sede'}],kids_etiqueta_config_campus:[{igreja_id:A,fonte:'mono',logo_aniversario_url:'https://sede.test/logo'}]};const db:any={calls,rows,storageCalls:storage,fail:false,rpc:vi.fn(async()=>({data:[{codigo:'ABCD'}],error:null})),from:(table:string)=>{const c:any={table,filters:[],patch:null};calls.push(c);const q:any={select:()=>q,eq:(k:string,v:any)=>{c.filters.push([k,v]);return q;},maybeSingle:()=>q,upsert:(body:any)=>{c.patch=body;return q;}};q.then=(ok:any,no:any)=>{if(c.patch){const found=(rows[table]||[]).find((r:any)=>r.igreja_id===c.patch.igreja_id);if(found)Object.assign(found,c.patch);else(rows[table]||=[]).push(c.patch);}const data=(rows[table]||[]).find((r:any)=>c.filters.every(([k,v]:any[])=>r[k]===v))||null;return Promise.resolve({data,error:db.fail?new Error('offline'):null}).then(ok,no);};return q;},storage:{from:(bucket:string)=>({upload:async(path:string)=>{storage.push(['upload',bucket,path]);return {error:null};},remove:async(paths:string[])=>{storage.push(['remove',bucket,paths]);return {error:null};},getPublicUrl:(path:string)=>({data:{publicUrl:'https://assets.test/'+path}})})}};return db;}
describe('configuração Kids por campus',()=>{
 it('campus sem configuração usa layout padrão e não herda hash ou logo da Sede',async()=>{const db=banco();expect(await config.statusSenha(db,ctx)).toEqual({definida:false});expect(await config.verificarSenha(db,ctx,'0000')).toEqual({ok:false,naoDefinida:true});expect(await config.etiqueta(db,ctx)).toMatchObject({fonte:'sans',logo_aniversario_url:null});expect(db.calls.every((c:any)=>c.filters.some(([k,v]:any[])=>k==='igreja_id'&&v===B))).toBe(true);});
 it('salva hash no campus escolhido e status nunca retorna o segredo',async()=>{const db=banco();await config.salvarSenha(db,ctx,'senha-local',A);expect(db.rows.kids_totem_config_campus.find((r:any)=>r.igreja_id===B).edit_senha_hash).not.toBe('senha-local');expect(await config.verificarSenha(db,ctx,'senha-local')).toEqual({ok:true});expect(await config.verificarSenha(db,ctx,'errada')).toEqual({ok:false});expect(await config.statusSenha(db,ctx)).toEqual({definida:true});expect(db.rows.kids_totem_config_campus[0].edit_senha_hash).toBe('hash-Sede');});
 it('patch de layout ignora tentativa de escrever campus, hash e URL arbitrários',async()=>{const db=banco();await config.salvarEtiqueta(db,ctx,{igreja_id:A,edit_senha_hash:'invasão',logo_aniversario_url:'https://estranho.test',fonte:'mono'});const r=db.calls.find((c:any)=>c.patch).patch;expect(r.igreja_id).toBe(B);expect(r).not.toHaveProperty('edit_senha_hash');expect(r).not.toHaveProperty('logo_aniversario_url');});
 it('logo usa namespace do campus e remoção nunca toca caminho legado ou alheio',async()=>{const db=banco();await config.logo(db,ctx,'data:image/png;base64,YWJj');await config.removerLogo(db,ctx);expect(db.storageCalls[0]).toEqual(['upload','fotos-membros',`kids-logos/${B}/aniversario.png`]);expect(db.storageCalls[1][2].every((p:string)=>p.startsWith(`kids-logos/${B}/`))).toBe(true);});
 it('reserva carimba campus e usuário confirmado e não aceita valores do payload',async()=>{const db=banco();await config.reservarCodigos(db,ctx,{igreja_id:A,usuario_id:B,estacao_ref:'totem-ref',sessao_id:A,quantidade:2},A);expect(db.rpc).toHaveBeenCalledWith('fn_campus_kids_reservar_codigos',expect.objectContaining({p_igreja_id:B,p_usuario_id:A,p_quantidade:2}));});
 it('falha de configuração não vira ausência de senha ou padrão silencioso',async()=>{const db=banco();db.fail=true;await expect(config.statusSenha(db,ctx)).rejects.toMatchObject({status:503});await expect(config.etiqueta(db,ctx)).rejects.toMatchObject({status:503});});
});

describe('certificação de configuração Kids',()=>{
 it('libera somente os oito métodos e caminhos comprovados',async()=>{
  const {criarCampusSuperficie}=createRequire(import.meta.url)('../../backend/middleware/campusSuperficie');
  const cobertura=[...readFileSync('backend/server.js','utf8').matchAll(/\{ metodo: '([^']+)', caminho: '([^']+)' \}/g)].map(m=>({metodo:m[1],caminho:m[2]}));
  const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{estado:'ativo',campus_legado_id:A},error:null})};
  const guard=criarCampusSuperficie({supabase:{from:()=>q},cobertura});
  for(const [method,path] of [['GET','edit-senha/status'],['POST','edit-senha'],['POST','edit-senha/verificar'],['GET','etiqueta-config'],['PUT','etiqueta-config'],['POST','etiqueta-config/logo'],['POST','etiqueta-config/logo/remover'],['POST','codigos-reservados']]){
   const next=vi.fn();const res:any={status:()=>res,json:vi.fn()};
   await guard({originalUrl:'/api/totem-kids/'+path,method,headers:{}},res,next);expect(next).toHaveBeenCalledOnce();
   for(const invalid of [{originalUrl:'/api/totem-kids/'+path+'/extra',method},{originalUrl:'/api/totem-kids/'+path,method:'DELETE'}]){
    const denied=vi.fn();await guard({...invalid,headers:{}},res,denied);expect(denied).not.toHaveBeenCalled();
   }
  }
 });
});
