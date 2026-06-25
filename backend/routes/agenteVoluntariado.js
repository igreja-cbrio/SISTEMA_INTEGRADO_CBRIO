// ============================================================================
// Agente de Voluntariado · API (listas acionáveis + cron)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { analisar, alertar } = require('../services/agenteVoluntariado');
const wpp = require('../services/whatsappService');

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

// POST /lembrar { schedule_ids?: [] } — dispara o lembrete de escala pelo WhatsApp
// (Cloud API · template `escala_voluntario` · {{1}} ministério {{2}} evento {{3}} quando).
// Sem schedule_ids = lembra TODOS os pendentes com telefone. Escrita: voluntariado>=2.
// No-op gracioso até o template ser aprovado na Meta + WHATSAPP_TEMPLATE_ESCALA setado.
router.post('/lembrar', authenticate, authorizeModule('voluntariado', 2), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.schedule_ids) ? req.body.schedule_ids : null;
    const templateName = process.env.WHATSAPP_TEMPLATE_ESCALA;

    const { confirmacoes_pendentes } = await analisar();
    const alvo = ids ? confirmacoes_pendentes.filter((p) => ids.includes(p.schedule_id)) : confirmacoes_pendentes;

    let enviados = 0, sem_telefone = 0, falhas = 0;
    for (const p of alvo) {
      if (!p.telefone) { sem_telefone++; continue; }
      if (!templateName) continue; // sem template aprovado: não envia (no-op)
      const params = [p.funcao || 'Voluntariado', p.servico || 'culto', p.quando || ''];
      const r = await wpp.sendTemplate(p.telefone, templateName, 'pt_BR', params);
      if (r?.sent) enviados++; else falhas++;
    }

    res.json({
      total: alvo.length,
      enviados,
      sem_telefone,
      falhas,
      template_configurado: !!templateName,
    });
  } catch (e) {
    console.error('[agente-voluntariado] lembrar:', e.message);
    res.status(500).json({ error: 'Erro ao enviar lembretes' });
  }
});

module.exports = router;
