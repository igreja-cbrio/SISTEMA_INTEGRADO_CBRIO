const { supabase } = require('../utils/supabase');
const { getReleaseInfo } = require('../config/systemCatalog');
const { sanitizeText } = require('./systemJobRuns');

const WEB_VITAL_METRICS = new Set(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']);
const WEB_VITAL_RATINGS = new Set(['good', 'needs-improvement', 'poor']);
const DEVICE_CLASSES = new Set(['mobile', 'tablet', 'desktop', 'unknown']);
const THRESHOLDS = {
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  INP: [200, 500],
  LCP: [2500, 4000],
  TTFB: [800, 1800],
};

const SYNTHETIC_JOURNEYS = [
  { id: 'public-home', name: 'Site público', path: '/', assertion: 'HTTP 2xx e HTML' },
  { id: 'api-health', name: 'API principal', path: '/api/health', assertion: 'HTTP 2xx e JSON válido' },
  { id: 'privacy-page', name: 'Página de privacidade', path: '/privacidade', assertion: 'HTTP 2xx e HTML' },
];

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function ratingFor(metric, value) {
  const [good, poor] = THRESHOLDS[metric] || [Infinity, Infinity];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

function normalizedRoute(value) {
  const raw = String(value || '/').split(/[?#]/, 1)[0] || '/';
  const clean = raw
    .replace(/[<>"'`\\\r\n]/g, '')
    .replace(/\/\d{4,}(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .slice(0, 300);
  return clean.startsWith('/') ? clean : `/${clean}`;
}

function normalizeVital(input = {}) {
  const metric = String(input.metric || '').toUpperCase();
  const value = Number(input.value);
  if (!WEB_VITAL_METRICS.has(metric) || !Number.isFinite(value) || value < 0 || value >= 1000000000) {
    return null;
  }
  const rating = WEB_VITAL_RATINGS.has(input.rating)
    ? input.rating
    : ratingFor(metric, value);
  const release = getReleaseInfo();
  return {
    metric,
    value: metric === 'CLS' ? Number(value.toFixed(4)) : Math.round(value),
    rating,
    route: normalizedRoute(input.route),
    navigation_type: sanitizeText(input.navigation_type, 80),
    device_class: DEVICE_CLASSES.has(input.device_class) ? input.device_class : 'unknown',
    release: sanitizeText(input.release || release.commit, 120),
    environment: sanitizeText(release.environment, 80) || 'unknown',
    request_id: sanitizeText(input.request_id, 128),
  };
}

async function recordWebVital(input) {
  const row = normalizeVital(input);
  if (!row) {
    const error = new Error('Métrica Web Vital inválida.');
    error.code = 'INVALID_WEB_VITAL';
    throw error;
  }
  const { error } = await supabase.from('system_web_vitals').insert(row);
  if (error) throw error;
  return row;
}

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getPerformance(hours = 24 * 7) {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const data = await rows(
    supabase.from('system_web_vitals')
      .select('metric,value,rating,route,device_class,release,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10000),
  );

  const metrics = {};
  for (const metric of WEB_VITAL_METRICS) {
    const sample = data.filter((row) => row.metric === metric);
    const p75 = percentile(sample.map((row) => Number(row.value)), 0.75);
    metrics[metric] = {
      samples: sample.length,
      p75,
      rating: p75 == null ? 'unknown' : ratingFor(metric, p75),
      good: sample.filter((row) => row.rating === 'good').length,
      needsImprovement: sample.filter((row) => row.rating === 'needs-improvement').length,
      poor: sample.filter((row) => row.rating === 'poor').length,
    };
  }

  const routeMap = new Map();
  for (const row of data) {
    const current = routeMap.get(row.route) || { route: row.route, samples: 0, poor: 0 };
    current.samples += 1;
    if (row.rating === 'poor') current.poor += 1;
    routeMap.set(row.route, current);
  }

  return {
    available: true,
    hours,
    totalSamples: data.length,
    metrics,
    routes: [...routeMap.values()]
      .sort((a, b) => b.poor - a.poor || b.samples - a.samples)
      .slice(0, 12),
    generatedAt: new Date().toISOString(),
  };
}

async function getReleaseComparison(hours = 24 * 30) {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const [vitals, errors] = await Promise.all([
    rows(
      supabase.from('system_web_vitals')
        .select('release,metric,value,rating,created_at')
        .gte('created_at', since)
        .not('release', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10000),
    ),
    rows(
      supabase.from('app_erros_servidor')
        .select('release,created_at')
        .gte('created_at', since)
        .not('release', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000),
    ),
  ]);

  const releases = new Map();
  for (const row of vitals) {
    const key = row.release;
    const current = releases.get(key) || {
      release: key, firstSeen: row.created_at, lastSeen: row.created_at,
      vitalSamples: 0, poorVitals: 0, errors: 0, lcp: [], inp: [], cls: [],
    };
    current.vitalSamples += 1;
    if (row.rating === 'poor') current.poorVitals += 1;
    current.lastSeen = current.lastSeen > row.created_at ? current.lastSeen : row.created_at;
    current.firstSeen = current.firstSeen < row.created_at ? current.firstSeen : row.created_at;
    const bucket = row.metric?.toLowerCase();
    if (current[bucket]) current[bucket].push(Number(row.value));
    releases.set(key, current);
  }
  for (const row of errors) {
    const key = row.release;
    const current = releases.get(key) || {
      release: key, firstSeen: row.created_at, lastSeen: row.created_at,
      vitalSamples: 0, poorVitals: 0, errors: 0, lcp: [], inp: [], cls: [],
    };
    current.errors += 1;
    current.lastSeen = current.lastSeen > row.created_at ? current.lastSeen : row.created_at;
    current.firstSeen = current.firstSeen < row.created_at ? current.firstSeen : row.created_at;
    releases.set(key, current);
  }

  return [...releases.values()]
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, 12)
    .map((item) => ({
      release: item.release,
      shortRelease: item.release.slice(0, 8),
      firstSeen: item.firstSeen,
      lastSeen: item.lastSeen,
      vitalSamples: item.vitalSamples,
      poorVitals: item.poorVitals,
      errors: item.errors,
      lcpP75: percentile(item.lcp, 0.75),
      inpP75: percentile(item.inp, 0.75),
      clsP75: percentile(item.cls, 0.75),
    }));
}

function publicOrigin() {
  const configured = process.env.SYSTEM_PUBLIC_ORIGIN || process.env.FRONTEND_URL || 'https://cbrio.org';
  const parsed = new URL(configured);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('SYSTEM_PUBLIC_ORIGIN inválida.');
  return parsed.origin;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getSecurityPosture() {
  const checks = [
    {
      id: 'sentry-backend',
      label: 'Sentry no backend',
      status: process.env.SENTRY_DSN ? 'configured' : 'unknown',
      detail: process.env.SENTRY_DSN ? 'DSN configurado; segredo não é exposto.' : 'SENTRY_DSN não configurado neste runtime.',
    },
    {
      id: 'release',
      label: 'Release correlacionada',
      status: getReleaseInfo().commit ? 'configured' : 'unknown',
      detail: getReleaseInfo().commit ? 'Commit presente no runtime.' : 'Commit ausente no runtime.',
    },
    {
      id: 'cors',
      label: 'CORS por allowlist',
      status: 'configured',
      detail: 'Origens CBRio e ambientes conhecidos são validados pelo backend.',
    },
  ];

  let observed = { available: false, origin: null, checkedAt: new Date().toISOString(), headers: [] };
  try {
    const origin = publicOrigin();
    const response = await fetchWithTimeout(`${origin}/api/health`, { redirect: 'follow' });
    const expected = [
      ['strict-transport-security', 'HSTS'],
      ['x-content-type-options', 'Bloqueio de MIME sniffing'],
      ['x-frame-options', 'Proteção contra frame'],
      ['content-security-policy', 'Content Security Policy'],
    ];
    observed = {
      available: true,
      origin,
      httpStatus: response.status,
      checkedAt: new Date().toISOString(),
      headers: expected.map(([header, label]) => ({
        id: header,
        label,
        status: response.headers.get(header) ? 'observed' : 'missing',
      })),
    };
  } catch (error) {
    observed.error = error.name === 'AbortError' ? 'timeout' : 'source_unavailable';
  }
  return { checks, observed };
}

function sentryConfig() {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const projects = [
    ['frontend', process.env.SENTRY_PROJECT_FRONTEND || process.env.SENTRY_PROJECT],
    ['backend', process.env.SENTRY_PROJECT_BACKEND],
  ].filter(([, project]) => project);
  return { token, org, projects };
}

async function getSentryIssues() {
  const { token, org, projects } = sentryConfig();
  const missing = [];
  if (!token) missing.push('SENTRY_AUTH_TOKEN');
  if (!org) missing.push('SENTRY_ORG');
  if (!projects.length) missing.push('SENTRY_PROJECT_FRONTEND/SENTRY_PROJECT_BACKEND');
  if (missing.length) return { available: false, missing, issues: [] };

  const result = [];
  const url = new URL(`https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/issues/`);
  url.searchParams.set('query', 'is:unresolved');
  url.searchParams.set('sort', 'freq');
  url.searchParams.set('statsPeriod', '24h');
  url.searchParams.set('limit', '30');
  for (const [, project] of projects) url.searchParams.append('project', project);
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Sentry respondeu HTTP ${response.status}`);
  const payload = await response.json();
  for (const issue of payload) {
    const projectSlug = issue.project?.slug || issue.project?.name || '';
    const surface = projects.find(([, project]) => project === projectSlug)?.[0] || 'web-api';
    result.push({
      id: sanitizeText(issue.id, 120),
      shortId: sanitizeText(issue.shortId, 80),
      surface,
      title: sanitizeText(issue.title, 220),
      culprit: sanitizeText(issue.culprit, 220),
      level: sanitizeText(issue.level, 30),
      count: Number(issue.count) || 0,
      userCount: Number(issue.userCount) || 0,
      firstSeen: issue.firstSeen || null,
      lastSeen: issue.lastSeen || null,
      permalink: /^https:\/\/[^/]*sentry\.io\//.test(issue.permalink || '') ? issue.permalink : null,
    });
  }
  return {
    available: true,
    issues: result.sort((a, b) => b.count - a.count).slice(0, 30),
    fetchedAt: new Date().toISOString(),
  };
}

async function listSyntheticRuns(limit = 60) {
  return rows(
    supabase.from('system_synthetic_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 60, 1), 300)),
  );
}

async function runSyntheticSuite({ triggeredBy, requestId } = {}) {
  const origin = publicOrigin();
  const release = getReleaseInfo();
  const results = [];

  for (const journey of SYNTHETIC_JOURNEYS) {
    const started = Date.now();
    let status = 'failed';
    let httpStatus = null;
    let errorMessage = null;
    try {
      const response = await fetchWithTimeout(`${origin}${journey.path}`, {
        headers: { 'User-Agent': 'CBRio-System-Synthetic/1.0', Accept: '*/*' },
        redirect: 'follow',
      });
      httpStatus = response.status;
      const contentType = response.headers.get('content-type') || '';
      let assertionPassed = response.ok;
      if (journey.id === 'api-health') {
        assertionPassed = assertionPassed && contentType.includes('application/json');
        if (assertionPassed) await response.json();
      } else {
        assertionPassed = assertionPassed && contentType.includes('text/html');
      }
      status = assertionPassed ? 'passed' : 'failed';
      if (!assertionPassed) errorMessage = `A asserção falhou (HTTP ${response.status}, ${contentType || 'sem content-type'}).`;
    } catch (error) {
      errorMessage = error.name === 'AbortError' ? 'Timeout após 8 segundos.' : sanitizeText(error.message, 500);
    }
    const row = {
      journey_id: journey.id,
      journey_name: journey.name,
      target_path: journey.path,
      status,
      http_status: httpStatus,
      duration_ms: Date.now() - started,
      assertion_label: journey.assertion,
      error_message: sanitizeText(errorMessage, 1000),
      release: release.commit,
      environment: release.environment,
      request_id: sanitizeText(requestId, 128),
      triggered_by: sanitizeText(triggeredBy, 250),
    };
    const { data, error } = await supabase
      .from('system_synthetic_runs')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    results.push(data);
  }
  return results;
}

async function safeSource(name, fn, fallback) {
  try {
    return { available: true, data: await fn() };
  } catch (error) {
    console.warn(`[sistema/web/${name}]`, error.message);
    return { available: false, error: 'source_unavailable', data: fallback };
  }
}

async function getWebCommandCenter(hours = 24 * 7) {
  const [performance, releases, security, sentry, synthetics] = await Promise.all([
    safeSource('performance', () => getPerformance(hours), null),
    safeSource('releases', () => getReleaseComparison(Math.max(hours, 24 * 30)), []),
    safeSource('security', getSecurityPosture, null),
    safeSource('sentry', getSentryIssues, { available: false, issues: [] }),
    safeSource('synthetics', () => listSyntheticRuns(60), []),
  ]);
  return {
    hours,
    generatedAt: new Date().toISOString(),
    performance,
    releases,
    security,
    sentry,
    synthetics,
  };
}

module.exports = {
  WEB_VITAL_METRICS,
  THRESHOLDS,
  SYNTHETIC_JOURNEYS,
  percentile,
  ratingFor,
  normalizedRoute,
  normalizeVital,
  recordWebVital,
  getPerformance,
  getReleaseComparison,
  getSecurityPosture,
  getSentryIssues,
  listSyntheticRuns,
  runSyntheticSuite,
  getWebCommandCenter,
};
