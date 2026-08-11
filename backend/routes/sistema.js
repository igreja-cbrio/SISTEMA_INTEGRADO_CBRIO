const router = require('express').Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { getFoundationPayload } = require('../config/systemCatalog');
const { AppError, ERROR_CODES } = require('../utils/appError');
const { isAuthorizedCron } = require('../utils/cronAuth');

// ⚠️⚠️ ESTE ARQUIVO ESTAVA MATANDO UM CRON DO ARQUIVO VIZINHO (11/08/2026).
//
// `/api/sistema` é montado DUAS vezes no server.js: primeiro este router,
// depois o `sistemaV1`. O `router.use(authenticate)` abaixo casa QUALQUER
// caminho sob `/api/sistema` — inclusive um que este arquivo não serve. Então a
// requisição do cron para `/api/sistema/cron/push-receipts`, que vive no
// `sistemaV1` com `requireCron`, levava **401 aqui** e nunca chegava lá.
//
// ⚠️ O QUE ISSO CUSTOU, medido: o comentário daquela rota conta que
// `refreshExpoReceipts` "nunca rodou — 0 de 1.849 tickets tinham
// receipt_status", e que 1.801 falhas de entrega passaram dois meses
// despercebidas. O conserto foi apontar um cron pra ela — e o cron também nunca
// rodou, pelo motivo acima. Hoje são **0 de 4.509** tickets com recibo. Ou seja:
// o segundo conserto acreditou ter resolvido e o número não se moveu.
//
// ⚠️ A liberação é POR CAMINHO e só com segredo de cron válido. Um `next()`
// solto aqui abriria todas as rotas de super-admin deste arquivo.
const CAMINHOS_DE_CRON = new Set(['/cron/push-receipts']);
router.use((req, res, next) => (
  CAMINHOS_DE_CRON.has(req.path) && isAuthorizedCron(req)
    ? next('router') // sai deste router e deixa o sistemaV1 atender
    : authenticate(req, res, next)
));
// ⚠️ `requireSuperAdmin` segue GERAL e sem exceção: o caminho do cron sai do
// router no middleware acima e nunca chega aqui. Quem chega é gente logada — e
// pra essa, nada mudou.
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
