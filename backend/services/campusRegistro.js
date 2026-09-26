const { criarMiddlewareCampus } = require('../middleware/campus');
const { ErroCampus, responderErroCampus } = require('./campusContexto');
const { filtrarCampus, validarContexto } = require('../utils/campusQuery');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A tabela é uma constante definida pela rota, nunca um campo do cliente.
function criarGuardasRegistro({ modulo, tabela, supabase, resolver } = {}) {
  if (!/^[a-z_]+$/.test(tabela || '')) throw new Error('Tabela de campus inválida');
  const db = () => supabase || require('../utils/supabase').supabase;
  const contexto = criarMiddlewareCampus({ modulo, cobertura: { leitura: true, escrita: true }, ...(supabase ? { supabase } : {}), ...(resolver ? { resolver } : {}) });
  const proteger = fn => async (req, res, next) => {
    try { await fn(req); return next(); } catch (e) { return responderErroCampus(res, e); }
  };
  const payload = proteger(async req => {
    validarContexto(req.campus, true);
    if (req.body?.igreja_id !== undefined && req.body.igreja_id !== req.campus.campus_id) {
      throw new ErroCampus(403, 'campus_payload_divergente', 'O campus informado difere do selecionado.');
    }
  });
  const registro = proteger(async req => {
    if (!UUID.test(req.params?.id || '')) throw new ErroCampus(404, 'campus_registro_ausente', 'Registro não encontrado.');
    const { data, error } = await filtrarCampus(db().from(tabela).select('*'), req.campus)
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) throw new ErroCampus(404, 'campus_registro_ausente', 'Registro não encontrado.');
    req.registroCampus = Object.freeze({ ...data });
  });
  const membro = proteger(async req => {
    const id = req.body?.membro_id;
    if (id === undefined || id === null || id === '') return;
    if (id === req.registroCampus?.membro_id) return;
    if (!UUID.test(id)) throw new ErroCampus(404, 'campus_membro_ausente', 'Membro não encontrado neste campus.');
    const { data, error } = await filtrarCampus(db().from('mem_membros').select('id'), req.campus)
      .eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) throw new ErroCampus(404, 'campus_membro_ausente', 'Membro não encontrado neste campus.');
  });
  return { contexto, payload, registro, membro };
}
module.exports = { criarGuardasRegistro };
