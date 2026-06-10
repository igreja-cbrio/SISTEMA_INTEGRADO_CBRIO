// Bot WhatsApp · Grupos de conexão — cron diário + admin do estudo da semana.
// Cron (Vercel · CRON_SECRET): GET /api/whatsapp-grupos/cron/diario
//   - lembrete pós-encontro: grupos cujo dia_semana foi ONTEM → pergunta ao líder
//   - estudo da semana: no dia configurado (default segunda) → broadcast 1:1
// Admin (authenticate + módulo grupos):
//   - PATCH /materiais/:docId/estudo-semana · marca o material da semana
//   - POST  /enviar-estudo · disparo manual (teste)
//   - POST  /enviar-lembretes · disparo manual (teste)
const router = require('express').Router();
const { requireCron } = require('../utils/cronAuth');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const svc = require('../services/whatsappGrupos');

// Dia do envio do estudo (0=Dom..6=Sáb) · default segunda
const DIA_ESTUDO = Number(process.env.WHATSAPP_ESTUDO_DIA ?? 1);

// ── Cron diário (sem login · CRON_SECRET) ───────────────────────────────────
router.get('/cron/diario', requireCron, async (req, res) => {
  try {
    const lembretes = await svc.enviarLembretesEncontro();
    let estudo = null;
    if (new Date().getDay() === DIA_ESTUDO) {
      estudo = await svc.enviarEstudoSemanal();
    }
    console.log('[whatsapp-grupos cron]', JSON.stringify({ lembretes, estudo }));
    res.json({ ok: true, lembretes, estudo });
  } catch (e) {
    console.error('[whatsapp-grupos cron]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Admin ───────────────────────────────────────────────────────────────────
router.use(authenticate);
const podeGerir = authorizeModule('grupos', 3);

// PATCH /api/whatsapp-grupos/materiais/:docId/estudo-semana · { ativo }
// Só 1 material fica marcado por vez (o cron pega o marcado mais recente).
router.patch('/materiais/:docId/estudo-semana', podeGerir, async (req, res) => {
  try {
    const ativo = req.body?.ativo !== false;
    if (ativo) {
      await supabase.from('mem_grupo_documentos').update({ estudo_semana: false }).eq('estudo_semana', true);
    }
    const { data, error } = await supabase
      .from('mem_grupo_documentos')
      .update({ estudo_semana: ativo })
      .eq('id', req.params.docId)
      .select('id, nome, estudo_semana')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[whatsapp-grupos] estudo-semana', e.message);
    res.status(500).json({ error: 'Erro ao marcar estudo da semana' });
  }
});

// POST /api/whatsapp-grupos/enviar-estudo · disparo manual (teste do coordenador)
router.post('/enviar-estudo', podeGerir, async (req, res) => {
  try {
    const r = await svc.enviarEstudoSemanal();
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/whatsapp-grupos/enviar-lembretes · disparo manual (teste)
router.post('/enviar-lembretes', podeGerir, async (req, res) => {
  try {
    const r = await svc.enviarLembretesEncontro();
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
