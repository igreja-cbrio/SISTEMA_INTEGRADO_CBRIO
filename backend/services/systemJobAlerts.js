const { supabase } = require('../utils/supabase');
const { JOBS, getReleaseInfo } = require('../config/systemCatalog');
const { notificar } = require('./notificar');

const ACTIVE_INCIDENT_STATUSES = ['novo', 'reconhecido', 'investigando', 'mitigado', 'monitorado'];

function isConfirmedFailure(run) {
  return run?.status === 'failed' || run?.effect_status === 'failed' || run?.effectStatus === 'failed';
}

function isConfirmedRecovery(run) {
  return run?.status === 'success'
    && (run?.effect_status === 'confirmed' || run?.effectStatus === 'confirmed');
}

function countConsecutiveFailures(runs) {
  let count = 0;
  for (const run of runs || []) {
    if (!isConfirmedFailure(run)) break;
    count += 1;
  }
  return count;
}

function countConsecutiveRecoveries(runs) {
  let count = 0;
  for (const run of runs || []) {
    if (!isConfirmedRecovery(run)) break;
    count += 1;
  }
  return count;
}

function decideJobAlert({ currentRun, recentRuns, activeIncident, policy }) {
  if (!policy?.enabled) return { action: 'none', reason: 'disabled' };
  if (isConfirmedRecovery(currentRun)) {
    if (!activeIncident) return { action: 'none', reason: 'no_active_incident' };
    const recoveries = countConsecutiveRecoveries(recentRuns);
    return recoveries >= (policy.recoveryThreshold || 1)
      ? { action: 'resolve', incident: activeIncident, recoveries }
      : { action: 'none', reason: 'recovery_observation', recoveries };
  }
  if (!isConfirmedFailure(currentRun)) return { action: 'none', reason: 'not_confirmed_failure' };
  if (activeIncident) return { action: 'none', reason: 'already_open' };

  const failures = countConsecutiveFailures(recentRuns);
  if (failures < policy.threshold) {
    return { action: 'none', reason: 'below_threshold', failures };
  }
  return { action: 'open', failures };
}

async function superAdminProfileIds(db = supabase) {
  const { data: admins, error: adminError } = await db
    .from('app_super_admins')
    .select('email')
    .eq('ativo', true);
  if (adminError) throw adminError;
  const emails = [...new Set((admins || []).map((row) => String(row.email || '').toLowerCase()).filter(Boolean))];
  if (!emails.length) return [];

  const { data: profiles, error: profileError } = await db
    .from('profiles')
    .select('id,email')
    .in('email', emails)
    .eq('active', true);
  if (profileError) throw profileError;
  return (profiles || []).map((row) => row.id).filter(Boolean);
}

function jobForId(jobId) {
  return JOBS.find((job) => job.id === jobId) || null;
}

async function activeIncidentForJob(jobId, db = supabase) {
  const { data, error } = await db
    .from('system_incidents')
    .select('*')
    .eq('source_type', 'job')
    .eq('source_ref', jobId)
    .in('status', ACTIVE_INCIDENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function notifySuperAdmins(payload, db = supabase, notify = notificar) {
  const targetIds = await superAdminProfileIds(db);
  if (!targetIds.length) return 0;
  return notify({ ...payload, targetIds });
}

async function evaluateJobAlert(currentRun, { db = supabase, notify = notificar } = {}) {
  const job = jobForId(currentRun?.jobId || currentRun?.job_id);
  const policy = job?.alertPolicy;
  if (!job || !policy?.enabled) return { action: 'none', reason: 'no_policy' };
  if (!isConfirmedFailure(currentRun) && !isConfirmedRecovery(currentRun))
    return { action: 'none', reason: 'not_confirmed_failure' };

  const activeIncident = await activeIncidentForJob(job.id, db);
  let recentRuns = [];
  if ((isConfirmedFailure(currentRun) && !activeIncident)
    || (isConfirmedRecovery(currentRun) && activeIncident)) {
    const { data, error } = await db
      .from('system_job_runs')
      .select('id,status,effect_status,error_code,error_message,request_id,started_at')
      .eq('job_id', job.id)
      .order('started_at', { ascending: false })
      .limit(Math.max(policy.threshold, policy.recoveryThreshold || 1));
    if (error) throw error;
    recentRuns = data || [];
  }

  const decision = decideJobAlert({ currentRun, recentRuns, activeIncident, policy });
  if (decision.action === 'none') return decision;

  if (decision.action === 'resolve') {
    const resolvedAt = new Date().toISOString();
    const { data, error } = await db
      .from('system_incidents')
      .update({
        status: 'resolvido',
        resolved_at: resolvedAt,
        updated_by_email: 'sistema@cbrio.org',
        request_id: currentRun.requestId || currentRun.request_id || null,
      })
      .eq('id', activeIncident.id)
      .select('id,title,severity')
      .single();
    if (error) throw error;
    await notifySuperAdmins({
      modulo: 'sistema', tipo: 'job_recovered', severidade: 'info',
      titulo: `Recuperado: ${job.name}`,
      mensagem: 'A rotina voltou a concluir com efeito confirmado. O incidente foi resolvido automaticamente.',
      link: '/sistema?view=incidents', chaveDedup: `system-job-recovered:${data.id}`,
    }, db, notify).catch((error) => console.warn('[system-job-alerts] notificacao de recuperacao:', error.message));
    return { action: 'resolved', incidentId: data.id };
  }

  const release = getReleaseInfo();
  const lastFailure = recentRuns[0] || currentRun;
  const ownerEmail = process.env.SYSTEM_ALERT_OWNER_EMAIL || null;
  const description = [
    `${decision.failures} falhas consecutivas confirmadas na rotina ${job.path}.`,
    `Responsavel operacional: ${policy.ownerLabel}.`,
    `Runbook: ${policy.runbook}.`,
  ].join('\n');
  const row = {
    title: `Falhas consecutivas: ${job.name}`,
    description,
    severity: policy.severity,
    status: 'novo',
    source_type: 'job',
    source_ref: job.id,
    affected_surface: job.category,
    impact_summary: `${decision.failures} execucoes consecutivas falharam.`,
    owner_email: ownerEmail,
    request_id: lastFailure.request_id || currentRun.requestId || null,
    release: release.commit,
    environment: release.environment,
    created_by_email: 'sistema@cbrio.org',
    updated_by_email: 'sistema@cbrio.org',
  };
  const { data, error } = await db.from('system_incidents').insert(row).select('id').single();
  if (error) {
    if (error.code === '23505') return { action: 'none', reason: 'race_deduplicated' };
    throw error;
  }

  await notifySuperAdmins({
    modulo: 'sistema', tipo: 'job_incident', severidade: policy.severity,
    titulo: `Incidente: ${job.name}`,
    mensagem: `${decision.failures} falhas consecutivas. ${policy.runbook}`,
    link: '/sistema?view=incidents', chaveDedup: `system-job-incident:${data.id}`,
    email: policy.severity === 'error' || policy.severity === 'critical',
  }, db, notify).catch((notifyError) => console.warn('[system-job-alerts] notificacao de incidente:', notifyError.message));
  return { action: 'opened', incidentId: data.id, failures: decision.failures };
}

module.exports = {
  ACTIVE_INCIDENT_STATUSES,
  isConfirmedFailure,
  isConfirmedRecovery,
  countConsecutiveFailures,
  countConsecutiveRecoveries,
  decideJobAlert,
  superAdminProfileIds,
  evaluateJobAlert,
};
