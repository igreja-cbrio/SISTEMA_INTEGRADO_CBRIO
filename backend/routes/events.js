const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../utils/db');
const { sanitizeObj, isValidUUID, logActivity } = require('../utils/sanitize');

router.use(authenticate);

// GET /api/events/categories
router.get('/categories', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM event_categories WHERE active = true ORDER BY sort_order');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar categorias' }); }
});

// GET /api/events/dashboard — view otimizada
router.get('/dashboard', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM v_events_dashboard ORDER BY date ASC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar dashboard' }); }
});

// GET /api/events
router.get('/', async (req, res) => {
  try {
    const { status, category_id, year } = req.query;
    let q = `
      SELECT e.*,
        ec.name  AS category_name,
        ec.color AS category_color,
        ec.id    AS category_id,
        COALESCE(
          ARRAY(SELECT eo.date::text FROM event_occurrences eo
                WHERE eo.event_id = e.id ORDER BY eo.date),
          ARRAY[]::text[]
        ) AS occurrence_dates
      FROM events e
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      WHERE 1=1`;
    const params = [];
    if (status)      { params.push(status);      q += ` AND e.status = $${params.length}`; }
    if (category_id) { params.push(category_id); q += ` AND e.category_id = $${params.length}`; }
    if (year)        { params.push(year);         q += ` AND EXTRACT(YEAR FROM e.date) = $${params.length}`; }
    q += ' ORDER BY e.date ASC';
    const r = await db.query(q, params);
    res.json(r.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar eventos' }); }
});

// GET /api/events/:id — com tarefas, ocorrências, reuniões
router.get('/:id', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const ev = await db.query(
      `SELECT e.*, ec.name AS category_name, ec.color AS category_color
       FROM events e LEFT JOIN event_categories ec ON e.category_id = ec.id WHERE e.id = $1`, [req.params.id]);
    if (!ev.rows[0]) return res.status(404).json({ error: 'Evento não encontrado' });

    const [tasks, occurrences, meetings] = await Promise.all([
      db.query('SELECT * FROM event_tasks WHERE event_id = $1 ORDER BY sort_order, deadline', [req.params.id]),
      db.query('SELECT * FROM event_occurrences WHERE event_id = $1 ORDER BY date', [req.params.id]),
      db.query('SELECT * FROM meetings WHERE event_id = $1 ORDER BY date DESC', [req.params.id]),
    ]);

    // Subtarefas e comentários de cada tarefa
    const tasksWithDetails = await Promise.all(tasks.rows.map(async t => {
      const [subs, comments, links, deps] = await Promise.all([
        db.query('SELECT * FROM event_task_subtasks WHERE task_id = $1 ORDER BY sort_order', [t.id]),
        db.query('SELECT * FROM event_task_comments WHERE task_id = $1 ORDER BY created_at DESC', [t.id]),
        db.query('SELECT * FROM event_task_links WHERE task_id = $1 ORDER BY created_at', [t.id]),
        db.query('SELECT depends_on_id FROM event_task_dependencies WHERE task_id = $1', [t.id]),
      ]);
      return { ...t, subtasks: subs.rows, comments: comments.rows, links: links.rows, dependencies: deps.rows.map(d => d.depends_on_id) };
    }));

    // Pendências de cada reunião
    const meetingsWithPends = await Promise.all(meetings.rows.map(async m => {
      const pends = await db.query('SELECT * FROM pendencies WHERE meeting_id = $1 ORDER BY created_at', [m.id]);
      return { ...m, pendencies: pends.rows };
    }));

    res.json({ ...ev.rows[0], tasks: tasksWithDetails, occurrences: occurrences.rows, meetings: meetingsWithPends });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar evento' }); }
});

// POST /api/events — só diretor
router.post('/', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `INSERT INTO events (name, date, category_id, description, location, responsible,
        budget_planned, expected_attendance, recurrence, notes, project_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [d.name, d.date, d.category_id||null, d.description||'', d.location||'', d.responsible||'',
       d.budget_planned||0, d.expected_attendance||null, d.recurrence||'unico', d.notes||'',
       d.project_id||null, req.user.userId]
    );

    // Criar ocorrências se recorrente
    if (d.occurrence_dates && Array.isArray(d.occurrence_dates)) {
      for (let i = 0; i < d.occurrence_dates.length; i++) {
        await db.query(
          'INSERT INTO event_occurrences (event_id, date, sort_order) VALUES ($1,$2,$3)',
          [r.rows[0].id, d.occurrence_dates[i], i]
        );
      }
    }

    await logActivity(db, req.user.userId, 'create', 'events', r.rows[0].id, d.name, null, r.rows[0]);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar evento' }); }
});

// PUT /api/events/:id — só diretor
router.put('/:id', authorize('diretor'), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `UPDATE events SET name=$1, date=$2, category_id=$3, description=$4, location=$5,
        responsible=$6, budget_planned=$7, budget_spent=$8, expected_attendance=$9,
        actual_attendance=$10, recurrence=$11, notes=$12, lessons_learned=$13,
        project_id=$14, status=$15
       WHERE id=$16 RETURNING *`,
      [d.name, d.date, d.category_id||null, d.description||'', d.location||'',
       d.responsible||'', d.budget_planned||0, d.budget_spent||0, d.expected_attendance||null,
       d.actual_attendance||null, d.recurrence||'unico', d.notes||'', d.lessons_learned||'',
       d.project_id||null, d.status||'no-prazo', req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao atualizar evento' }); }
});

// DELETE /api/events/:id — só diretor
router.delete('/:id', authorize('diretor'), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    await db.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir evento' }); }
});

// ── OCCURRENCES ──

// PATCH /api/events/:id/occurrences/:occId — atualizar status/notas de ocorrência
router.patch('/:id/occurrences/:occId', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `UPDATE event_occurrences SET status=COALESCE($1,status), notes=COALESCE($2,notes),
       lessons_learned=COALESCE($3,lessons_learned), attendance=COALESCE($4,attendance)
       WHERE id=$5 AND event_id=$6 RETURNING *`,
      [d.status, d.notes, d.lessons_learned, d.attendance, req.params.occId, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Ocorrência não encontrada' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar ocorrência' }); }
});

// ── TASKS ──

// POST /api/events/:id/tasks
router.post('/:id/tasks', authorize('diretor'), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `INSERT INTO event_tasks (event_id, name, responsible, area, start_date, deadline, status, priority, is_milestone, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.params.id, d.name, d.responsible||'', d.area||'', d.start_date||null, d.deadline||null,
       d.status||'pendente', d.priority||'media', d.is_milestone||false, d.description||'', req.user.userId]
    );
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar tarefa' }); }
});

// PUT /api/events/tasks/:taskId
router.put('/tasks/:taskId', authorize('diretor'), async (req, res) => {
  try {
    if (!isValidUUID(req.params.taskId)) return res.status(400).json({ error: 'ID inválido' });
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `UPDATE event_tasks SET name=$1, responsible=$2, area=$3, start_date=$4, deadline=$5,
       status=$6, priority=$7, is_milestone=$8, description=$9 WHERE id=$10 RETURNING *`,
      [d.name, d.responsible||'', d.area||'', d.start_date||null, d.deadline||null,
       d.status||'pendente', d.priority||'media', d.is_milestone||false, d.description||'', req.params.taskId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Tarefa não encontrada' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar tarefa' }); }
});

// PATCH /api/events/tasks/:taskId/status — mudança rápida de status (kanban drag)
router.patch('/tasks/:taskId/status', authorize('diretor'), async (req, res) => {
  try {
    const { status } = req.body;
    const r = await db.query('UPDATE event_tasks SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.taskId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Tarefa não encontrada' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// DELETE /api/events/tasks/:taskId
router.delete('/tasks/:taskId', authorize('diretor'), async (req, res) => {
  try {
    await db.query('DELETE FROM event_tasks WHERE id = $1', [req.params.taskId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir tarefa' }); }
});

// ── SUBTASKS ──
router.post('/tasks/:taskId/subtasks', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      'INSERT INTO event_task_subtasks (task_id, name) VALUES ($1,$2) RETURNING *',
      [req.params.taskId, d.name]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/subtasks/:subId', authorize('diretor'), async (req, res) => {
  try {
    const r = await db.query('UPDATE event_task_subtasks SET done=$1 WHERE id=$2 RETURNING *', [req.body.done, req.params.subId]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/subtasks/:subId', authorize('diretor'), async (req, res) => {
  try {
    await db.query('DELETE FROM event_task_subtasks WHERE id = $1', [req.params.subId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── COMMENTS ──
router.post('/tasks/:taskId/comments', authenticate, async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      'INSERT INTO event_task_comments (task_id, author_id, author_name, text) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.taskId, req.user.userId, req.user.name, d.text]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
