async function notif(opts) {
  const { notificar } = require('../../services/notificar');
  return notificar(opts);
}

const HANDLERS = {
  'proj.alertar_atrasado': async ({ payload }) => {
    const { projeto_id, nome_projeto, dias_atrasado, leader_id, responsible_id } = payload || {};
    const target = leader_id || responsible_id;
    await notif({
      modulo: 'projetos', tipo: 'atrasado',
      titulo: `Projeto atrasado · ${nome_projeto}`,
      mensagem: `O projeto "${nome_projeto}" está ${dias_atrasado} dias após o date_end e ainda não foi concluído.`,
      link: `/projetos`, severidade: dias_atrasado > 60 ? 'critico' : 'alerta',
      chaveDedup: `proj_atr_${projeto_id}_${new Date().toISOString().slice(0, 7)}`,
      targetIds: target ? [target] : undefined,
    });
    return { ok: true };
  },
  'proj.alertar_sem_lider': async ({ payload }) => {
    const { projeto_id, nome_projeto } = payload || {};
    await notif({
      modulo: 'projetos', tipo: 'sem_lider',
      titulo: `Projeto sem líder · ${nome_projeto}`,
      mensagem: `"${nome_projeto}" não tem leader_id nem responsible_id. Atribuir.`,
      link: `/projetos`, severidade: 'aviso',
      chaveDedup: `proj_lid_${projeto_id}`,
    });
    return { ok: true };
  },
  'proj.alertar_sem_update': async ({ payload }) => {
    const { projeto_id, nome_projeto, dias_sem_update, leader_id } = payload || {};
    await notif({
      modulo: 'projetos', tipo: 'sem_update',
      titulo: `Projeto sem atualização ha ${dias_sem_update}d · ${nome_projeto}`,
      mensagem: `Projeto em andamento sem update ha ${dias_sem_update} dias. Atualizar status.`,
      link: `/projetos`, severidade: 'aviso',
      chaveDedup: `proj_upd_${projeto_id}_${new Date().toISOString().slice(0, 7)}`,
      targetIds: leader_id ? [leader_id] : undefined,
    });
    return { ok: true };
  },
};

async function applyProjetosAction({ action_type, payload, reviewedBy }) {
  const h = HANDLERS[action_type];
  if (!h) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try { return await h({ payload, reviewedBy }); } catch (e) { return { ok: false, error: e.message }; }
}
module.exports = { applyProjetosAction, HANDLERS };
