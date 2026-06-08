// Handlers do eventos_watcher · cria notificações pros responsáveis.

const { supabase } = require('../../utils/supabase');

async function notif(opts) {
  const { notificar } = require('../../services/notificar');
  return notificar(opts);
}

async function applyAlertarTarefaAtrasada({ payload }) {
  const { tarefa_id, nome_tarefa, dias_atrasada, severidade, responsavel_profile_id, event_id } = payload || {};
  if (!tarefa_id) return { ok: false, error: 'tarefa_id ausente' };
  await notif({
    modulo: 'eventos',
    tipo: 'tarefa_atrasada',
    titulo: `Tarefa atrasada · ${nome_tarefa}`,
    mensagem: `A tarefa "${nome_tarefa}" esta atrasada ha ${dias_atrasada} dia(s). Atualize o status.`,
    link: event_id ? `/eventos/${event_id}` : '/eventos',
    severidade: severidade || 'aviso',
    chaveDedup: `eventos_atrasada_${tarefa_id}_${new Date().toISOString().slice(0, 10)}`,
    targetIds: responsavel_profile_id ? [responsavel_profile_id] : undefined,
  });
  return { ok: true, info: { tarefa: nome_tarefa, dias: dias_atrasada } };
}

async function applyAlertarTarefaSemResponsavel({ payload }) {
  const { tarefa_id, area, nome_tarefa, dias_ate_evento, is_critica, event_id } = payload || {};
  if (!tarefa_id) return { ok: false, error: 'tarefa_id ausente' };

  // Resolve responsável da área via area_responsaveis
  let targetIds;
  if (area) {
    const { data: r } = await supabase
      .from('area_responsaveis')
      .select('responsavel_id')
      .eq('area', area)
      .maybeSingle();
    if (r?.responsavel_id) targetIds = [r.responsavel_id];
  }

  await notif({
    modulo: 'eventos',
    tipo: 'tarefa_sem_responsavel',
    titulo: `${is_critica ? '🔴 ' : ''}Tarefa sem responsável · ${area}`,
    mensagem: `"${nome_tarefa}" (area ${area}) esta sem responsavel atribuido${dias_ate_evento != null ? ` e o evento eh em ${dias_ate_evento} dias` : ''}. Atribua alguem.`,
    link: event_id ? `/eventos/${event_id}` : '/eventos',
    severidade: is_critica ? 'critico' : 'aviso',
    chaveDedup: `eventos_orfa_${tarefa_id}`,
    targetIds,
  });
  return { ok: true, info: { tarefa: nome_tarefa, area } };
}

async function applyAlertarEventoAtrasado({ payload }) {
  const { event_id, nome_evento, data_evento, pct_concluido, pendentes } = payload || {};
  if (!event_id) return { ok: false, error: 'event_id ausente' };
  await notif({
    modulo: 'eventos',
    tipo: 'evento_atrasado',
    titulo: `Evento ${nome_evento} com baixa preparação`,
    mensagem: `${nome_evento} (${data_evento}) tem so ${pct_concluido}% das tarefas concluídas · ${pendentes} pendentes. Atenção do responsável.`,
    link: `/eventos/${event_id}`,
    severidade: pct_concluido < 50 ? 'critico' : 'alerta',
    chaveDedup: `eventos_atrasado_${event_id}_${new Date().toISOString().slice(0, 10)}`,
  });
  return { ok: true, info: { evento: nome_evento, pct: pct_concluido } };
}

const HANDLERS = {
  'eventos.alertar_tarefa_atrasada': applyAlertarTarefaAtrasada,
  'eventos.alertar_tarefa_sem_responsavel': applyAlertarTarefaSemResponsavel,
  'eventos.alertar_evento_atrasado': applyAlertarEventoAtrasado,
};

async function applyEventosAction({ action_type, payload, reviewedBy }) {
  const handler = HANDLERS[action_type];
  if (!handler) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try { return await handler({ payload, reviewedBy }); }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
}

module.exports = { applyEventosAction, HANDLERS };
