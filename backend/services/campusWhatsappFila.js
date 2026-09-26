const {listarContextosOperacionais}=require('./campusOperacional');
// Cada campus tem sua parcela da rodada; uma unidade com fila cheia não
// consome a capacidade das outras. Sobra fica para a próxima rodada.
async function listarPendentesPorCampus(db,{limite=200,agora=new Date().toISOString(),listarCampi=listarContextosOperacionais}={}) {
  if(!Number.isInteger(limite)||limite<1||limite>1000) throw new Error('Limite de fila inválido.');
  const campi=await listarCampi(db);
  const particoes=[...campi.map(c=>c.campus_id),null];
  // Rotação horária distribui também as vagas restantes de uma divisão desigual.
  const offset=Math.floor(new Date(agora).getTime()/3600000)%particoes.length;
  if(!Number.isFinite(offset)) throw new Error('Data da rodada inválida.');
  const ordem=particoes.slice(offset).concat(particoes.slice(0,offset)),resultado=[];
  for(let i=0;i<ordem.length;i++) {
    const parcela=Math.floor(limite/ordem.length)+(i<limite%ordem.length?1:0);
    if(!parcela) continue;
    let q=db.from('whatsapp_envios').select('id,telefone,igreja_id,escopo_campus')
      .eq('status','pendente').lte('proxima_tentativa_em',agora).order('criado_em',{ascending:true}).order('id',{ascending:true});
    q=ordem[i]===null?q.is('igreja_id',null).eq('escopo_campus','central'):q.eq('igreja_id',ordem[i]).eq('escopo_campus','campus');
    const {data,error}=await q.limit(parcela);
    if(error||!Array.isArray(data)) throw error||new Error('Fila de campus indisponível.');
    resultado.push(...data);
  }
  return resultado;
}
module.exports={listarPendentesPorCampus};
