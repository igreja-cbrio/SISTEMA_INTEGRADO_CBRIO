const TARGET_BY_CATEGORY = Object.freeze({
  platform: 0.995,
  payments: 0.99,
  finance: 0.99,
  data: 0.98,
});

function targetFor(category) {
  return TARGET_BY_CATEGORY[category] || 0.95;
}

function maxSilenceHours(schedule = '') {
  const [minute, hour, dayOfMonth, , dayOfWeek] = schedule.trim().split(/\s+/);
  const interval = minute?.match(/^\*\/(\d+)$/);
  if (interval) return Math.max(1, (Number(interval[1]) * 3) / 60);
  if (hour === '*') return 3;
  if (dayOfMonth === '*' && dayOfWeek === '*') return 36;
  return null;
}

function percent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function summarizeJobSlo(jobs, rows, { now = new Date(), windowHours = 48 } = {}) {
  const nowMs = now.getTime();
  const items = jobs.map((job) => {
    const jobRows = rows.filter((row) => row.job_id === job.id);
    const success = jobRows.filter((row) => row.status === 'success' && row.effect_status === 'confirmed').length;
    const failed = jobRows.filter((row) => row.status === 'failed' || row.effect_status === 'failed').length;
    const measured = success + failed;
    const unknown = jobRows.length - measured;
    const target = targetFor(job.category);
    const lastRunAt = jobRows[0]?.started_at || null;
    const silenceLimit = maxSilenceHours(job.schedule);
    const silenceHours = lastRunAt ? (nowMs - new Date(lastRunAt).getTime()) / 3600000 : null;
    const missing = silenceLimit != null && (silenceHours == null || silenceHours > silenceLimit);
    const successRate = measured ? success / measured : null;
    let state = 'healthy';
    if (missing) state = 'missing';
    else if (!jobRows.length || !measured) state = 'unproven';
    else if (successRate < target) state = 'breached';
    else if (unknown > 0) state = 'at_risk';

    return {
      jobId: job.id,
      name: job.name,
      path: job.path,
      category: job.category,
      schedule: job.schedule,
      ownerLabel: job.alertPolicy?.ownerLabel,
      state,
      targetPct: target * 100,
      successRatePct: percent(success, measured),
      proofCoveragePct: percent(measured, jobRows.length),
      runs: jobRows.length,
      success,
      failed,
      unknown,
      lastRunAt,
      maxSilenceHours: silenceLimit,
    };
  });

  const totalRuns = items.reduce((sum, item) => sum + item.runs, 0);
  const provenRuns = items.reduce((sum, item) => sum + item.success + item.failed, 0);
  const successfulRuns = items.reduce((sum, item) => sum + item.success, 0);
  const priority = { breached: 0, missing: 1, at_risk: 2, unproven: 3, healthy: 4 };

  return {
    windowHours,
    successRatePct: percent(successfulRuns, provenRuns),
    proofCoveragePct: percent(provenRuns, totalRuns),
    jobsTotal: items.length,
    jobsObserved: items.filter((item) => item.runs > 0).length,
    jobsHealthy: items.filter((item) => item.state === 'healthy').length,
    jobsBreached: items.filter((item) => item.state === 'breached').length,
    jobsMissing: items.filter((item) => item.state === 'missing').length,
    jobsUnproven: items.filter((item) => item.state === 'unproven' || item.state === 'at_risk').length,
    items: items.sort((a, b) => priority[a.state] - priority[b.state] || b.failed - a.failed),
  };
}

module.exports = { maxSilenceHours, summarizeJobSlo, targetFor };
