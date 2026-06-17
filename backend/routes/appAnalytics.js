// ============================================================
// Analytics do app de membros (visto no SISTEMA)
// Resumo agregado da telemetria (app_eventos) via RPC.
// ============================================================
const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// GET /api/app-analytics/resumo?dias=14
router.get('/resumo', authorizeModule('dashboard', 1), async (req, res) => {
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

module.exports = router;
