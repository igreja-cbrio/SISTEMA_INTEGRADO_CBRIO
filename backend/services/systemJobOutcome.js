function isFailedStep(value) {
  return Boolean(value && typeof value === 'object' && (value.erro || value.error));
}

function outcomeFromSteps(steps, { errorCode = 'JOB_PARTIAL_FAILURE' } = {}) {
  const entries = Object.entries(steps || {});
  const failed = entries.filter(([, value]) => isFailedStep(value));
  const succeeded = entries.length - failed.length;
  const failedNames = failed.map(([name]) => name);

  if (!failed.length) {
    return {
      status: 'success',
      effectStatus: 'confirmed',
      inputCount: entries.length,
      outputCount: succeeded,
      discardedCount: 0,
      result: `${succeeded}/${entries.length} etapas concluidas`,
    };
  }

  return {
    status: succeeded > 0 ? 'warning' : 'failed',
    effectStatus: 'failed',
    inputCount: entries.length,
    outputCount: succeeded,
    discardedCount: failed.length,
    errorCode,
    errorMessage: `Etapas com falha: ${failedNames.join(', ')}`,
    result: `${succeeded}/${entries.length} etapas concluidas`,
  };
}

function resolveHttpOutcome(statusCode, explicit = {}) {
  const httpFailed = Number(statusCode) >= 400;
  if (httpFailed) {
    return {
      ...explicit,
      status: 'failed',
      effectStatus: 'failed',
      errorCode: explicit.errorCode || `HTTP_${statusCode}`,
    };
  }

  const status = explicit.status || 'warning';
  const effectStatus = explicit.effectStatus
    || (status === 'success' ? 'confirmed' : status === 'skipped' ? 'not_applicable' : status === 'failed' ? 'failed' : 'unknown');
  return { ...explicit, status, effectStatus };
}

function setSystemJobOutcome(res, outcome) {
  res.locals.systemJobOutcome = {
    ...(res.locals.systemJobOutcome || {}),
    ...(outcome || {}),
  };
  return res.locals.systemJobOutcome;
}

module.exports = { isFailedStep, outcomeFromSteps, resolveHttpOutcome, setSystemJobOutcome };
