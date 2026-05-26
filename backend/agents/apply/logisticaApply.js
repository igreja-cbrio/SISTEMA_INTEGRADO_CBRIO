// Handlers do logistica_watcher · cria notificacoes pros responsaveis.

const { supabase } = require('../../utils/supabase');

async function notif(opts) {
  const { notificar } = require('../../services/notificar');
  return notificar(opts);
}

async function resolverResponsavel(responsavel_id) {
  if (!responsavel_id) return null;
  return responsavel_id; // ja eh profile id em solicitacoes
}

async function applyAlertarSla({ payload }) {
  const { solicitacao_id, titulo, area_responsavel, responsavel_id, horas_atrasada, severidade } = payload || {};
  if (!solicitacao_id) return { ok: false, error: 'solicitacao_id ausente' };
  await notif({
    modulo: 'solicitacoes',
    tipo: 'sla_estourado',
    titulo: `SLA estourado · ${titulo}`,
    mensagem: `Solicitacao "${titulo}" (${area_responsavel}) esta ${horas_atrasada}h alem do SLA. Atender.`,
    link: `/solicitacoes`,
    severidade: severidade || 'aviso',
    chaveDedup: `log_sla_${solicitacao_id}_${new Date().toISOString().slice(0, 10)}`,
    targetIds: responsavel_id ? [responsavel_id] : undefined,
  });
  return { ok: true, info: { solicitacao_id, horas: horas_atrasada } };
}

async function applyAlertarUrgente({ payload }) {
  const { solicitacao_id, titulo, area_responsavel, responsavel_id, horas_aberta, justificativa } = payload || {};
  if (!solicitacao_id) return { ok: false, error: 'solicitacao_id ausente' };
  await notif({
    modulo: 'solicitacoes',
    tipo: 'urgente_nao_atendida',
    titulo: `🔴 URGENTE aberta ha ${horas_aberta}h · ${titulo}`,
    mensagem: `${titulo} (${area_responsavel}) marcada urgente, ainda em pendente.${justificativa ? ` Justificativa: ${justificativa}` : ''}`,
    link: `/solicitacoes`,
    severidade: 'critico',
    chaveDedup: `log_urg_${solicitacao_id}_${new Date().toISOString().slice(0, 10)}`,
    targetIds: responsavel_id ? [responsavel_id] : undefined,
  });
  return { ok: true, info: { solicitacao_id } };
}

async function applyAlertarMlParado({ payload }) {
  const { solicitacao_id, titulo, solicitante_id, ml_last_status, dias_sem_update, tracking_url } = payload || {};
  if (!solicitacao_id) return { ok: false, error: 'solicitacao_id ausente' };
  await notif({
    modulo: 'solicitacoes',
    tipo: 'ml_rastreio_parado',
    titulo: `Rastreio ML parado · ${titulo}`,
    mensagem: `Pedido "${titulo}" no status "${ml_last_status}" sem update ha ${dias_sem_update} dias. Verificar.${tracking_url ? ` Track: ${tracking_url}` : ''}`,
    link: `/solicitacoes`,
    severidade: dias_sem_update > 14 ? 'alerta' : 'aviso',
    chaveDedup: `log_ml_${solicitacao_id}_${new Date().toISOString().slice(0, 10)}`,
    targetIds: solicitante_id ? [solicitante_id] : undefined,
  });
  return { ok: true, info: { solicitacao_id, status: ml_last_status } };
}

const HANDLERS = {
  'log.alertar_sla_resposta': applyAlertarSla,
  'log.alertar_urgente': applyAlertarUrgente,
  'log.alertar_ml_parado': applyAlertarMlParado,
};

async function applyLogisticaAction({ action_type, payload, reviewedBy }) {
  const handler = HANDLERS[action_type];
  if (!handler) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try { return await handler({ payload, reviewedBy }); }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
}

module.exports = { applyLogisticaAction, HANDLERS };
