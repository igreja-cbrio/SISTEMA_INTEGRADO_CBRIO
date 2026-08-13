const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_JSON: 'INVALID_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  DEPENDENCY_TIMEOUT: 'DEPENDENCY_TIMEOUT',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  PAYMENT_WEBHOOK_FAILED: 'PAYMENT_WEBHOOK_FAILED',
  PAYMENT_CRON_FAILED: 'PAYMENT_CRON_FAILED',
  BANK_SYNC_FAILED: 'BANK_SYNC_FAILED',
  COMMUNICATION_OPERATION_FAILED: 'COMMUNICATION_OPERATION_FAILED',
  WIFI_SYNC_FAILED: 'WIFI_SYNC_FAILED',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
});

const STATUS_DEFAULTS = Object.freeze({
  400: { code: ERROR_CODES.VALIDATION_ERROR, publicMessage: 'Requisição inválida.' },
  401: { code: ERROR_CODES.UNAUTHENTICATED, publicMessage: 'Autenticação necessária.' },
  403: { code: ERROR_CODES.FORBIDDEN, publicMessage: 'Acesso não permitido.' },
  404: { code: ERROR_CODES.NOT_FOUND, publicMessage: 'Recurso não encontrado.' },
  409: { code: ERROR_CODES.CONFLICT, publicMessage: 'A operação está em conflito com o estado atual.' },
  413: { code: ERROR_CODES.PAYLOAD_TOO_LARGE, publicMessage: 'Conteúdo enviado acima do limite permitido.' },
  429: { code: ERROR_CODES.RATE_LIMITED, publicMessage: 'Muitas requisições. Tente novamente em alguns minutos.' },
  503: { code: ERROR_CODES.DEPENDENCY_UNAVAILABLE, publicMessage: 'Serviço temporariamente indisponível.' },
});

function validStatus(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 400 && parsed <= 599 ? parsed : null;
}

function normalizeCode(value, fallback) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : fallback;
}

class AppError extends Error {
  constructor(message, options = {}) {
    const cause = options.cause;
    super(String(message || 'Erro da aplicação'), cause === undefined ? undefined : { cause });
    this.name = 'AppError';
    this.status = validStatus(options.status) || 500;
    const defaults = STATUS_DEFAULTS[this.status] || {
      code: ERROR_CODES.UNEXPECTED_ERROR,
      publicMessage: 'Erro interno do servidor.',
    };
    this.code = normalizeCode(options.code, defaults.code);
    this.publicMessage = String(options.publicMessage || defaults.publicMessage).slice(0, 300);
    this.isOperational = options.isOperational ?? this.status < 500;
    if (cause !== undefined && this.cause === undefined) this.cause = cause;
    Error.captureStackTrace?.(this, AppError);
  }
}

function statusCodeFor(error) {
  const status = Number(error?.status || error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
}

function normalizeError(error) {
  if (error instanceof AppError) return error;

  if (error?.type === 'entity.too.large') {
    return new AppError('Payload acima do limite configurado', {
      status: 413,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      cause: error,
      isOperational: true,
    });
  }

  if (error instanceof SyntaxError && error?.type === 'entity.parse.failed') {
    return new AppError('JSON inválido', {
      status: 400,
      code: ERROR_CODES.INVALID_JSON,
      publicMessage: 'JSON inválido.',
      cause: error,
      isOperational: true,
    });
  }

  const declaredStatus = statusCodeFor(error);
  if (declaredStatus) {
    const defaults = STATUS_DEFAULTS[declaredStatus] || {};
    return new AppError(error?.message || 'Falha na requisição', {
      status: declaredStatus,
      code: error?.code || defaults.code,
      publicMessage: error?.publicMessage || defaults.publicMessage,
      cause: error,
      isOperational: error?.isOperational ?? declaredStatus < 500,
    });
  }

  if (error instanceof Error) {
    error.code = normalizeCode(error.code, ERROR_CODES.UNEXPECTED_ERROR);
    error.status = 500;
    error.publicMessage = 'Erro interno do servidor.';
    error.isOperational = false;
    return error;
  }

  return new AppError('Valor não-Error lançado pela aplicação', {
    code: ERROR_CODES.UNEXPECTED_ERROR,
    cause: error,
    isOperational: false,
  });
}

module.exports = { AppError, ERROR_CODES, STATUS_DEFAULTS, normalizeError };
