const {membroConfirmado}=require('./campusBatismoPorta');
const arquivos=require('./campusBatismoArquivos');
const {lerTodasPaginas}=require('../utils/campusPaginacao');
const {ErroCampus,responderErroCampus}=require('./campusContexto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function criarBatismoProprio({db,resolverMembro=(req)=>membroConfirmado(db,req.user?.id),fotosEvento=(e)=>arquivos.listarFotos(db,e)}) {
 async function inscricao(req) {
  if(!UUID.test(req.params.id||'')) throw new ErroCampus(400,'batismo_id_invalido','Identificador de inscrição inválido.');
  const membro=await resolverMembro(req);
  const {data,error}=await db.from('batismo_inscricoes').select('id,igreja_id,evento_id,status')
   .eq('id',req.params.id).eq('membro_id',membro.id).is('deleted_at',null).maybeSingle();
  if(error) throw error;
  if(!data || ['cancelado','rejeitado'].includes(data.status)) throw new ErroCampus(404,'batismo_inscricao_inexistente','Inscrição não encontrada.');
  return {insc:data,membro};
 }
 return {
  me:async(req,res)=>{try {
   const membro=await resolverMembro(req);const eventoId=req.query?.evento_id;
   if(eventoId!==undefined && !UUID.test(typeof eventoId==='string'?eventoId:'')) throw new ErroCampus(400,'batismo_evento_invalido','Evento inválido.');
   const rows=await lerTodasPaginas(()=>{
    let q=db.from('batismo_inscricoes').select('id,status,data_batismo,nome,sobrenome,tamanho_camisa,eh_crianca,observacoes,checkin_em,igreja_id,evento_id')
     .eq('membro_id',membro.id).is('deleted_at',null).not('status','in','(cancelado,rejeitado)').order('created_at',{ascending:false}).order('id');
    if(eventoId)q=q.eq('evento_id',eventoId);return q;
   });
   // Ato próprio histórico pode atravessar campi; nunca depende de data sozinha.
   if(eventoId && !rows.length) throw new ErroCampus(404,'batismo_inscricao_inexistente','Inscrição não encontrada.');
   res.json(rows.find(i=>['pendente','confirmado'].includes(i.status)) || rows.find(i=>i.status==='realizado'&&i.data_batismo) || null);
  }catch(e){responderErroCampus(res,e);}},
  fotos:async(req,res)=>{try {const {insc}=await inscricao(req);res.json(insc.evento_id?await fotosEvento(await arquivos.eventoDaInscricao(db,insc)):[]);}catch(e){responderErroCampus(res,e);}},
  checkin:async(req,res)=>{try {
   const {insc,membro}=await inscricao(req);
   const {data,error}=await db.rpc('fn_campus_batismo_checkin_proprio',{p_inscricao_id:insc.id,p_membro_id:membro.id,p_igreja_id:insc.igreja_id});
   if(error)throw error;res.json(data);
  }catch(e){responderErroCampus(res,e);}},
 };
}
module.exports={criarBatismoProprio};
