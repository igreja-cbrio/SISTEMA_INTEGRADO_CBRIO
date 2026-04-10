const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../utils/db');
const { sanitizeObj, isValidUUID } = require('../utils/sanitize');

router.use(authenticate);

// GET /api/meetings?eventId=x&projectId=y
router.get('/', async (req, res) => {
  try {
    const { eventId, projectId } = req.query;
    let q = 'SELECT * FROM meetings WHERE 1=1';
    const params = [];
    if (eventId) { params.push(eventId); q += ` AND event_id = $${params.length}`; }
    if (projectId) { params.push(projectId); q += ` AND project_id = $${params.length}`; }
    q += ' ORDER BY date DESC';
    const meetings = await db.query(q, params);
    const result = await Promise.all(meetings.rows.map(async m => {
      const pends = await db.query('SELECT * FROM pendencies WHERE meeting_id = $1 ORDER BY created_at', [m.id]);
      return { ...m, pendencies: pends.rows };
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar reuniões' }); }
});

// POST /api/meetings
router.post('/', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `INSERT INTO meetings (event_id, occurrence_id, project_id, title, date, occurrence_date, participants, decisions, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [d.event_id||null, d.occurrence_id||null, d.project_id||null, d.title||'Reunião',
       d.date, d.occurrence_date||null,
       Array.isArray(d.participants) ? `{${d.participants.map(p => String(p).replace(/[{},]/g, '')).join(',')}}` : null,
       d.decisions||'', d.notes||'', req.user.userId]
    );

    // Criar pendências se enviadas
    if (d.pendencies && Array.isArray(d.pendencies)) {
      for (const p of d.pendencies) {
        await db.query(
          `INSERT INTO pendencies (event_id, meeting_id, project_id, description, responsible, area, deadline)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [d.event_id||null, r.rows[0].id, d.project_id||null, p.description, p.responsible||'', p.area||'', p.deadline||null]
        );
      }
    }
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar reunião' }); }
});

// PUT /api/meetings/:id
router.put('/:id', authorize('diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const r = await db.query(
      `UPDATE meetings SET title=$1, date=$2, participants=$3, decisions=$4, notes=$5
       WHERE id=$6 RETURNING *`,
      [d.title, d.date, Array.isArray(d.participants) ? `{${d.participants.map(p => String(p).replace(/[{},]/g, '')).join(',')}}` : null,
       d.decisions||'', d.notes||'', req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// DELETE /api/meetings/:id
router.delete('/:id', authorize('diretor'), async (req, res) => {
  try {
    await db.query('DELETE FROM meetings WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── PENDENCIES ──
router.patch('/pendencies/:id', authorize('diretor'), async (req, res) => {
  try {
    const done = req.body.done;
    const r = await db.query(
      'UPDATE pendencies SET done=$1, done_at=$2 WHERE id=$3 RETURNING *',
      [done, done ? new Date() : null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/pendencies/:id', authorize('diretor'), async (req, res) => {
  try {
    await db.query('DELETE FROM pendencies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
