const { filtrarCampus, validarContexto } = require('../utils/campusQuery');
const { lerTodasPaginas } = require('../utils/campusPaginacao');
async function coberturaBatismo(db,ctx) {
  validarContexto(ctx,true);
  const convertidos=await lerTodasPaginas(()=>filtrarCampus(db.from('cui_convertidos')
    .select('id,nome,telefone,membro_id,data_culto'),ctx).is('deleted_at',null).order('id'));
  const sinais=new Map();
  for(let inicio=0;inicio<convertidos.length;inicio+=500) {
    const ids=convertidos.slice(inicio,inicio+500).map(c=>c.id);
    const esperados=new Set(ids);
    const {data,error}=await db.rpc('fn_campus_batismo_sinais',{p_igreja_id:ctx.campus_id,p_convertido_ids:ids});
    if(error||!Array.isArray(data)) throw error||new Error('Cobertura de batismo indisponível.');
    for(const linha of data) {
      if(!esperados.delete(linha.registro_id)||typeof linha.batizado!=='boolean'||typeof linha.inscrito!=='boolean') throw new Error('Resposta de cobertura inválida.');
      sinais.set(linha.registro_id,linha);
    }
    if(esperados.size) throw new Error('Cobertura incompleta.');
  }
  let batizados=0,inscritos=0,naoInscritos=0;const pendentes=[];
  for(const c of convertidos) {
    const sinal=sinais.get(c.id);
    if(sinal.batizado){batizados++;continue;}
    if(sinal.inscrito)inscritos++;else naoInscritos++;
    pendentes.push({...c,status_batismo:sinal.inscrito?'inscrito':'nao_inscrito'});
  }
  pendentes.sort((a,b)=>String(b.data_culto||'').localeCompare(String(a.data_culto||''))||String(a.id).localeCompare(String(b.id)));
  return {total:convertidos.length,batizados,inscritos,nao_inscritos:naoInscritos,pct_batizados:convertidos.length?Math.round(batizados/convertidos.length*100):0,pendentes};
}
module.exports={coberturaBatismo};
