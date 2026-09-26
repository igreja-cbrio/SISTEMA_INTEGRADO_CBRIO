const { criarMiddlewareCampus } = require('../middleware/campus');
const { ErroCampus, responderErroCampus } = require('./campusContexto');
const { validarContexto } = require('../utils/campusQuery');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function campusLocal(req) {
  validarContexto(req.campus, true);
  if (!req.campus || !UUID.test(req.campus.campus_id || '')) {
    throw new ErroCampus(409, 'campus_selecao_necessaria', 'Selecione um campus para operar cultos.');
  }
  return req.campus.campus_id;
}

function criarGuardasCultos({ supabase, ...opcoes } = {}) {
  const db = () => supabase || require('../utils/supabase').supabase;
  const contexto = criarMiddlewareCampus({ modulo: 'integracao', cobertura: { leitura: true, escrita: true }, supabase, ...opcoes });
  const executar = fn => async (req, res, next) => {
    try { await fn(req); return next(); } catch (erro) { return responderErroCampus(res, erro); }
  };
  const payload = executar(async req => {
    const campus = campusLocal(req);
    if (req.body?.igreja_id !== undefined && req.body.igreja_id !== campus) {
      throw new ErroCampus(403, 'campus_payload_divergente', 'O campus informado não corresponde ao campus selecionado.');
    }
  });
  const culto = executar(async req => {
    if (!UUID.test(req.params?.id || '')) throw new ErroCampus(404, 'culto_nao_encontrado', 'Culto não encontrado.');
    const { data, error } = await db().from('cultos').select('id, igreja_id')
      .eq('id', req.params.id).eq('igreja_id', campusLocal(req)).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) throw new ErroCampus(404, 'culto_nao_encontrado', 'Culto não encontrado.');
  });
  const referenciasDecisao = executar(async req => {
    const { membro_id, wifi_id, tipo_decisao } = req.body || {};
    if (tipo_decisao === 'kids') return;
    // O cadastro global continua sendo conciliado pelo matcher SQL. Uma referência
    // explícita não autoriza copiar CPF/nascimento de outra unidade para a decisão.
    if (membro_id) {
      if (!UUID.test(membro_id)) throw new ErroCampus(404, 'membro_nao_encontrado', 'Membro não encontrado neste campus.');
      const { data, error } = await db().from('mem_membros').select('id')
        .eq('id', membro_id).eq('igreja_id', campusLocal(req)).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!data) throw new ErroCampus(404, 'membro_nao_encontrado', 'Membro não encontrado neste campus.');
    }
    if (wifi_id && req.campus.estado !== 'preparacao') {
      throw new ErroCampus(409, 'campus_wifi_pendente', 'A seleção de visitantes do Wi-Fi ainda não está habilitada por campus. Informe os dados fornecidos pela pessoa.');
    }
  });
  return { contexto, payload, culto, referenciasDecisao };
}

async function destinatariosDecisaoCampus(supabase, contexto, ids) {
  if (!contexto || !UUID.test(contexto.campus_id || '')) throw new Error('Contexto de campus ausente');
  if (!ids.length || contexto.estado === 'preparacao') return ids;
  const { data, error } = await supabase.from('usuario_igrejas').select('usuario_id')
    .eq('igreja_id', contexto.campus_id).in('usuario_id', ids);
  if (error || !Array.isArray(data)) throw new Error('Não foi possível verificar destinatários do campus');
  const permitidos = new Set(data.map(v => v.usuario_id));
  return ids.filter(id => permitidos.has(id));
}

module.exports = { criarGuardasCultos, campusLocal, destinatariosDecisaoCampus };
