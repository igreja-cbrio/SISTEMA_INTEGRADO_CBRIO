const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
// (sync-areas, projects-kanban e strategic-kanban removidos na poda do atlas
// 2026-07 — sem consumidor; pmo/workload seguem vivos na home do Eventos.)
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// GET /api/dashboard/pmo — KPIs agregados
router.get('/pmo', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vw_pmo_kpis').select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar KPIs' }); }
});

// GET /api/dashboard/workload — carga por responsável
router.get('/workload', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vw_workload').select('*');
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar carga' }); }
});


module.exports = router;
