const { JOBS } = require('../config/systemCatalog');
const { recordJobRun } = require('../services/systemJobRuns');
const { resolveHttpOutcome } = require('../services/systemJobOutcome');
const { evaluateJobAlert } = require('../services/systemJobAlerts');

const jobsByPath = new Map(
  JOBS.map((job) => [job.path.split('?')[0], job]),
);
let warnedUnavailable = false;
let warnedAlertsUnavailable = false;

function systemJobTracking(req, res, next) {
  const job = jobsByPath.get(req.path);
  if (!job) return next();

  const startedAt = new Date();
  const startedNs = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedNs) / 1e6;
    const explicit = resolveHttpOutcome(res.statusCode, res.locals.systemJobOutcome || {});

    const run = {
      jobId: job.id,
      provider: 'vercel',
      schedule: job.schedule,
      triggerType: req.headers['x-vercel-cron'] ? 'scheduled' : 'unknown',
      status: explicit.status,
      effectStatus: explicit.effectStatus,
      startedAt,
      finishedAt: new Date(),
      durationMs: Math.round(durationMs),
      inputCount: explicit.inputCount,
      outputCount: explicit.outputCount,
      discardedCount: explicit.discardedCount,
      errorCode: explicit.errorCode,
      errorMessage: explicit.errorMessage,
      requestId: req.requestId,
      ownerLabel: job.alertPolicy?.ownerLabel,
      runbookUrl: job.alertPolicy?.runbookUrl,
      metadata: {
        method: req.method,
        route: job.path.split('?')[0],
        http_status: res.statusCode,
        source: 'http_middleware',
        result: explicit.result,
      },
    };

    recordJobRun(run)
      .then(() => evaluateJobAlert(run).catch((error) => {
        if (!warnedAlertsUnavailable) {
          warnedAlertsUnavailable = true;
          console.warn('[system-job-alerts] avaliacao indisponivel:', error.message);
        }
      }))
      .catch((error) => {
      // Deploy do código pode anteceder a migration. Nunca derruba o cron.
      if (!warnedUnavailable) {
        warnedUnavailable = true;
        console.warn('[system-job-runs] registro indisponível:', error.message);
      }
    });
  });

  next();
}

module.exports = { systemJobTracking, jobsByPath };
