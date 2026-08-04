// Wrapper do Sentry com no-op quando SENTRY_DSN não esta configurado.
//
// Sentry v8 (@sentry/node ^8.x) instrumenta o Express automaticamente
// via integration; so precisamos chamar setupExpressErrorHandler(app)
// depois das rotas e antes do nosso error handler.
//
// Variaveis de ambiente:
//   SENTRY_DSN         (obrigatória pra ativar)
//   SENTRY_ENV         (opcional, default = NODE_ENV ou 'development')
//   SENTRY_TRACES_RATE (opcional, default 0.1 em prod, 0 em dev)

const { normalizeError } = require('./appError');
let Sentry = null;
let initialized = false;

function redact(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/(token|secret|password|senha|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function sanitizeRoute(value) {
  return String(value || '')
    .split(/[?#]/, 1)[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/\d{3,}(?=\/|$)/g, '/:id')
    .replace(/\/[^/]*(?:%40|@)[^/]*(?=\/|$)/gi, '/:value');
}

function sanitizeSentryEvent(event) {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.Authorization;
      delete event.request.headers.cookie;
      delete event.request.headers.Cookie;
    }
    if (event.request.url) event.request.url = sanitizeRoute(event.request.url);
  }
  delete event.user;
  delete event.extra;
  if (event.message) event.message = redact(event.message);
  for (const item of event.exception?.values || []) {
    if (item.value) item.value = redact(item.value);
  }
  for (const crumb of event.breadcrumbs || []) {
    if (crumb.message) crumb.message = redact(crumb.message);
    if (crumb.data?.url) crumb.data.url = String(crumb.data.url).split(/[?#]/, 1)[0];
    if (crumb.data) delete crumb.data.body;
  }
  return event;
}

function initSentryBackend() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    initialized = true;
    return;
  }
  try {
    Sentry = require('@sentry/node');
    const env = process.env.SENTRY_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
    const tracesSampleRate = Number(
      process.env.SENTRY_TRACES_RATE ?? (env === 'production' ? 0.1 : 0)
    );
    Sentry.init({
      dsn,
      environment: env,
      release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_RELEASE || undefined,
      tracesSampleRate,
      sendDefaultPii: false,
      beforeSend(event) {
        return sanitizeSentryEvent(event);
      },
    });
    initialized = true;
    console.log(`[Sentry] inicializado em ${env} (sample=${tracesSampleRate})`);
  } catch (e) {
    console.warn('[Sentry] falha ao inicializar:', e.message);
  }
}

// No-op middleware quando Sentry não esta ativo.
function noopRequestHandler() {
  return (_req, _res, next) => next();
}
function noopErrorHandler() {
  return (err, _req, _res, next) => next(err);
}

// No Sentry v8 não existe Handlers.requestHandler — a integração e
// automática. Mantemos a função no fluxo do server.js para preservar
// a ordem dos middlewares se um dia voltar.
function sentryRequestHandler() {
  return noopRequestHandler();
}

// Em v8: Sentry.setupExpressErrorHandler(app) substitui o
// errorHandler middleware. Como o server.js usa app.use(handler),
// retornamos um middleware que delega ao captureException.
function shouldCaptureException(error) {
  const normalized = normalizeError(error);
  return !(normalized.isOperational && Number(normalized.status) < 500);
}

function sentryErrorHandler() {
  if (!Sentry) return noopErrorHandler();
  return (err, req, _res, next) => {
    // Erros operacionais 4xx são comportamento esperado, não incidentes.
    if (shouldCaptureException(err)) {
      try {
        captureException(err, {
          requestId: req.requestId,
          method: req.method,
          route: req.route?.path || req.originalUrl || req.path,
        });
      } catch {}
    }
    next(err);
  };
}

function captureException(err, ctx) {
  if (!Sentry) return null;
  const normalized = normalizeError(err);
  const route = sanitizeRoute(ctx?.route);
  return Sentry.withScope((scope) => {
    scope.setTag('error.code', normalized.code);
    scope.setTag('http.status_code', String(normalized.status));
    if (ctx?.method) scope.setTag('http.request.method', String(ctx.method).toUpperCase());
    scope.setContext('cbrio_request', {
      requestId: ctx?.requestId || null,
      route: route || null,
    });
    Sentry.captureException(err);
  });
}

module.exports = {
  initSentryBackend,
  sentryRequestHandler,
  sentryErrorHandler,
  captureException,
  sanitizeSentryEvent,
  sanitizeRoute,
  shouldCaptureException,
};
