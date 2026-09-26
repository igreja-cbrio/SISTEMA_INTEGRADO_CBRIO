const { resolverContextoCampus, ErroCampus } = require('./campusContexto');
const { filtrarCampus } = require('../utils/campusQuery');
const { lerTodasPaginas } = require('../utils/campusPaginacao');
const inscricoes = require('./campusBatismoInscricao');
const { eventosAbertos, horariosConfigurados } = require('./batismoHorarios');
const { dataIso } = require('../utils/batismoData');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function verificar(r) { if(r.error) throw new ErroCampus(503,'batismo_indisponivel','Não foi possível consultar o Batismo.'); return r.data; }
function criarGestaoBatismoApp({db, permissao, resolver=resolverContextoCampus, salvar=inscricoes.salvar, eventos=eventosAbertos, horarios=horariosConfigurados}) {
  async function acesso(req) {
    const p = await permissao(req, 'batismo');
    if (Math.max(p.leitura,p.escrita)<2) throw new ErroCampus(403,'batismo_gestao_negada','Esta área é só para quem gerencia o Batismo.');
    // Flags vêm do perfil consultado no servidor, nunca de user_metadata.
    const profile=verificar(await db.from('profiles').select('id,active,is_diretoria_geral').eq('id',req.user.id).maybeSingle());
    if(!profile || profile.active===false) throw new ErroCampus(403,'batismo_gestao_negada','Seu acesso à gestão está indisponível.');
    const ctx=await resolver({...req,user:{id:req.user.id,email:req.user.email,is_super_admin:p.superadmin===true,is_diretoria_geral:profile.is_diretoria_geral===true}}, {supabase:db,exigirSelecao:true,permitirConsolidado:false});
    if(ctx.campi.find(c=>c.id===ctx.campus_id)?.tipo!=='sede') throw new ErroCampus(403,'batismo_campus_invalido','Selecione um campus operacional.');
    return {ctx,p};
  }
  async function registro(ctx,id) {
    if(!UUID.test(id || '')) throw new ErroCampus(400,'batismo_id_invalido','Inscrição inválida.');
    const row=verificar(await filtrarCampus(db.from('batismo_inscricoes').select('*'),ctx).eq('id',id).is('deleted_at',null).maybeSingle());
    if(!row) throw new ErroCampus(404,'batismo_inscricao_ausente','Inscrição não encontrada.');
    return row;
  }
  async function listar(ctx,data) {
    const hoje=new Date(Date.now()-3*3600000).toISOString().slice(0,10);
    const opcoes={supabase:db,campusId:ctx.campus_id};
    const [lista, hs]=await Promise.all([eventos(3,opcoes),horarios(opcoes)]);
    const datas=lista.map(e=>e.data).filter(d=>d>=hoje);
    if(data!==undefined && (!dataIso(data) || !datas.includes(data))) throw new ErroCampus(404,'batismo_evento_ausente','Data não encontrada neste campus.');
    const selecionada=data || datas[0] || null;
    const pessoas=selecionada?await lerTodasPaginas(()=>filtrarCampus(db.from('batismo_inscricoes').select('*'),ctx).eq('data_batismo',selecionada).is('deleted_at',null).not('status','in','(cancelado,rejeitado)').order('horario_culto').order('nome').order('id')):[];
    const aprovacoes=await lerTodasPaginas(()=>filtrarCampus(db.from('batismo_inscricoes').select('*'),ctx).eq('status','pendente').is('deleted_at',null).order('created_at').order('id'));
    return {campus_id:ctx.campus_id,data:selecionada,datas,eventos:lista,hoje,pessoas:pessoas.map(inscricoes.publico),aprovacoes:aprovacoes.map(inscricoes.publico),resumo:{previstos:pessoas.length,presentes:pessoas.filter(p=>p.checkin_em).length,aguardando:aprovacoes.length},horarios:hs.filter(h=>h.aberto!==false).map(h=>({id:h.id,horario:h.horario,label:h.label || h.horario}))};
  }
  function dataFutura(body) {
    if(body.data_batismo!==undefined && (!dataIso(body.data_batismo) || body.data_batismo<new Date(Date.now()-3*3600000).toISOString().slice(0,10))) throw new ErroCampus(400,'batismo_data_invalida','Selecione uma data futura de Batismo.');
  }
  async function criar(ctx,body,usuarioId) {
    dataFutura(body);
    // Não aceitar vínculo global fornecido pelo cliente: a porta usa o matcher.
    const {membro_id,igreja_id,...dados}=body;
    return salvar(db,ctx,{...dados,status:'confirmado',origem:'app_gestao_batismo'},{usuarioId});
  }
  async function editar(ctx,id,body,usuarioId,aprovar=false) {
    const atual=await registro(ctx,id);dataFutura(body);
    if(aprovar && atual.status!=='pendente') throw new ErroCampus(409,'batismo_ja_tratado','Esta solicitação já foi tratada.');
    const dados={...body};delete dados.status;
    if(aprovar) dados.status='confirmado';
    return salvar(db,ctx,dados,{atual,usuarioId,editarDadosPessoa:true});
  }
  async function checkin(ctx,id,presente,usuarioId) {
    const atual=await registro(ctx,id);
    if(['cancelado','rejeitado'].includes(atual.status)) throw new ErroCampus(409,'batismo_inscricao_inativa','Esta inscrição não está ativa.');
    if(presente) await inscricoes.registrarCheckin(db,ctx,atual,{},usuarioId);
    else {
      let q=filtrarCampus(db.from('batismo_inscricoes').update({checkin_em:null,checkin_por:null,updated_at:new Date().toISOString()}),ctx).eq('id',id).is('deleted_at',null);
      q=atual.updated_at?q.eq('updated_at',atual.updated_at):q.is('updated_at',null);
      if(!verificar(await q.select('id').maybeSingle())) throw new ErroCampus(409,'batismo_edicao_concorrente','A inscrição foi alterada. Atualize a lista e tente novamente.');
    }
    return inscricoes.publico(await registro(ctx,id));
  }
  async function retirar(ctx,id,usuarioId) {
    const atual=await registro(ctx,id);
    await salvar(db,ctx,{status:'cancelado'},{atual,usuarioId});
    return {ok:true,id};
  }
  return {acesso,registro,listar,criar,editar,checkin,retirar};
}
module.exports={criarGestaoBatismoApp};
