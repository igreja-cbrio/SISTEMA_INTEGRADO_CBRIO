async function notif(opts) {
  const { notificar } = require('../../services/notificar');
  return notificar(opts);
}

const HANDLERS = {
  'nps.alertar_baixa_resposta': async ({ payload }) => {
    const { pesquisa_id, titulo, respostas_atuais, dias_ativa, criado_por } = payload || {};
    await notif({
      modulo: 'nps', tipo: 'baixa_resposta',
      titulo: `NPS "${titulo}" com ${respostas_atuais} respostas`,
      mensagem: `Pesquisa NPS ativa ha ${dias_ativa} dias com apenas ${respostas_atuais} respostas. Divulgar mais.`,
      link: `/nps`, severidade: 'aviso',
      chaveDedup: `nps_baixa_${pesquisa_id}_${new Date().toISOString().slice(0, 7)}`,
      targetIds: criado_por ? [criado_por] : undefined,
    });
    return { ok: true };
  },
  'nps.alertar_analise_pendente': async ({ payload }) => {
    const { pesquisa_id, titulo, criado_por } = payload || {};
    await notif({
      modulo: 'nps', tipo: 'analise_pendente',
      titulo: `NPS "${titulo}" vencida sem análise`,
      mensagem: `Pesquisa "${titulo}" passou da data_fim mas ainda não foi analisada pela IA. Rodar análise.`,
      link: `/nps`, severidade: 'alerta',
      chaveDedup: `nps_anl_${pesquisa_id}`,
      targetIds: criado_por ? [criado_por] : undefined,
    });
    return { ok: true };
  },
  'nps.alertar_detrator': async ({ payload }) => {
    const { resposta_id, pesquisa_id, score, comentario, area } = payload || {};
    await notif({
      modulo: 'nps', tipo: 'detrator_recente',
      titulo: `Detrator NPS · score ${score}${area ? ` (${area})` : ''}`,
      mensagem: `Resposta com score ${score} recebida${comentario ? `: "${comentario.slice(0, 200)}"` : ''}. Revisar.`,
      link: `/nps/${pesquisa_id}`, severidade: score <= 3 ? 'critico' : 'alerta',
      chaveDedup: `nps_det_${resposta_id}`,
    });
    return { ok: true };
  },
};

async function applyNpsAction({ action_type, payload, reviewedBy }) {
  const h = HANDLERS[action_type];
  if (!h) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try { return await h({ payload, reviewedBy }); } catch (e) { return { ok: false, error: e.message }; }
}
module.exports = { applyNpsAction, HANDLERS };
