const { cultoDeAgora } = require('./cultoDeAgora');
const { ErroCampus, responderErroCampus } = require('./campusContexto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function dados(query) {
  const result = await query;
  if (!result || result.error) throw new ErroCampus(503, 'campus_indisponivel', 'Não foi possível carregar a agenda do campus.');
  return result.data;
}

// Catálogo operacional público: escolher onde participar não concede acesso
// administrativo nem altera a identidade ou o campus-base do membro.
async function contextoApp(req, db, exigirSelecao = true) {
  if (!req.user?.id) throw new ErroCampus(401, 'campus_sem_sessao', 'Autenticação necessária.');
  const config = await dados(db.from('app_campus_config').select('estado, campus_legado_id, ja_ativado').eq('id', true).maybeSingle());
  if (!config || !['preparacao', 'ensaio', 'ativo'].includes(config.estado) || !UUID.test(config.campus_legado_id)
    || (config.estado === 'preparacao' ? config.ja_ativado !== false : config.ja_ativado !== true)) {
    throw new ErroCampus(503, 'campus_configuracao_pendente', 'A configuração de campus ainda não está disponível.');
  }
  let campi = await dados(db.from('igrejas').select('id, nome, slug, tipo').eq('ativa', true).eq('tipo', 'sede').order('nome'));
  if (!Array.isArray(campi)) throw new Error('Catálogo inválido');
  if (config.estado === 'preparacao') campi = campi.filter(c => c.id === config.campus_legado_id);
  if (!campi.length) throw new ErroCampus(503, 'campus_indisponivel', 'Nenhum campus disponível.');
  let campus = req.headers?.['x-campus-id'];
  if (campus !== undefined && (typeof campus !== 'string' || !UUID.test(campus.trim()))) {
    throw new ErroCampus(400, 'campus_invalido', 'Informe um campus válido.');
  }
  campus = campus?.trim().toLowerCase() || (campi.length === 1 ? campi[0].id : null);
  if (campus && !campi.some(c => c.id === campus)) throw new ErroCampus(403, 'campus_acesso_negado', 'Este campus não está disponível.');
  if (!campus && exigirSelecao) throw new ErroCampus(409, 'campus_selecao_necessaria', 'Selecione o campus para continuar.');
  return Object.freeze({ estado: config.estado, campus_legado_id: config.campus_legado_id, campus_id: campus,
    campi: Object.freeze(campi.map(c => Object.freeze({ id: c.id, nome: c.nome, slug: c.slug, tipo: c.tipo }))) });
}

async function membroVinculadoAgenda(req, supabase) {
  // O banner não pode reconciliar identidade por contato nem escrever vínculos.
  const perfil = await dados(supabase.from('profiles').select('membro_id').eq('id', req.user.id).maybeSingle());
  if (!perfil?.membro_id) return null;
  return dados(supabase.from('mem_membros').select('id').eq('id', perfil.membro_id).is('deleted_at', null).maybeSingle());
}

function criarCampusApp({ supabase, agora = () => Date.now(), resolverMembro = req => membroVinculadoAgenda(req, supabase), channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCfjMVzaYlCS_VE3JuEJj2vQ' }) {
  return {
    agora: async (req, res) => {
      try {
        const ctx = await contextoApp(req, supabase);
        const instante = agora();
        const { culto, ao_vivo } = await cultoDeAgora({ supabase, campusId: ctx.campus_id, agora: instante });
        let jaRegistrou = false;
        if (culto) {
          const membro = await resolverMembro(req);
          if (membro?.id) {
            const inicio = new Date(instante - 3 * 3600000).toISOString().slice(0, 10);
            const fim = new Date(instante - 3 * 3600000 + 86400000).toISOString().slice(0, 10);
            const pendentes = await dados(supabase.from('app_decisoes').select('id')
              .eq('membro_id', membro.id).eq('culto_id', culto.id).eq('status', 'pendente').is('deleted_at', null)
              .gte('criada_em', `${inicio}T00:00:00-03:00`).lt('criada_em', `${fim}T00:00:00-03:00`).limit(1));
            if (!Array.isArray(pendentes)) throw new Error('Resposta inválida de decisões.');
            jaRegistrou = pendentes.length > 0;
          }
        }
        return res.json({ culto, ao_vivo, canal_live: `https://www.youtube.com/channel/${channelId}/live`, jaRegistrou });
      } catch (erro) { return responderErroCampus(res, erro); }
    },
    contexto: async (req, res) => {
      try { return res.json(await contextoApp(req, supabase, false)); }
      catch (erro) { return responderErroCampus(res, erro); }
    },
    agenda: async (req, res) => {
      try {
        const ctx = await contextoApp(req, supabase);
        const raw = req.query?.dias ?? '7';
        if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw) || Number(raw) > 31) {
          throw new ErroCampus(400, 'campus_periodo_invalido', 'Informe um período entre 0 e 31 dias.');
        }
        const dia = (offset) => new Date(agora() - 3 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
        const result = [];
        for (let start = 0; ; start += 1000) {
          const rows = await dados(supabase.from('cultos')
            .select('id, nome, data, hora, vol_service_types(color, has_online_stream, has_kids)')
            .eq('igreja_id', ctx.campus_id).is('deleted_at', null)
            .gte('data', dia(0)).lte('data', dia(Number(raw)))
            .order('data').order('hora').order('id').range(start, start + 999));
          if (!Array.isArray(rows)) throw new ErroCampus(503, 'campus_indisponivel', 'Não foi possível carregar a agenda do campus.');
          for (const row of rows) {
            const tipo = Array.isArray(row.vol_service_types) ? row.vol_service_types[0] : row.vol_service_types;
            result.push({ id: row.id, nome: row.nome, data: row.data, hora: row.hora,
              cor: tipo?.color ?? null, has_online: tipo?.has_online_stream ?? null, has_kids: tipo?.has_kids ?? null });
          }
          if (!rows || rows.length < 1000) break;
        }
        return res.json(result);
      } catch (erro) { return responderErroCampus(res, erro); }
    },
    detalhe: async (req, res) => {
      try {
        const ctx = await contextoApp(req, supabase);
        if (!UUID.test(req.params.id || '')) throw new ErroCampus(400, 'campus_culto_invalido', 'Informe um culto válido.');
        const row = await dados(supabase.from('cultos')
          .select('id, nome, data, hora, youtube_video_id, vol_service_types(name, description, has_online_stream, has_kids, color)')
          .eq('igreja_id', ctx.campus_id).eq('id', req.params.id).is('deleted_at', null).maybeSingle());
        if (!row) return res.json(null);
        const tipo = Array.isArray(row.vol_service_types) ? row.vol_service_types[0] : row.vol_service_types;
        return res.json({ id: row.id, nome: row.nome, data: row.data, hora: row.hora, youtube_video_id: row.youtube_video_id,
          service_type: tipo ? { name: tipo.name, description: tipo.description, has_online_stream: tipo.has_online_stream, has_kids: tipo.has_kids, color: tipo.color } : null });
      } catch (erro) { return responderErroCampus(res, erro); }
    },
  };
}
module.exports = { contextoApp, criarCampusApp };
