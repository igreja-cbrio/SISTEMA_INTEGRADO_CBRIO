async function notif(opts) {
  const { notificar } = require('../../services/notificar');
  return notificar(opts);
}

const HANDLERS = {
  'grupos.alertar_sem_encontro': async ({ payload }) => {
    const { grupo_id, nome_grupo, supervisor_id, lider_id, dias_sem_encontro } = payload || {};
    const target = supervisor_id || lider_id;
    await notif({
      modulo: 'membresia', tipo: 'grupo_sem_encontro',
      titulo: `Grupo ${nome_grupo} sem encontro ha ${dias_sem_encontro}d`,
      mensagem: `Grupo "${nome_grupo}" não tem encontro registrado ha ${dias_sem_encontro} dias. Verificar com o líder.`,
      link: `/grupos`, severidade: dias_sem_encontro > 60 ? 'critico' : 'alerta',
      chaveDedup: `grp_enc_${grupo_id}_${new Date().toISOString().slice(0, 7)}`,
      targetIds: target ? [target] : undefined,
    });
    return { ok: true };
  },
  'grupos.alertar_sem_lider': async ({ payload }) => {
    const { grupo_id, nome_grupo } = payload || {};
    await notif({
      modulo: 'membresia', tipo: 'grupo_sem_lider',
      titulo: `Grupo ${nome_grupo} sem líder`,
      mensagem: `Grupo "${nome_grupo}" está ativo mas sem líder atribuído. Atribuir alguém.`,
      link: `/grupos`, severidade: 'alerta',
      chaveDedup: `grp_lid_${grupo_id}`,
    });
    return { ok: true };
  },
};

async function applyGruposAction({ action_type, payload, reviewedBy }) {
  const h = HANDLERS[action_type];
  if (!h) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try { return await h({ payload, reviewedBy }); } catch (e) { return { ok: false, error: e.message }; }
}
module.exports = { applyGruposAction, HANDLERS };
