// Bot WhatsApp · Grupos de conexão — cron diário (só sincroniza líderes).
// Cron (Vercel · CRON_SECRET): GET /api/whatsapp-grupos/cron/diario
//   - sincroniza os auto-vínculos de líderes (whatsapp_lideres). SEM ENVIO.
// ⚠️ NENHUMA mensagem automática pro líder por aqui:
//   - Cobrança de relato: REMOVIDA em 2026-07-20 (decisão do Marcos).
//   - Estudo da semana automático: REMOVIDO em 2026-07-23 (decisão do Marcos ·
//     ideia descontinuada; estudo agora só é enviado manualmente pela aba de
//     estudos, nunca por cron).
// O único envio proativo automático que sobra é o cron mensal de frequência
// (publicGrupos · gated por temporada em curso + kill-switch grupos_auto_envios).
// Lembrete avulso e frequência avulsa: SÓ por disparo manual (aba Envios).
// Admin (authenticate + módulo grupos):
//   - PATCH /materiais/:docId/estudo-semana · marca o material da semana (a aba
//     de estudos usa esse flag; NÃO dispara envio automático)
//   - POST  /enviar-lembretes · disparo manual (coordenação)
const router = require('express').Router();
const { requireCron } = require('../utils/cronAuth');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const svc = require('../services/whatsappGrupos');

// ── Cron diário (sem login · CRON_SECRET) ───────────────────────────────────
// SÓ sincroniza os vínculos de líderes (a partir de mem_grupos.lider_id) — não
// envia mensagem nenhuma. Estudo automático removido em 2026-07-23.
router.get('/cron/diario', requireCron, async (req, res) => {
  try {
    const sync = await svc.sincronizarLideresGrupos();
    console.log('[whatsapp-grupos cron]', JSON.stringify({ sync }));
    res.json({ ok: true, sync });
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

// (Removido 2026-07-23) POST /enviar-estudo — envio de estudo pelo bot foi
// descontinuado pelo Marcos. O estudo da semana agora vive só na aba de
// estudos e, se for enviado, é manualmente por lá — não por este bot.

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
