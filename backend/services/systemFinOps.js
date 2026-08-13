const crypto = require('node:crypto');
const { supabase } = require('../utils/supabase');
const { getReleaseInfo } = require('../config/systemCatalog');
const { getOverview, queryRows } = require('./systemOverview');
const { sanitizeText } = require('./systemJobRuns');

const COST_TYPES = new Set(['subscription', 'usage', 'one_off', 'tax', 'adjustment', 'credit']);
const COST_STATUSES = new Set(['estimated', 'accrued', 'actual']);
const COST_SOURCES = new Set(['manual', 'invoice', 'api', 'legacy_estimate']);
const CURRENCIES = new Set(['BRL', 'USD']);

function monthKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return `${match[1]}-${match[2]}`;
}

function normalizeHttpsUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function finiteNonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeCostInput(body = {}, user = {}) {
  const competence = monthKey(body.competence);
  const amount = finiteNonNegative(body.amount);
  const fxRate = finiteNonNegative(body.fx_rate_to_brl ?? 1);
  const providerKey = sanitizeText(body.provider_key, 80)?.toLowerCase();
  const currency = String(body.currency || 'BRL').toUpperCase();
  const costType = String(body.cost_type || 'subscription');
  const direction = costType === 'credit' ? 'credit' : String(body.direction || 'debit');
  const status = String(body.status || 'estimated');
  const sourceType = String(body.source_type || 'manual');
  const evidenceUrl = body.evidence_url ? normalizeHttpsUrl(body.evidence_url) : null;

  if (!providerKey || !/^[a-z0-9_]+$/.test(providerKey)) throw invalid('Fornecedor inválido.');
  if (!competence) throw invalid('Competência inválida. Use AAAA-MM.');
  if (!COST_TYPES.has(costType)) throw invalid('Tipo de custo inválido.');
  if (!['debit', 'credit'].includes(direction) || (costType === 'credit' && direction !== 'credit')) {
    throw invalid('Direção do lançamento inválida.');
  }
  if (amount === null) throw invalid('Valor deve ser um número maior ou igual a zero.');
  if (!CURRENCIES.has(currency)) throw invalid('Moeda deve ser BRL ou USD.');
  if (fxRate === null || fxRate <= 0) throw invalid('Cotação para BRL deve ser maior que zero.');
  if (!COST_STATUSES.has(status)) throw invalid('Natureza do valor inválida.');
  if (!COST_SOURCES.has(sourceType)) throw invalid('Fonte do valor inválida.');
  if (body.evidence_url && !evidenceUrl) throw invalid('A evidência deve usar uma URL HTTPS.');

  return {
    provider_key: providerKey,
    competence: `${competence}-01`,
    cost_type: costType,
    direction,
    amount,
    currency,
    fx_rate_to_brl: fxRate,
    status,
    source_type: sourceType,
    evidence_url: evidenceUrl,
    external_ref: sanitizeText(body.external_ref, 240),
    idempotency_key: sanitizeText(body.idempotency_key, 180),
    notes: sanitizeText(body.notes, 2000),
    metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : {},
    created_by_email: sanitizeText(user.email, 250),
    updated_by_email: sanitizeText(user.email, 250),
  };
}

function invalid(message) {
  const error = new Error(message);
  error.code = 'INVALID_FINOPS_INPUT';
  return error;
}

function summarizeCostEntries(entries = [], providers = []) {
  const totals = { estimated: 0, accrued: 0, actual: 0 };
  const monthlyMap = new Map();
  const providerMap = new Map();

  for (const entry of entries) {
    const status = COST_STATUSES.has(entry.status) ? entry.status : 'estimated';
    const amount = Number(entry.amount_brl) || 0;
    totals[status] += amount;
    const month = monthKey(entry.competence) || 'sem_competencia';
    if (!monthlyMap.has(month)) monthlyMap.set(month, { month, estimated: 0, accrued: 0, actual: 0 });
    monthlyMap.get(month)[status] += amount;
    if (!providerMap.has(entry.provider_key)) {
      providerMap.set(entry.provider_key, { providerKey: entry.provider_key, estimated: 0, accrued: 0, actual: 0 });
    }
    providerMap.get(entry.provider_key)[status] += amount;
  }

  const providerNames = new Map(providers.map((provider) => [provider.provider_key, provider.name]));
  const monthly = [...monthlyMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(roundValues);
  const byProvider = [...providerMap.values()]
    .map((row) => ({ ...roundValues(row), name: providerNames.get(row.providerKey) || row.providerKey }))
    .sort((a, b) => (b.actual + b.accrued + b.estimated) - (a.actual + a.accrued + a.estimated));
  const monthlyBudget = providers.reduce((sum, provider) => sum + (Number(provider.budget_monthly_brl) || 0), 0);

  return {
    totals: roundValues(totals),
    monthly,
    byProvider,
    monthlyBudget: Math.round(monthlyBudget * 100) / 100,
    entriesCount: entries.length,
  };
}

function roundValues(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => (
    typeof value === 'number' ? [key, Math.round(value * 100) / 100] : [key, value]
  )));
}

function monthsWindow(months) {
  const safeMonths = Math.min(Math.max(Number.parseInt(months, 10) || 12, 1), 36);
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - safeMonths + 1);
  return { months: safeMonths, start: start.toISOString().slice(0, 10) };
}

async function getFinanceCommandCenter(months = 12) {
  const window = monthsWindow(months);
  const [providers, entries, reports, events] = await Promise.all([
    queryRows(supabase.from('system_cost_providers').select('*').order('name')),
    queryRows(supabase.from('system_cost_entries').select('*')
      .gte('competence', window.start).order('competence', { ascending: false }).limit(1000)),
    queryRows(supabase.from('system_executive_reports').select('*')
      .order('created_at', { ascending: false }).limit(24)),
    queryRows(supabase.from('system_cost_events').select('*')
      .order('created_at', { ascending: false }).limit(40)),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    window,
    providers,
    entries,
    reports,
    events,
    summary: summarizeCostEntries(entries, providers),
  };
}

async function appendEvent(event) {
  const { error } = await supabase.from('system_cost_events').insert(event);
  if (error) console.warn('[sistema/finops-event]', error.message);
}

async function createCostEntry(body, user) {
  const row = normalizeCostInput(body, user);
  const { data, error } = await supabase.from('system_cost_entries').insert(row).select('*').single();
  if (error) throw error;
  await appendEvent({
    entity_type: 'cost_entry', entity_id: data.id, action: 'created',
    actor_email: user.email, after_data: data, metadata: { request_id: user.requestId || null },
  });
  return data;
}

async function updateProvider(providerKey, body, user) {
  const patch = {};
  if (Object.hasOwn(body, 'budget_monthly_brl')) {
    const budget = body.budget_monthly_brl === '' || body.budget_monthly_brl == null
      ? null : finiteNonNegative(body.budget_monthly_brl);
    if (budget === null && body.budget_monthly_brl !== '' && body.budget_monthly_brl != null) {
      throw invalid('Orçamento mensal inválido.');
    }
    patch.budget_monthly_brl = budget;
  }
  if (Object.hasOwn(body, 'owner_email')) {
    patch.owner_email = sanitizeText(body.owner_email, 250)?.trim() || null;
  }
  if (Object.hasOwn(body, 'notes')) patch.notes = sanitizeText(body.notes, 2000);
  if (Object.hasOwn(body, 'active')) patch.active = body.active === true;
  if (!Object.keys(patch).length) throw invalid('Nenhuma alteração válida foi informada.');
  patch.updated_by_email = sanitizeText(user.email, 250);

  const { data: before, error: readError } = await supabase.from('system_cost_providers')
    .select('*').eq('provider_key', providerKey).single();
  if (readError) throw readError;
  const { data, error } = await supabase.from('system_cost_providers')
    .update(patch).eq('provider_key', providerKey).select('*').single();
  if (error) throw error;
  await appendEvent({
    entity_type: 'provider', entity_id: providerKey, action: data.active ? 'updated' : 'deactivated',
    actor_email: user.email, before_data: before, after_data: data,
    metadata: { request_id: user.requestId || null },
  });
  return data;
}

async function createExecutiveReport(body, user) {
  const periodStart = String(body.period_start || '');
  const periodEnd = String(body.period_end || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart) {
    throw invalid('Período do relatório inválido.');
  }
  const [finance, operations] = await Promise.all([
    getFinanceCommandCenter(12),
    getOverview(24 * 30),
  ]);
  const periodEntries = finance.entries.filter((entry) => (
    String(entry.competence).slice(0, 10) >= periodStart
    && String(entry.competence).slice(0, 10) <= periodEnd
  ));
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    period: { start: periodStart, end: periodEnd },
    release: getReleaseInfo(),
    finance: {
      summary: summarizeCostEntries(periodEntries, finance.providers),
      providers: finance.providers,
      entries: periodEntries,
    },
    operations,
  };
  const checksum = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const row = {
    period_start: periodStart,
    period_end: periodEnd,
    title: sanitizeText(body.title, 180) || `Prestação de contas ${periodStart} a ${periodEnd}`,
    status: 'draft',
    payload,
    checksum_sha256: checksum,
    notes: sanitizeText(body.notes, 2000),
    generated_by_email: sanitizeText(user.email, 250),
  };
  const { data, error } = await supabase.from('system_executive_reports').insert(row).select('*').single();
  if (error) throw error;
  await appendEvent({
    entity_type: 'executive_report', entity_id: data.id, action: 'created',
    actor_email: user.email, after_data: { ...data, payload: { checksum_sha256: checksum } },
    metadata: { request_id: user.requestId || null },
  });
  return data;
}

async function publishExecutiveReport(id, user) {
  const { data: before, error: readError } = await supabase.from('system_executive_reports')
    .select('*').eq('id', id).single();
  if (readError) throw readError;
  if (before.status !== 'draft') throw invalid('Somente relatórios em rascunho podem ser publicados.');
  const patch = { status: 'published', published_at: new Date().toISOString(), published_by_email: user.email };
  const { data, error } = await supabase.from('system_executive_reports')
    .update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  await appendEvent({
    entity_type: 'executive_report', entity_id: id, action: 'published', actor_email: user.email,
    before_data: { status: before.status }, after_data: { status: data.status, published_at: data.published_at },
    metadata: { request_id: user.requestId || null },
  });
  return data;
}

async function getExecutiveReport(id) {
  const { data, error } = await supabase.from('system_executive_reports').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

module.exports = {
  COST_TYPES,
  COST_STATUSES,
  COST_SOURCES,
  monthKey,
  normalizeHttpsUrl,
  normalizeCostInput,
  summarizeCostEntries,
  getFinanceCommandCenter,
  createCostEntry,
  updateProvider,
  createExecutiveReport,
  publishExecutiveReport,
  getExecutiveReport,
};
