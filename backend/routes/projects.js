const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../utils/db');
const { sanitizeObj, isValidUUID, logActivity } = require('../utils/sanitize');

router.use(authenticate);

// GET /api/projects/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM v_projects_dashboard ORDER BY year DESC, name');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar dashboard de projetos' }); }
});

// GET /api/projects
router.get('/', async (req, res) => {
  try {
    const { year, status, area } = req.query;
    let q = 'SELECT p.*, pc.name AS category_name, pc.color AS category_color FROM projects p LEFT JOIN project_categories pc ON p.category_id = pc.id WHERE 1=1';
    const params = [];
    if (year) { params.push(year); q += ` AND p.year = $${params.length}`; }
    if (status) { params.push(status); q += ` AND p.status = $${params.length}`; }
    if (area) { params.push(area); q += ` AND p.area = $${params.length}`; }
    q += ' ORDER BY p.year DESC, p.priority, p.name';
    const r = await db.query(q, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar projetos' }); }
});

// GET /api/projects/:id — com objectives, tasks, milestones, events vinculados
router.get('/:id', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const p = await db.query('SELECT p.*, pc.name AS category_name, pc.color AS category_color FROM projects p LEFT JOIN project_categories pc ON p.category_id = pc.id WHERE p.id = $1', [req.params.id]);
    if (!p.rows[0]) return res.status(404).json({ error: 'Projeto não encontrado' });

    const [objectives, tasks, milestones, events, meetings] = await Promise.all([
      db.query('SELECT * FROM project_objectives WHERE project_id = $1 ORDER BY sort_order', [req.params.id]),
      db.query('SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY sort_order, deadline', [req.params.id]),
      db.query('SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY date', [req.params.id]),
      db.query('SELECT id, name, date, status FROM events WHERE project_id = $1 ORDER BY date', [req.params.id]),
      db.query('SELECT * FROM meetings WHERE project_id = $1 ORDER BY date DESC', [req.params.id]),
    ]);

    // Subtarefas de cada task
    const tasksWithSubs = await Promise.all(tasks.rows.map(async t => {
      const subs = await db.query('SELECT * FROM project_task_subtasks WHERE task_id = $1 ORDER BY sort_order', [t.id]);
      return { ...t, subtasks: subs.rows };
    }));

    // Pendências de cada reunião
    const meetingsWithPends = await Promise.all(meetings.rows.map(async m => {
      const pends = await db.query('SELECT * FROM pendencies WHERE meeting_id = $1 ORDER BY created_at', [m.id]);
      return { ...m, pendencies: pends.rows };
    }));

    res.json({
      ...p.rows[0],
      objectives: objectives.rows,
      tasks: tasksWithSubs,
      milestones: milestones.rows,
      events: events.rows,
      meetings: meetingsWithPends,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar projeto' }); }
});

// POST /api/projects — só diretor
router.post('/', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `INSERT INTO projects (name, year, description, status, responsible, area, date_start, date_end,
        budget_planned, category_id, priority, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [d.name, d.year||new Date().getFullYear(), d.description||'', d.status||'planejamento',
       d.responsible||'', d.area||'', d.date_start||d.start_date||null, d.date_end||d.end_date||null,
       d.budget_planned||0, d.category_id||null, d.priority||'media', d.notes||'', req.user.userId]
    );
    await logActivity(db, req.user.userId, 'create', 'projects', r.rows[0].id, d.name, null, r.rows[0]);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar projeto' }); }
});

// PUT /api/projects/:id
router.put('/:id', authorize('diretor'), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `UPDATE projects SET name=$1, year=$2, description=$3, status=$4, responsible=$5, area=$6,
        date_start=$7, date_end=$8, budget_planned=$9, budget_spent=$10, category_id=$11,
        priority=$12, notes=$13 WHERE id=$14 RETURNING *`,
      [d.name, d.year, d.description||'', d.status, d.responsible||'', d.area||'',
       d.date_start||d.start_date||null, d.date_end||d.end_date||null, d.budget_planned||0, d.budget_spent||0,
       d.category_id||null, d.priority||'media', d.notes||'', req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar projeto' }); }
});

// DELETE /api/projects/:id
router.delete('/:id', authorize('diretor'), async (req, res) => {
  try {
    await db.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir projeto' }); }
});

// ── OBJECTIVES ──
router.post('/:id/objectives', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `INSERT INTO project_objectives (project_id, name, description, target_value, unit, deadline)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, d.name, d.description||'', d.target_value||null, d.unit||'%', d.deadline||null]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/objectives/:objId', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `UPDATE project_objectives SET name=$1, description=$2, target_value=$3, current_value=$4,
       unit=$5, deadline=$6, status=$7 WHERE id=$8 RETURNING *`,
      [d.name, d.description||'', d.target_value, d.current_value||0, d.unit||'%', d.deadline||null, d.status||'pendente', req.params.objId]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── PROJECT TASKS ──
router.post('/:id/tasks', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `INSERT INTO project_tasks (project_id, objective_id, name, responsible, area, start_date, deadline, status, priority, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, d.objective_id||null, d.name, d.responsible||'', d.area||'',
       d.start_date||null, d.deadline||null, d.status||'pendente', d.priority||'media', d.description||'']
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/tasks/:taskId', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `UPDATE project_tasks SET name=$1, responsible=$2, area=$3, start_date=$4, deadline=$5,
       status=$6, priority=$7, description=$8, pct=$9 WHERE id=$10 RETURNING *`,
      [d.name, d.responsible||'', d.area||'', d.start_date||null, d.deadline||null,
       d.status||'pendente', d.priority||'media', d.description||'', d.pct||0, req.params.taskId]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/tasks/:taskId/status', authorize('diretor'), async (req, res) => {
  try {
    const r = await db.query('UPDATE project_tasks SET status=$1 WHERE id=$2 RETURNING *', [req.body.status, req.params.taskId]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/tasks/:taskId', authorize('diretor'), async (req, res) => {
  try {
    await db.query('DELETE FROM project_tasks WHERE id = $1', [req.params.taskId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── PROJECT MILESTONES ──
router.post('/:id/milestones', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      'INSERT INTO project_milestones (project_id, name, date, description) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, d.name, d.date, d.description||'']
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/milestones/:mId', authorize('diretor'), async (req, res) => {
  try {
    const r = await db.query('UPDATE project_milestones SET done=$1 WHERE id=$2 RETURNING *', [req.body.done, req.params.mId]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── WORKLOAD VIEW ──
router.get('/views/workload', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM v_workload_by_responsible ORDER BY active DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── PENDENCIES VIEW ──
router.get('/views/pendencies-by-area', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM v_pendencies_by_area');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
