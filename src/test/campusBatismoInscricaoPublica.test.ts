// @vitest-environment node
import {afterAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002';
const db=require('../../backend/utils/supabase').supabase;
const porta=require('../../backend/services/campusBatismoPorta');
const matcher=require('../../backend/services/membroMatch');
const identidade=require('../../backend/services/identidadeProgressiva');
const contrato=require('../../backend/services/inscricaoContrato');
const notifications=require('../../backend/services/notificar');
vi.spyOn(require('../../backend/services/campusBatismoArquivos'),'lerConfigBatismo').mockResolvedValue({grupo_url:null});
const horarios=require('../../backend/services/batismoHorarios');
const ctx={estado:'ativo',campus_id:B,campus_legado_id:A};
const contexto=vi.spyOn(porta,'contextoPublico').mockResolvedValue(ctx);
const reserva=vi.spyOn(porta,'reservar').mockResolvedValue({id:A});
const match=vi.spyOn(matcher,'acharOuCriarGuardado').mockResolvedValue({membro_id:B});
vi.spyOn(identidade,'registrarObservacaoSegura').mockResolvedValue({});
vi.spyOn(contrato,'registrarConsentimentos').mockResolvedValue({});
const notificar=vi.spyOn(notifications,'notificar').mockResolvedValue({});
vi.spyOn(horarios,'datasAbertas').mockResolvedValue(['2099-09-20']);
const {inscrever}=require('../../backend/routes/publicBatismo');
function request(overrides={}) {return {body:{nome_completo:'Pessoa Completa',telefone:'21999999999',email:'PESSOA@EXAMPLE.COM',cpf:'52998224725',data_nascimento:'1990-01-01',sexo:'feminino',tamanho_camisa:'M',aceita_termos:true,campus:'nova',data_batismo:'2099-09-20',horario_culto:'10:00',membro_id:A,p_editar:true,...overrides},headers:{'x-campus-id':A},ip:'127.0.0.1'};}
function response(){const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res;}
beforeEach(()=>{vi.clearAllMocks();contexto.mockResolvedValue(ctx);reserva.mockResolvedValue({id:A});match.mockResolvedValue({membro_id:B});});
afterAll(()=>vi.restoreAllMocks());
describe('handler compartilhado de inscrição pública/App',()=>{
 it('normaliza e usa matcher global; campus e membro do corpo não concedem autoridade',async()=>{
  const req=request(),res=response();await inscrever(req,res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(contexto).toHaveBeenCalledWith(db,'nova');
  expect(match).toHaveBeenCalledWith(expect.objectContaining({email:'pessoa@example.com',cpf:'52998224725'}));
  expect(reserva).toHaveBeenCalledWith(db,ctx,expect.objectContaining({membro_id:B,origem:'publico'}),req.body);
  expect(notificar).toHaveBeenCalledWith(expect.objectContaining({campus:ctx,emailsExtra:[]}));
  expect(res.json.mock.calls[0][0]).not.toHaveProperty('cpf');
 });
 it('App preserva identidade confirmada sem executar matcher ou fallback por e-mail',async()=>{
  const req:any=request();req.batismoCampus=ctx;req.batismoMembroConfirmado={id:B,cpf:'52998224725'};
  const res=response();await inscrever(req,res);
  expect(res.status).toHaveBeenCalledWith(201);expect(match).not.toHaveBeenCalled();
  expect(reserva).toHaveBeenCalledWith(db,ctx,expect.objectContaining({membro_id:B,origem:'app'}),req.body);
 });
 it('falha de identidade não cria inscrição órfã',async()=>{
  match.mockRejectedValue(new Error('Falha de identidade'));const res=response();await inscrever(request(),res);
  expect(res.status).toHaveBeenCalledWith(503);expect(reserva).not.toHaveBeenCalled();
 });
 it('não reserva nem registra consentimento quando termos não foram aceitos',async()=>{
  const res=response();await inscrever(request({aceita_termos:false}),res);
  expect(res.status).toHaveBeenCalledWith(400);expect(reserva).not.toHaveBeenCalled();expect(match).not.toHaveBeenCalled();
 });
});
