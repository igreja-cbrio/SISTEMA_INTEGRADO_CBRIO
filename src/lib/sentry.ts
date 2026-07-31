import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const environment = import.meta.env.MODE || "development";
const release = import.meta.env.VITE_APP_RELEASE || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA;

let initialized = false;

function redact(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/(token|secret|password|senha|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function sanitizeEvent(event: any) {
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
    if (event.request.url) event.request.url = String(event.request.url).split(/[?#]/, 1)[0];
  }
  delete event.user;
  delete event.extra;
  if (event.message) event.message = redact(String(event.message));
  for (const item of event.exception?.values || []) {
    if (item.value) item.value = redact(String(item.value));
  }
  for (const crumb of event.breadcrumbs || []) {
    if (crumb.message) crumb.message = redact(String(crumb.message));
    if (crumb.data?.url) crumb.data.url = String(crumb.data.url).split(/[?#]/, 1)[0];
    delete crumb.data?.body;
  }
  return event;
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
