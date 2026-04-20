const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

router.use(authenticate);

// ── Helpers ──
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v) => UUID_RE.test(v);
const VALID_EVENT_STATUS = ['no-prazo', 'em-risco', 'atrasado', 'concluido', 'reabrir'];
const VALID_RECURRENCE = ['unico', 'semanal', 'mensal', 'anual'];
const VALID_TASK_STATUS = ['pendente', 'em-andamento', 'concluida', 'bloqueada'];
const VALID_TASK_PRIORITY = ['baixa', 'media', 'alta', 'urgente'];

// GET /api/events/categories
router.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_categories').select('*').eq('active', true).order('sort_order');
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar categorias' }); }
});

// GET /api/events/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const { data, error } = await supabase.from('v_events_dashboard').select('*').order('date');
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar dashboard' }); }
});

// ── SIMPLE TEMPLATES (DEVE vir antes de /:id) ──
router.get('/simple-templates', async (req, res) => {
  try {
    const { data, error } = await supabase.from('simple_event_task_templates').select('*').order('sort_order');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/events
router.get('/', async (req, res) => {
  try {
    const { status, category_id, year } = req.query;
    let query = supabase.from('events').select('id, name, date, status, category_id, description, location, responsible, budget_planned, budget_spent, expected_attendance, actual_attendance, recurrence, project_id, created_by, created_at, event_categories(name, color)').order('date');
    if (status) query = query.eq('status', status);
    if (category_id && isUUID(category_id)) query = query.eq('category_id', category_id);
    if (year && /^\d{4}$/.test(year)) query = query.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);

    const { data: events, error } = await query.limit(200);
    if (error) throw error;

    const ids = events.map(e => e.id);
    if (ids.length === 0) return res.json([]);

    const { data: allOccs } = await supabase.from('event_occurrences').select('event_id, date, status').in('event_id', ids).order('date');

    const occMap = {};
    const nextOccMap = {};
    (allOccs || []).forEach(o => {
      if (!occMap[o.event_id]) occMap[o.event_id] = [];
      occMap[o.event_id].push(o.date);
      if (o.status === 'pendente' && !nextOccMap[o.event_id]) nextOccMap[o.event_id] = o.date;
    });

    const result = events.map(e => ({
      ...e,
      category_name: e.event_categories?.name || null,
      category_color: e.event_categories?.color || null,
      occurrence_dates: occMap[e.id] || [],
      next_occurrence_date: nextOccMap[e.id] || null,
    }));

    res.json(result);
  } catch (e) { console.error('[Events GET]', e.message); res.status(500).json({ error: 'Erro ao buscar eventos' }); }
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });

    const { data: ev, error } = await supabase.from('events').select('*, event_categories(name, color)').eq('id', req.params.id).single();
    if (error || !ev) return res.status(404).json({ error: 'Evento não encontrado' });

    const [tasksRes, occsRes, meetingsRes] = await Promise.all([
      supabase.from('event_tasks').select('*').eq('event_id', req.params.id).order('sort_order').order('deadline'),
      supabase.from('event_occurrences').select('*').eq('event_id', req.params.id).order('date'),
      supabase.from('meetings').select('*').eq('event_id', req.params.id).order('date', { ascending: false }),
    ]);

    const taskIds = (tasksRes.data || []).map(t => t.id);
    const [subsRes, commentsRes, linksRes, depsRes] = taskIds.length > 0 ? await Promise.all([
      supabase.from('event_task_subtasks').select('*').in('task_id', taskIds).order('sort_order'),
      supabase.from('event_task_comments').select('*').in('task_id', taskIds).order('created_at', { ascending: false }),
      supabase.from('event_task_links').select('*').in('task_id', taskIds).order('created_at'),
      supabase.from('event_task_dependencies').select('*').in('task_id', taskIds),
    ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

    const tasks = (tasksRes.data || []).map(t => ({
      ...t,
      subtasks: (subsRes.data || []).filter(s => s.task_id === t.id),
      comments: (commentsRes.data || []).filter(c => c.task_id === t.id),
      links: (linksRes.data || []).filter(l => l.task_id === t.id),
      dependencies: (depsRes.data || []).filter(d => d.task_id === t.id).map(d => d.depends_on_id),
    }));

    const meetingIds = (meetingsRes.data || []).map(m => m.id);
    const { data: allPends } = meetingIds.length > 0
      ? await supabase.from('pendencies').select('*').in('meeting_id', meetingIds).order('created_at')
      : { data: [] };

    const meetings = (meetingsRes.data || []).map(m => ({
      ...m,
      pendencies: (allPends || []).filter(p => p.meeting_id === m.id),
    }));

    res.json({
      ...ev,
      category_name: ev.event_categories?.name || null,
      category_color: ev.event_categories?.color || null,
      tasks,
      occurrences: occsRes.data || [],
      meetings,
    });
  } catch (e) { console.error('[Events GET/:id]', e.message); res.status(500).json({ error: 'Erro ao buscar evento' }); }
});

// POST /api/events — criar evento (diretor+)
router.post('/', authorize('diretor', 'admin'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.name || !d.name.trim()) return res.status(400).json({ error: 'Nome do evento é obrigatório' });
    if (!d.date) return res.status(400).json({ error: 'Data do evento é obrigatória' });
    if (d.recurrence && !VALID_RECURRENCE.includes(d.recurrence)) return res.status(400).json({ error: 'Recorrência inválida' });

    const { data: ev, error } = await supabase.from('events').insert({
      name: d.name.trim(), date: d.date, category_id: d.category_id || null,
      description: d.description || '', location: d.location || '', responsible: d.responsible || '',
      budget_planned: Math.max(0, parseFloat(d.budget_planned) || 0),
      expected_attendance: d.expected_attendance ? Math.max(0, parseInt(d.expected_attendance)) : null,
      recurrence: d.recurrence || 'unico', notes: d.notes || '',
      project_id: d.project_id || null, created_by: req.user.userId,
    }).select().single();
    if (error) throw error;

    if (d.occurrence_dates && Array.isArray(d.occurrence_dates)) {
      const occs = d.occurrence_dates.filter(date => date).map((date, i) => ({ event_id: ev.id, date, sort_order: i }));
      if (occs.length > 0) await supabase.from('event_occurrences').insert(occs);
    }

    await supabase.from('audit_log').insert({ table_name: 'events', record_id: ev.id, event_id: ev.id, action: 'create', description: `Evento criado: ${d.name}`, changed_by: req.user.userId, changed_by_name: req.user.name }).catch(() => {});

    notificar({
      modulo: 'eventos',
      tipo: 'evento_criado',
      titulo: `Novo evento: ${ev.name}`,
      mensagem: `O evento "${ev.name}" foi criado para ${ev.date}${ev.location ? ` em ${ev.location}` : ''}.`,
      link: `/eventos/${ev.id}`,
      severidade: 'info',
      chaveDedup: `evento_criado_${ev.id}`,
    }).catch(() => {});

    res.json(ev);
  } catch (e) { console.error('[Events POST]', e.message); res.status(500).json({ error: 'Erro ao criar evento' }); }
});

// PUT /api/events/:id — atualizar evento (diretor+)
router.put('/:id', authorize('diretor', 'admin'), async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const d = req.body;
    if (d.name !== undefined && !d.name?.trim()) return res.status(400).json({ error: 'Nome não pode ser vazio' });

    const { data: oldEvent } = await supabase.from('events').select('date, name').eq('id', req.params.id).single();
    if (!oldEvent) return res.status(404).json({ error: 'Evento não encontrado' });

    const updatePayload = {};
    if (d.name !== undefined) updatePayload.name = d.name || oldEvent.name;
    if (d.date !== undefined) updatePayload.date = d.date;
    if (d.category_id !== undefined) updatePayload.category_id = d.category_id || null;
    if (d.description !== undefined) updatePayload.description = d.description || '';
    if (d.location !== undefined) updatePayload.location = d.location || '';
    if (d.responsible !== undefined) updatePayload.responsible = d.responsible || '';
    if (d.budget_planned !== undefined) updatePayload.budget_planned = Math.max(0, parseFloat(d.budget_planned) || 0);
    if (d.budget_spent !== undefined) updatePayload.budget_spent = Math.max(0, parseFloat(d.budget_spent) || 0);
    if (d.expected_attendance !== undefined) updatePayload.expected_attendance = d.expected_attendance ? Math.max(0, parseInt(d.expected_attendance)) : null;
    if (d.actual_attendance !== undefined) updatePayload.actual_attendance = d.actual_attendance ? Math.max(0, parseInt(d.actual_attendance)) : null;
    if (d.recurrence !== undefined) updatePayload.recurrence = VALID_RECURRENCE.includes(d.recurrence) ? d.recurrence : 'unico';
    if (d.notes !== undefined) updatePayload.notes = d.notes || '';
    if (d.lessons_learned !== undefined) updatePayload.lessons_learned = d.lessons_learned || '';
    if (d.project_id !== undefined) updatePayload.project_id = d.project_id || null;
    if (d.status !== undefined && VALID_EVENT_STATUS.includes(d.status)) updatePayload.status = d.status;

    const { data, error } = await supabase.from('events').update(updatePayload).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Se a data mudou, recalcular ciclo criativo
    if (oldEvent.date && d.date && oldEvent.date !== d.date) {
      const diffDays = Math.round((new Date(d.date) - new Date(oldEvent.date)) / 86400000);
      if (diffDays !== 0) {
        const { data: phases } = await supabase.from('event_cycle_phases').select('id, data_inicio_prevista, data_fim_prevista').eq('event_id', req.params.id);
        for (const phase of (phases || [])) {
          const updates = {};
          if (phase.data_inicio_prevista) { const nd = new Date(phase.data_inicio_prevista); nd.setDate(nd.getDate() + diffDays); updates.data_inicio_prevista = nd.toISOString().split('T')[0]; }
          if (phase.data_fim_prevista) { const nd = new Date(phase.data_fim_prevista); nd.setDate(nd.getDate() + diffDays); updates.data_fim_prevista = nd.toISOString().split('T')[0]; }
          if (Object.keys(updates).length > 0) await supabase.from('event_cycle_phases').update(updates).eq('id', phase.id);
        }
        const { data: tasks } = await supabase.from('cycle_phase_tasks').select('id, prazo').eq('event_id', req.params.id).not('prazo', 'is', null);
        for (const task of (tasks || [])) { const nd = new Date(task.prazo); nd.setDate(nd.getDate() + diffDays); await supabase.from('cycle_phase_tasks').update({ prazo: nd.toISOString().split('T')[0] }).eq('id', task.id); }
      }
    }

    await supabase.from('audit_log').insert({ table_name: 'events', record_id: req.params.id, event_id: req.params.id, action: 'update', description: `Evento "${oldEvent.name}" atualizado`, changed_by: req.user.userId, changed_by_name: req.user.name }).catch(() => {});
    res.json(data);
  } catch (e) { console.error('[Events PUT]', e.message); res.status(500).json({ error: 'Erro ao atualizar evento' }); }
});

// PATCH /api/events/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    let { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status obrigatório' });

    // Reabrir: reativar ciclo criativo e recalcular status
    if (status === 'reabrir') {
      await supabase.from('event_cycles').update({ status: 'ativo' }).eq('event_id', req.params.id).eq('status', 'encerrado');
      const { data: ev } = await supabase.from('events').select('date, recurrence').eq('id', req.params.id).single();
      if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
      if (ev.recurrence !== 'unico') {
        const { data: nextOcc } = await supabase.from('event_occurrences').select('date').eq('event_id', req.params.id).eq('status', 'pendente').order('date').limit(1);
        const refDate = nextOcc?.length > 0 ? new Date(nextOcc[0].date) : new Date(ev.date);
        const diffDays = Math.ceil((refDate - new Date()) / 86400000);
        status = diffDays < 0 ? 'atrasado' : diffDays <= 7 ? 'em-risco' : 'no-prazo';
      } else {
        const diffDays = Math.ceil((new Date(ev.date) - new Date()) / 86400000);
        status = diffDays < 0 ? 'atrasado' : diffDays <= 7 ? 'em-risco' : 'no-prazo';
      }
    }

    // Finalizar: desativar ciclo criativo (se existir)
    if (status === 'concluido') {
      await supabase.from('event_cycles').update({ status: 'encerrado' }).eq('event_id', req.params.id).eq('status', 'ativo');
    }

    const { data: oldEv } = await supabase.from('events').select('status, name').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('events').update({ status }).eq('id', req.params.id).select().single();
    if (error) throw error;
    if (oldEv) await supabase.from('audit_log').insert({ table_name: 'events', record_id: req.params.id, event_id: req.params.id, action: 'status_change', field_name: 'status', old_value: oldEv.status, new_value: status, description: `Evento "${oldEv.name}" ${oldEv.status} → ${status}`, changed_by: req.user.userId, changed_by_name: req.user.name }).catch(() => {});
    res.json(data);
  } catch (e) { console.error('[Events PATCH status]', e.message); res.status(500).json({ error: 'Erro ao atualizar status' }); }
});

// DELETE /api/events/:id — excluir evento (diretor+) com cascade
router.delete('/:id', authorize('diretor', 'admin'), async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const eid = req.params.id;

    // Cascade: limpar tabelas dependentes
    await Promise.all([
      supabase.from('event_task_attachments').delete().eq('event_id', eid),
      supabase.from('card_completions').delete().eq('event_id', eid),
      supabase.from('event_reports').delete().eq('event_id', eid),
      supabase.from('event_risks').delete().eq('event_id', eid),
      supabase.from('event_retrospectives').delete().eq('event_id', eid),
      supabase.from('audit_log').delete().eq('event_id', eid),
    ]).catch(() => {});

    // Tarefas do ciclo e subtarefas
    const { data: cycleTasks } = await supabase.from('cycle_phase_tasks').select('id').eq('event_id', eid);
    if (cycleTasks?.length > 0) {
      const ctIds = cycleTasks.map(t => t.id);
      await supabase.from('cycle_task_subtasks').delete().in('task_id', ctIds).catch(() => {});
      await supabase.from('cycle_phase_tasks').delete().eq('event_id', eid);
    }
    await supabase.from('event_cycle_phases').delete().eq('event_id', eid).catch(() => {});
    await supabase.from('event_cycles').delete().eq('event_id', eid).catch(() => {});

    // Tarefas do evento e subtarefas
    const { data: evTasks } = await supabase.from('event_tasks').select('id').eq('event_id', eid);
    if (evTasks?.length > 0) {
      const etIds = evTasks.map(t => t.id);
      await supabase.from('event_task_subtasks').delete().in('task_id', etIds).catch(() => {});
      await supabase.from('event_task_comments').delete().in('task_id', etIds).catch(() => {});
      await supabase.from('event_tasks').delete().eq('event_id', eid);
    }

    // Reunioes e pendencias
    const { data: meets } = await supabase.from('meetings').select('id').eq('event_id', eid);
    if (meets?.length > 0) {
      await supabase.from('pendencies').delete().in('meeting_id', meets.map(m => m.id)).catch(() => {});
      await supabase.from('meetings').delete().eq('event_id', eid);
    }

    await supabase.from('event_occurrences').delete().eq('event_id', eid).catch(() => {});
    await supabase.from('events').delete().eq('id', eid);

    res.json({ success: true });
  } catch (e) { console.error('[Events DELETE]', e.message); res.status(500).json({ error: 'Erro ao excluir evento' }); }
});

// Helper: recalcular status do evento
async function recalcEventStatus(eventId) {
  const { data: occs } = await supabase.from('event_occurrences').select('date, status').eq('event_id', eventId).eq('status', 'pendente').order('date').limit(1);
  if (!occs || occs.length === 0) {
    const { data: ev } = await supabase.from('events').select('recurrence').eq('id', eventId).single();
    if (ev && ev.recurrence !== 'unico') await supabase.from('events').update({ status: 'concluido' }).eq('id', eventId);
    return;
  }
  const diffDays = Math.ceil((new Date(occs[0].date) - new Date()) / 86400000);
  await supabase.from('events').update({ status: diffDays < 0 ? 'atrasado' : diffDays <= 7 ? 'em-risco' : 'no-prazo' }).eq('id', eventId);
}

// ── OCCURRENCES ──
router.patch('/:id/occurrences/:occId', async (req, res) => {
  try {
    if (!isUUID(req.params.occId)) return res.status(400).json({ error: 'ID inválido' });
    const d = req.body;
    const update = {};
    if (d.status !== undefined) update.status = d.status;
    if (d.notes !== undefined) update.notes = d.notes;
    if (d.lessons_learned !== undefined) update.lessons_learned = d.lessons_learned;
    if (d.attendance !== undefined) update.attendance = Math.max(0, parseInt(d.attendance) || 0);
    const { data, error } = await supabase.from('event_occurrences').update(update).eq('id', req.params.occId).eq('event_id', req.params.id).select().single();
    if (error) throw error;
    await recalcEventStatus(req.params.id);
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar ocorrência' }); }
});

// ── TASKS ──
router.post('/:id/tasks', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const d = req.body;
    if (!d.name || !d.name.trim()) return res.status(400).json({ error: 'Nome da tarefa é obrigatório' });
    const { data, error } = await supabase.from('event_tasks').insert({
      event_id: req.params.id, name: d.name.trim(), responsible: d.responsible || '',
      area: d.area || '', start_date: d.start_date || null, deadline: d.deadline || null,
      status: VALID_TASK_STATUS.includes(d.status) ? d.status : 'pendente',
      priority: VALID_TASK_PRIORITY.includes(d.priority) ? d.priority : 'media',
      is_milestone: d.is_milestone || false, description: d.description || '',
      created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    await supabase.from('audit_log').insert({ table_name: 'event_tasks', record_id: data.id, event_id: req.params.id, action: 'create', description: `Tarefa criada: ${d.name}`, changed_by: req.user.userId, changed_by_name: req.user.name }).catch(() => {});
    res.json(data);
  } catch (e) { console.error('[Events POST task]', e.message); res.status(500).json({ error: 'Erro ao criar tarefa' }); }
});

router.put('/tasks/:taskId', async (req, res) => {
  try {
    if (!isUUID(req.params.taskId)) return res.status(400).json({ error: 'ID inválido' });
    const d = req.body;
    const { data: old } = await supabase.from('event_tasks').select('name, event_id').eq('id', req.params.taskId).single();
    const { data, error } = await supabase.from('event_tasks').update({
      name: d.name, responsible: d.responsible || '', area: d.area || '',
      start_date: d.start_date || null, deadline: d.deadline || null,
      status: VALID_TASK_STATUS.includes(d.status) ? d.status : 'pendente',
      priority: VALID_TASK_PRIORITY.includes(d.priority) ? d.priority : 'media',
      is_milestone: d.is_milestone || false, description: d.description || '',
    }).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    if (old) await supabase.from('audit_log').insert({ table_name: 'event_tasks', record_id: data.id, event_id: old.event_id, action: 'update', description: `Tarefa "${old.name}" atualizada`, changed_by: req.user.userId, changed_by_name: req.user.name }).catch(() => {});
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar tarefa' }); }
});

router.patch('/tasks/:taskId/status', async (req, res) => {
  try {
    if (!isUUID(req.params.taskId)) return res.status(400).json({ error: 'ID inválido' });
    const { data: old } = await supabase.from('event_tasks').select('status, name, event_id').eq('id', req.params.taskId).single();
    const { data, error } = await supabase.from('event_tasks').update({ status: req.body.status }).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    if (old) await supabase.from('audit_log').insert({ table_name: 'event_tasks', record_id: data.id, event_id: old.event_id, action: 'status_change', field_name: 'status', old_value: old.status, new_value: req.body.status, description: `Tarefa "${old.name}" ${old.status} → ${req.body.status}`, changed_by: req.user.userId, changed_by_name: req.user.name }).catch(() => {});
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar status' }); }
});

router.delete('/tasks/:taskId', authorize('diretor', 'admin'), async (req, res) => {
  try {
    if (!isUUID(req.params.taskId)) return res.status(400).json({ error: 'ID inválido' });
    // Cascade subtasks, comments
    await supabase.from('event_task_subtasks').delete().eq('task_id', req.params.taskId).catch(() => {});
    await supabase.from('event_task_comments').delete().eq('task_id', req.params.taskId).catch(() => {});
    await supabase.from('event_tasks').delete().eq('id', req.params.taskId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir tarefa' }); }
});

// ── SUBTASKS ──
router.post('/tasks/:taskId/subtasks', async (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
    const { data, error } = await supabase.from('event_task_subtasks').insert({ task_id: req.params.taskId, name: req.body.name.trim() }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar subtarefa' }); }
});

router.patch('/subtasks/:subId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_task_subtasks').update({ done: req.body.done }).eq('id', req.params.subId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar subtarefa' }); }
});

router.delete('/subtasks/:subId', async (req, res) => {
  try {
    await supabase.from('event_task_subtasks').delete().eq('id', req.params.subId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir subtarefa' }); }
});

// ── COMMENTS ──
router.post('/tasks/:taskId/comments', async (req, res) => {
  try {
    if (!req.body.text?.trim()) return res.status(400).json({ error: 'Texto obrigatório' });
    const { data, error } = await supabase.from('event_task_comments').insert({
      task_id: req.params.taskId, author_id: req.user.userId,
      author_name: req.user.name || 'PMO', text: req.body.text.trim(),
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao adicionar comentário' }); }
});

// ── RISKS ──
router.get('/:id/risks', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_risks').select('*').eq('event_id', req.params.id).order('score', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar riscos' }); }
});

router.post('/:id/risks', async (req, res) => {
  try {
    const d = req.body;
    if (!d.title?.trim()) return res.status(400).json({ error: 'Título do risco é obrigatório' });
    const { data, error } = await supabase.from('event_risks').insert({
      event_id: req.params.id, title: d.title.trim(), description: d.description || '',
      category: d.category || 'other',
      probability: Math.max(1, Math.min(5, parseInt(d.probability) || 3)),
      impact: Math.max(1, Math.min(5, parseInt(d.impact) || 3)),
      mitigation: d.mitigation || '', owner_id: d.owner_id || null, owner_name: d.owner_name || '',
      target_date: d.target_date || null, status: 'aberto', created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    await supabase.from('audit_log').insert({ table_name: 'event_risks', record_id: data.id, event_id: req.params.id, action: 'create', description: `Risco criado: ${d.title}`, changed_by: req.user.userId, changed_by_name: req.user.name }).catch(() => {});
    res.json(data);
  } catch (e) { console.error('[Events POST risk]', e.message); res.status(500).json({ error: 'Erro ao criar risco' }); }
});

// PATCH risks — whitelist de campos (previne injection)
router.patch('/risks/:riskId', async (req, res) => {
  try {
    if (!isUUID(req.params.riskId)) return res.status(400).json({ error: 'ID inválido' });
    const d = req.body;
    const { data: old } = await supabase.from('event_risks').select('status, event_id').eq('id', req.params.riskId).single();
    const update = {};
    if (d.title !== undefined) update.title = d.title;
    if (d.description !== undefined) update.description = d.description;
    if (d.category !== undefined) update.category = d.category;
    if (d.probability !== undefined) update.probability = Math.max(1, Math.min(5, parseInt(d.probability) || 3));
    if (d.impact !== undefined) update.impact = Math.max(1, Math.min(5, parseInt(d.impact) || 3));
    if (d.mitigation !== undefined) update.mitigation = d.mitigation;
    if (d.owner_id !== undefined) update.owner_id = d.owner_id;
    if (d.owner_name !== undefined) update.owner_name = d.owner_name;
    if (d.target_date !== undefined) update.target_date = d.target_date;
    if (d.status !== undefined) update.status = d.status;

    const { data, error } = await supabase.from('event_risks').update(update).eq('id', req.params.riskId).select().single();
    if (error) throw error;
    if (old && d.status && old.status !== d.status) {
      await supabase.from('audit_log').insert({ table_name: 'event_risks', record_id: data.id, event_id: old.event_id, action: 'status_change', field_name: 'status', old_value: old.status, new_value: d.status, changed_by: req.user.userId, changed_by_name: req.user.name }).catch(() => {});
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar risco' }); }
});

router.delete('/risks/:riskId', authorize('diretor', 'admin'), async (req, res) => {
  try {
    if (!isUUID(req.params.riskId)) return res.status(400).json({ error: 'ID inválido' });
    await supabase.from('event_risks').delete().eq('id', req.params.riskId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir risco' }); }
});

// ── RETROSPECTIVE ──
router.get('/:id/retrospective', async (req, res) => {
  try {
    const { data } = await supabase.from('event_retrospectives').select('*').eq('event_id', req.params.id).maybeSingle();
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar retrospectiva' }); }
});

router.post('/:id/retrospective', async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('event_retrospectives').upsert({
      event_id: req.params.id, what_went_well: d.what_went_well || '',
      what_to_improve: d.what_to_improve || '', action_items: d.action_items || '',
      attendee_feedback: d.attendee_feedback || '', overall_rating: d.overall_rating ? Math.max(1, Math.min(5, parseInt(d.overall_rating))) : null,
      created_by: req.user.userId,
    }, { onConflict: 'event_id' }).select().single();
    if (error) throw error;
    await supabase.from('audit_log').insert({ table_name: 'event_retrospectives', record_id: data.id, event_id: req.params.id, action: 'create', description: 'Retrospectiva salva', changed_by: req.user.userId, changed_by_name: req.user.name }).catch(() => {});
    res.json(data);
  } catch (e) { console.error('[Events POST retro]', e.message); res.status(500).json({ error: 'Erro ao salvar retrospectiva' }); }
});

// ── AUDIT LOG ──
router.get('/:id/history', async (req, res) => {
  try {
    const { data, error } = await supabase.from('audit_log').select('*').eq('event_id', req.params.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar histórico' }); }
});

// ── ATTACHMENTS ──
const multer = require('multer');
const storage = require('../services/storageService');
const uploadMw = multer({ storage: multer.memoryStorage(), limits: { fileSize: storage.MAX_FILE_SIZE } });

router.post('/:eventId/tasks/:taskId/attachments', uploadMw.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não fornecido' });
    if (!isUUID(req.params.eventId) || !isUUID(req.params.taskId)) return res.status(400).json({ error: 'IDs inválidos' });

    const { eventId, taskId } = req.params;
    const { description, area, phase_name, task_type } = req.body;
    const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const { data: event } = await supabase.from('events').select('name').eq('id', eventId).single();
    const eventName = event?.name || eventId;
    const result = await storage.uploadFile(eventName, phase_name || '', fileName, req.file.buffer, req.file.mimetype);

    const attachment = {
      event_id: eventId, file_name: fileName, file_type: req.file.mimetype, file_size: req.file.size,
      supabase_path: result.provider === 'supabase' ? result.path : null,
      sharepoint_url: result.url || null, sharepoint_item_id: result.itemId || null,
      phase_name: phase_name || null, area: area || req.user.area || null,
      description: description || null, uploaded_by: req.user.userId, uploaded_by_name: req.user.name,
    };
    if (task_type === 'cycle') attachment.cycle_task_id = taskId;
    else attachment.event_task_id = taskId;

    const { data, error } = await supabase.from('event_task_attachments').insert(attachment).select().single();
    if (error) throw error;
    data.signed_url = await storage.getSignedUrl(result.path);
    res.json(data);
  } catch (e) { console.error('[Events Upload]', e.message); res.status(500).json({ error: e.message || 'Erro ao fazer upload' }); }
});

router.get('/:eventId/attachments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_task_attachments').select('*').eq('event_id', req.params.eventId).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar anexos' }); }
});

router.get('/:eventId/tasks/:taskId/attachments', async (req, res) => {
  try {
    if (!isUUID(req.params.taskId)) return res.status(400).json({ error: 'ID inválido' });
    const { taskId } = req.params;
    const { data, error } = await supabase.from('event_task_attachments').select('*').or(`event_task_id.eq.${taskId},cycle_task_id.eq.${taskId}`).order('created_at', { ascending: false });
    if (error) throw error;
    for (const a of data) {
      if (a.sharepoint_url) a.signed_url = a.sharepoint_url;
      else if (a.supabase_path) { try { a.signed_url = await storage.getSignedUrl(a.supabase_path); } catch {} }
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar anexos' }); }
});

router.delete('/attachments/:attachId', async (req, res) => {
  try {
    if (!isUUID(req.params.attachId)) return res.status(400).json({ error: 'ID inválido' });
    const { data: attach } = await supabase.from('event_task_attachments').select('supabase_path, sharepoint_item_id').eq('id', req.params.attachId).single();
    if (attach) await storage.deleteFile(attach.supabase_path, attach.sharepoint_item_id);
    const { error } = await supabase.from('event_task_attachments').delete().eq('id', req.params.attachId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error('[Events Delete attach]', e.message); res.status(500).json({ error: 'Erro ao excluir anexo' }); }
});

// ══════════════════════════════════════════════
// TEMPLATES DE TAREFAS SIMPLES (GET registrado acima de /:id)
// ══════════════════════════════════════════════

router.post('/simple-templates', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('simple_event_task_templates').insert({ titulo: req.body.titulo }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/simple-templates/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('simple_event_task_templates').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/simple-templates/:id/toggle', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data: current } = await supabase.from('simple_event_task_templates').select('ativo').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('simple_event_task_templates').update({ ativo: !current.ativo }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/events/:id/apply-simple-templates — aplicar templates ao evento
router.post('/:id/apply-simple-templates', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data: templates } = await supabase.from('simple_event_task_templates').select('*').eq('ativo', true).order('sort_order');
    let created = 0;
    for (const t of (templates || [])) {
      const { error } = await supabase.from('event_tasks').insert({ event_id: req.params.id, name: t.titulo, status: 'pendente', priority: 'media' });
      if (!error) created++;
    }
    res.json({ success: true, created });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
