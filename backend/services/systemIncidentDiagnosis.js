const { supabase } = require('../utils/supabase');
const { sanitizeText } = require('./systemJobRuns');
const { serverErrorFingerprint } = require('./systemIncidentTriage');
const {
  redactSensitive,
  codeContextFromStack,
  runIncidentDiagnostician,
} = require('../agents/incidentDiagnostician');

const DIAGNOSIS_AGENT_VERSION = 'incident-diagnosis-v2';
const DIAGNOSIS_EMAIL = 'agente-diagnostico@cbrio.org';

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function diagnosisEventState(events = [], now = new Date()) {
  const relevant = events.filter((event) => event.metadata?.agent_version === DIAGNOSIS_AGENT_VERSION);
  if (relevant.some((event) => event.metadata?.diagnosis_status === 'completed')) return 'completed';
  const latest = relevant.at(-1);
  if (!latest) return 'eligible';
  const ageMs = now.getTime() - new Date(latest.created_at).getTime();
  if (latest.metadata?.diagnosis_status === 'started' && ageMs < 10 * 60 * 1000) return 'running';
  if (latest.metadata?.diagnosis_status === 'failed' && ageMs < 60 * 60 * 1000) return 'cooldown';
  return 'eligible';
}

async function addDiagnosisEvent(db, incidentId, message, metadata) {
  const { error } = await db.from('system_incident_events').insert({
    incident_id: incidentId,
    event_type: 'note',
    message: sanitizeText(message, 4000),
    actor_email: DIAGNOSIS_EMAIL,
    metadata: {
      agent: 'incident-diagnostician',
      agent_version: DIAGNOSIS_AGENT_VERSION,
      autonomous_actions: false,
      ...metadata,
    },
  });
  if (error) throw error;
}

async function serverErrorEvidence(incident, db) {
  let samples = [];
  if (incident.request_id) {
    samples = await rows(db.from('app_erros_servidor')
      .select('metodo,rota,mensagem,stack,status,request_id,release,environment,created_at')
      .eq('request_id', incident.request_id)
      .order('created_at', { ascending: false })
      .limit(5));
  }
  if (!samples.length) {
    const recent = await rows(db.from('app_erros_servidor')
      .select('metodo,rota,mensagem,stack,status,request_id,release,environment,created_at')
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(500));
    samples = recent.filter((row) => serverErrorFingerprint(row) === incident.source_ref).slice(0, 5);
  }
  const sample = samples[0] || {};
  return {
    samples: samples.map((row) => ({
      method: row.metodo,
      route: row.rota,
      message: redactSensitive(row.mensagem, 1200),
      status: row.status,
      request_id: row.request_id,
      release: row.release,
      environment: row.environment,
      created_at: row.created_at,
    })),
    code_context: codeContextFromStack(sample.stack),
    stack_summary: redactSensitive(sample.stack, 3500),
  };
}

async function jobEvidence(incident, db) {
  const runs = await rows(db.from('system_job_runs')
    .select('job_id,status,effect_status,input_count,output_count,discarded_count,error_code,error_message,metadata,request_id,started_at,finished_at,duration_ms')
    .eq('job_id', incident.source_ref)
    .order('started_at', { ascending: false })
    .limit(8));
  return { runs: runs.map((run) => ({ ...run, error_message: redactSensitive(run.error_message, 1200) })) };
}

async function feedbackEvidence(incident, db) {
  const feedback = await rows(db.from('app_feedback')
    .select('id,tipo,mensagem,rota,modulo,severidade,status,created_at')
    .eq('id', incident.source_ref)
    .limit(1));
  return {
    feedback: feedback.map((item) => ({
      ...item,
      mensagem: redactSensitive(item.mensagem, 2500),
    })),
  };
}

async function buildIncidentEvidence(incident, db = supabase) {
  if (incident.source_type === 'server_error' || incident.source_type === 'sentry') {
    return serverErrorEvidence(incident, db);
  }
  if (incident.source_type === 'job') return jobEvidence(incident, db);
  if (incident.source_type === 'feedback') return feedbackEvidence(incident, db);
  return { note: 'Não há fonte técnica adicional; o diagnóstico usa somente o cadastro do incidente.' };
}

function diagnosisMessage(result) {
  const { diagnosis, specialist } = result;
  const action = diagnosis.recommended_actions[0] || 'Coletar mais evidências antes de qualquer alteração.';
  const decision = diagnosis.decision_required ? ` Decisão necessária: ${diagnosis.decision_question}` : '';
  return `${specialist}: ${diagnosis.summary} Causa provável (${diagnosis.confidence} confiança): ${diagnosis.probable_cause} Próximo passo proposto: ${action}.${decision}`;
}

async function diagnoseIncident(incident, {
  db = supabase,
  runner = runIncidentDiagnostician,
  now = new Date(),
} = {}) {
  const events = await rows(db.from('system_incident_events')
    .select('created_at,metadata')
    .eq('incident_id', incident.id)
    .order('created_at', { ascending: true })
    .limit(500));
  const state = diagnosisEventState(events, now);
  if (state !== 'eligible') return { action: 'skipped', reason: state, incidentId: incident.id };

  await addDiagnosisEvent(db, incident.id, 'Um agente especialista iniciou o diagnóstico baseado nas evidências disponíveis.', {
    diagnosis_status: 'started',
  });
  try {
    const evidence = await buildIncidentEvidence(incident, db);
    const result = await runner({ incident, evidence, triggeredBy: null });
    await addDiagnosisEvent(db, incident.id, diagnosisMessage(result), {
      diagnosis_status: 'completed',
      agent_run_id: result.runId,
      agent_type: result.agentType,
      specialist: result.specialist,
      diagnosis: result.diagnosis,
      cost_usd: Number(result.costUsd || 0),
      proposal_only: true,
    });
    return { action: 'diagnosed', incidentId: incident.id, runId: result.runId, agentType: result.agentType };
  } catch (error) {
    await addDiagnosisEvent(db, incident.id, 'O diagnóstico automático falhou e entrará em nova tentativa após o período de segurança.', {
      diagnosis_status: 'failed',
      error: redactSensitive(error.message, 700),
    });
    return { action: 'failed', incidentId: incident.id, error: redactSensitive(error.message, 700) };
  }
}

async function runIncidentDiagnosisBatch({
  db = supabase,
  runner = runIncidentDiagnostician,
  now = new Date(),
  limit = Number(process.env.INCIDENT_AI_MAX_PER_RUN || 2),
} = {}) {
  if (!db) throw new Error('Supabase indisponível para diagnóstico de incidentes');
  if (!process.env.ANTHROPIC_API_KEY && runner === runIncidentDiagnostician) {
    return { enabled: false, reason: 'ANTHROPIC_API_KEY_not_configured', scanned: 0, diagnosed: 0, failed: 0, skipped: 0 };
  }
  const safeLimit = Math.max(1, Math.min(Number(limit) || 2, 5));
  const incidents = await rows(db.from('system_incidents')
    .select('*')
    .eq('status', 'investigando')
    // Incidentes ja diagnosticados continuam em investigando ate a decisao
    // humana. Priorizar os mais novos evita que eles bloqueiem a janela para
    // sempre; o limite maior ainda permite consumir o backlog gradualmente.
    .order('created_at', { ascending: false })
    .limit(200));
  const results = [];
  for (const incident of incidents) {
    const result = await diagnoseIncident(incident, { db, runner, now });
    results.push(result);
    if (results.filter((item) => item.action === 'diagnosed' || item.action === 'failed').length >= safeLimit) break;
  }
  return {
    enabled: true,
    scanned: results.length,
    diagnosed: results.filter((item) => item.action === 'diagnosed').length,
    failed: results.filter((item) => item.action === 'failed').length,
    skipped: results.filter((item) => item.action === 'skipped').length,
    results,
    safety: { proposal_only: true, autonomous_actions: false },
  };
}

module.exports = {
  DIAGNOSIS_AGENT_VERSION,
  DIAGNOSIS_EMAIL,
  diagnosisEventState,
  buildIncidentEvidence,
  diagnosisMessage,
  diagnoseIncident,
  runIncidentDiagnosisBatch,
};
