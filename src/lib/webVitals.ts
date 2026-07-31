import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'unknown';

function normalizedRoute(pathname: string) {
  const clean = (pathname || '/')
    .split(/[?#]/, 1)[0]
    .replace(/\/\d{4,}(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .slice(0, 300);
  return clean.startsWith('/') ? clean : `/${clean}`;
}

function deviceClass(): DeviceClass {
  const width = Math.max(window.innerWidth || 0, window.screen?.width || 0);
  if (!width) return 'unknown';
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

function report(metric: Metric) {
  const payload = JSON.stringify({
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    route: normalizedRoute(window.location.pathname),
    navigation_type: metric.navigationType,
    device_class: deviceClass(),
    release: import.meta.env.VITE_APP_RELEASE || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || null,
  });

  try {
    const blob = new Blob([payload], { type: 'application/json' });
    if (navigator.sendBeacon?.('/api/telemetry/web-vitals', blob)) return;
  } catch {
    // O fallback abaixo mantém a telemetria best-effort.
  }

  void fetch('/api/telemetry/web-vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {});
}

let initialized = false;

export function initWebVitals() {
  if (initialized || import.meta.env.MODE !== 'production') return;
  initialized = true;

  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
}

export { normalizedRoute };
