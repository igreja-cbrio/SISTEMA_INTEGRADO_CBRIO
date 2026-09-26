const { validarContexto } = require('../utils/campusQuery');
const { resolverContextoCampus, responderErroCampus, ErroCampus } = require('./campusContexto');
const CENTRAIS=new Set(['rh','financeiro','financeiro-v2','patrimonio']);
async function contextoNotificacoes(req,res,next) {
  try { req.campus=await resolverContextoCampus(req,{exigirSelecao:true});return next(); }
  catch(e){return responderErroCampus(res,e);}
}
function filtrarNotificacoes(query,ctx) {
  validarContexto(ctx,true);
  return query.or(`igreja_id.eq.${ctx.campus_id},escopo_campus.eq.central`);
}
async function escopoNotificacao(db,modulo,campus) {
  const {data:c,error}=await db.from('app_campus_config').select('estado,campus_legado_id,ja_ativado').eq('id',true).maybeSingle();
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(error||!c||!uuid.test(c.campus_legado_id||'')||!['preparacao','ensaio','ativo'].includes(c.estado)||
   (c.estado==='preparacao'?c.ja_ativado!==false:c.ja_ativado!==true)) throw new ErroCampus(503,'campus_configuracao_pendente','Configuração de notificações indisponível.');
  if(campus) {
    validarContexto(campus,true);
    if(campus.estado!==c.estado || (c.estado==='preparacao'&&campus.campus_id!==c.campus_legado_id)) throw new Error('Contexto de notificação desatualizado.');
    return {igreja_id:campus.campus_id,escopo_campus:'campus'};
  }
  if(CENTRAIS.has(modulo)) return {igreja_id:null,escopo_campus:'central'};
  if(c.estado!=='preparacao') throw new ErroCampus(503,'campus_notificacao_sem_origem','A notificação exige o campus do evento.');
  return {igreja_id:c.campus_legado_id,escopo_campus:'campus'};
}
async function contextoEventoArmazenado(db,registro) {
  if(registro?.escopo_campus==='central' && registro.igreja_id===null) return undefined;
  if(registro?.escopo_campus!=='campus' || !registro.igreja_id) throw new Error('Origem do evento não registrada.');
  const {resolverCampusOperacional}=require('./campusOperacional');
  await resolverCampusOperacional(db,registro.igreja_id);
  const {data:c,error}=await db.from('app_campus_config').select('estado,campus_legado_id').eq('id',true).maybeSingle();
  if(error||!c) throw new Error('Contexto do evento indisponível.');
  return {estado:c.estado,campus_legado_id:c.campus_legado_id,campus_id:registro.igreja_id,campi:[{id:registro.igreja_id}]};
}
module.exports={contextoNotificacoes,filtrarNotificacoes,escopoNotificacao,contextoEventoArmazenado};
