// ============================================================================
// Monitor de Automações · API (status + cron)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { checarSaude, checarEAlertar } = require('../services/monitorAutomacoes');

// Cron (CRON_SECRET) — checa e alerta os pipelines parados. Também roda no cron
// diário de notificações; este endpoint permite uma frequência dedicada.
async function cronChecar(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const alertas = await checarEAlertar();
    res.json({ ok: true, alertas });
  } catch (e) {
    console.error('[monitor-automacoes/cron]', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/checar', cronChecar);
router.post('/cron/checar', cronChecar);

// GET /status — saúde atual de cada pipeline (pro painel). Leitura: dashboard>=1.
router.get('/status', authenticate, authorizeModule('dashboard', 1), async (_req, res) => {
  try {
    const pipelines = await checarSaude();
    const resumo = {
      ok: pipelines.filter((p) => p.status === 'ok').length,
      atrasado: pipelines.filter((p) => p.status === 'atrasado').length,
      parado: pipelines.filter((p) => p.status === 'parado').length,
      desconhecido: pipelines.filter((p) => p.status === 'desconhecido').length,
    };
    res.json({ pipelines, resumo });
  } catch (e) {
    console.error('[monitor-automacoes/status]', e.message);
    res.status(500).json({ error: 'Erro ao checar a saúde das automações' });
  }
});

module.exports = router;
