const { supabase } = require('../utils/supabase');
const { sanitizeText } = require('./systemJobRuns');
const { DIAGNOSIS_AGENT_VERSION } = require('./systemIncidentDiagnosis');

const CORRECTION_AGENT_VERSION = 'incident-correction-v3';
const CORRECTION_EMAIL = 'agente-correcao@cbrio.org';
const ELIGIBLE_SOURCES = new Set(['server_error', 'sentry', 'job', 'feedback']);
const ELIGIBLE_CLASSIFICATIONS = new Set(['codigo', 'experiencia_usuario']);
const ELIGIBLE_CONFIDENCE = new Set(['media', 'alta']);
const ELIGIBLE_RISK = new Set(['baixo', 'medio']);

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function completedDiagnosisEvent(events = []) {
  return [...events].reverse().find((event) => (
    event.metadata?.agent_version === DIAGNOSIS_AGENT_VERSION
    && event.metadata?.diagnosis_status === 'completed'
    && event.metadata?.diagnosis
  )) || null;
}

function correctionEventState(events = []) {
  return events.some((event) => (
    event.metadata?.agent_version === CORRECTION_AGENT_VERSION
    && event.metadata?.correction_status === 'proposed'
  )) ? 'proposed' : 'eligible';
}

function correctionEligibility(incident, diagnosis) {
  if (!ELIGIBLE_SOURCES.has(incident?.source_type)) return { eligible: false, reason: 'source_not_supported' };
  if (!ELIGIBLE_CLASSIFICATIONS.has(diagnosis?.classification)) return { eligible: false, reason: 'classification_not_supported' };
  if (!ELIGIBLE_CONFIDENCE.has(diagnosis?.confidence)) return { eligible: false, reason: 'confidence_too_low' };
  if (!ELIGIBLE_RISK.has(diagnosis?.risk_level)) return { eligible: false, reason: 'risk_too_high' };
  if (diagnosis?.decision_required) return { eligible: false, reason: 'decision_required' };
  if (!diagnosis?.probable_cause || !diagnosis?.summary) return { eligible: false, reason: 'diagnosis_incomplete' };
  if (!Array.isArray(diagnosis?.evidence) || !diagnosis.evidence.length) {
    return { eligible: false, reason: 'missing_evidence' };
  }
  if (!Array.isArray(diagnosis?.recommended_actions) || !diagnosis.recommended_actions.length) {
    return { eligible: false, reason: 'missing_actions' };
  }
  if (!Array.isArray(diagnosis?.validation_steps) || !diagnosis.validation_steps.length) {
    return { eligible: false, reason: 'missing_validation' };
  }
  return { eligible: true, reason: 'eligible' };
}

function priorityForIncident(incident) {
  if (incident?.severity === 'critical') return 'critica';
  if (incident?.severity === 'error') return 'alta';
  if (incident?.severity === 'warning') return 'media';
  return 'baixa';
}

function formatDiagnosis(diagnosis) {
  const actions = diagnosis.recommended_actions.map((item, index) => (index + 1) + '. ' + item).join('\n');
  const validation = diagnosis.validation_steps.map((item, index) => (index + 1) + '. ' + item).join('\n');
  return [
    'Resumo: ' + diagnosis.summary,
    'Causa provavel (' + diagnosis.confidence + ' confianca): ' + diagnosis.probable_cause,
    'Classificacao: ' + diagnosis.classification + ' | Risco: ' + diagnosis.risk_level,
    'Acoes recomendadas:\n' + actions,
    'Validacao obrigatoria:\n' + validation,
  ].join('\n\n');
}

function correctionTaskRow(incident, diagnosis) {
  return {
    id: incident.id,
    titulo: sanitizeText('Corrigir incidente: ' + incident.title, 250),
    descricao: sanitizeText(
      'Correcao assistida da Etapa 3 para o incidente ' + incident.id + '. '
      + 'Escopo: aplicar a menor alteracao de codigo ou UX que trate a causa diagnosticada; '
      + 'incluir testes; nao alterar autenticacao, pagamentos, infraestrutura, schema ou migrations. '
      + 'A execucao termina em PR para revisao humana, sem merge ou deploy automatico.',
      4000,
    ),
    classe: 'dev',
    agente_key: 'developer_agent',
    status: 'aguardando_aprovacao',
    prioridade: priorityForIncident(incident),
    origem: 'cron',
    gate: 'G1',
    diagnostico: formatDiagnosis(diagnosis),
    diagnostico_em: new Date().toISOString(),
  };
}

async function addCorrectionEvent(db, incidentId, message, metadata) {
  const { error } = await db.from('system_incident_events').insert({
    incident_id: incidentId,
    event_type: 'note',
    message: sanitizeText(message, 4000),
    actor_email: CORRECTION_EMAIL,
    metadata: {
      agent: 'incident-correction-planner',
      agent_version: CORRECTION_AGENT_VERSION,
      autonomous_merge: false,
      autonomous_deploy: false,
      migrations_allowed: false,
      ...metadata,
    },
  });
  if (error) throw error;
}

async function planIncidentCorrection(incident, { db = supabase } = {}) {
  const events = await rows(db.from('system_incident_events')
    .select('created_at,metadata')
    .eq('incident_id', incident.id)
    .order('created_at', { ascending: true })
    .limit(500));
  if (correctionEventState(events) === 'proposed') {
    return { action: 'skipped', reason: 'already_proposed', incidentId: incident.id };
  }
  const diagnosisEvent = completedDiagnosisEvent(events);
  if (!diagnosisEvent) return { action: 'skipped', reason: 'diagnosis_missing', incidentId: incident.id };

  const diagnosis = diagnosisEvent.metadata.diagnosis;
  const eligibility = correctionEligibility(incident, diagnosis);
  if (!eligibility.eligible) {
    return { action: 'skipped', reason: eligibility.reason, incidentId: incident.id };
  }

  const task = correctionTaskRow(incident, diagnosis);
  const { error } = await db.from('agent_tarefas').insert(task);
  if (error && error.code !== '23505') throw error;

  await addCorrectionEvent(
    db,
    incident.id,
    'A Etapa 3 preparou uma proposta de correcao. A edicao do codigo depende de aprovacao humana e terminara em um PR para revisao.',
    {
      correction_status: 'proposed',
      task_id: task.id,
      diagnosis_event_created_at: diagnosisEvent.created_at,
      approval_required: true,
      max_changed_files: 6,
    },
  );
  return { action: error?.code === '23505' ? 'linked' : 'proposed', incidentId: incident.id, taskId: task.id };
}

async function runIncidentCorrectionPlanningBatch({
  db = supabase,
  limit = Number(process.env.INCIDENT_CORRECTION_MAX_PER_RUN || 3),
} = {}) {
  if (!db) throw new Error('Supabase indisponivel para planejar correcoes de incidentes');
  const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 5));
  const incidents = await rows(db.from('system_incidents')
    .select('*')
    .eq('status', 'investigando')
    .order('created_at', { ascending: false })
    .limit(200));
  const results = [];
  for (const incident of incidents) {
    const result = await planIncidentCorrection(incident, { db });
    results.push(result);
    if (results.filter((item) => item.action === 'proposed' || item.action === 'linked').length >= safeLimit) break;
  }
  return {
    enabled: true,
    scanned: results.length,
    proposed: results.filter((item) => item.action === 'proposed').length,
    linked: results.filter((item) => item.action === 'linked').length,
    skipped: results.filter((item) => item.action === 'skipped').length,
    results,
    safety: {
      approval_required: true,
      autonomous_merge: false,
      autonomous_deploy: false,
      migrations_allowed: false,
    },
  };
}

module.exports = {
  CORRECTION_AGENT_VERSION,
  CORRECTION_EMAIL,
  completedDiagnosisEvent,
  correctionEventState,
  correctionEligibility,
  priorityForIncident,
  formatDiagnosis,
  correctionTaskRow,
  planIncidentCorrection,
  runIncidentCorrectionPlanningBatch,
};
