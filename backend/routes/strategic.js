const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ── CATEGORIES ──
router.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabase.from('strategic_categories').select('*').order('sort_order');
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar categorias' }); }
});

// ── LIST ──
router.get('/', async (req, res) => {
  try {
    const { status, category_id } = req.query;
    let q = supabase.from('strategic_plans').select('*, strategic_categories(name, color)');
    if (status) q = q.eq('status', status);
    if (category_id) q = q.eq('category_id', category_id);
    q = q.order('priority').order('date_start');
    const { data, error } = await q;
    if (error) throw error;
    res.json((data || []).map(p => ({
      ...p,
      category_name: p.strategic_categories?.name || '',
      category_color: p.strategic_categories?.color || '',
      strategic_categories: undefined,
    })));
  } catch (e) { console.error('[Strategic list]', e.message); res.status(500).json({ error: 'Erro ao buscar planos' }); }
});

// ── GET by ID ──
router.get('/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { data: plan, error } = await supabase.from('strategic_plans').select('*, strategic_categories(name, color)').eq('id', req.params.id).single();
    if (error) throw error;

    const [tasks, milestones] = await Promise.all([
      supabase.from('strategic_tasks').select('*').eq('plan_id', req.params.id).order('sort_order').order('deadline'),
      supabase.from('strategic_milestones').select('*').eq('plan_id', req.params.id).order('sort_order'),
    ]);

    const taskIds = (tasks.data || []).map(t => t.id);
    let subtasks = [];
    if (taskIds.length > 0) {
      const { data: subs } = await supabase.from('strategic_task_subtasks').select('*').in('task_id', taskIds).order('sort_order');
      subtasks = subs || [];
    }
    const tasksWithSubs = (tasks.data || []).map(t => ({
      ...t,
      subtasks: subtasks.filter(s => s.task_id === t.id),
    }));

    res.json({
      ...plan,
      category_name: plan.strategic_categories?.name || '',
      category_color: plan.strategic_categories?.color || '',
      strategic_categories: undefined,
      tasks: tasksWithSubs,
      milestones: milestones.data || [],
    });
  } catch (e) { console.error('[Strategic get]', e.message); res.status(500).json({ error: 'Erro ao buscar plano' }); }
});

// ── CREATE ──
router.post('/', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('strategic_plans').insert({
      name: d.name, description: d.description || '', status: d.status || 'no-prazo',
      responsible: d.responsible || '', area: d.area || '',
      date_start: d.date_start || null, date_end: d.date_end || null,
      budget_planned: d.budget_planned || 0, category_id: d.category_id || null,
      priority: d.priority || 'media', notes: d.notes || '', created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Strategic create]', e.message); res.status(500).json({ error: 'Erro ao criar plano' }); }
});

// ── UPDATE ──
router.put('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const d = req.body;
    const { data, error } = await supabase.from('strategic_plans').update({
      name: d.name, description: d.description || '', status: d.status,
      responsible: d.responsible || '', area: d.area || '',
      date_start: d.date_start || null, date_end: d.date_end || null,
      budget_planned: d.budget_planned || 0, budget_spent: d.budget_spent || 0,
      category_id: d.category_id || null, priority: d.priority || 'media', notes: d.notes || '',
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar plano' }); }
});

// ── DELETE ──
router.delete('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('strategic_plans').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir plano' }); }
});

// ══════════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════════
router.post('/:id/tasks', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('strategic_tasks').insert({
      plan_id: req.params.id, milestone_id: d.milestone_id || null, name: d.name,
      responsible: d.responsible || '', area: d.area || '',
      start_date: d.start_date || null, deadline: d.deadline || null,
      status: d.status || 'pendente', priority: d.priority || 'media', description: d.description || '',
      created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/tasks/:taskId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('strategic_tasks').update({
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
    const { data, error } = await supabase.from('strategic_tasks').update({ status: req.body.status }).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/tasks/:taskId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('strategic_task_subtasks').delete().eq('task_id', req.params.taskId);
    await supabase.from('strategic_tasks').delete().eq('id', req.params.taskId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── SUBTASKS ──
router.post('/tasks/:taskId/subtasks', async (req, res) => {
  try {
    const { data, error } = await supabase.from('strategic_task_subtasks').insert({
      task_id: req.params.taskId, name: req.body.name, done: false,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/subtasks/:subId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('strategic_task_subtasks').update({ done: req.body.done }).eq('id', req.params.subId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/subtasks/:subId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('strategic_task_subtasks').delete().eq('id', req.params.subId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── COMMENTS ──
router.post('/tasks/:taskId/comments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('strategic_task_comments').insert({
      task_id: req.params.taskId, author_id: req.user.userId, author_name: req.user.name, text: req.body.text,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// MILESTONES
// ══════════════════════════════════════════════
router.post('/:id/milestones', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('strategic_milestones').insert({
      plan_id: req.params.id, name: d.name, description: d.description || '',
      date_start: d.date_start || null, date_end: d.date_end || null, status: d.status || 'pendente',
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/milestones/:mId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('strategic_milestones').update(req.body).eq('id', req.params.mId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/milestones/:mId/status', async (req, res) => {
  try {
    const { data, error } = await supabase.from('strategic_milestones').update({ status: req.body.status }).eq('id', req.params.mId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
