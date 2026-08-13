const { AppError, ERROR_CODES } = require('./appError');

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted);
  return entry ? entry[1] : null;
}

function canRetry(method, headers, explicitlySafe = false) {
  if (explicitlySafe || SAFE_METHODS.has(method)) return true;
  return Boolean(
    headerValue(headers, 'idempotency-key')
    || headerValue(headers, 'x-idempotency-key'),
  );
}

function retryAfterMs(response) {
  const raw = response?.headers?.get?.('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function backoffMs(attempt, response, random) {
  const instructed = retryAfterMs(response);
  if (instructed !== null) return Math.min(instructed, 10_000);
  const base = Math.min(250 * (2 ** attempt), 2_000);
  return Math.round(base * (0.8 + random() * 0.4));
}

function dependencyError(dependency, timedOut, cause, attempts) {
  const label = String(dependency || 'servico externo');
  const error = new AppError(
    timedOut ? `${label} excedeu o tempo limite` : `${label} esta indisponivel`,
    {
      status: 503,
      code: timedOut ? ERROR_CODES.DEPENDENCY_TIMEOUT : ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      publicMessage: 'Servico externo temporariamente indisponivel. Tente novamente.',
      cause,
      isOperational: false,
    },
  );
  error.dependency = label;
  error.attempts = attempts;
  return error;
}

/**
 * Fetch com prazo total por tentativa e retry conservador.
 * POST so e repetido quando tem chave de idempotencia ou `retrySafe: true`.
 * Respostas HTTP finais sao devolvidas para o adapter traduzir o corpo do provedor.
 */
async function resilientFetch(url, options = {}, policy = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const timeoutMs = Math.max(1, Number(policy.timeoutMs || 8_000));
  const retryAllowed = canRetry(method, options.headers, policy.retrySafe === true);
  const maxRetries = retryAllowed ? Math.max(0, Number(policy.maxRetries ?? 1)) : 0;
  const fetchImpl = policy.fetchImpl || globalThis.fetch;
  const sleep = policy.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = policy.random || Math.random;

  if (typeof fetchImpl !== 'function') {
    throw dependencyError(policy.dependency, false, new Error('fetch indisponivel'), 0);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const upstreamSignal = options.signal;
    const relayAbort = () => controller.abort(upstreamSignal?.reason);
    if (upstreamSignal?.aborted) relayAbort();
    else upstreamSignal?.addEventListener?.('abort', relayAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
        response.body?.cancel?.().catch?.(() => {});
        await sleep(backoffMs(attempt, response, random));
        continue;
      }
      return response;
    } catch (error) {
      const timedOut = controller.signal.aborted && !upstreamSignal?.aborted;
      if (!timedOut && upstreamSignal?.aborted) throw error;
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt, null, random));
        continue;
      }
      throw dependencyError(policy.dependency, timedOut, error, attempt + 1);
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener?.('abort', relayAbort);
    }
  }

  throw dependencyError(policy.dependency, false, new Error('tentativas esgotadas'), maxRetries + 1);
}

module.exports = { resilientFetch, RETRYABLE_STATUS, canRetry, retryAfterMs };
