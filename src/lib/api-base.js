const API_SUFFIX = '/api';

function isLovablePreviewHost(hostname = '') {
  return /\.lovableproject\.com$/.test(hostname) || /\.lovable\.app$/.test(hostname);
}

export function resolveApiBaseUrl(rawBaseUrl) {
  const normalized = (rawBaseUrl || '').trim().replace(/\/+$/, '');

  if (!normalized || normalized === '/') {
    return API_SUFFIX;
  }

  if (typeof window !== 'undefined' && /^https?:\/\//i.test(normalized)) {
    try {
      const targetUrl = new URL(normalized);
      if (isLovablePreviewHost(window.location.hostname) && targetUrl.origin !== window.location.origin) {
        return API_SUFFIX;
      }
    } catch {
      // ignore invalid URL and fall through
    }
  }

  if (normalized === API_SUFFIX || normalized.endsWith(API_SUFFIX)) {
    return normalized;
  }

  return `${normalized}${API_SUFFIX}`;
}
