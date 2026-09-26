const { ErroCampus } = require('../services/campusContexto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validarContexto(contexto, escrita = false) {
  if (!contexto || !Array.isArray(contexto.campi) || !contexto.campus_id) {
    throw new ErroCampus(503, 'campus_contexto_ausente', 'O contexto de campus não foi validado.');
  }
  if (contexto.campus_id === 'consolidado') {
    if (escrita || contexto.consolidado_permitido !== true || !contexto.campi.length) {
      throw new ErroCampus(403, 'campus_consolidado_negado', 'Selecione um campus para esta operação.');
    }
  } else if (!UUID.test(contexto.campus_id) || !contexto.campi.some(c => c.id === contexto.campus_id)) {
    throw new ErroCampus(403, 'campus_acesso_negado', 'O campus não pertence ao contexto autorizado.');
  }
  if (contexto.campi.some(c => !UUID.test(c.id || ''))) throw new ErroCampus(503, 'campus_contexto_invalido', 'Contexto inválido.');
  return contexto;
}
function filtrarCampus(query, contexto, coluna = 'igreja_id') {
  const c = validarContexto(contexto);
  if (!/^[a-z_][a-z0-9_.]*$/.test(coluna)) throw new Error('Coluna de campus inválida.');
  return c.campus_id === 'consolidado' ? query.in(coluna, c.campi.map(i => i.id)) : query.eq(coluna, c.campus_id);
}
function carimbarCampus(payload, contexto) {
  const c = validarContexto(contexto, true);
  if (Array.isArray(payload)) return payload.map(item => carimbarCampus(item, c));
  if (!payload || typeof payload !== 'object') throw new ErroCampus(400, 'campus_payload_invalido', 'Dados inválidos.');
  if (Object.hasOwn(payload, 'igreja_id') && payload.igreja_id !== c.campus_id) {
    throw new ErroCampus(403, 'campus_payload_divergente', 'O campus dos dados difere do campus selecionado.');
  }
  return { ...payload, igreja_id: c.campus_id };
}
function chaveCacheCampus(chave, contexto, usuarioId) {
  const c = validarContexto(contexto);
  if (!UUID.test(usuarioId || '')) throw new ErroCampus(503, 'campus_cache_sem_identidade', 'Identidade de cache não validada.');
  // IDs permitidos fazem parte da chave para não reaproveitar consolidado após revogação.
  return JSON.stringify([String(chave), usuarioId, c.campus_id, [...new Set(c.campi.map(i => i.id))].sort()]);
}
module.exports = { filtrarCampus, carimbarCampus, chaveCacheCampus, validarContexto };
