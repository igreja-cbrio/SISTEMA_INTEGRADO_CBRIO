const router = require('express').Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { getFoundationPayload } = require('../config/systemCatalog');
const { AppError, ERROR_CODES } = require('../utils/appError');

router.use(authenticate);
router.use(requireSuperAdmin);

// Fundação somente leitura. Não consulta nem persiste secrets ou payloads.
router.get('/fundacao', (_req, res) => {
  res.json(getFoundationPayload());
});

router.get('/observabilidade/status', (_req, res) => {
  const backendCapture = Boolean(process.env.SENTRY_DSN);
  const frontendCapture = Boolean(process.env.VITE_SENTRY_DSN);
  const sourceMaps = Boolean(
    process.env.SENTRY_AUTH_TOKEN
    && process.env.SENTRY_ORG
    && process.env.SENTRY_PROJECT_FRONTEND
    && (process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_RELEASE)
  );
  res.json({
    backendCapture,
    frontendCapture,
    sourceMaps,
    environment: process.env.SENTRY_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_RELEASE || null,
  });
});

router.post('/observabilidade/canary', (req, _res, next) => {
  if (req.body?.confirm !== 'SENTRY_CANARY') {
    return next(new AppError('Confirmação inválida para o canário do Sentry', {
      status: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      publicMessage: 'Confirmação inválida para o teste de observabilidade.',
      isOperational: true,
    }));
  }
  const error = new Error('Sentry backend canary');
  error.code = 'SENTRY_CANARY';
  error.status = 500;
  error.publicMessage = 'Canário backend enviado para a observabilidade.';
  error.isOperational = false;
  next(error);
});
module.exports = router;
