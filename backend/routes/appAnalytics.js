// ============================================================
// Analytics do app de membros (visto no SISTEMA)
// Resumo agregado da telemetria (app_eventos) via RPC.
// ============================================================
const router = require('express').Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);
// Analytics do app = dado sensível · SÓ super-admin (gestão + Marcos Paulo).
router.use(requireSuperAdmin);

// GET /api/app-analytics/resumo?dias=14
router.get('/resumo', async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 14, 1), 90);
    const { data, error } = await supabase.rpc('fn_app_telemetria_resumo', { p_dias: dias });
    if (error) throw error;
    res.json(data || {});
  } catch (e) {
    console.error('[app-analytics] resumo:', e.message);
    res.status(500).json({ error: 'Erro ao carregar analytics do app' });
  }
});

// GET /api/app-analytics/ao-vivo — painel ao vivo (lançamento)
router.get('/ao-vivo', async (_req, res) => {
  try {
    const { data, error } = await supabase.rpc('fn_app_telemetria_ao_vivo');
    if (error) throw error;
    res.json(data || {});
  } catch (e) {
    console.error('[app-analytics] ao-vivo:', e.message);
    res.status(500).json({ error: 'Erro ao carregar painel ao vivo' });
  }
});

module.exports = router;
