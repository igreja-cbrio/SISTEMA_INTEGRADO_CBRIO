const {listarContextosOperacionais}=require('./campusOperacional');
const {lerTodasPaginas}=require('../utils/campusPaginacao');
function amanhaBrt(agora=new Date()) {
  const dia=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(agora);
  const data=new Date(`${dia}T12:00:00Z`);data.setUTCDate(data.getUTCDate()+1);return data.toISOString().slice(0,10);
}
async function lembretesBatismo({db,notificarMembro,agora=new Date(),listarCampi=listarContextosOperacionais}) {
  const data=amanhaBrt(agora),campi=await listarCampi(db),resultados=[];
  for(const campus of campi) {
    let alvo=0,enviados=0,registrados=0,erros=0;
    try {
      const inscricoes=await lerTodasPaginas(()=>db.from('batismo_inscricoes')
        .select('id,membro_id,evento_id,data_batismo,horario_culto,status')
        .eq('igreja_id',campus.campus_id).eq('data_batismo',data).is('deleted_at',null)
        .not('membro_id','is',null).in('status',['pendente','confirmado']).order('id'));
      alvo=inscricoes.length;
      for(const inscricao of inscricoes) {
        if(!inscricao.evento_id) {erros++;continue;}
        const hora=String(inscricao.horario_culto||'').trim()||'a confirmar';
        const local=campus.estado==='preparacao'?hora:`${hora} · ${campus.nome}`;
        const r=await notificarMembro(inscricao.membro_id,'batismo_lembrete',[data.split('-').reverse().join('/'),local],{
          campus,refId:inscricao.id,chaveDedup:`batismo_lembrete:${inscricao.id}:${inscricao.evento_id}:${data}`,
        });
        if(r?.sent) enviados++;
        if(r?.queued||r?.sent) registrados++;
        if(r?.error||r?.reason==='fila_indisponivel'||r?.reason==='campus_indisponivel') erros++;
      }
      resultados.push({igreja_id:campus.campus_id,ok:erros===0,alvo,enviados,registrados,erros});
    }catch {resultados.push({igreja_id:campus.campus_id,ok:false,alvo,enviados,registrados,erros:erros+1});}
  }
  return {ok:resultados.every(r=>r.ok),data,campi:resultados,alvo:resultados.reduce((n,r)=>n+r.alvo,0),enviados:resultados.reduce((n,r)=>n+r.enviados,0)};
}
module.exports={amanhaBrt,lembretesBatismo};
