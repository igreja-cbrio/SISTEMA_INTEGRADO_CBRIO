const { ErroCampus } = require('./campusContexto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Para serviços/jobs que já validaram a autorização do chamador. A existência
// de uma unidade operacional não concede acesso administrativo a ela.
async function resolverCampusOperacional(db, solicitado) {
  const { data: config, error } = await db.from('app_campus_config')
    .select('estado,campus_legado_id,ja_ativado').eq('id', true).maybeSingle();
  if (error || !config || !['preparacao','ensaio','ativo'].includes(config.estado)
    || !UUID.test(config.campus_legado_id || '')
    || (config.estado === 'preparacao' ? config.ja_ativado !== false : config.ja_ativado !== true)) {
    throw new ErroCampus(503, 'campus_configuracao_pendente', 'A configuração de campus ainda não está disponível.');
  }
  const id = solicitado === undefined || solicitado === null
    ? (config.estado === 'preparacao' ? config.campus_legado_id : null) : solicitado;
  if (!UUID.test(id || '')) throw new ErroCampus(409, 'campus_selecao_necessaria', 'Informe o campus desta operação.');
  if (config.estado === 'preparacao' && id !== config.campus_legado_id) {
    throw new ErroCampus(409, 'campus_ainda_nao_habilitado', 'Somente o campus atual está disponível durante a preparação.');
  }
  const { data: igreja, error: erroIgreja } = await db.from('igrejas').select('id')
    .eq('id', id).eq('ativa', true).eq('tipo', 'sede').maybeSingle();
  if (erroIgreja) throw erroIgreja;
  if (!igreja) throw new ErroCampus(404, 'campus_nao_encontrado', 'Campus não encontrado.');
  return id;
}
module.exports = { resolverCampusOperacional };
