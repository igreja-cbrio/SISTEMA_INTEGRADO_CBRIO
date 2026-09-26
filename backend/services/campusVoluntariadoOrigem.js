const { ErroCampus } = require('./campusContexto');
const { validarContexto } = require('../utils/campusQuery');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Chamadores antigos só podem produzir na preparação confirmada, nunca inferir origem ativa.
async function resolverOrigemVoluntariado(db, contexto) {
  if (contexto) return validarContexto(contexto,true);
  const {data,error} = await db.from('app_campus_config').select('estado,ja_ativado,campus_legado_id').eq('id',true).maybeSingle();
  if (error || data?.estado !== 'preparacao' || data?.ja_ativado !== false || !UUID.test(data?.campus_legado_id || '')) {
    throw new ErroCampus(503,'vol_origem_pendente','Este produtor exige uma origem de campus explícita.');
  }
  return Object.freeze({estado:'preparacao',campus_id:data.campus_legado_id,campi:Object.freeze([{id:data.campus_legado_id}])});
}
module.exports = { resolverOrigemVoluntariado };
