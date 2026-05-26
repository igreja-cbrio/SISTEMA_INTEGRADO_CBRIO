// Handlers do membresia_watcher.

async function notif(opts) {
  const { notificar } = require('../../services/notificar');
  return notificar(opts);
}

async function applyAlertarDuplicado({ payload }) {
  const { membro_a_id, membro_b_id, nome_a, nome_b, score, motivos } = payload || {};
  if (!membro_a_id || !membro_b_id) return { ok: false, error: 'membros ausentes' };
  await notif({
    modulo: 'membresia',
    tipo: 'duplicado_detectado',
    titulo: `Possivel duplicado · ${nome_a} ↔ ${nome_b}`,
    mensagem: `Par detectado com score ${Math.round((score || 0) * 100)}% (${(motivos || []).join(', ')}). Revisar e fazer merge ou marcar como nao-duplicado.`,
    link: `/ministerial/membresia?aba=duplicados`,
    severidade: score >= 0.95 ? 'alerta' : 'aviso',
    chaveDedup: `mem_dup_${[membro_a_id, membro_b_id].sort().join('_')}`,
    // sem targetIds · vai pra admin/diretor (membresia)
  });
  return { ok: true, info: { par: `${nome_a} ↔ ${nome_b}`, score } };
}

async function applyAlertarCadastroParado({ payload }) {
  const { cadastro_id, nome, origem, dias_parado, severidade } = payload || {};
  if (!cadastro_id) return { ok: false, error: 'cadastro_id ausente' };
  await notif({
    modulo: 'membresia',
    tipo: 'cadastro_parado',
    titulo: `Cadastro pendente ha ${dias_parado}d · ${nome}`,
    mensagem: `Cadastro de "${nome}"${origem ? ` (via ${origem})` : ''} aguarda revisao ha ${dias_parado} dias. Aprovar ou rejeitar.`,
    link: `/ministerial/membresia?aba=cadastros`,
    severidade: severidade || 'alerta',
    chaveDedup: `mem_cad_${cadastro_id}_${new Date().toISOString().slice(0, 7)}`,
  });
  return { ok: true, info: { cadastro_id, nome, dias_parado } };
}

const HANDLERS = {
  'mem.alertar_duplicado': applyAlertarDuplicado,
  'mem.alertar_cadastro_parado': applyAlertarCadastroParado,
};

async function applyMembresiaAction({ action_type, payload, reviewedBy }) {
  const handler = HANDLERS[action_type];
  if (!handler) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try { return await handler({ payload, reviewedBy }); }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
}

module.exports = { applyMembresiaAction, HANDLERS };
