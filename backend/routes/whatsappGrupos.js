// Bot WhatsApp · Grupos de conexão — cron diário + admin do estudo da semana.
// Cron (Vercel · CRON_SECRET): GET /api/whatsapp-grupos/cron/diario
//   - sincroniza líderes (auto-vínculos) e envia o estudo no dia configurado.
// ⚠️ Decisão do Marcos (2026-07-20): NENHUMA mensagem automática de cobrança/
// lembrete de relato pro líder — nem com temporada ativa. O pedido de chamada
// é 1×/mês pelo cron frequencia-mensal (publicGrupos · gated por temporada em
// curso) e lembrete avulso SÓ por disparo manual da coordenação.
// Admin (authenticate + módulo grupos):
//   - PATCH /materiais/:docId/estudo-semana · marca o material da semana
//   - POST  /enviar-estudo · disparo manual (teste)
//   - POST  /enviar-lembretes · disparo manual (coordenação)
const router = require('express').Router();
const { requireCron } = require('../utils/cronAuth');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const svc = require('../services/whatsappGrupos');

// Dia do envio do estudo (0=Dom..6=Sáb) · default segunda
const DIA_ESTUDO = Number(process.env.WHATSAPP_ESTUDO_DIA ?? 1);

// ── Cron diário (sem login · CRON_SECRET) ───────────────────────────────────
// Ordem: sincroniza líderes (auto-vínculos a partir de mem_grupos.lider_id) →
// estudo da semana no dia configurado. Cobrança automática de relato foi
// REMOVIDA em 2026-07-20 (decisão do Marcos: líder não recebe cobrança
// automática nunca; ver cabeçalho do arquivo).
router.get('/cron/diario', requireCron, async (req, res) => {
  try {
    const sync = await svc.sincronizarLideresGrupos();
    let estudo = null;
    if (new Date().getDay() === DIA_ESTUDO) {
      estudo = await svc.enviarEstudoSemanal();
    }
    console.log('[whatsapp-grupos cron]', JSON.stringify({ sync, estudo }));
    res.json({ ok: true, sync, estudo });
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

// POST /api/whatsapp-grupos/enviar-lembretes · disparo manual (coordenação ·
// única via de lembrete de relato — não há envio automático)
router.post('/enviar-lembretes', podeGerir, async (req, res) => {
  try {
    const r = await svc.enviarLembretesEncontro();
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/whatsapp-grupos/sincronizar-lideres · disparo manual do auto-sync
router.post('/sincronizar-lideres', podeGerir, async (req, res) => {
  try {
    const r = await svc.sincronizarLideresGrupos();
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
