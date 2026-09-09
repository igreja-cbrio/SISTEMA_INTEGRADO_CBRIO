const router = require('express').Router();
const { authenticate, apenasColaborador } = require('../middleware/auth');
// (sync-areas, projects-kanban e strategic-kanban removidos na poda do atlas
// 2026-07 — sem consumidor; pmo/workload seguem vivos na home do Eventos.)
const { supabase } = require('../utils/supabase');

router.use(authenticate);
// varredura 2026-09: A05 — /pmo e /workload devolvem KPI agregado da casa e
// carga de trabalho por pessoa (PII de equipe) para qualquer autenticado,
// incluindo as 138 contas `is_membro_only` (04/09). Piso no router: as duas
// rotas daqui já exigem `req.user` (sem cron, sem rota pública) e o app de
// membros não chama /api/dashboard (só /api/app/* e /api/public/*).
router.use(apenasColaborador);

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
