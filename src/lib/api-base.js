const API_SUFFIX = '/api';

export function resolveApiBaseUrl(rawBaseUrl) {
  const normalized = (rawBaseUrl || '').trim().replace(/\/+$/, '');

  if (!normalized || normalized === '/') {
    return API_SUFFIX;
  }

  if (normalized === API_SUFFIX || normalized.endsWith(API_SUFFIX)) {
    return normalized;
  }

  return `${normalized}${API_SUFFIX}`;
}