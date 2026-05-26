// Handlers do voluntariado_watcher · cria notificacao pro lider do ministerio.

const { supabase } = require('../../utils/supabase');

async function notif(opts) {
  const { notificar } = require('../../services/notificar');
  return notificar(opts);
}

async function resolverLiderMinisterio(ministerio_id) {
  if (!ministerio_id) return null;
  const { data } = await supabase
    .from('mem_ministerios')
    .select('lider_id, nome')
    .eq('id', ministerio_id)
    .maybeSingle();
  return data;
}

async function applyAlertarInativo({ payload }) {
  const { voluntario_id, ministerio_id, nome_voluntario, dias_sem_checkin } = payload || {};
  if (!voluntario_id) return { ok: false, error: 'voluntario_id ausente' };
  const min = await resolverLiderMinisterio(ministerio_id);
  await notif({
    modulo: 'voluntariado',
    tipo: 'voluntario_inativo',
    titulo: `Voluntario inativo · ${nome_voluntario}`,
    mensagem: `${nome_voluntario}${min?.nome ? ` (${min.nome})` : ''} esta sem check-in ha ${dias_sem_checkin} dias. Considere fazer contato pastoral.`,
    link: '/voluntariado',
    severidade: dias_sem_checkin > 90 ? 'alerta' : 'aviso',
    chaveDedup: `vol_inativo_${voluntario_id}_${new Date().toISOString().slice(0, 7)}`,
    targetIds: min?.lider_id ? [min.lider_id] : undefined,
  });
  return { ok: true, info: { voluntario: nome_voluntario, dias: dias_sem_checkin } };
}

async function applyAlertarPausa({ payload }) {
  const { voluntario_id, ministerio_id, nome_voluntario, dias_sem_checkin, checkins_antes } = payload || {};
  if (!voluntario_id) return { ok: false, error: 'voluntario_id ausente' };
  const min = await resolverLiderMinisterio(ministerio_id);
  await notif({
    modulo: 'voluntariado',
    tipo: 'voluntario_pausa',
    titulo: `Voluntario em pausa · ${nome_voluntario}`,
    mensagem: `${nome_voluntario}${min?.nome ? ` (${min.nome})` : ''} sem check-in ha ${dias_sem_checkin} dias (tinha ${checkins_antes} check-ins antes). Bom momento pra um oi.`,
    link: '/voluntariado',
    severidade: 'aviso',
    chaveDedup: `vol_pausa_${voluntario_id}_${new Date().toISOString().slice(0, 7)}`,
    targetIds: min?.lider_id ? [min.lider_id] : undefined,
  });
  return { ok: true, info: { voluntario: nome_voluntario, dias: dias_sem_checkin } };
}

const HANDLERS = {
  'vol.alertar_inativo': applyAlertarInativo,
  'vol.alertar_pausa': applyAlertarPausa,
};

async function applyVoluntariadoAction({ action_type, payload, reviewedBy }) {
  const handler = HANDLERS[action_type];
  if (!handler) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try { return await handler({ payload, reviewedBy }); }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
}

module.exports = { applyVoluntariadoAction, HANDLERS };
