const { supabase } = require('../utils/supabase');
const { checarSaude } = require('./monitorAutomacoes');
const { JOBS } = require('../config/systemCatalog');
const { summarizeJobSlo } = require('./systemJobSlo');

const ACTIVE_INCIDENT_STATUSES = [
  'novo', 'reconhecido', 'investigando', 'mitigado', 'monitorado',
];

async function safe(label, fn, fallback) {
  try {
    return { available: true, data: await fn() };
  } catch (error) {
    console.warn(`[sistema/${label}]`, error.message);
    return { available: false, data: fallback, error: 'source_unavailable' };
  }
}

async function queryRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function queryCount(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function getOverview(hours = 24) {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const sloWindowHours = 48;
  const sloUntilMs = Date.now();
  const runsSinceMs = sloUntilMs - sloWindowHours * 3600000;

  const [runs, incidents, errors, feedback, pipelines] = await Promise.all([
    safe('runs', async () => {
      const sliceHours = 12;
      const slices = Array.from({ length: sloWindowHours / sliceHours }, (_, index) => {
        const start = new Date(runsSinceMs + index * sliceHours * 3600000).toISOString();
        const end = new Date(Math.min(runsSinceMs + (index + 1) * sliceHours * 3600000, sloUntilMs)).toISOString();
        return queryRows(
          supabase.from('system_job_runs')
            .select('id,job_id,status,effect_status,started_at,finished_at,duration_ms,request_id')
            .gte('started_at', start)
            .lt('started_at', end)
            .order('started_at', { ascending: false })
            .limit(1000),
        );
      });
      const rows = (await Promise.all(slices))
        .flat()
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
      let visibleRows = rows.filter((row) => row.started_at >= since);
      if (hours > sloWindowHours) {
        visibleRows = await queryRows(
          supabase.from('system_job_runs')
            .select('id,job_id,status,effect_status,started_at,finished_at,duration_ms,request_id')
            .gte('started_at', since)
            .order('started_at', { ascending: false })
            .limit(2000),
        );
      }

      const byStatus = {};
      for (const row of visibleRows) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      return { total: visibleRows.length, byStatus, recent: visibleRows.slice(0, 12), slo: summarizeJobSlo(JOBS, rows, { windowHours: sloWindowHours }) };
    }, { total: 0, byStatus: {}, recent: [], slo: null }),
    safe('incidents', async () => {
      const rows = await queryRows(
        supabase.from('system_incidents')
          .select('*')
          .in('status', ACTIVE_INCIDENT_STATUSES)
          .order('created_at', { ascending: false })
          .limit(100),
      );
      return {
        active: rows.length,
        critical: rows.filter((row) => row.severity === 'critical').length,
        recent: rows.slice(0, 8),
      };
    }, { active: 0, critical: 0, recent: [] }),
    safe('errors', async () => {
      const rows = await queryRows(
        supabase.from('app_erros_servidor')
          .select('id,metodo,rota,mensagem,status,request_id,release,environment,created_at')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(300),
      );
      const byRoute = {};
      for (const row of rows) byRoute[row.rota || 'sem rota'] = (byRoute[row.rota || 'sem rota'] || 0) + 1;
      return {
        total: rows.length,
        topRoutes: Object.entries(byRoute)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([route, count]) => ({ route, count })),
        recent: rows.slice(0, 12),
      };
    }, { total: 0, topRoutes: [], recent: [] }),
    safe('feedback', async () => {
      const rows = await queryRows(
        supabase.from('app_feedback')
          .select('id,tipo,mensagem,rota,modulo,severidade,status,created_at')
          .in('status', ['novo', 'triado', 'em_andamento'])
          .order('created_at', { ascending: false })
          .limit(100),
      );
      return {
        active: rows.length,
        critical: rows.filter((row) => row.severidade === 'critica').length,
        recent: rows.slice(0, 8),
      };
    }, { active: 0, critical: 0, recent: [] }),
    safe('pipelines', () => checarSaude(), []),
  ]);

  return {
    windowHours: hours,
    generatedAt: new Date().toISOString(),
    runs,
    incidents,
    errors,
    feedback,
    pipelines,
  };
}

async function listRuns({ limit = 100, status, jobId } = {}) {
  let query = supabase.from('system_job_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 500));
  if (status) query = query.eq('status', status);
  if (jobId) query = query.eq('job_id', jobId);
  return queryRows(query);
}

async function listIncidents({ limit = 100, status, severity } = {}) {
  let query = supabase.from('system_incidents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 300));
  if (status) query = query.eq('status', status);
  if (severity) query = query.eq('severity', severity);
  return queryRows(query);
}

async function listWebErrors(limit = 100) {
  return queryRows(
    supabase.from('app_erros_servidor')
      .select('id,metodo,rota,mensagem,status,request_id,release,environment,created_at')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 100, 1), 300)),
  );
}

module.exports = {
  ACTIVE_INCIDENT_STATUSES,
  getOverview,
  listRuns,
  listIncidents,
  listWebErrors,
  queryRows,
  queryCount,
};
