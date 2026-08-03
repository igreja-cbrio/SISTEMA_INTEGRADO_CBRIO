const { normalizeError, ERROR_CODES } = require('../utils/appError');
const { recordServerError } = require('../services/serverErrorTelemetry');

function redactErrorText(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/(token|secret|password|senha|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function serializeErrorStack(error, maxDepth = 4) {
  const parts = [];
  const visited = new Set();
  let current = error;
  while (current != null && parts.length < maxDepth && !visited.has(current)) {
    if (typeof current === 'object' || typeof current === 'function') visited.add(current);
    const rendered = current instanceof Error
      ? (current.stack || `${current.name}: ${current.message}`)
      : String(current);
    parts.push(parts.length === 0 ? rendered : `Caused by: ${rendered}`);
    current = current?.cause;
  }
  return redactErrorText(parts.join('\n')).slice(0, 4000);
}

function normalizeRoutePath(path) {
  return String(path || '')
    .split(/[?#]/, 1)[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[^/]*(?:@|%40)[^/]*(?=\/|$)/gi, '/:value')
    .replace(/\/[A-Za-z0-9_-]{32,}(?=\/|$)/g, '/:token')
    .slice(0, 300);
}

function requestRoute(req) {
  const routePath = typeof req?.route?.path === 'string' ? req.route.path : '';
  if (routePath && req?.baseUrl) return normalizeRoutePath(`${req.baseUrl}${routePath}`);
  return normalizeRoutePath(req?.originalUrl || req?.path || '');
}

function responsePayload(error, requestId) {
  return {
    error: error.publicMessage || 'Erro interno do servidor.',
    code: error.code || ERROR_CODES.UNEXPECTED_ERROR,
    request_id: requestId,
  };
}

function createErrorHandler({ recordError = recordServerError, logger = console } = {}) {
  return (rawError, req, res, next) => {
    if (res.headersSent) return next(rawError);
    const error = normalizeError(rawError);
    const status = error.status || 500;
    const requestId = req.requestId || res.locals?.requestId;

    if (status >= 500) {
      res.locals._erro500Registrado = true;
      const safeMessage = redactErrorText(error.message).slice(0, 900);
      const row = {
        user_id: req.user?.id || null,
        user_email: req.user?.email || null,
        metodo: req.method,
        rota: requestRoute(req),
        mensagem: `[${error.code || ERROR_CODES.UNEXPECTED_ERROR}] ${safeMessage}`.slice(0, 1000),
        stack: serializeErrorStack(error),
        status,
        request_id: requestId,
        release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_RELEASE || null,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      };
      logger.error(`[ERROR] [${requestId || 'sem-request-id'}] [${error.code}]`, safeMessage);
      try {
        const pending = recordError(row);
        pending?.catch?.((persistenceError) => logger.warn('[app_erros_servidor]', persistenceError.message));
      } catch (persistenceError) {
        logger.warn('[app_erros_servidor]', persistenceError.message);
      }
    } else if (!error.isOperational) {
      logger.warn(`[HTTP ${status}] [${requestId || 'sem-request-id'}] [${error.code}]`, redactErrorText(error.message));
    }

    return res.status(status).json(responsePayload(error, requestId));
  };
}

module.exports = {
  createErrorHandler,
  normalizeRoutePath,
  redactErrorText,
  requestRoute,
  responsePayload,
  serializeErrorStack,
};
