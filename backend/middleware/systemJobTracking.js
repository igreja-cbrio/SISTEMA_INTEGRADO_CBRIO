const { JOBS } = require('../config/systemCatalog');
const { recordJobRun } = require('../services/systemJobRuns');

const jobsByPath = new Map(
  JOBS.map((job) => [job.path.split('?')[0], job]),
);
let warnedUnavailable = false;

function systemJobTracking(req, res, next) {
  const job = jobsByPath.get(req.path);
  if (!job) return next();

  const startedAt = new Date();
  const startedNs = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedNs) / 1e6;
    const explicit = res.locals.systemJobOutcome || {};
    const failed = res.statusCode >= 400;

    recordJobRun({
      jobId: job.id,
      provider: 'vercel',
      schedule: job.schedule,
      triggerType: req.headers['x-vercel-cron'] ? 'scheduled' : 'unknown',
      status: explicit.status || (failed ? 'failed' : 'warning'),
      effectStatus: explicit.effectStatus || (failed ? 'failed' : 'unknown'),
      startedAt,
      finishedAt: new Date(),
      durationMs: Math.round(durationMs),
      inputCount: explicit.inputCount,
      outputCount: explicit.outputCount,
      discardedCount: explicit.discardedCount,
      errorCode: explicit.errorCode || (failed ? `HTTP_${res.statusCode}` : null),
      errorMessage: explicit.errorMessage,
      requestId: req.requestId,
      metadata: {
        method: req.method,
        route: job.path.split('?')[0],
        http_status: res.statusCode,
        source: 'http_middleware',
      },
    }).catch((error) => {
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
