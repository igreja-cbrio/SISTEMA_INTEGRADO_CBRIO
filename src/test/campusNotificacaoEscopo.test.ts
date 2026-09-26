import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {notificacaoDoCampus} from '../lib/campusNotificacao';
const require=createRequire(import.meta.url);
const {escopoNotificacao,filtrarNotificacoes}=require('../../backend/services/campusNotificacaoEscopo.js');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
function banco(estado='ativo') {const q:any={};for(const m of ['select','eq','maybeSingle'])q[m]=()=>q;q.then=(r:any)=>Promise.resolve({data:{estado,campus_legado_id:A,ja_ativado:estado!=='preparacao'},error:null}).then(r);return {from:()=>q};}
describe('Notificação com origem explícita',()=>{
 it('aceita contexto local e preserva módulos centrais sem inventar campus',async()=>{
  expect(await escopoNotificacao(banco(),'kids',{estado:'ativo',campus_id:B,campi:[{id:B}]})).toEqual({igreja_id:B,escopo_campus:'campus'});
  expect(await escopoNotificacao(banco(),'rh')).toEqual({igreja_id:null,escopo_campus:'central'});
 });
 it('produtor legado só recebe Sede durante preparação',async()=>{
  expect(await escopoNotificacao(banco('preparacao'),'kids')).toEqual({igreja_id:A,escopo_campus:'campus'});
  await expect(escopoNotificacao(banco(),'kids')).rejects.toThrow('campus do evento');
  await expect(escopoNotificacao(banco(),'kids',{estado:'preparacao',campus_id:A,campi:[{id:A}]})).rejects.toThrow('desatualizado');
 });
 it('leitura inclui local e central com UUID validado',()=>{
  let filtro='';filtrarNotificacoes({or:(v:string)=>{filtro=v;}},{campus_id:A,campi:[{id:A}]});expect(filtro).toBe(`igreja_id.eq.${A},escopo_campus.eq.central`);
  expect(()=>filtrarNotificacoes({},{campus_id:'intruso',campi:[{id:A}]})).toThrow();
 });
 it('evento realtime de outra unidade não entra no sino da seleção atual',()=>{
  expect(notificacaoDoCampus({igreja_id:B,escopo_campus:'campus'},A)).toBe(false);
  expect(notificacaoDoCampus({igreja_id:A,escopo_campus:'campus'},A)).toBe(true);
  expect(notificacaoDoCampus({escopo_campus:'central'},A)).toBe(true);
  expect(notificacaoDoCampus({escopo_campus:'central'},null)).toBe(false);
  expect(notificacaoDoCampus({},A)).toBe(false);
 });
});
