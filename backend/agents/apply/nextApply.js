async function notif(opts) {
  const { notificar } = require('../../services/notificar');
  return notificar(opts);
}

const HANDLERS = {
  'next.alertar_sem_checkin': async ({ payload }) => {
    const { inscricao_id, nome, telefone } = payload || {};
    await notif({
      modulo: 'membresia', tipo: 'next_sem_checkin',
      titulo: `NEXT · ${nome} não compareceu`,
      mensagem: `${nome} se inscreveu mas não fez check-in. Telefone: ${telefone || 'N/A'}. Fazer contato.`,
      link: `/ministerial/next`, severidade: 'aviso',
      chaveDedup: `next_nochk_${inscricao_id}`,
    });
    return { ok: true };
  },
  'next.alertar_indicacao_pendente': async ({ payload }) => {
    const { inscricao_id, nome, dias_sem_indicacao } = payload || {};
    await notif({
      modulo: 'membresia', tipo: 'next_indicacao_pendente',
      titulo: `NEXT · indicação pendente · ${nome}`,
      mensagem: `${nome} fez check-in ha ${dias_sem_indicacao} dias mas ainda não tem indicações (batismo/servir/grupo) marcadas.`,
      link: `/ministerial/next`, severidade: 'aviso',
      chaveDedup: `next_ind_${inscricao_id}_${new Date().toISOString().slice(0, 7)}`,
    });
    return { ok: true };
  },
};

async function applyNextAction({ action_type, payload, reviewedBy }) {
  const h = HANDLERS[action_type];
  if (!h) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try { return await h({ payload, reviewedBy }); } catch (e) { return { ok: false, error: e.message }; }
}
module.exports = { applyNextAction, HANDLERS };
