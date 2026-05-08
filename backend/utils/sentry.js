// Wrapper do Sentry com no-op quando SENTRY_DSN nao esta configurado.
//
// Sentry v8 (@sentry/node ^8.x) instrumenta o Express automaticamente
// via integration; so precisamos chamar setupExpressErrorHandler(app)
// depois das rotas e antes do nosso error handler.
//
// Variaveis de ambiente:
//   SENTRY_DSN         (obrigatoria pra ativar)
//   SENTRY_ENV         (opcional, default = NODE_ENV ou 'development')
//   SENTRY_TRACES_RATE (opcional, default 0.1 em prod, 0 em dev)

let Sentry = null;
let initialized = false;

function initSentryBackend() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    initialized = true;
    return;
  }
  try {
    Sentry = require('@sentry/node');
    const env = process.env.SENTRY_ENV || process.env.NODE_ENV || 'development';
    const tracesSampleRate = Number(
      process.env.SENTRY_TRACES_RATE ?? (env === 'production' ? 0.1 : 0)
    );
    Sentry.init({
      dsn,
      environment: env,
      tracesSampleRate,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        return event;
      },
    });
    initialized = true;
    console.log(`[Sentry] inicializado em ${env} (sample=${tracesSampleRate})`);
  } catch (e) {
    console.warn('[Sentry] falha ao inicializar:', e.message);
  }
}

// No-op middleware quando Sentry nao esta ativo.
function noopRequestHandler() {
  return (_req, _res, next) => next();
}
function noopErrorHandler() {
  return (err, _req, _res, next) => next(err);
}

// No Sentry v8 nao existe Handlers.requestHandler — a integracao e
// automatica. Mantemos a funcao no fluxo do server.js para preservar
// a ordem dos middlewares se um dia voltar.
function sentryRequestHandler() {
  return noopRequestHandler();
}

// Em v8: Sentry.setupExpressErrorHandler(app) substitui o
// errorHandler middleware. Como o server.js usa app.use(handler),
// retornamos um middleware que delega ao captureException.
function sentryErrorHandler() {
  if (!Sentry) return noopErrorHandler();
  return (err, _req, _res, next) => {
    try { Sentry.captureException(err); } catch {}
    next(err);
  };
}

function captureException(err, ctx) {
  if (Sentry) {
    Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
  }
}

module.exports = {
  initSentryBackend,
  sentryRequestHandler,
  sentryErrorHandler,
  captureException,
};
