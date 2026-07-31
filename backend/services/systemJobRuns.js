const { supabase } = require('../utils/supabase');
const { getReleaseInfo } = require('../config/systemCatalog');

const VALID_STATUSES = new Set(['running', 'success', 'warning', 'failed', 'skipped']);
const VALID_EFFECTS = new Set(['unknown', 'confirmed', 'not_applicable', 'failed']);

function sanitizeText(value, max = 500) {
  if (value == null) return null;
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(token|secret|password|senha|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, max);
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = {};
  for (const key of ['method', 'route', 'http_status', 'source', 'result']) {
    if (value[key] == null) continue;
    allowed[key] = typeof value[key] === 'string'
      ? sanitizeText(value[key], 200)
      : value[key];
  }
  return allowed;
}

async function recordJobRun(input) {
  const release = getReleaseInfo();
  const startedAt = input.startedAt instanceof Date ? input.startedAt : new Date(input.startedAt || Date.now());
  const finishedAt = input.finishedAt instanceof Date ? input.finishedAt : new Date(input.finishedAt || Date.now());
  const durationMs = Math.max(0, Number(input.durationMs ?? (finishedAt.getTime() - startedAt.getTime())) || 0);

  const row = {
    job_id: sanitizeText(input.jobId, 300),
    provider: input.provider || 'internal',
    schedule: sanitizeText(input.schedule, 100),
    trigger_type: input.triggerType || 'unknown',
    status: VALID_STATUSES.has(input.status) ? input.status : 'warning',
    effect_status: VALID_EFFECTS.has(input.effectStatus) ? input.effectStatus : 'unknown',
    attempt: Math.max(1, Number(input.attempt) || 1),
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
    input_count: Number.isFinite(input.inputCount) ? Math.max(0, input.inputCount) : null,
    output_count: Number.isFinite(input.outputCount) ? Math.max(0, input.outputCount) : null,
    discarded_count: Number.isFinite(input.discardedCount) ? Math.max(0, input.discardedCount) : null,
    error_code: sanitizeText(input.errorCode, 120),
    error_message: sanitizeText(input.errorMessage, 1000),
    request_id: sanitizeText(input.requestId, 128),
    release: release.commit,
    environment: release.environment,
    owner_label: sanitizeText(input.ownerLabel, 160),
    runbook_url: sanitizeText(input.runbookUrl, 500),
    triggered_by: sanitizeText(input.triggeredBy, 200),
    metadata: sanitizeMetadata(input.metadata),
  };

  const { data, error } = await supabase
    .from('system_job_runs')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  sanitizeText,
  sanitizeMetadata,
  recordJobRun,
};
