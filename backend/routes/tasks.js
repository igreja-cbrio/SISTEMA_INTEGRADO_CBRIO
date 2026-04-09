const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

router.use(authenticate);

// GET /api/tasks/all — todas as tarefas de todos os módulos
router.get('/all', async (req, res) => {
  try {
    const { source, area } = req.query;

    const results = [];

    // Tarefas de eventos
    if (!source || source === 'evento') {
      let q = supabase.from('event_tasks')
        .select('id, name, responsible, area, deadline, status, priority, is_milestone, event_id, created_at, events(name)')
        .order('deadline', { nullsFirst: false });
      if (area) q = q.eq('area', area);
      const { data } = await q;
      (data || []).forEach(t => results.push({
        ...t, source: 'evento', parent_name: t.events?.name || '—', parent_id: t.event_id,
      }));
    }

    // Tarefas do ciclo criativo (com subtarefas)
    if (!source || source === 'ciclo') {
      let q = supabase.from('cycle_phase_tasks')
        .select('id, titulo, responsavel_nome, area, prazo, status, prioridade, event_id, observacoes, created_at, events(name), event_cycle_phases(nome_fase)')
        .order('prazo', { nullsFirst: false });
      if (area) q = q.eq('area', area);
      const { data } = await q;

      // Buscar subtarefas de todas as tarefas do ciclo
      const cycleTaskIds = (data || []).map(t => t.id);
      const { data: allSubs } = cycleTaskIds.length > 0
        ? await supabase.from('cycle_task_subtasks').select('*').in('task_id', cycleTaskIds).order('sort_order')
        : { data: [] };
      const subsMap = {};
      (allSubs || []).forEach(s => { if (!subsMap[s.task_id]) subsMap[s.task_id] = []; subsMap[s.task_id].push(s); });

      (data || []).forEach(t => results.push({
        id: t.id, name: t.titulo, responsible: t.responsavel_nome, area: t.area,
        deadline: t.prazo, status: t.status === 'a_fazer' ? 'pendente' : t.status === 'em_andamento' ? 'em-andamento' : t.status,
        priority: t.prioridade, parent_name: (t.events?.name || '—') + ' → ' + (t.event_cycle_phases?.nome_fase || ''),
        parent_id: t.event_id, source: 'ciclo', created_at: t.created_at,
        observacoes: t.observacoes,
        subtasks: subsMap[t.id] || [],
      }));
    }

    // Tarefas de projetos
    if (!source || source === 'projeto') {
      let q = supabase.from('project_tasks')
        .select('id, name, responsible, area, deadline, status, priority, is_milestone, project_id, created_at, projects(name)')
        .order('deadline', { nullsFirst: false });
      if (area) q = q.eq('area', area);
      const { data } = await q;
      (data || []).forEach(t => results.push({
        ...t, source: 'projeto', parent_name: t.projects?.name || '—', parent_id: t.project_id,
      }));
    }

    // Tarefas de planejamento estratégico
    if (!source || source === 'planejamento') {
      let q = supabase.from('strategic_tasks')
        .select('id, name, responsible, area, deadline, status, priority, is_milestone, plan_id, created_at, strategic_plans(name)')
        .order('deadline', { nullsFirst: false });
      if (area) q = q.eq('area', area);
      const { data } = await q;
      (data || []).forEach(t => results.push({
        ...t, source: 'planejamento', parent_name: t.strategic_plans?.name || '—', parent_id: t.plan_id,
      }));
    }

    res.json(results);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar tarefas' }); }
});

// PATCH /api/tasks/:source/:taskId/status — atualizar status de qualquer tarefa
router.patch('/:source/:taskId/status', async (req, res) => {
  try {
    const { source, taskId } = req.params;
    const tableMap = { evento: 'event_tasks', ciclo: 'cycle_phase_tasks', projeto: 'project_tasks', planejamento: 'strategic_tasks' };
    const table = tableMap[source];
    if (!table) return res.status(400).json({ error: 'Source inválido' });
    // Mapear status para cycle_phase_tasks (usa underscores)
    let newStatus = req.body.status;
    if (source === 'ciclo') {
      const map = { 'pendente': 'a_fazer', 'em-andamento': 'em_andamento', 'concluida': 'concluida', 'bloqueada': 'bloqueada' };
      newStatus = map[newStatus] || newStatus;
    }
    const { data, error } = await supabase.from(table).update({ status: newStatus }).eq('id', taskId).select().single();
    if (error) throw error;

    // Auto-conclusão de fase para projetos
    if (source === 'projeto' && newStatus === 'concluida' && data) {
      try {
        const phaseMatch = (data.description || '').match(/Fase:\s*(.+)/);
        if (phaseMatch) {
          const phaseName = phaseMatch[1].trim();
          const { data: allPhaseTasks } = await supabase.from('project_tasks')
            .select('id, status').eq('project_id', data.project_id).ilike('description', `%Fase: ${phaseName}%`);
          const total = allPhaseTasks?.length || 0;
          const done = allPhaseTasks?.filter(t => t.status === 'concluida').length || 0;
          if (total > 0 && done === total) {
            const { data: phase } = await supabase.from('project_phases')
              .select('id, phase_order, status').eq('project_id', data.project_id).eq('name', phaseName).maybeSingle();
            if (phase && phase.status !== 'concluida') {
              await supabase.from('project_phases').update({ status: 'concluida' }).eq('id', phase.id);
              if (phase.phase_order < 7) {
                await supabase.from('project_phases').update({ status: 'em-andamento' })
                  .eq('project_id', data.project_id).eq('phase_order', phase.phase_order + 1).eq('status', 'pendente');
              }
              const { data: proj } = await supabase.from('projects').select('name').eq('id', data.project_id).single();
              try {
                await notificar({
                  modulo: 'projetos', tipo: 'fase_concluida',
                  titulo: `Fase "${phaseName}" concluída`,
                  mensagem: `Todas as tarefas da fase "${phaseName}" foram concluídas no projeto "${proj?.name}".`,
                  link: `/projetos?id=${data.project_id}`, severidade: 'info',
                  chaveDedup: `phase_done_${phase.id}`,
                });
              } catch (notifErr) { console.error('[Tasks] Erro ao notificar:', notifErr.message); }
            }
          }
        }
      } catch (err) { console.error('[Tasks] Erro auto-conclusão fase:', err.message); }
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar status' }); }
});

module.exports = router;
