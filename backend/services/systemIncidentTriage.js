const crypto = require('node:crypto');
const { supabase } = require('../utils/supabase');
const { sanitizeText } = require('./systemJobRuns');

const AGENT_EMAIL = 'agente-incidentes@cbrio.org';
const ACTIVE_STATUSES = ['novo', 'reconhecido', 'investigando', 'mitigado', 'monitorado'];

function normalizeSignal(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
    .replace(/\b[0-9a-f]{20,}\b/gi, ':token')
    .replace(/\b\d{4,}\b/g, ':number')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function safeRoute(value) {
  return String(value || 'sem-rota')
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/\d{4,}(?=\/|$)/g, '/:id')
    .slice(0, 140);
}

function serverErrorFingerprint(row) {
  const signature = [
    String(row?.metodo || 'HTTP').toUpperCase(),
    safeRoute(row?.rota),
    normalizeSignal(row?.mensagem),
  ].join('|');
  return `http:${crypto.createHash('sha256').update(signature).digest('hex').slice(0, 32)}`;
}

function groupServerErrors(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const fingerprint = serverErrorFingerprint(row);
    const current = groups.get(fingerprint) || { fingerprint, rows: [] };
    current.rows.push(row);
    groups.set(fingerprint, current);
  }
  return [...groups.values()];
}

function severityForErrors(rows = []) {
  if (rows.length >= 10) return 'critical';
  return 'error';
}

function severityForFeedback(value) {
  return ({ baixa: 'info', media: 'warning', alta: 'error', critica: 'critical' })[value] || 'warning';
}

function feedbackNeedsIncident(row) {
  return row?.tipo === 'bug' || row?.tipo === 'confusao';
}

async function queryRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function activeIncident(sourceType, sourceRef, db) {
  const { data, error } = await db.from('system_incidents')
    .select('*')
    .eq('source_type', sourceType)
    .eq('source_ref', sourceRef)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function addAgentNote(incidentId, message, metadata, db) {
  const { error } = await db.from('system_incident_events').insert({
    incident_id: incidentId,
    event_type: 'note',
    message: sanitizeText(message, 4000),
    actor_email: AGENT_EMAIL,
    metadata: { agent: 'incident-triage-v1', ...metadata },
  });
  if (error) throw error;
}

async function createInvestigatingIncident(row, note, metadata, db) {
  const now = new Date().toISOString();
  const { data, error } = await db.from('system_incidents').insert({
    ...row,
    status: 'investigando',
    acknowledged_at: now,
    created_by_email: AGENT_EMAIL,
    updated_by_email: AGENT_EMAIL,
  }).select('*').single();
  if (error) {
    if (error.code === '23505') return activeIncident(row.source_type, row.source_ref, db);
    throw error;
  }
  await addAgentNote(data.id, note, metadata, db);
  return data;
}

async function triageServerErrors({ db, since }) {
  const rows = await queryRows(db.from('app_erros_servidor')
    .select('id,metodo,rota,mensagem,status,request_id,release,environment,created_at')
    .gte('created_at', since)
    .gte('status', 500)
    .order('created_at', { ascending: false })
    .limit(500));
  let opened = 0;
  let grouped = 0;

  for (const group of groupServerErrors(rows)) {
    const sample = group.rows[0];
    const current = await activeIncident('server_error', group.fingerprint, db);
    const impact = `${group.rows.length} ocorrência(s) nos últimos 15 minutos.`;
    if (current) {
      const { error } = await db.from('system_incidents').update({
        impact_summary: impact,
        request_id: sample.request_id || current.request_id,
        updated_by_email: AGENT_EMAIL,
      }).eq('id', current.id);
      if (error) throw error;
      grouped += group.rows.length;
      continue;
    }

    await createInvestigatingIncident({
      title: `${sample.metodo || 'HTTP'} ${safeRoute(sample.rota)}`.slice(0, 180),
      description: 'Falha agrupada automaticamente. Consulte o request ID no Sentry e valide o release antes de qualquer correção.',
      severity: severityForErrors(group.rows),
      source_type: 'server_error',
      source_ref: group.fingerprint,
      affected_surface: 'web-api',
      impact_summary: impact,
      request_id: sample.request_id || null,
      release: sample.release || null,
      environment: sample.environment || 'production',
    }, 'Triagem automática iniciada. Nenhuma ação corretiva foi executada nesta etapa.', {
      signal_type: 'server_error',
      occurrences: group.rows.length,
      fingerprint: group.fingerprint,
    }, db);
    opened += 1;
  }
  return { scanned: rows.length, opened, grouped };
}

async function triageFeedback({ db }) {
  const rows = await queryRows(db.from('app_feedback')
    .select('id,tipo,mensagem,rota,modulo,severidade,status,created_at')
    .eq('status', 'novo')
    .order('created_at', { ascending: true })
    .limit(200));
  let opened = 0;
  let triaged = 0;

  for (const row of rows) {
    if (!feedbackNeedsIncident(row)) {
      const { error } = await db.from('app_feedback').update({ status: 'triado' }).eq('id', row.id);
      if (error) throw error;
      triaged += 1;
      continue;
    }

    const sourceRef = String(row.id);
    let incident = await activeIncident('feedback', sourceRef, db);
    if (!incident) {
      incident = await createInvestigatingIncident({
        title: `Feedback ${row.tipo} em ${safeRoute(row.rota || row.modulo || 'superficie-nao-informada')}`.slice(0, 180),
        description: 'Relato humano recebido. Consulte o feedback vinculado; o agente não copia payloads para o incidente.',
        severity: severityForFeedback(row.severidade),
        source_type: 'feedback',
        source_ref: sourceRef,
        affected_surface: sanitizeText(row.modulo || row.rota || 'web', 120),
        impact_summary: 'Relato humano aguardando validação técnica.',
        environment: 'production',
      }, 'Feedback recebido e colocado automaticamente em investigação. Nenhuma correção foi aplicada.', {
        signal_type: 'feedback',
        feedback_id: sourceRef,
      }, db);
      opened += 1;
    }
    const { error } = await db.from('app_feedback').update({ status: 'em_andamento' }).eq('id', row.id);
    if (error) throw error;
    triaged += 1;
  }
  return { scanned: rows.length, opened, triaged };
}

async function promoteUntriagedIncidents({ db }) {
  const rows = await queryRows(db.from('system_incidents')
    .select('id,status,source_type')
    .in('status', ['novo', 'reconhecido'])
    .order('created_at', { ascending: true })
    .limit(200));
  let promoted = 0;
  for (const row of rows) {
    const { error } = await db.from('system_incidents').update({
      status: 'investigando',
      acknowledged_at: new Date().toISOString(),
      updated_by_email: AGENT_EMAIL,
    }).eq('id', row.id).in('status', ['novo', 'reconhecido']);
    if (error) throw error;
    await addAgentNote(row.id, 'O agente assumiu a triagem e iniciou a investigação. Ações corretivas continuam bloqueadas.', {
      signal_type: row.source_type,
    }, db);
    promoted += 1;
  }
  return { scanned: rows.length, promoted };
}

async function runIncidentTriage({ db = supabase, now = new Date() } = {}) {
  if (!db) throw new Error('Supabase indisponível para a triagem de incidentes');
  const since = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const [errors, feedback] = await Promise.all([
    triageServerErrors({ db, since }),
    triageFeedback({ db }),
  ]);
  const incidents = await promoteUntriagedIncidents({ db });
  return {
    ok: true,
    mode: 'triage_only',
    generated_at: now.toISOString(),
    errors,
    feedback,
    incidents,
    safety: {
      code_changes: false,
      migrations: false,
      production_actions: false,
      financial_actions: false,
    },
  };
}

module.exports = {
  AGENT_EMAIL,
  normalizeSignal,
  safeRoute,
  serverErrorFingerprint,
  groupServerErrors,
  severityForErrors,
  severityForFeedback,
  feedbackNeedsIncident,
  runIncidentTriage,
};
