const { supabase } = require('../utils/supabase');
const { sanitizeText } = require('./systemJobRuns');

const CONTROL_STATUSES = new Set(['implemented', 'monitoring', 'pending_decision', 'review_required', 'blocked']);

async function safeSource(name, fn, fallback) {
  try {
    return { available: true, data: await fn() };
  } catch (error) {
    console.warn(`[sistema/governance/${name}]`, error.message);
    return { available: false, error: 'source_unavailable', data: fallback };
  }
}

async function count(query) {
  const { count: total, error } = await query;
  if (error) throw error;
  return Number(total) || 0;
}

async function getWifiGovernance() {
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const [visitors, connections30d, withoutConsent, unlinked, pendingIdentity, latestResult] = await Promise.all([
    count(supabase.from('wifi_visitantes').select('id', { count: 'exact', head: true }).is('deleted_at', null)),
    count(supabase.from('wifi_conexoes').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('timestamp_evento', since30d)),
    count(supabase.from('wifi_visitantes').select('id', { count: 'exact', head: true }).is('deleted_at', null).or('aceite_lgpd.is.null,aceite_lgpd.eq.false')),
    count(supabase.from('wifi_visitantes').select('id', { count: 'exact', head: true }).is('deleted_at', null).is('membro_id', null)),
    count(supabase.from('identidade_pendencias').select('id', { count: 'exact', head: true }).eq('origem', 'wifi').eq('status', 'pendente')),
    supabase.from('wifi_sync_log')
      .select('id,iniciado_em,finalizado_em,status,visitantes_novos,conexoes_novas,vinculos_membro,visitantes_criados,erro')
      .order('iniciado_em', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (latestResult.error) throw latestResult.error;
  const latest = latestResult.data ? { ...latestResult.data, erro: sanitizeText(latestResult.data.erro, 500) } : null;
  return { visitors, connections30d, withoutConsent, unlinked, pendingIdentity, latestSync: latest };
}

async function getFacialGovernance() {
  const now = new Date().toISOString();
  const in7d = new Date(Date.now() + 7 * 86400000).toISOString();
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const [enrolled, consented, consentMismatch, anonymousPending, overduePurge, expiring7d, presences30d] = await Promise.all([
    count(supabase.from('mem_membros').select('id', { count: 'exact', head: true }).is('deleted_at', null).not('face_descriptor', 'is', null)),
    count(supabase.from('mem_membros').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('face_consentimento', true).not('face_descriptor', 'is', null)),
    count(supabase.from('mem_membros').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('face_consentimento', false).not('face_descriptor', 'is', null)),
    count(supabase.from('face_anonimos').select('id', { count: 'exact', head: true }).eq('status', 'pendente')),
    count(supabase.from('face_anonimos').select('id', { count: 'exact', head: true }).eq('status', 'pendente').lt('expurgar_em', now)),
    count(supabase.from('face_anonimos').select('id', { count: 'exact', head: true }).eq('status', 'pendente').gte('expurgar_em', now).lte('expurgar_em', in7d)),
    count(supabase.from('face_presencas').select('id', { count: 'exact', head: true }).gte('reconhecido_em', since30d)),
  ]);
  return { enrolled, consented, consentMismatch, anonymousPending, overduePurge, expiring7d, presences30d };
}

async function getDataIntegrity() {
  const since24h = new Date(Date.now() - 86400000).toISOString();
  const [pendingIdentity, auditEvents24h, serverErrors24h, feedbackOpen] = await Promise.all([
    count(supabase.from('identidade_pendencias').select('id', { count: 'exact', head: true }).eq('status', 'pendente')),
    count(supabase.from('app_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', since24h)),
    count(supabase.from('app_erros_servidor').select('id', { count: 'exact', head: true }).gte('created_at', since24h)),
    count(supabase.from('app_feedback').select('id', { count: 'exact', head: true }).in('status', ['novo', 'triado', 'em_andamento'])),
  ]);
  return { pendingIdentity, auditEvents24h, serverErrors24h, feedbackOpen };
}

async function listControls() {
  const { data, error } = await supabase.from('system_governance_controls').select('*').order('domain').order('control_key');
  if (error) throw error;
  return data || [];
}

async function getGovernanceCommandCenter() {
  const [wifi, facial, integrity, controls] = await Promise.all([
    safeSource('wifi', getWifiGovernance, null),
    safeSource('facial', getFacialGovernance, null),
    safeSource('integrity', getDataIntegrity, null),
    safeSource('controls', listControls, []),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    wifi,
    facial,
    integrity,
    controls,
    boundaries: {
      forbidden: ['cpf', 'phone', 'email', 'ip', 'mac', 'face_image', 'face_embedding', 'request_body', 'secret'],
      consoleStores: ['aggregates', 'control_status', 'evidence_link', 'audit_metadata'],
    },
  };
}

function normalizeEvidenceUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString().slice(0, 1000) : null;
  } catch { return null; }
}

async function updateGovernanceControl(controlKey, payload, actor) {
  const key = sanitizeText(controlKey, 120);
  const status = CONTROL_STATUSES.has(payload?.status) ? payload.status : null;
  const reason = sanitizeText(payload?.reason, 1000);
  const owner = sanitizeText(payload?.owner, 250);
  const evidenceUrl = normalizeEvidenceUrl(payload?.evidence_url);
  if (!key || !status || !reason || reason.length < 10) {
    const error = new Error('Status e motivo com pelo menos 10 caracteres são obrigatórios.');
    error.code = 'INVALID_CONTROL_UPDATE';
    throw error;
  }
  const { data: current, error: readError } = await supabase
    .from('system_governance_controls').select('*').eq('control_key', key).maybeSingle();
  if (readError) throw readError;
  if (!current) {
    const error = new Error('Controle não encontrado.');
    error.code = 'CONTROL_NOT_FOUND';
    throw error;
  }
  if (key === 'facial_dpo_approval' && status === 'implemented' && (!owner || !evidenceUrl)) {
    const error = new Error('Aprovação biométrica exige responsável e evidência HTTPS.');
    error.code = 'BIOMETRIC_EVIDENCE_REQUIRED';
    throw error;
  }
  const patch = {
    status,
    owner: owner || current.owner,
    evidence_url: evidenceUrl || current.evidence_url,
    review_due_at: payload?.review_due_at || current.review_due_at,
    updated_by_email: sanitizeText(actor?.email, 250),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('system_governance_controls')
    .update(patch).eq('control_key', key).select('*').single();
  if (error) throw error;
  const { error: eventError } = await supabase.from('system_governance_control_events').insert({
    control_key: key,
    previous_status: current.status,
    new_status: status,
    reason,
    actor_email: sanitizeText(actor?.email, 250),
    evidence_url: evidenceUrl,
  });
  if (eventError) throw eventError;
  return data;
}

module.exports = {
  CONTROL_STATUSES,
  normalizeEvidenceUrl,
  getGovernanceCommandCenter,
  updateGovernanceControl,
};
