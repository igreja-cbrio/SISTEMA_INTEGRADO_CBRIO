// ============================================================================
// Agente de Voluntariado · API (listas acionáveis + cron)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { analisar, alertar } = require('../services/agenteVoluntariado');

// Cron (CRON_SECRET) — alerta o coordenador. Também roda no cron diário.
async function cronChecar(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const alertas = await alertar();
    res.json({ ok: true, alertas });
  } catch (e) {
    console.error('[agente-voluntariado/cron]', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/checar', cronChecar);
router.post('/cron/checar', cronChecar);

// GET / — listas acionáveis (confirmações pendentes c/ wa.me 1-toque, reposições,
// no-shows) pro coordenador. Leitura: voluntariado>=1.
router.get('/', authenticate, authorizeModule('voluntariado', 1), async (_req, res) => {
  try {
    const r = await analisar();
    res.json(r);
  } catch (e) {
    console.error('[agente-voluntariado] analisar:', e.message);
    res.status(500).json({ error: 'Erro ao analisar as escalas' });
  }
});

module.exports = router;
