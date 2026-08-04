import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const environment = (typeof __APP_ENVIRONMENT__ !== 'undefined' && __APP_ENVIRONMENT__)
  || import.meta.env.MODE || "development";
const release = (typeof __APP_RELEASE__ !== 'undefined' && __APP_RELEASE__)
  || undefined;
const capturedErrors = new WeakSet<object>();

let initialized = false;

function redact(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/(token|secret|password|senha|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

export function sanitizeRoute(value: string) {
  return String(value || '')
    .split(/[?#]/, 1)[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/\d{3,}(?=\/|$)/g, '/:id')
    .replace(/\/[^/]*(?:%40|@)[^/]*(?=\/|$)/gi, '/:value');
}

export function sanitizeEvent(event: Sentry.Event) {
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
  if (event.message) event.message = redact(String(event.message));
  for (const item of event.exception?.values || []) {
    if (item.value) item.value = redact(String(item.value));
  }
  for (const crumb of event.breadcrumbs || []) {
    if (crumb.message) crumb.message = redact(String(crumb.message));
    if (crumb.data?.url) crumb.data.url = sanitizeRoute(crumb.data.url);
    delete crumb.data?.body;
  }
  return event;
}

function normalizeThrowable(value: unknown) {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  return new Error('Valor não-Error capturado no frontend');
}

function wasCaptured(error: Error) {
  if (capturedErrors.has(error)) return true;
  capturedErrors.add(error);
  return false;
}

export function captureAppException(
  throwable: unknown,
  options: {
    mechanism: string;
    tags?: Record<string, string>;
    context?: Record<string, string | number | boolean | null | undefined>;
  },
) {
  if (!dsn || !initialized) return null;
  const error = normalizeThrowable(throwable);
  if (wasCaptured(error)) return null;

  return Sentry.withScope((scope) => {
    scope.setTag('error.mechanism', options.mechanism);
    for (const [key, value] of Object.entries(options.tags || {})) scope.setTag(key, value);
    if (options.context) scope.setContext('cbrio', options.context);
    return Sentry.captureException(error);
  });
}

export function captureApiError(
  throwable: unknown,
  metadata: {
    path: string;
    method?: string;
    kind: 'network' | 'timeout' | 'protocol' | 'response';
    status?: number;
    requestId?: string | null;
    code?: string | null;
  },
) {
  const status = Number(metadata.status || 0);
  if (metadata.code === 'SENTRY_CANARY' || (metadata.kind === 'response' && status < 500)) return null;
  return captureAppException(throwable, {
    mechanism: 'api-client',
    tags: {
      'api.kind': metadata.kind,
      'api.method': String(metadata.method || 'GET').toUpperCase(),
      ...(status ? { 'http.status_code': String(status) } : {}),
      ...(metadata.code ? { 'error.code': metadata.code } : {}),
    },
    context: {
      route: sanitizeRoute(metadata.path),
      status: status || null,
      requestId: metadata.requestId || null,
    },
  });
}

export function captureFrontendCanary() {
  return captureAppException(new Error('Sentry frontend canary'), {
    mechanism: 'manual-canary',
    tags: { 'error.code': 'SENTRY_CANARY', surface: 'frontend' },
    context: { purpose: 'Validação manual da observabilidade pelo superadmin' },
  });
}

export function isSentryEnabled() {
  return Boolean(dsn && initialized);
}

export function initSentry() {
  if (!dsn || initialized) return;
  Sentry.init({
    dsn,
    environment,
    release,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: environment === "production" ? 0.1 : 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
    sendDefaultPii: false,
    beforeSend(event) {
      return sanitizeEvent(event);
    },
  });
  initialized = true;
}

export { Sentry };
