const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../utils/db');
const { sanitizeObj, isValidUUID } = require('../utils/sanitize');

router.use(authenticate);

// GET /api/expansion/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM v_expansion_dashboard ORDER BY sort_order, deadline');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/expansion/milestones — com tasks e subtasks aninhados
router.get('/milestones', async (req, res) => {
  try {
    const milestones = await db.query('SELECT * FROM expansion_milestones ORDER BY sort_order, deadline');
    const result = await Promise.all(milestones.rows.map(async mi => {
      const tasks = await db.query('SELECT * FROM expansion_tasks WHERE milestone_id = $1 ORDER BY sort_order', [mi.id]);
      const tasksWithSubs = await Promise.all(tasks.rows.map(async t => {
        const subs = await db.query('SELECT * FROM expansion_subtasks WHERE task_id = $1 ORDER BY sort_order', [t.id]);
        return { ...t, subtasks: subs.rows };
      }));
      return { ...mi, tasks: tasksWithSubs };
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar marcos' }); }
});

// POST /api/expansion/milestones
router.post('/milestones', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `INSERT INTO expansion_milestones (name, description, deadline, phase, budget_planned, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [d.name, d.description||'', d.deadline||null, d.phase||'', d.budget_planned||0, req.user.userId]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar marco' }); }
});

// PUT /api/expansion/milestones/:id
router.put('/milestones/:id', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `UPDATE expansion_milestones SET name=$1, description=$2, deadline=$3, phase=$4,
       budget_planned=$5, budget_spent=$6 WHERE id=$7 RETURNING *`,
      [d.name, d.description||'', d.deadline||null, d.phase||'', d.budget_planned||0, d.budget_spent||0, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// DELETE /api/expansion/milestones/:id
router.delete('/milestones/:id', authorize('diretor'), async (req, res) => {
  try {
    await db.query('DELETE FROM expansion_milestones WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── TASKS ──
router.post('/milestones/:miId/tasks', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `INSERT INTO expansion_tasks (milestone_id, name, responsible, area, start_date, deadline, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.miId, d.name, d.responsible||'', d.area||'', d.start_date||null, d.deadline||null, d.description||'', req.user.userId]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/tasks/:id', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `UPDATE expansion_tasks SET name=$1, responsible=$2, area=$3, start_date=$4, deadline=$5,
       status=$6, description=$7 WHERE id=$8 RETURNING *`,
      [d.name, d.responsible||'', d.area||'', d.start_date||null, d.deadline||null, d.status||'pendente', d.description||'', req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/tasks/:id', authorize('diretor'), async (req, res) => {
  try {
    await db.query('DELETE FROM expansion_tasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── SUBTASKS ──
router.post('/tasks/:taskId/subtasks', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      'INSERT INTO expansion_subtasks (task_id, name) VALUES ($1,$2) RETURNING *',
      [req.params.taskId, d.name]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// PATCH /api/expansion/subtasks/:id — atualizar %
router.patch('/subtasks/:id', authorize('diretor'), async (req, res) => {
  try {
    const pct = Math.min(100, Math.max(0, parseInt(req.body.pct) || 0));
    const r = await db.query('UPDATE expansion_subtasks SET pct=$1 WHERE id=$2 RETURNING *', [pct, req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/subtasks/:id', authorize('diretor'), async (req, res) => {
  try {
    await db.query('DELETE FROM expansion_subtasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
