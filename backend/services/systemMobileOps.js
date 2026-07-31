const { supabase } = require('../utils/supabase');

const PLATFORMS = new Set(['android', 'ios']);
const ALLOWED_PROPS = new Set([
  'message', 'fatal', 'screen', 'route', 'action', 'reason', 'status_code',
  'endpoint', 'permission', 'notification_type', 'source',
]);

function cleanText(value, max = 120) {
  if (value === undefined || value === null) return null;
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) || null;
}

function normalizePlatform(value) {
  const platform = cleanText(value, 20)?.toLowerCase();
  return PLATFORMS.has(platform) ? platform : null;
}

function safeTimestamp(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  const now = Date.now();
  if (parsed.getTime() > now + 5 * 60 * 1000 || parsed.getTime() < now - 30 * 86400000) return null;
  return parsed.toISOString();
}

function sanitizeEndpoint(value) {
  const text = cleanText(value, 300);
  if (!text) return null;
  try {
    const parsed = new URL(text, 'https://mobile.invalid');
    return cleanText(parsed.pathname, 180);
  } catch {
    return cleanText(text.split('?')[0].split('#')[0], 180);
  }
}

function sanitizeProps(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_PROPS.has(key)) continue;
    if (key === 'fatal') result.fatal = value === true || value === 1 || value === 'true';
    else if (key === 'status_code') {
      const status = Number.parseInt(value, 10);
      if (Number.isFinite(status) && status >= 100 && status <= 599) result.status_code = status;
    } else if (key === 'endpoint') {
      const endpoint = sanitizeEndpoint(value);
      if (endpoint) result.endpoint = endpoint;
    } else {
      const cleaned = cleanText(value, key === 'message' || key === 'reason' ? 500 : 160);
      if (cleaned) result[key] = cleaned;
    }
  }
  return Object.keys(result).length ? result : null;
}

function normalizeMobileEvent(event, userId = null) {
  const type = ['tela', 'acao', 'erro', 'ping'].includes(event?.tipo) ? event.tipo : 'acao';
  const duration = Number.parseInt(event?.duration_ms, 10);
  return {
    tipo: type,
    nome: cleanText(event?.nome, 120) || 'desconhecido',
    props: sanitizeProps(event?.props),
    plataforma: normalizePlatform(event?.plataforma),
    app_version: cleanText(event?.app_version, 40),
    build_number: cleanText(event?.build_number, 40),
    session_id: cleanText(event?.session_id, 80),
    installation_id: cleanText(event?.installation_id, 80),
    os_version: cleanText(event?.os_version, 40),
    device_model: cleanText(event?.device_model, 120),
    manufacturer: cleanText(event?.manufacturer, 80),
    network_type: cleanText(event?.network_type, 30),
    duration_ms: Number.isFinite(duration) && duration >= 0 && duration <= 600000 ? duration : null,
    outcome: cleanText(event?.outcome, 30),
    is_offline: typeof event?.is_offline === 'boolean' ? event.is_offline : null,
    occurred_at: safeTimestamp(event?.occurred_at),
    event_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event?.event_id || '')
      ? event.event_id : undefined,
    user_id: userId,
  };
}

function normalizeMobileTelemetryBatch(events, userId = null) {
  return (Array.isArray(events) ? events : []).slice(0, 50).map((event) => normalizeMobileEvent(event, userId));
}

async function mobileSentry(platform) {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = platform === 'ios' ? process.env.SENTRY_PROJECT_IOS : process.env.SENTRY_PROJECT_ANDROID;
  const missing = [];
  if (!token) missing.push('SENTRY_AUTH_TOKEN');
  if (!org) missing.push('SENTRY_ORG');
  if (!project) missing.push(platform === 'ios' ? 'SENTRY_PROJECT_IOS' : 'SENTRY_PROJECT_ANDROID');
  if (missing.length) return { state: 'external_pending', missing, issues: [] };

  const url = new URL(`https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/issues/`);
  url.searchParams.set('project', project);
  url.searchParams.set('query', 'is:unresolved');
  url.searchParams.set('sort', 'freq');
  url.searchParams.set('statsPeriod', '14d');
  url.searchParams.set('limit', '30');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return {
      state: 'connected',
      issues: payload.map((issue) => ({
        id: cleanText(issue.id, 120),
        shortId: cleanText(issue.shortId, 80),
        title: cleanText(issue.title, 220),
        level: cleanText(issue.level, 30),
        count: Number(issue.count) || 0,
        users: Number(issue.userCount) || 0,
        lastSeen: issue.lastSeen || null,
        permalink: /^https:\/\/[^/]*sentry\.io\//.test(issue.permalink || '') ? issue.permalink : null,
      })),
    };
  } catch (error) {
    return { state: 'partial', error: error.name === 'AbortError' ? 'timeout' : 'source_unavailable', issues: [] };
  } finally {
    clearTimeout(timer);
  }
}

function storeAdapter(platform) {
  const required = platform === 'ios'
    ? ['APP_STORE_CONNECT_ISSUER_ID', 'APP_STORE_CONNECT_KEY_ID', 'APP_STORE_CONNECT_PRIVATE_KEY']
    : ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'GOOGLE_PLAY_PACKAGE_NAME'];
  const missing = required.filter((key) => !process.env[key]);
  return {
    state: missing.length ? 'external_pending' : 'partial',
    provider: platform === 'ios' ? 'App Store Connect' : 'Google Play Developer Reporting',
    missing,
    note: missing.length
      ? 'Credenciais ainda não configuradas.'
      : 'Credenciais presentes; coleta automática da loja ainda não foi ativada.',
  };
}

async function getMobileCommandCenter(platform, days = 14) {
  const normalized = normalizePlatform(platform);
  if (!normalized) {
    const error = new Error('Plataforma inválida.');
    error.code = 'INVALID_PLATFORM';
    throw error;
  }
  const safeDays = Math.min(Math.max(Number.parseInt(days, 10) || 14, 1), 30);
  const [{ data, error }, sentry] = await Promise.all([
    supabase.rpc('fn_system_mobile_overview', { p_platform: normalized, p_days: safeDays }),
    mobileSentry(normalized),
  ]);
  if (error) throw error;
  return {
    ...data,
    sources: {
      telemetry: { state: data?.lastEventAt ? 'connected' : 'partial' },
      sentry,
      store: storeAdapter(normalized),
      expo: {
        state: Number(data?.push?.total || 0) > 0 ? 'connected' : 'partial',
        trackedTickets: Number(data?.push?.total || 0),
        pendingReceipts: Number(data?.push?.pending_receipts || 0),
      },
    },
  };
}

async function refreshExpoReceipts(limit = 500) {
  const { data: pending, error } = await supabase
    .from('system_mobile_push_tickets')
    .select('id,provider_ticket_id')
    .not('provider_ticket_id', 'is', null)
    .is('receipt_checked_at', null)
    .lte('sent_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('sent_at', { ascending: true })
    .limit(Math.min(Math.max(Number(limit) || 500, 1), 1000));
  if (error) throw error;
  if (!pending?.length) return { checked: 0, delivered: 0, errors: 0, pending: 0 };

  const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ids: pending.map((item) => item.provider_ticket_id) }),
  });
  if (!response.ok) throw new Error(`Expo receipts respondeu HTTP ${response.status}`);
  const payload = await response.json();
  const receipts = payload?.data || {};
  let delivered = 0;
  let errors = 0;
  let checked = 0;
  for (const item of pending) {
    const receipt = receipts[item.provider_ticket_id];
    if (!receipt) continue;
    const isOk = receipt.status === 'ok';
    const patch = {
      receipt_status: isOk ? 'delivered_to_provider' : 'error',
      receipt_error_code: cleanText(receipt.details?.error, 120),
      receipt_error_message: cleanText(receipt.message, 500),
      receipt_checked_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase.from('system_mobile_push_tickets').update(patch).eq('id', item.id);
    if (updateError) throw updateError;
    checked += 1;
    if (isOk) delivered += 1;
    else errors += 1;
  }
  return { checked, delivered, errors, pending: pending.length - checked };
}

module.exports = {
  ALLOWED_PROPS,
  normalizePlatform,
  sanitizeProps,
  normalizeMobileEvent,
  normalizeMobileTelemetryBatch,
  getMobileCommandCenter,
  refreshExpoReceipts,
};
