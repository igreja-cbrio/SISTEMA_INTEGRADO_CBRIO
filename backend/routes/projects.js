const router = require('express').Router();
const { authenticate, authorize, authorizeModule } = require('../middleware/auth'); // varredura 2026-09: A06 escrita sem autorizacao — passa a gatear por modulo, nao so por role
const { supabase } = require('../utils/supabase');
const { enqueueSync } = require('../services/cerebroSync');

router.use(authenticate);

const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// varredura 2026-09: A06 - as rotas de "operacao" deste arquivo (status de tarefa,
// subtarefa, comentario, status de marco e os PATCH de kpi/risco/orcamento) eram
// AUTHN_ONLY: qualquer uma das 201 contas logadas (138 so-app) escrevia nelas com
// um curl. Regua = modulo `projetos` (routeKey 'projects' ja existe no
// ROUTE_MODULE_MAP), nivel 2 - o MESMO que a tela ja exige pra abrir
// (`canProjetos` = canAccessModule(['projetos','Projetos','Tarefas'], leitura>=2)
// em AuthContext.jsx:382 + ModuleGuard em App.tsx:781). Nivel 2 e nao 3 porque
// nenhuma dessas telas gateia botao por nivel: subir a regua da escrita acima da
// que abre a tela criaria 403 em botao visivel. O CRUD estrutural continua em
// `authorize('admin','diretor')`, como ja estava. Trava POR ROTA, nunca router.use.
const escritaProjetos = authorizeModule('projects', 2);

// varredura 2026-09: A06 mass-assignment - os PATCH abaixo gravavam `req.body` cru,
// entao qualquer coluna da tabela (inclusive project_id, created_by e o proprio id)
// era escrevivel pelo cliente. As listas saem dos INSERT correspondentes DESTE
// arquivo, que sao o contrato real do formulario.
const CAMPOS_FASE = ['name', 'phase_order', 'date_start', 'date_end', 'status', 'responsible', 'notes'];
const CAMPOS_MARCO = ['name', 'description', 'date_start', 'date_end', 'status'];
const CAMPOS_KPI = ['name', 'target_value', 'current_value', 'unit', 'instrument'];
const CAMPOS_RISCO = ['title', 'description', 'probability', 'impact', 'score', 'mitigation', 'owner_name', 'status'];
const CAMPOS_ORCAMENTO = ['description', 'category', 'planned_amount', 'actual_amount', 'date', 'notes'];

// varredura 2026-09: A06 whitelist de escrita - so o que esta na lista atravessa.
// Campo ausente no corpo NAO e tocado (patch parcial continua parcial).
function somenteCampos(corpo, permitidos) {
  const out = {};
  for (const k of permitidos) {
    if (corpo && Object.prototype.hasOwnProperty.call(corpo, k)) out[k] = corpo[k];
  }
  return out;
}

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
    // Pool pg não conecta no serverless do Vercel → REST + agregação em JS.
    // Paginado pra não cair no cap de 1000 linhas do PostgREST.
    let tasks = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('project_tasks')
        .select('responsible')
        .not('status', 'in', '("concluida","concluido")')
        .range(from, from + 999);
      if (error) throw error;
      tasks = tasks.concat(data || []);
      if (!data || data.length < 1000) break;
    }
    const counts = {};
    for (const t of tasks) {
      const r = t.responsible || '';
      counts[r] = (counts[r] || 0) + 1;
    }
    const rows = Object.entries(counts)
      .map(([responsible, active]) => ({ responsible, active }))
      .sort((a, b) => b.active - a.active);
    res.json(rows);
  } catch (e) { console.error('[Projects workload]', e.message); res.status(500).json({ error: 'Erro ao calcular workload' }); }
});

// ── LIST ──
router.get('/', async (req, res) => {
  try {
    const { year, status, area } = req.query;
    let q = supabase.from('projects').select('*, project_categories(name, color)').is('deleted_at', null);
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

    // Subtarefas + comentários (a UI lê t.comments — sem este fetch os
    // comentários gravados nunca apareciam ao reabrir o projeto)
    const taskIds = (tasks.data || []).map(t => t.id);
    let subtasks = [];
    let comments = [];
    if (taskIds.length > 0) {
      const [subsRes, comsRes] = await Promise.all([
        supabase.from('project_task_subtasks').select('*').in('task_id', taskIds).order('sort_order'),
        supabase.from('project_task_comments').select('*').in('task_id', taskIds).order('created_at'),
      ]);
      subtasks = subsRes.data || [];
      comments = comsRes.data || [];
    }
    const tasksWithSubs = (tasks.data || []).map(t => ({
      ...t,
      subtasks: subtasks.filter(s => s.task_id === t.id),
      comments: comments.filter(c => c.task_id === t.id),
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
router.post('/', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('projects').insert({
      name: d.name, year: d.year || new Date().getFullYear(), description: d.description || '',
      status: d.status || 'planejamento',
      responsible: d.responsible || '',           // snapshot TEXT (UI legacy)
      responsible_id: d.responsible_id || null,   // UUID FK (canonico)
      leader: d.leader || '',
      leader_id: d.leader_id || null,
      area: d.area || '',
      date_start: d.date_start || null, date_end: d.date_end || null,
      budget_planned: d.budget_planned || 0, category_id: d.category_id || null,
      priority: d.priority || 'media', notes: d.notes || '', created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    enqueueSync('projeto', data.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) { console.error('[Projects create]', e.message); res.status(500).json({ error: 'Erro ao criar projeto' }); }
});

// ── UPDATE ──
router.put('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const d = req.body;
    const { data, error } = await supabase.from('projects').update({
      name: d.name, year: d.year, description: d.description || '', status: d.status,
      responsible: d.responsible || '',
      responsible_id: d.responsible_id || null,
      leader: d.leader || '',
      leader_id: d.leader_id || null,
      area: d.area || '',
      date_start: d.date_start || null, date_end: d.date_end || null,
      budget_planned: d.budget_planned || 0, budget_spent: d.budget_spent || 0,
      category_id: d.category_id || null, priority: d.priority || 'media', notes: d.notes || '',
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    enqueueSync('projeto', req.params.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar projeto' }); }
});

// ── DELETE · soft-delete (preserva histórico de projeto) ──
router.delete('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'projects',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir projeto' }); }
});

// ══════════════════════════════════════════════
// PHASES
// ══════════════════════════════════════════════
router.post('/:id/phases', authorize('admin', 'diretor'), async (req, res) => {
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

router.patch('/phases/:phaseId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const update = somenteCampos(req.body, CAMPOS_FASE); // varredura 2026-09: A06 mass-assignment - `.update(req.body)` cru deixava o cliente escrever qualquer coluna
    const { data, error } = await supabase.from('project_phases').update(update).eq('id', req.params.phaseId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════════
router.post('/:id/tasks', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('project_tasks').insert({
      project_id: req.params.id, milestone_id: d.milestone_id || null, name: d.name,
      responsible: d.responsible || '',
      responsible_id: d.responsible_id || null,
      area: d.area || '',
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
    const { data, error } = await supabase.from('project_tasks').update({
      name: d.name,
      responsible: d.responsible || '',
      responsible_id: d.responsible_id || null,
      area: d.area || '',
      start_date: d.start_date || null, deadline: d.deadline || null,
      status: d.status, priority: d.priority || 'media', description: d.description || '',
    }).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/tasks/:taskId/status', escritaProjetos, async (req, res) => { // varredura 2026-09: A06 escrita sem autorizacao - mudar status de tarefa exige o modulo projetos
  try {
    const { data, error } = await supabase.from('project_tasks').update({ status: req.body.status }).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/tasks/:taskId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('project_task_subtasks').delete().eq('task_id', req.params.taskId);
    await supabase.from('project_tasks').delete().eq('id', req.params.taskId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── SUBTASKS ──
router.post('/tasks/:taskId/subtasks', escritaProjetos, async (req, res) => { // varredura 2026-09: A06 escrita sem autorizacao - criar subtarefa exige o modulo projetos
  try {
    const { data, error } = await supabase.from('project_task_subtasks').insert({
      task_id: req.params.taskId, name: req.body.name, done: false,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/subtasks/:subId', escritaProjetos, async (req, res) => { // varredura 2026-09: A06 escrita sem autorizacao - marcar subtarefa exige o modulo projetos
  try {
    const { data, error } = await supabase.from('project_task_subtasks').update({ done: req.body.done }).eq('id', req.params.subId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/subtasks/:subId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('project_task_subtasks').delete().eq('id', req.params.subId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── COMMENTS ──
router.post('/tasks/:taskId/comments', escritaProjetos, async (req, res) => { // varredura 2026-09: A06 escrita sem autorizacao - comentar exige o modulo projetos
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
router.post('/:id/milestones', authorize('admin', 'diretor'), async (req, res) => {
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

router.put('/milestones/:mId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const update = somenteCampos(req.body, CAMPOS_MARCO); // varredura 2026-09: A06 mass-assignment - whitelist derivada do INSERT de marcos
    const { data, error } = await supabase.from('project_milestones').update(update).eq('id', req.params.mId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/milestones/:mId/status', escritaProjetos, async (req, res) => { // varredura 2026-09: A06 escrita sem autorizacao - mudar status de marco exige o modulo projetos
  try {
    const { data, error } = await supabase.from('project_milestones').update({ status: req.body.status }).eq('id', req.params.mId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// KPIs
// ══════════════════════════════════════════════
router.post('/:id/kpis', authorize('admin', 'diretor'), async (req, res) => {
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

router.patch('/kpis/:kpiId', escritaProjetos, async (req, res) => { // varredura 2026-09: A06 escrita sem autorizacao + mass-assignment
  try {
    const update = somenteCampos(req.body, CAMPOS_KPI); // varredura 2026-09: A06 mass-assignment - whitelist derivada do INSERT de kpis
    const { data, error } = await supabase.from('project_kpis').update(update).eq('id', req.params.kpiId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/kpis/:kpiId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('project_kpis').delete().eq('id', req.params.kpiId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// RISKS
// ══════════════════════════════════════════════
router.post('/:id/risks', authorize('admin', 'diretor'), async (req, res) => {
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

router.patch('/risks/:riskId', escritaProjetos, async (req, res) => { // varredura 2026-09: A06 escrita sem autorizacao + mass-assignment
  try {
    const update = somenteCampos(req.body, CAMPOS_RISCO); // varredura 2026-09: A06 mass-assignment - whitelist derivada do INSERT de riscos
    // varredura 2026-09: A06 o `score` e DERIVADO aqui, nunca aceito cru do cliente - score solto faria o risco mentir na ordenacao da lista
    if (update.probability && update.impact) update.score = update.probability * update.impact;
    else delete update.score;
    const { data, error } = await supabase.from('project_risks').update(update).eq('id', req.params.riskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/risks/:riskId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('project_risks').delete().eq('id', req.params.riskId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// BUDGET
// ══════════════════════════════════════════════
router.post('/:id/budget', authorize('admin', 'diretor'), async (req, res) => {
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

router.patch('/budget/:itemId', escritaProjetos, async (req, res) => { // varredura 2026-09: A06 escrita sem autorizacao + mass-assignment
  try {
    const update = somenteCampos(req.body, CAMPOS_ORCAMENTO); // varredura 2026-09: A06 mass-assignment - whitelist derivada do INSERT de orcamento
    const { data, error } = await supabase.from('project_budget_items').update(update).eq('id', req.params.itemId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/budget/:itemId', authorize('admin', 'diretor'), async (req, res) => {
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

router.post('/:id/retrospective', authorize('admin', 'diretor'), async (req, res) => {
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
