const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

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

// GET /api/events
router.get('/', async (req, res) => {
  try {
    const { status, category_id, year } = req.query;
    let query = supabase.from('events').select('*, event_categories(name, color)').order('date');
    if (status) query = query.eq('status', status);
    if (category_id) query = query.eq('category_id', category_id);
    if (year) query = query.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);

    const { data: events, error } = await query;
    if (error) throw error;

    // Buscar ocorrências para cada evento
    const ids = events.map(e => e.id);
    const { data: allOccs } = await supabase.from('event_occurrences').select('event_id, date, status').in('event_id', ids.length > 0 ? ids : ['_']).order('date');

    const occMap = {};
    const nextOccMap = {};
    (allOccs || []).forEach(o => {
      if (!occMap[o.event_id]) occMap[o.event_id] = [];
      occMap[o.event_id].push(o.date);
      // Próxima ocorrência pendente
      if (o.status === 'pendente' && !nextOccMap[o.event_id]) {
        nextOccMap[o.event_id] = o.date;
      }
    });

    const result = events.map(e => ({
      ...e,
      category_name: e.event_categories?.name || null,
      category_color: e.event_categories?.color || null,
      occurrence_dates: occMap[e.id] || [],
      next_occurrence_date: nextOccMap[e.id] || null,
    }));

    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar eventos' }); }
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  try {
    const { data: ev, error } = await supabase.from('events').select('*, event_categories(name, color)').eq('id', req.params.id).single();
    if (error || !ev) return res.status(404).json({ error: 'Evento não encontrado' });

    const [tasksRes, occsRes, meetingsRes] = await Promise.all([
      supabase.from('event_tasks').select('*').eq('event_id', req.params.id).order('sort_order').order('deadline'),
      supabase.from('event_occurrences').select('*').eq('event_id', req.params.id).order('date'),
      supabase.from('meetings').select('*').eq('event_id', req.params.id).order('date', { ascending: false }),
    ]);

    // Subtarefas, comentários, links, dependências
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

    // Pendências das reuniões
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
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar evento' }); }
});

// POST /api/events
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const { data: ev, error } = await supabase.from('events').insert({
      name: d.name, date: d.date, category_id: d.category_id || null,
      description: d.description || '', location: d.location || '', responsible: d.responsible || '',
      budget_planned: d.budget_planned || 0, expected_attendance: d.expected_attendance || null,
      recurrence: d.recurrence || 'unico', notes: d.notes || '',
      project_id: d.project_id || null, created_by: req.user.userId,
    }).select().single();
    if (error) throw error;

    if (d.occurrence_dates && Array.isArray(d.occurrence_dates)) {
      const occs = d.occurrence_dates.map((date, i) => ({ event_id: ev.id, date, sort_order: i }));
      await supabase.from('event_occurrences').insert(occs);
    }

    res.json(ev);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar evento' }); }
});

// PUT /api/events/:id
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;

    // Buscar data antiga para comparar
    const { data: oldEvent } = await supabase.from('events').select('date').eq('id', req.params.id).single();

    const { data, error } = await supabase.from('events').update({
      name: d.name, date: d.date, category_id: d.category_id || null,
      description: d.description || '', location: d.location || '', responsible: d.responsible || '',
      budget_planned: d.budget_planned || 0, budget_spent: d.budget_spent || 0,
      expected_attendance: d.expected_attendance || null, actual_attendance: d.actual_attendance || null,
      recurrence: d.recurrence || 'unico', notes: d.notes || '', lessons_learned: d.lessons_learned || '',
      project_id: d.project_id || null, status: d.status || 'no-prazo',
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Evento não encontrado' });

    // Se a data mudou, recalcular todas as datas do ciclo criativo
    if (oldEvent?.date && d.date && oldEvent.date !== d.date) {
      const diffMs = new Date(d.date) - new Date(oldEvent.date);
      const diffDays = Math.round(diffMs / 86400000);
      if (diffDays !== 0) {
        console.log(`[EVENTS] Data do evento ${req.params.id} mudou ${diffDays} dias. Recalculando ciclo...`);

        // Recalcular fases
        const { data: phases } = await supabase.from('event_cycle_phases')
          .select('id, data_inicio_prevista, data_fim_prevista')
          .eq('event_id', req.params.id);
        for (const phase of (phases || [])) {
          const updates = {};
          if (phase.data_inicio_prevista) {
            const newStart = new Date(phase.data_inicio_prevista);
            newStart.setDate(newStart.getDate() + diffDays);
            updates.data_inicio_prevista = newStart.toISOString().split('T')[0];
          }
          if (phase.data_fim_prevista) {
            const newEnd = new Date(phase.data_fim_prevista);
            newEnd.setDate(newEnd.getDate() + diffDays);
            updates.data_fim_prevista = newEnd.toISOString().split('T')[0];
          }
          if (Object.keys(updates).length > 0) {
            await supabase.from('event_cycle_phases').update(updates).eq('id', phase.id);
          }
        }

        // Recalcular prazo das tarefas
        const { data: tasks } = await supabase.from('cycle_phase_tasks')
          .select('id, prazo')
          .eq('event_id', req.params.id)
          .not('prazo', 'is', null);
        for (const task of (tasks || [])) {
          const newPrazo = new Date(task.prazo);
          newPrazo.setDate(newPrazo.getDate() + diffDays);
          await supabase.from('cycle_phase_tasks')
            .update({ prazo: newPrazo.toISOString().split('T')[0] })
            .eq('id', task.id);
        }

        console.log(`[EVENTS] Recalculado: ${phases?.length || 0} fases, ${tasks?.length || 0} tarefas`);
      }
    }

    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao atualizar evento' }); }
});

// PATCH /api/events/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    let { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status obrigatório' });

    if (status === 'reabrir') {
      const { data: ev } = await supabase.from('events').select('date, recurrence').eq('id', req.params.id).single();
      if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });

      // Se recorrente, usar próxima ocorrência pendente
      if (ev.recurrence !== 'unico') {
        const { data: nextOcc } = await supabase.from('event_occurrences')
          .select('date').eq('event_id', req.params.id).eq('status', 'pendente').order('date').limit(1);
        const refDate = nextOcc?.length > 0 ? new Date(nextOcc[0].date) : new Date(ev.date);
        const diffDays = Math.ceil((refDate - new Date()) / 86400000);
        status = diffDays < 0 ? 'atrasado' : diffDays <= 7 ? 'em-risco' : 'no-prazo';
      } else {
        const diffDays = Math.ceil((new Date(ev.date) - new Date()) / 86400000);
        status = diffDays < 0 ? 'atrasado' : diffDays <= 7 ? 'em-risco' : 'no-prazo';
      }
    }

    const { data: oldEv } = await supabase.from('events').select('status, name').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('events').update({ status }).eq('id', req.params.id).select().single();
    if (error) throw error;
    if (oldEv) await supabase.from('audit_log').insert({ table_name: 'events', record_id: req.params.id, event_id: req.params.id, action: 'status_change', field_name: 'status', old_value: oldEv.status, new_value: status, description: `Evento "${oldEv.name}" ${oldEv.status} → ${status}`, changed_by: req.user.userId, changed_by_name: req.user.name });
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao atualizar status' }); }
});

// DELETE /api/events/:id
router.delete('/:id', async (req, res) => {
  try {
    await supabase.from('events').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir evento' }); }
});

// Helper: recalcular status do evento baseado na próxima ocorrência pendente
async function recalcEventStatus(eventId) {
  const { data: occs } = await supabase.from('event_occurrences')
    .select('date, status')
    .eq('event_id', eventId)
    .eq('status', 'pendente')
    .order('date')
    .limit(1);

  if (!occs || occs.length === 0) {
    // Todas as ocorrências concluídas — evento concluído
    const { data: ev } = await supabase.from('events').select('recurrence').eq('id', eventId).single();
    if (ev && ev.recurrence !== 'unico') {
      await supabase.from('events').update({ status: 'concluido' }).eq('id', eventId);
    }
    return;
  }

  const nextDate = new Date(occs[0].date);
  const diffDays = Math.ceil((nextDate - new Date()) / 86400000);
  const newStatus = diffDays < 0 ? 'atrasado' : diffDays <= 7 ? 'em-risco' : 'no-prazo';
  await supabase.from('events').update({ status: newStatus }).eq('id', eventId);
}

// ── OCCURRENCES ──
router.patch('/:id/occurrences/:occId', async (req, res) => {
  try {
    const d = req.body;
    const update = {};
    if (d.status !== undefined) update.status = d.status;
    if (d.notes !== undefined) update.notes = d.notes;
    if (d.lessons_learned !== undefined) update.lessons_learned = d.lessons_learned;
    if (d.attendance !== undefined) update.attendance = d.attendance;
    const { data, error } = await supabase.from('event_occurrences').update(update).eq('id', req.params.occId).eq('event_id', req.params.id).select().single();
    if (error) throw error;
    // Recalcular status do evento pai baseado na próxima ocorrência pendente
    await recalcEventStatus(req.params.id);
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar ocorrência' }); }
});

// ── TASKS ──
router.post('/:id/tasks', async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('event_tasks').insert({
      event_id: req.params.id, name: d.name, responsible: d.responsible || '',
      area: d.area || '', start_date: d.start_date || null, deadline: d.deadline || null,
      status: d.status || 'pendente', priority: d.priority || 'media',
      is_milestone: d.is_milestone || false, description: d.description || '',
      created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    await supabase.from('audit_log').insert({ table_name: 'event_tasks', record_id: data.id, event_id: req.params.id, action: 'create', description: `Tarefa criada: ${d.name}`, changed_by: req.user.userId, changed_by_name: req.user.name });
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar tarefa' }); }
});

router.put('/tasks/:taskId', async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('event_tasks').update({
      name: d.name, responsible: d.responsible || '', area: d.area || '',
      start_date: d.start_date || null, deadline: d.deadline || null,
      status: d.status || 'pendente', priority: d.priority || 'media',
      is_milestone: d.is_milestone || false, description: d.description || '',
    }).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar tarefa' }); }
});

router.patch('/tasks/:taskId/status', async (req, res) => {
  try {
    const { data: old } = await supabase.from('event_tasks').select('status, name, event_id').eq('id', req.params.taskId).single();
    const { data, error } = await supabase.from('event_tasks').update({ status: req.body.status }).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    if (old) await supabase.from('audit_log').insert({ table_name: 'event_tasks', record_id: data.id, event_id: old.event_id, action: 'status_change', field_name: 'status', old_value: old.status, new_value: req.body.status, description: `Tarefa "${old.name}" ${old.status} → ${req.body.status}`, changed_by: req.user.userId, changed_by_name: req.user.name });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/tasks/:taskId', async (req, res) => {
  try {
    await supabase.from('event_tasks').delete().eq('id', req.params.taskId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao excluir tarefa' }); }
});

// ── SUBTASKS ──
router.post('/tasks/:taskId/subtasks', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_task_subtasks').insert({ task_id: req.params.taskId, name: req.body.name }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.patch('/subtasks/:subId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_task_subtasks').update({ done: req.body.done }).eq('id', req.params.subId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/subtasks/:subId', async (req, res) => {
  try {
    await supabase.from('event_task_subtasks').delete().eq('id', req.params.subId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── COMMENTS ──
router.post('/tasks/:taskId/comments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_task_comments').insert({
      task_id: req.params.taskId, author_id: req.user.userId,
      author_name: req.user.name || 'PMO', text: req.body.text,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
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
    const { data, error } = await supabase.from('event_risks').insert({
      event_id: req.params.id, title: d.title, description: d.description || '',
      category: d.category || 'other', probability: d.probability || 3, impact: d.impact || 3,
      mitigation: d.mitigation || '', owner_id: d.owner_id || null, owner_name: d.owner_name || '',
      target_date: d.target_date || null, status: 'aberto', created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    // Audit
    await supabase.from('audit_log').insert({ table_name: 'event_risks', record_id: data.id, event_id: req.params.id, action: 'create', description: `Risco criado: ${d.title}`, changed_by: req.user.userId, changed_by_name: req.user.name });
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar risco' }); }
});

router.patch('/risks/:riskId', async (req, res) => {
  try {
    const d = req.body;
    const { data: old } = await supabase.from('event_risks').select('status').eq('id', req.params.riskId).single();
    const { data, error } = await supabase.from('event_risks').update(d).eq('id', req.params.riskId).select().single();
    if (error) throw error;
    if (old && old.status !== d.status) {
      await supabase.from('audit_log').insert({ table_name: 'event_risks', record_id: data.id, event_id: data.event_id, action: 'status_change', field_name: 'status', old_value: old.status, new_value: d.status, changed_by: req.user.userId, changed_by_name: req.user.name });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar risco' }); }
});

router.delete('/risks/:riskId', async (req, res) => {
  try {
    await supabase.from('event_risks').delete().eq('id', req.params.riskId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// ── RETROSPECTIVE ──
router.get('/:id/retrospective', async (req, res) => {
  try {
    const { data } = await supabase.from('event_retrospectives').select('*').eq('event_id', req.params.id).maybeSingle();
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/:id/retrospective', async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('event_retrospectives').upsert({
      event_id: req.params.id, what_went_well: d.what_went_well || '',
      what_to_improve: d.what_to_improve || '', action_items: d.action_items || '',
      attendee_feedback: d.attendee_feedback || '', overall_rating: d.overall_rating || null,
      created_by: req.user.userId,
    }, { onConflict: 'event_id' }).select().single();
    if (error) throw error;
    await supabase.from('audit_log').insert({ table_name: 'event_retrospectives', record_id: data.id, event_id: req.params.id, action: 'create', description: 'Retrospectiva salva', changed_by: req.user.userId, changed_by_name: req.user.name });
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao salvar retrospectiva' }); }
});

// ── AUDIT LOG ──
router.get('/:id/history', async (req, res) => {
  try {
    const { data, error } = await supabase.from('audit_log').select('*').eq('event_id', req.params.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar histórico' }); }
});

// ── ATTACHMENTS (entregáveis) ──
const multer = require('multer');
const storage = require('../services/storageService');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: storage.MAX_FILE_SIZE } });

// POST /api/events/:eventId/tasks/:taskId/attachments — upload file
router.post('/:eventId/tasks/:taskId/attachments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não fornecido' });

    const { eventId, taskId } = req.params;
    const { description, area, phase_name, task_type } = req.body; // task_type: 'event' | 'cycle'

    // Fix encoding: multer/busboy interpreta filenames como latin1, mas browser envia UTF-8
    const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    // Buscar nome do evento para organizar pastas
    const { data: event } = await supabase.from('events').select('name').eq('id', eventId).single();
    const eventName = event?.name || eventId;

    // Upload para storage
    const result = await storage.uploadFile(eventName, phase_name || '', fileName, req.file.buffer, req.file.mimetype);

    // Salvar registro no banco
    const attachment = {
      event_id: eventId,
      file_name: fileName,
      file_type: req.file.mimetype,
      file_size: req.file.size,
      supabase_path: result.provider === 'supabase' ? result.path : null,
      sharepoint_url: result.url || null,
      sharepoint_item_id: result.itemId || null,
      phase_name: phase_name || null,
      area: area || req.user.area || null,
      description: description || null,
      uploaded_by: req.user.userId,
      uploaded_by_name: req.user.name,
    };

    // Vincular a event_task ou cycle_phase_task
    if (task_type === 'cycle') {
      attachment.cycle_task_id = taskId;
    } else {
      attachment.event_task_id = taskId;
    }

    const { data, error } = await supabase.from('event_task_attachments').insert(attachment).select().single();
    if (error) throw error;

    // Gerar URL assinada para acesso imediato
    data.signed_url = await storage.getSignedUrl(result.path);

    res.json(data);
  } catch (e) {
    console.error('[Events] Upload attachment:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao fazer upload' });
  }
});

// GET /api/events/:eventId/attachments — listar todos anexos do evento
router.get('/:eventId/attachments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_task_attachments')
      .select('*')
      .eq('event_id', req.params.eventId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar anexos' });
  }
});

// GET /api/events/:eventId/tasks/:taskId/attachments — listar anexos de uma task
router.get('/:eventId/tasks/:taskId/attachments', async (req, res) => {
  try {
    const { taskId } = req.params;
    // Buscar por event_task_id OU cycle_task_id
    const { data, error } = await supabase.from('event_task_attachments')
      .select('*')
      .or(`event_task_id.eq.${encodeURIComponent(taskId)},cycle_task_id.eq.${encodeURIComponent(taskId)}`)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Resolver URLs de acesso
    for (const a of data) {
      if (a.sharepoint_url) {
        a.signed_url = a.sharepoint_url; // SharePoint URL já é acessível
      } else if (a.supabase_path) {
        try { a.signed_url = await storage.getSignedUrl(a.supabase_path); } catch {}
      }
    }

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar anexos da tarefa' });
  }
});

// DELETE /api/events/attachments/:attachId — remover anexo
router.delete('/attachments/:attachId', async (req, res) => {
  try {
    // Buscar para obter path do storage
    const { data: attach } = await supabase.from('event_task_attachments')
      .select('supabase_path, sharepoint_item_id')
      .eq('id', req.params.attachId)
      .single();

    if (attach) await storage.deleteFile(attach.supabase_path, attach.sharepoint_item_id);

    const { error } = await supabase.from('event_task_attachments').delete().eq('id', req.params.attachId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('[Events] Delete attachment:', e.message);
    res.status(500).json({ error: 'Erro ao excluir anexo' });
  }
});

module.exports = router;
