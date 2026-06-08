const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { sanitizeObj } = require('../utils/sanitize');

router.use(authenticate);

// participants é coluna de array no Postgres. Via REST passamos o array JS direto
// (o PostgREST serializa). Mantém a limpeza histórica de chars de delimitador.
const normParticipants = (p) =>
  Array.isArray(p) ? p.map(x => String(x).replace(/[{},]/g, '')) : null;

// GET /api/meetings?eventId=x&projectId=y
router.get('/', async (req, res) => {
  try {
    const { eventId, projectId } = req.query;
    let q = supabase.from('meetings').select('*').order('date', { ascending: false });
    if (eventId) q = q.eq('event_id', eventId);
    if (projectId) q = q.eq('project_id', projectId);
    const { data: meetings, error } = await q;
    if (error) throw error;
    const result = await Promise.all((meetings || []).map(async m => {
      const { data: pends } = await supabase
        .from('pendencies')
        .select('*')
        .eq('meeting_id', m.id)
        .order('created_at', { ascending: true });
      return { ...m, pendencies: pends || [] };
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar reuniões' }); }
});

// POST /api/meetings
router.post('/', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const { data: meeting, error } = await supabase
      .from('meetings')
      .insert({
        event_id: d.event_id || null,
        occurrence_id: d.occurrence_id || null,
        project_id: d.project_id || null,
        title: d.title || 'Reunião',
        date: d.date,
        occurrence_date: d.occurrence_date || null,
        participants: normParticipants(d.participants),
        decisions: d.decisions || '',
        notes: d.notes || '',
        created_by: req.user.userId,
      })
      .select()
      .single();
    if (error) throw error;

    // Criar pendências se enviadas
    if (d.pendencies && Array.isArray(d.pendencies) && d.pendencies.length) {
      const rows = d.pendencies.map(p => ({
        event_id: d.event_id || null,
        meeting_id: meeting.id,
        project_id: d.project_id || null,
        description: p.description,
        responsible: p.responsible || '',
        area: p.area || '',
        deadline: p.deadline || null,
      }));
      const { error: pErr } = await supabase.from('pendencies').insert(rows);
      if (pErr) throw pErr;
    }
    res.json(meeting);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar reunião' }); }
});

// PUT /api/meetings/:id
router.put('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = sanitizeObj(req.body);
    const { data, error } = await supabase
      .from('meetings')
      .update({
        title: d.title,
        date: d.date,
        participants: normParticipants(d.participants),
        decisions: d.decisions || '',
        notes: d.notes || '',
      })
      .eq('id', req.params.id)
      .select();
    if (error) throw error;
    res.json(data?.[0] || null);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// DELETE /api/meetings/:id
router.delete('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('meetings').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── PENDENCIES ──
router.patch('/pendencies/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const done = req.body.done;
    const { data, error } = await supabase
      .from('pendencies')
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq('id', req.params.id)
      .select();
    if (error) throw error;
    res.json(data?.[0] || null);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/pendencies/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('pendencies').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
