const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase, query: dbQuery } = require('../utils/supabase');

router.use(authenticate);

const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ── CATEGORIES (deve vir antes de /:id) ──
router.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_categories').select('*').order('sort_order');
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar categorias' }); }
});

// ── DASHBOARD ──
router.get('/dashboard', async (req, res) => {
  try {
    const { data, error } = await supabase.from('v_projects_dashboard').select('*').order('year', { ascending: false }).order('name');
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Projects dashboard]', e.message); res.status(500).json({ error: 'Erro ao buscar dashboard de projetos' }); }
});

// ── WORKLOAD VIEW ──
router.get('/views/workload', async (req, res) => {
  try {
    const r = await dbQuery('SELECT responsible, count(*) as active FROM project_tasks WHERE status NOT IN (\'concluida\',\'concluido\') GROUP BY responsible ORDER BY active DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── LIST ──
router.get('/', async (req, res) => {
  try {
    const { year, status, area } = req.query;
    let q = supabase.from('projects').select('*, project_categories(name, color)');
    if (year) q = q.eq('year', year);
    if (status) q = q.eq('status', status);
    if (area) q = q.eq('area', area);
    q = q.order('year', { ascending: false }).order('priority').order('name');
    const { data, error } = await q;
    if (error) throw error;
    res.json((data || []).map(p => ({
      ...p,
      category_name: p.project_categories?.name || '',
      category_color: p.project_categories?.color || '',
      project_categories: undefined,
    })));
  } catch (e) { console.error('[Projects list]', e.message); res.status(500).json({ error: 'Erro ao buscar projetos' }); }
});

// ── GET by ID ──
router.get('/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { data: project, error } = await supabase.from('projects').select('*, project_categories(name, color)').eq('id', req.params.id).single();
    if (error) throw error;

    const [phases, tasks, milestones, kpis, risks, budget] = await Promise.all([
      supabase.from('project_phases').select('*').eq('project_id', req.params.id).order('phase_order'),
      supabase.from('project_tasks').select('*').eq('project_id', req.params.id).order('sort_order').order('deadline'),
      supabase.from('project_milestones').select('*').eq('project_id', req.params.id).order('sort_order'),
      supabase.from('project_kpis').select('*').eq('project_id', req.params.id).order('sort_order'),
      supabase.from('project_risks').select('*').eq('project_id', req.params.id).order('created_at'),
      supabase.from('project_budget_items').select('*').eq('project_id', req.params.id).order('created_at'),
    ]);

    // Subtarefas
    const taskIds = (tasks.data || []).map(t => t.id);
    let subtasks = [];
    if (taskIds.length > 0) {
      const { data: subs } = await supabase.from('project_task_subtasks').select('*').in('task_id', taskIds).order('sort_order');
      subtasks = subs || [];
    }
    const tasksWithSubs = (tasks.data || []).map(t => ({
      ...t,
      subtasks: subtasks.filter(s => s.task_id === t.id),
    }));

    res.json({
      ...project,
      category_name: project.project_categories?.name || '',
      category_color: project.project_categories?.color || '',
      project_categories: undefined,
      phases: phases.data || [],
      tasks: tasksWithSubs,
      milestones: milestones.data || [],
      kpis: kpis.data || [],
      risks: risks.data || [],
      budget_items: budget.data || [],
    });
  } catch (e) { console.error('[Projects get]', e.message); res.status(500).json({ error: 'Erro ao buscar projeto' }); }
});

// ── CREATE ──
router.post('/', authorize('diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('projects').insert({
      name: d.name, year: d.year || new Date().getFullYear(), description: d.description || '',
      status: d.status || 'planejamento', responsible: d.responsible || '', area: d.area || '',
      date_start: d.date_start || null, date_end: d.date_end || null,
      budget_planned: d.budget_planned || 0, category_id: d.category_id || null,
      priority: d.priority || 'media', notes: d.notes || '', created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Projects create]', e.message); res.status(500).json({ error: 'Erro ao criar projeto' }); }
});

// ── UPDATE ──
router.put('/:id', authorize('diretor'), async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const d = req.body;
    const { data, error } = await supabase.from('projects').update({
      name: d.name, year: d.year, description: d.description || '', status: d.status,
      responsible: d.responsible || '', area: d.area || '',
      date_start: d.date_start || null, date_end: d.date_end || null,
      budget_planned: d.budget_planned || 0, budget_spent: d.budget_spent || 0,
      category_id: d.category_id || null, priority: d.priority || 'media', notes: d.notes || '',
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar projeto' }); }
});

// ── DELETE ──
router.delete('/:id', authorize('diretor'), async (req, res) => {
  try {
    await supabase.from('projects').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir projeto' }); }
});

// ══════════════════════════════════════════════
// PHASES
// ══════════════════════════════════════════════
router.post('/:id/phases', authorize('diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('project_phases').insert({
      project_id: req.params.id, name: d.name, phase_order: d.phase_order || 0,
      date_start: d.date_start || null, date_end: d.date_end || null,
      status: d.status || 'pendente', responsible: d.responsible || '', notes: d.notes || '',
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/phases/:phaseId', authorize('diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_phases').update(req.body).eq('id', req.params.phaseId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════════
router.post('/:id/tasks', authorize('diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('project_tasks').insert({
      project_id: req.params.id, milestone_id: d.milestone_id || null, name: d.name,
      responsible: d.responsible || '', area: d.area || '',
      start_date: d.start_date || null, deadline: d.deadline || null,
      status: d.status || 'pendente', priority: d.priority || 'media', description: d.description || '',
      created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/tasks/:taskId', authorize('diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('project_tasks').update({
      name: d.name, responsible: d.responsible || '', area: d.area || '',
      start_date: d.start_date || null, deadline: d.deadline || null,
      status: d.status, priority: d.priority || 'media', description: d.description || '',
    }).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/tasks/:taskId/status', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_tasks').update({ status: req.body.status }).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/tasks/:taskId', authorize('diretor'), async (req, res) => {
  try {
    await supabase.from('project_task_subtasks').delete().eq('task_id', req.params.taskId);
    await supabase.from('project_tasks').delete().eq('id', req.params.taskId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── SUBTASKS ──
router.post('/tasks/:taskId/subtasks', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_task_subtasks').insert({
      task_id: req.params.taskId, name: req.body.name, done: false,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/subtasks/:subId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_task_subtasks').update({ done: req.body.done }).eq('id', req.params.subId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/subtasks/:subId', authorize('diretor'), async (req, res) => {
  try {
    await supabase.from('project_task_subtasks').delete().eq('id', req.params.subId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── COMMENTS ──
router.post('/tasks/:taskId/comments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_task_comments').insert({
      task_id: req.params.taskId, author_id: req.user.userId, author_name: req.user.name, text: req.body.text,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// MILESTONES
// ══════════════════════════════════════════════
router.post('/:id/milestones', authorize('diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('project_milestones').insert({
      project_id: req.params.id, name: d.name, description: d.description || '',
      date_start: d.date_start || null, date_end: d.date_end || null, status: d.status || 'pendente',
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/milestones/:mId', authorize('diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_milestones').update(req.body).eq('id', req.params.mId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/milestones/:mId/status', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_milestones').update({ status: req.body.status }).eq('id', req.params.mId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// KPIs
// ══════════════════════════════════════════════
router.post('/:id/kpis', authorize('diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('project_kpis').insert({
      project_id: req.params.id, name: d.name, target_value: d.target_value || 0,
      current_value: d.current_value || 0, unit: d.unit || '%', instrument: d.instrument || '',
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/kpis/:kpiId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_kpis').update(req.body).eq('id', req.params.kpiId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/kpis/:kpiId', authorize('diretor'), async (req, res) => {
  try {
    await supabase.from('project_kpis').delete().eq('id', req.params.kpiId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// RISKS
// ══════════════════════════════════════════════
router.post('/:id/risks', authorize('diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('project_risks').insert({
      project_id: req.params.id, title: d.title, description: d.description || '',
      probability: d.probability || 3, impact: d.impact || 3,
      score: (d.probability || 3) * (d.impact || 3),
      mitigation: d.mitigation || '', owner_name: d.owner_name || '', status: d.status || 'identificado',
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/risks/:riskId', async (req, res) => {
  try {
    const d = req.body;
    if (d.probability && d.impact) d.score = d.probability * d.impact;
    const { data, error } = await supabase.from('project_risks').update(d).eq('id', req.params.riskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/risks/:riskId', authorize('diretor'), async (req, res) => {
  try {
    await supabase.from('project_risks').delete().eq('id', req.params.riskId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// BUDGET
// ══════════════════════════════════════════════
router.post('/:id/budget', authorize('diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('project_budget_items').insert({
      project_id: req.params.id, description: d.description, category: d.category || '',
      planned_amount: d.planned_amount || 0, actual_amount: d.actual_amount || 0,
      date: d.date || null, notes: d.notes || '',
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/budget/:itemId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_budget_items').update(req.body).eq('id', req.params.itemId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/budget/:itemId', authorize('diretor'), async (req, res) => {
  try {
    await supabase.from('project_budget_items').delete().eq('id', req.params.itemId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// RETROSPECTIVE
// ══════════════════════════════════════════════
router.get('/:id/retrospective', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_retrospectives').select('*').eq('project_id', req.params.id).maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/:id/retrospective', authorize('diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data: existing } = await supabase.from('project_retrospectives').select('id').eq('project_id', req.params.id).maybeSingle();
    if (existing) {
      const { data, error } = await supabase.from('project_retrospectives').update({
        what_went_well: d.what_went_well, what_to_improve: d.what_to_improve,
        action_items: d.action_items, overall_rating: d.overall_rating,
      }).eq('id', existing.id).select().single();
      if (error) throw error;
      res.json(data);
    } else {
      const { data, error } = await supabase.from('project_retrospectives').insert({
        project_id: req.params.id, what_went_well: d.what_went_well || '',
        what_to_improve: d.what_to_improve || '', action_items: d.action_items || '',
        overall_rating: d.overall_rating || 0, created_by: req.user.userId,
      }).select().single();
      if (error) throw error;
      res.json(data);
    }
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
