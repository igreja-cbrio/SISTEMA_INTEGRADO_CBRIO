const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// GET /api/occurrences/:occId
router.get('/:occId', async (req, res) => {
  try {
    const { data: occ, error } = await supabase.from('event_occurrences').select('*').eq('id', req.params.occId).single();
    if (error || !occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });

    const [tasksRes, meetingsRes] = await Promise.all([
      supabase.from('occurrence_tasks').select('*').eq('occurrence_id', req.params.occId).order('created_at'),
      supabase.from('occurrence_meetings').select('*').eq('occurrence_id', req.params.occId).order('date', { ascending: false }),
    ]);

    const meetingIds = (meetingsRes.data || []).map(m => m.id);
    const { data: allPends } = meetingIds.length > 0
      ? await supabase.from('occurrence_meeting_pendencies').select('*').in('meeting_id', meetingIds).order('created_at')
      : { data: [] };

    const meetings = (meetingsRes.data || []).map(m => ({
      ...m,
      pendencies: (allPends || []).filter(p => p.meeting_id === m.id),
    }));

    res.json({ ...occ, tasks: tasksRes.data || [], meetings });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar ocorrência' }); }
});

// ── TASKS ──
router.post('/:occId/tasks', async (req, res) => {
  try {
    const { data: occ } = await supabase.from('event_occurrences').select('event_id').eq('id', req.params.occId).single();
    if (!occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });
    const d = req.body;
    const { data, error } = await supabase.from('occurrence_tasks').insert({
      occurrence_id: req.params.occId, event_id: occ.event_id, name: d.name,
      responsible: d.responsible || null, area: d.area || null, deadline: d.deadline || null,
      status: d.status || 'pendente', priority: d.priority || 'media',
      description: d.description || null, created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar tarefa' }); }
});

router.patch('/tasks/:taskId/status', async (req, res) => {
  try {
    const { data, error } = await supabase.from('occurrence_tasks').update({ status: req.body.status }).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar tarefa' }); }
});

router.delete('/tasks/:taskId', async (req, res) => {
  try {
    await supabase.from('occurrence_tasks').delete().eq('id', req.params.taskId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir tarefa' }); }
});

// ── MEETINGS ──
router.post('/:occId/meetings', async (req, res) => {
  try {
    const { data: occ } = await supabase.from('event_occurrences').select('event_id').eq('id', req.params.occId).single();
    if (!occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });
    const d = req.body;
    const { data: meeting, error } = await supabase.from('occurrence_meetings').insert({
      occurrence_id: req.params.occId, event_id: occ.event_id,
      title: d.title || 'Reunião', date: d.date,
      participants: d.participants || [], decisions: d.decisions || '',
      notes: d.notes || '', created_by: req.user.userId,
    }).select().single();
    if (error) throw error;

    if (d.pendencies && Array.isArray(d.pendencies)) {
      const pends = d.pendencies.filter(p => p.description).map(p => ({
        meeting_id: meeting.id, occurrence_id: req.params.occId,
        description: p.description, responsible: p.responsible || null, deadline: p.deadline || null,
      }));
      if (pends.length > 0) await supabase.from('occurrence_meeting_pendencies').insert(pends);
    }
    res.json(meeting);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar reunião' }); }
});

router.patch('/pendencies/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('occurrence_meeting_pendencies').update({
      done: req.body.done, done_at: req.body.done ? new Date().toISOString() : null,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/meetings/:id', async (req, res) => {
  try {
    await supabase.from('occurrence_meetings').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
