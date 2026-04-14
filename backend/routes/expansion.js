const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// GET /api/expansion/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const { data, error } = await supabase.from('v_expansion_dashboard').select('*').order('sort_order').order('date_end');
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Expansion dashboard]', e.message); res.status(500).json({ error: 'Erro ao buscar dashboard' }); }
});

// GET /api/expansion/milestones — com tasks e subtasks aninhados
router.get('/milestones', async (req, res) => {
  try {
    const { data: milestones, error } = await supabase.from('expansion_milestones').select('*').order('sort_order').order('date_end');
    if (error) throw error;

    const miIds = (milestones || []).map(m => m.id);
    if (miIds.length === 0) return res.json([]);

    const { data: tasks } = await supabase.from('expansion_tasks').select('*').in('milestone_id', miIds).order('sort_order');
    const taskIds = (tasks || []).map(t => t.id);

    let subtasks = [];
    if (taskIds.length > 0) {
      const { data: subs } = await supabase.from('expansion_subtasks').select('*').in('task_id', taskIds).order('sort_order');
      subtasks = subs || [];
    }

    const result = (milestones || []).map(mi => ({
      ...mi,
      tasks: (tasks || []).filter(t => t.milestone_id === mi.id).map(t => ({
        ...t,
        subtasks: subtasks.filter(s => s.task_id === t.id),
      })),
    }));
    res.json(result);
  } catch (e) { console.error('[Expansion milestones]', e.message); res.status(500).json({ error: 'Erro ao buscar marcos' }); }
});

// POST /api/expansion/milestones
router.post('/milestones', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('expansion_milestones').insert({
      name: d.name, description: d.description || '', date_end: d.deadline || d.date_end || null,
      phase: d.phase || '', budget_planned: d.budget_planned || 0, created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar marco' }); }
});

// PUT /api/expansion/milestones/:id
router.put('/milestones/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('expansion_milestones').update({
      name: d.name, description: d.description || '', date_end: d.deadline || d.date_end || null,
      phase: d.phase || '', budget_planned: d.budget_planned || 0, budget_spent: d.budget_spent || 0,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// DELETE /api/expansion/milestones/:id
router.delete('/milestones/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('expansion_milestones').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── TASKS ──
router.post('/milestones/:miId/tasks', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('expansion_tasks').insert({
      milestone_id: req.params.miId, name: d.name, responsible: d.responsible || '',
      area: d.area || '', start_date: d.start_date || null, deadline: d.deadline || null,
      description: d.description || '', created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/tasks/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('expansion_tasks').update({
      name: d.name, responsible: d.responsible || '', area: d.area || '',
      start_date: d.start_date || null, deadline: d.deadline || null,
      status: d.status || 'pendente', description: d.description || '',
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/tasks/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('expansion_tasks').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── SUBTASKS ──
router.post('/tasks/:taskId/subtasks', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('expansion_subtasks').insert({
      task_id: req.params.taskId, name: req.body.name,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/subtasks/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const pct = Math.min(100, Math.max(0, parseInt(req.body.pct) || 0));
    const { data, error } = await supabase.from('expansion_subtasks').update({ pct }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/subtasks/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('expansion_subtasks').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── DEPENDENCIES ──
// GET /api/expansion/milestones/:id/dependents — marcos que dependem deste
router.get('/milestones/:id/dependents', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('expansion_milestone_dependencies')
      .select('milestone_id, expansion_milestones!expansion_milestone_dependencies_milestone_id_fkey(id, name, date_end, status)')
      .eq('depends_on_id', req.params.id);
    if (error) throw error;
    const dependents = (data || []).map(d => d.expansion_milestones).filter(Boolean);
    res.json(dependents);
  } catch (e) {
    // Fallback: query simples sem join
    try {
      const { data: depIds } = await supabase.from('expansion_milestone_dependencies').select('milestone_id').eq('depends_on_id', req.params.id);
      if (!depIds || depIds.length === 0) return res.json([]);
      const ids = depIds.map(d => d.milestone_id);
      const { data: milestones } = await supabase.from('expansion_milestones').select('id, name, date_end, status').in('id', ids);
      res.json(milestones || []);
    } catch (e2) { res.status(500).json({ error: 'Erro ao buscar dependentes' }); }
  }
});

// GET /api/expansion/milestones/:id/dependencies — marcos dos quais este depende
router.get('/milestones/:id/dependencies', async (req, res) => {
  try {
    const { data: depIds } = await supabase.from('expansion_milestone_dependencies').select('depends_on_id').eq('milestone_id', req.params.id);
    if (!depIds || depIds.length === 0) return res.json([]);
    const ids = depIds.map(d => d.depends_on_id);
    const { data: milestones } = await supabase.from('expansion_milestones').select('id, name, date_end, status').in('id', ids);
    res.json(milestones || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar dependências' }); }
});

module.exports = router;
