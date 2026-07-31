const express = require('express');
const rateLimit = require('express-rate-limit');
const { recordWebVital } = require('../services/systemWebOps');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de telemetria atingido.' },
});

router.post('/web-vitals', limiter, async (req, res) => {
  try {
    await recordWebVital({
      ...(req.body || {}),
      request_id: req.requestId,
    });
    res.status(202).end();
  } catch (error) {
    if (error.code === 'INVALID_WEB_VITAL') {
      return res.status(400).json({ error: 'Métrica inválida.' });
    }
    // Telemetria nunca deve interromper a jornada do usuário. A indisponibilidade
    // do schema aparece no painel como fonte ausente e não vaza detalhes internos.
    console.warn('[telemetry/web-vitals]', error.message);
    res.status(202).end();
  }
});

module.exports = router;
