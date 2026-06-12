// Handlers do cuidados_watcher · cria notificações pros responsáveis pastorais.

const { supabase } = require('../../utils/supabase');

async function notificar(opts) {
  const { notificar: fn } = require('../../services/notificar');
  return fn(opts);
}

async function applyAlertarJornada180({ payload }) {
  const { jornada_id, responsavel_id, nome_convertido, dias_parado, severidade } = payload || {};
  if (!jornada_id) return { ok: false, error: 'jornada_id ausente' };
  await notificar({
    modulo: 'cuidados',
    tipo: 'jornada180_parada',
    titulo: `Jornada 180 parada · ${nome_convertido || 'convertido'}`,
    mensagem: `${nome_convertido} esta sem encontro ha ${dias_parado} dias. Agendar visita pastoral.`,
    link: `/ministerial/cuidados`,
    severidade: severidade || 'aviso',
    chaveDedup: `cui_jornada180_${jornada_id}_${new Date().toISOString().slice(0, 10)}`,
    targetIds: responsavel_id ? [responsavel_id] : undefined,
  });
  return { ok: true, info: { jornada_id, nome: nome_convertido } };
}

async function applyAlertarVisitante({ payload }) {
  const { visitante_id, nome_visitante, dias_desde_visita, fez_decisao } = payload || {};
  if (!visitante_id) return { ok: false, error: 'visitante_id ausente' };
  await notificar({
    modulo: 'integracao',
    tipo: 'visitante_sem_followup',
    titulo: `Visitante sem follow-up · ${nome_visitante}`,
    mensagem: fez_decisao
      ? `${nome_visitante} fez decisão ha ${dias_desde_visita} dias e ainda sem responsável atribuído. PRIORIDADE.`
      : `${nome_visitante} visitou ha ${dias_desde_visita} dias e ainda sem follow-up. Atribuir responsável.`,
    link: `/integracao`,
    severidade: fez_decisao ? 'critico' : 'aviso',
    chaveDedup: `cui_visit_${visitante_id}`,
  });
  return { ok: true, info: { visitante_id, nome: nome_visitante } };
}

async function applyAlertarAcompanhamento({ payload }) {
  const { acompanhamento_id, responsavel_id, nome_acompanhado, dias_aberto } = payload || {};
  if (!acompanhamento_id) return { ok: false, error: 'acompanhamento_id ausente' };
  await notificar({
    modulo: 'cuidados',
    tipo: 'acompanhamento_estagnado',
    titulo: `Acompanhamento aberto ha ${dias_aberto}d · ${nome_acompanhado || 'pessoa'}`,
    mensagem: `Acompanhamento pastoral de ${nome_acompanhado} esta aberto sem atualização ha ${dias_aberto} dias.`,
    link: `/ministerial/cuidados`,
    severidade: dias_aberto > 60 ? 'critico' : 'aviso',
    chaveDedup: `cui_acomp_${acompanhamento_id}_${new Date().toISOString().slice(0, 7)}`,
    targetIds: responsavel_id ? [responsavel_id] : undefined,
  });
  return { ok: true, info: { acompanhamento_id, nome: nome_acompanhado } };
}

const HANDLERS = {
  'cui.alertar_jornada180': applyAlertarJornada180,
  'cui.alertar_visitante': applyAlertarVisitante,
  'cui.alertar_acompanhamento': applyAlertarAcompanhamento,
};

async function applyCuidadosAction({ action_type, payload, reviewedBy }) {
  const handler = HANDLERS[action_type];
  if (!handler) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try {
    return await handler({ payload, reviewedBy });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { applyCuidadosAction, HANDLERS };
