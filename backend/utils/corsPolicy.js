const { AppError, ERROR_CODES } = require('./appError');

function configuredOrigins(env = process.env) {
  return [
    'http://localhost:5173',
    'http://localhost:8080',
    env.FRONTEND_URL,
    ...(env.EXTRA_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()),
  ].filter(Boolean);
}

function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return true;
  if (configuredOrigins(env).includes(origin)) return true;
  return /\.vercel\.app$/.test(origin)
    || /\.lovable\.app$/.test(origin)
    || /\.lovableproject\.com$/.test(origin)
    || /^https:\/\/(.+\.)?cbrio\.org$/.test(origin);
}

function createCorsOriginValidator({ env = process.env, logger = console } = {}) {
  return (origin, callback) => {
    if (isAllowedOrigin(origin, env)) return callback(null, true);

    logger.warn('[CORS] Origem bloqueada:', origin);
    return callback(new AppError('Origem não permitida pelo CORS', {
      status: 403,
      code: ERROR_CODES.ORIGIN_NOT_ALLOWED,
      publicMessage: 'Origem não permitida.',
      isOperational: true,
    }));
  };
}

module.exports = { configuredOrigins, createCorsOriginValidator, isAllowedOrigin };
