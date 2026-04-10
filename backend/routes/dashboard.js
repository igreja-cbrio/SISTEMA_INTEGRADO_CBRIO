const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
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

// POST /api/dashboard/sync-areas — sincronizar area dos profiles com RH
router.post('/sync-areas', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data: profiles } = await supabase.from('profiles').select('id, email, area');
    const { data: funcionarios } = await supabase.from('rh_funcionarios').select('email, area, cargo').eq('status', 'ativo');

    let updated = 0;
    for (const f of (funcionarios || [])) {
      if (!f.email || !f.email.trim()) continue;
      const p = (profiles || []).find(pr => pr.email === f.email);
      if (p && (!p.area || p.area !== f.area)) {
        await supabase.from('profiles').update({ area: f.area }).eq('id', p.id);
        updated++;
      }
    }
    res.json({ success: true, updated, message: `${updated} profiles sincronizados com RH` });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// GET /api/dashboard/projects-kanban — projetos com tarefas para kanban
router.get('/projects-kanban', async (req, res) => {
  try {
    const { data: projects } = await supabase.from('projects')
      .select('*, project_categories(name, color)').neq('status', 'concluido').order('date_start');
    const { data: tasks } = await supabase.from('project_tasks').select('*');
    const { data: milestones } = await supabase.from('project_milestones').select('*').order('sort_order');

    // Agrupar por área (da categoria)
    const AREA_MAP = { 'Infraestrutura': 'Gestão', 'Administrativo': 'Gestão', 'Tecnologia': 'Gestão', 'Ministerial': 'Ministerial', 'Social': 'Ministerial' };
    const result = (projects || []).map(p => {
      const pTasks = (tasks || []).filter(t => t.project_id === p.id);
      const done = pTasks.filter(t => t.status === 'concluida').length;
      const catName = p.project_categories?.name || '';
      return {
        ...p, category_name: catName, category_color: p.project_categories?.color,
        area_group: AREA_MAP[catName] || 'Criativo',
        tasks_total: pTasks.length, tasks_done: done,
        milestones: (milestones || []).filter(m => m.project_id === p.id),
      };
    });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// GET /api/dashboard/strategic-kanban — planos estratégicos com tarefas para kanban
router.get('/strategic-kanban', async (req, res) => {
  try {
    const { data: plans } = await supabase.from('strategic_plans')
      .select('*, strategic_categories(name, color)').neq('status', 'concluido').order('date_start');
    const { data: tasks } = await supabase.from('strategic_tasks').select('*');
    const { data: milestones } = await supabase.from('strategic_milestones').select('*').order('sort_order');

    const AREA_MAP = { 'Crescimento': 'Ministerial', 'Expansão Física': 'Gestão', 'Capacitação': 'Gestão', 'Financeiro': 'Gestão', 'Missões': 'Ministerial' };
    const result = (plans || []).map(p => {
      const pTasks = (tasks || []).filter(t => t.plan_id === p.id);
      const done = pTasks.filter(t => t.status === 'concluida').length;
      const catName = p.strategic_categories?.name || '';
      return {
        ...p, category_name: catName, category_color: p.strategic_categories?.color,
        area_group: AREA_MAP[catName] || 'Gestão',
        tasks_total: pTasks.length, tasks_done: done,
        milestones: (milestones || []).filter(m => m.plan_id === p.id),
      };
    });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
