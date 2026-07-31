const { randomUUID } = require('crypto');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function normalizeRequestId(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return REQUEST_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function requestContext(req, res, next) {
  const requestId = normalizeRequestId(req.headers['x-request-id']) || randomUUID();

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

module.exports = {
  normalizeRequestId,
  requestContext,
};
