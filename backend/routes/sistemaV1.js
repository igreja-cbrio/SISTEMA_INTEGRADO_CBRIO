const router = require('express').Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { sanitizeText } = require('../services/systemJobRuns');
const {
  getOverview,
  listRuns,
  listIncidents,
  listWebErrors,
  queryRows,
} = require('../services/systemOverview');
const { getReleaseInfo } = require('../config/systemCatalog');
const {
  getWebCommandCenter,
  runSyntheticSuite,
} = require('../services/systemWebOps');
const {
  getMobileCommandCenter,
  refreshExpoReceipts,
} = require('../services/systemMobileOps');
const {
  getGovernanceCommandCenter,
  updateGovernanceControl,
} = require('../services/systemDataGovernance');
const {
  getFinanceCommandCenter,
  createCostEntry,
  updateProvider,
  createExecutiveReport,
  publishExecutiveReport,
  getExecutiveReport,
} = require('../services/systemFinOps');

const SEVERITIES = new Set(['info', 'warning', 'error', 'critical']);
const STATUSES = new Set([
  'novo', 'reconhecido', 'investigando', 'mitigado', 'resolvido',
  'monitorado', 'duplicado', 'nao_reproduzido', 'risco_aceito',
]);
const SOURCES = new Set(['manual', 'feedback', 'server_error', 'job', 'sentry', 'security']);
const TRANSITIONS = {
  novo: new Set(['reconhecido', 'investigando', 'duplicado', 'nao_reproduzido', 'risco_aceito']),
  reconhecido: new Set(['investigando', 'mitigado', 'duplicado', 'nao_reproduzido', 'risco_aceito']),
  investigando: new Set(['mitigado', 'resolvido', 'duplicado', 'nao_reproduzido', 'risco_aceito']),
  mitigado: new Set(['investigando', 'resolvido']),
  resolvido: new Set(['monitorado', 'investigando']),
  monitorado: new Set(['resolvido', 'investigando']),
  duplicado: new Set([]),
  nao_reproduzido: new Set([]),
  risco_aceito: new Set([]),
};

router.use(authenticate);
router.use(requireSuperAdmin);

function actor(req) {
  return {
    id: req.user?.id || req.user?.userId || null,
    email: sanitizeText(req.user?.email, 250),
  };
}

async function auditSensitiveRead(req, surface) {
  const user = actor(req);
  try {
    const { error } = await supabase.from('app_audit_log').insert({
      table_name: 'system_console',
      row_id: surface,
      action: 'INSERT',
      user_id: user.id,
      user_email: user.email,
      changes: {
        tipo: 'sensitive_read',
        surface,
        request_id: req.requestId,
      },
    });
    if (error) throw error;
  } catch (error) {
    console.warn('[sistema/audit-read]', error.message);
  }
}

function parseLimit(value, fallback = 100, max = 300) {
  return Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), max);
}

router.get('/overview', async (req, res) => {
  try {
    const hours = Math.min(Math.max(Number.parseInt(req.query.hours, 10) || 24, 1), 24 * 30);
    res.json(await getOverview(hours));
  } catch (error) {
    console.error('[sistema/overview]', error.message);
    res.status(500).json({ error: 'Erro ao montar a visão geral do Sistema.' });
  }
});

router.get('/jobs/runs', async (req, res) => {
  try {
    res.json(await listRuns({
      limit: req.query.limit,
      status: req.query.status,
      jobId: req.query.job_id,
    }));
  } catch (error) {
    console.error('[sistema/jobs/runs]', error.message);
    res.status(500).json({ error: 'Erro ao listar execuções.' });
  }
});

router.get('/web/errors', async (req, res) => {
  try {
    const result = await listWebErrors(parseLimit(req.query.limit));
    await auditSensitiveRead(req, 'web-errors');
    res.json(result);
  } catch (error) {
    console.error('[sistema/web/errors]', error.message);
    res.status(500).json({ error: 'Erro ao listar falhas da API.' });
  }
});

router.get('/web/command-center', async (req, res) => {
  try {
    const hours = Math.min(Math.max(Number.parseInt(req.query.hours, 10) || 24 * 7, 1), 24 * 30);
    const result = await getWebCommandCenter(hours);
    await auditSensitiveRead(req, 'web-command-center');
    res.json(result);
  } catch (error) {
    console.error('[sistema/web/command-center]', error.message);
    res.status(500).json({ error: 'Erro ao montar a operação Web & API.' });
  }
});

router.post('/web/synthetics/run', async (req, res) => {
  try {
    const user = actor(req);
    const result = await runSyntheticSuite({
      triggeredBy: user.email || user.id || 'superadmin',
      requestId: req.requestId,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('[sistema/web/synthetics/run]', error.message);
    res.status(500).json({ error: 'Erro ao executar as jornadas sintéticas.' });
  }
});

router.get('/mobile/command-center', async (req, res) => {
  try {
    const platform = String(req.query.platform || '').toLowerCase();
    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 14, 1), 30);
    const result = await getMobileCommandCenter(platform, days);
    await auditSensitiveRead(req, `mobile-${platform}`);
    res.json(result);
  } catch (error) {
    console.error('[sistema/mobile/command-center]', error.message);
    if (error.code === 'INVALID_PLATFORM') return res.status(400).json({ error: 'Plataforma deve ser android ou ios.' });
    res.status(500).json({ error: 'Erro ao montar a operação mobile.' });
  }
});

router.post('/mobile/push/receipts/refresh', async (req, res) => {
  try {
    res.json(await refreshExpoReceipts());
  } catch (error) {
    console.error('[sistema/mobile/push/receipts]', error.message);
    res.status(502).json({ error: 'Não foi possível consultar os recibos Expo.' });
  }
});

router.get('/governance/command-center', async (req, res) => {
  try {
    const result = await getGovernanceCommandCenter();
    await auditSensitiveRead(req, 'governance-command-center');
    res.json(result);
  } catch (error) {
    console.error('[sistema/governance/command-center]', error.message);
    res.status(500).json({ error: 'Erro ao montar a governança de dados.' });
  }
});

router.patch('/governance/controls/:controlKey', async (req, res) => {
  try {
    const result = await updateGovernanceControl(req.params.controlKey, req.body || {}, actor(req));
    res.json(result);
  } catch (error) {
    console.error('[sistema/governance/control]', error.message);
    if (error.code === 'CONTROL_NOT_FOUND') return res.status(404).json({ error: error.message });
    if (['INVALID_CONTROL_UPDATE', 'BIOMETRIC_EVIDENCE_REQUIRED'].includes(error.code)) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erro ao registrar a decisão de governança.' });
  }
});

router.get('/finance/command-center', async (req, res) => {
  try {
    const result = await getFinanceCommandCenter(req.query.months);
    await auditSensitiveRead(req, 'finance-command-center');
    res.json(result);
  } catch (error) {
    console.error('[sistema/finance/command-center]', error.message);
    res.status(500).json({ error: 'Erro ao montar custos e prestação de contas.' });
  }
});

router.post('/finance/costs', async (req, res) => {
  try {
    res.status(201).json(await createCostEntry(req.body || {}, {
      ...actor(req), requestId: req.requestId,
    }));
  } catch (error) {
    console.error('[sistema/finance/costs POST]', error.message);
    if (error.code === 'INVALID_FINOPS_INPUT') return res.status(400).json({ error: error.message });
    if (error.code === '23503') return res.status(400).json({ error: 'Fornecedor não cadastrado.' });
    if (error.code === '23505') return res.status(409).json({ error: 'Este lançamento já foi importado.' });
    res.status(500).json({ error: 'Erro ao registrar custo.' });
  }
});

router.patch('/finance/providers/:providerKey', async (req, res) => {
  try {
    res.json(await updateProvider(req.params.providerKey, req.body || {}, {
      ...actor(req), requestId: req.requestId,
    }));
  } catch (error) {
    console.error('[sistema/finance/providers PATCH]', error.message);
    if (error.code === 'INVALID_FINOPS_INPUT') return res.status(400).json({ error: error.message });
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Fornecedor não encontrado.' });
    res.status(500).json({ error: 'Erro ao atualizar fornecedor.' });
  }
});

router.post('/finance/reports', async (req, res) => {
  try {
    res.status(201).json(await createExecutiveReport(req.body || {}, {
      ...actor(req), requestId: req.requestId,
    }));
  } catch (error) {
    console.error('[sistema/finance/reports POST]', error.message);
    if (error.code === 'INVALID_FINOPS_INPUT') return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Erro ao gerar relatório executivo.' });
  }
});

router.post('/finance/reports/:id/publish', async (req, res) => {
  try {
    res.json(await publishExecutiveReport(req.params.id, {
      ...actor(req), requestId: req.requestId,
    }));
  } catch (error) {
    console.error('[sistema/finance/reports/publish]', error.message);
    if (error.code === 'INVALID_FINOPS_INPUT') return res.status(400).json({ error: error.message });
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Relatório não encontrado.' });
    res.status(500).json({ error: 'Erro ao publicar relatório executivo.' });
  }
});

router.get('/finance/reports/:id/export', async (req, res) => {
  try {
    const report = await getExecutiveReport(req.params.id);
    await auditSensitiveRead(req, `finance-report-${req.params.id}`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sistema-relatorio-${req.params.id}.json"`);
    res.json(report);
  } catch (error) {
    console.error('[sistema/finance/reports/export]', error.message);
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Relatório não encontrado.' });
    res.status(500).json({ error: 'Erro ao exportar relatório executivo.' });
  }
});

router.get('/feedback', async (req, res) => {
  try {
    let query = supabase.from('app_feedback')
      .select('id,tipo,mensagem,rota,modulo,severidade,status,user_nome,created_at')
      .order('created_at', { ascending: false })
      .limit(parseLimit(req.query.limit));
    if (req.query.status) query = query.eq('status', req.query.status);
    res.json(await queryRows(query));
  } catch (error) {
    console.error('[sistema/feedback]', error.message);
    res.status(500).json({ error: 'Erro ao listar feedbacks.' });
  }
});

router.get('/incidents', async (req, res) => {
  try {
    res.json(await listIncidents({
      limit: req.query.limit,
      status: STATUSES.has(req.query.status) ? req.query.status : null,
      severity: SEVERITIES.has(req.query.severity) ? req.query.severity : null,
    }));
  } catch (error) {
    console.error('[sistema/incidents]', error.message);
    res.status(500).json({ error: 'Erro ao listar incidentes.' });
  }
});

router.get('/incidents/:id/events', async (req, res) => {
  try {
    const events = await queryRows(
      supabase.from('system_incident_events')
        .select('*')
        .eq('incident_id', req.params.id)
        .order('created_at', { ascending: true })
        .limit(500),
    );
    res.json(events);
  } catch (error) {
    console.error('[sistema/incidents/events]', error.message);
    res.status(500).json({ error: 'Erro ao carregar a timeline.' });
  }
});

router.post('/incidents', async (req, res) => {
  try {
    const body = req.body || {};
    const title = sanitizeText(body.title, 180);
    if (!title || title.length < 3) {
      return res.status(400).json({ error: 'Informe um título com pelo menos 3 caracteres.' });
    }
    const user = actor(req);
    const release = getReleaseInfo();
    const row = {
      title,
      description: sanitizeText(body.description, 4000),
      severity: SEVERITIES.has(body.severity) ? body.severity : 'warning',
      source_type: SOURCES.has(body.source_type) ? body.source_type : 'manual',
      source_ref: sanitizeText(body.source_ref, 300),
      affected_surface: sanitizeText(body.affected_surface, 120),
      impact_summary: sanitizeText(body.impact_summary, 1000),
      owner_email: sanitizeText(body.owner_email, 250),
      request_id: sanitizeText(body.request_id || req.requestId, 128),
      release: sanitizeText(body.release || release.commit, 120),
      environment: sanitizeText(body.environment || release.environment, 80) || 'unknown',
      created_by_id: user.id,
      created_by_email: user.email,
      updated_by_id: user.id,
      updated_by_email: user.email,
    };
    const { data, error } = await supabase
      .from('system_incidents')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Esta fonte já está vinculada a um incidente ativo.' });
    }
    console.error('[sistema/incidents POST]', error.message);
    res.status(500).json({ error: 'Erro ao criar incidente.' });
  }
});

router.patch('/incidents/:id', async (req, res) => {
  try {
    const { data: current, error: readError } = await supabase
      .from('system_incidents')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (readError) throw readError;

    const body = req.body || {};
    const patch = {};
    if (body.status && body.status !== current.status) {
      if (!STATUSES.has(body.status) || !TRANSITIONS[current.status]?.has(body.status)) {
        return res.status(400).json({
          error: `Transição inválida: ${current.status} → ${body.status}.`,
        });
      }
      patch.status = body.status;
      if (body.status === 'reconhecido') patch.acknowledged_at = new Date().toISOString();
      if (body.status === 'mitigado') patch.mitigated_at = new Date().toISOString();
      if (body.status === 'resolvido') patch.resolved_at = new Date().toISOString();
    }
    if (SEVERITIES.has(body.severity)) patch.severity = body.severity;
    if (Object.hasOwn(body, 'owner_email')) patch.owner_email = sanitizeText(body.owner_email, 250);
    if (Object.hasOwn(body, 'impact_summary')) patch.impact_summary = sanitizeText(body.impact_summary, 1000);
    if (Object.hasOwn(body, 'description')) patch.description = sanitizeText(body.description, 4000);
    if (Object.hasOwn(body, 'monitor_until')) patch.monitor_until = body.monitor_until || null;

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'Nenhuma alteração válida foi informada.' });
    }
    const user = actor(req);
    patch.updated_by_id = user.id;
    patch.updated_by_email = user.email;
    patch.request_id = req.requestId;

    const { data, error } = await supabase
      .from('system_incidents')
      .update(patch)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('[sistema/incidents PATCH]', error.message);
    res.status(500).json({ error: 'Erro ao atualizar incidente.' });
  }
});

router.post('/incidents/:id/notes', async (req, res) => {
  try {
    const message = sanitizeText(req.body?.message, 4000);
    if (!message || message.length < 2) {
      return res.status(400).json({ error: 'Escreva uma nota antes de registrar.' });
    }
    const user = actor(req);
    const { data, error } = await supabase
      .from('system_incident_events')
      .insert({
        incident_id: req.params.id,
        event_type: 'note',
        message,
        actor_id: user.id,
        actor_email: user.email,
        request_id: req.requestId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('[sistema/incidents/notes]', error.message);
    res.status(500).json({ error: 'Erro ao registrar nota.' });
  }
});

module.exports = { router, TRANSITIONS, SEVERITIES, STATUSES, SOURCES };
