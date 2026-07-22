const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

router.use(authenticate);

// Guard transversal: esta rota lê/edita tarefas de eventos, ciclos, projetos
// e PE, então não cabe um authorizeModule único. Guarda pela MESMA régua das
// telas consumidoras (Projetos/Eventos): leitura >= 1 em qualquer módulo-fonte.
// Nunca `authenticate` solto — a rota tem PATCH de status (lição dos guards de
// Grupos). admin/diretor = nível 5 (mesmo padrão de encaminhamentos.js).
function nivel(req, slug) {
  if (['admin', 'diretor'].includes(req.user?.role)) return 5;
  return req.user?.granular?.modulePerms?.[slug]?.leitura ?? 0;
}
router.use((req, res, next) => {
  const podeVer = ['projetos', 'eventos', 'expansao'].some(s => nivel(req, s) >= 1);
  if (!podeVer) return res.status(403).json({ error: 'Sem acesso a tarefas' });
  next();
});

// GET /api/tasks/all — todas as tarefas de todos os módulos
// Query params:
//   source: filtra por tipo (evento | ciclo | projeto | planejamento)
//   área:   filtra por área
//   finalized: hide (default) | show | only
//     - hide: ignora tarefas com closed_with_event_at preenchido (lista limpa)
//     - show: traz todas, marca is_finalized_with_event nas que estão fechadas
//     - only: traz APENAS as fechadas com evento (bucket de visibilidade)
router.get('/all', async (req, res) => {
  try {
    const { source, area } = req.query;
    const finalized = req.query.finalized || 'hide'; // hide | show | only

    // project_tasks (2.7k) e cycle_task_subtasks (2.7k) passam do cap de 1000
    // do PostgREST — sem paginar, o Kanban truncava em silêncio (o MESMO bug
    // que a auditoria de performance corrigiu no resto do sistema). Ramo
    // resiliente: erro numa página devolve o acumulado (o /all nunca 500 por
    // uma fonte só, mantendo o comportamento original tolerante a erro).
    const PAGE = 1000;
    const fetchAll = async (build) => {
      const out = []; let from = 0;
      for (;;) {
        const { data, error } = await build().range(from, from + PAGE - 1);
        if (error) break;
        out.push(...(data || []));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return out;
    };

    const results = [];

    // Tarefas de eventos
    if (!source || source === 'evento') {
      const data = await fetchAll(() => {
        let q = supabase.from('event_tasks')
          .select('id, name, responsible, responsible_id, area, deadline, status, priority, is_milestone, event_id, created_at, closed_with_event_at, events(name)')
          .order('deadline', { nullsFirst: false });
        if (area) q = q.eq('area', area);
        if (finalized === 'hide') q = q.is('closed_with_event_at', null);
        if (finalized === 'only') q = q.not('closed_with_event_at', 'is', null);
        return q;
      });
      data.forEach(t => results.push({
        ...t, source: 'evento', parent_name: t.events?.name || '—', parent_id: t.event_id,
        is_finalized_with_event: !!t.closed_with_event_at,
      }));
    }

    // Tarefas do ciclo criativo (com subtarefas)
    if (!source || source === 'ciclo') {
      const data = await fetchAll(() => {
        let q = supabase.from('cycle_phase_tasks')
          .select('id, titulo, responsavel_nome, responsavel_id, area, prazo, status, prioridade, event_id, observacoes, created_at, closed_with_event_at, events(name), event_cycle_phases(nome_fase)')
          .order('prazo', { nullsFirst: false });
        if (area) q = q.eq('area', area);
        if (finalized === 'hide') q = q.is('closed_with_event_at', null);
        if (finalized === 'only') q = q.not('closed_with_event_at', 'is', null);
        return q;
      });

      // Subtarefas em lotes de 200 ids (o .in() estoura a URL do PostgREST
      // acima de ~200 uuids · lição postgrest-in-limite) + paginado.
      const cycleTaskIds = data.map(t => t.id);
      const allSubs = [];
      for (let i = 0; i < cycleTaskIds.length; i += 200) {
        const lote = cycleTaskIds.slice(i, i + 200);
        const subs = await fetchAll(() => supabase.from('cycle_task_subtasks').select('*').in('task_id', lote).order('sort_order'));
        allSubs.push(...subs);
      }
      const subsMap = {};
      allSubs.forEach(s => { if (!subsMap[s.task_id]) subsMap[s.task_id] = []; subsMap[s.task_id].push(s); });

      data.forEach(t => results.push({
        id: t.id, name: t.titulo,
        responsible: t.responsavel_nome,
        responsible_id: t.responsavel_id,
        area: t.area,
        deadline: t.prazo, status: t.status === 'a_fazer' ? 'pendente' : t.status === 'em_andamento' ? 'em-andamento' : t.status,
        priority: t.prioridade, parent_name: (t.events?.name || '—') + ' → ' + (t.event_cycle_phases?.nome_fase || ''),
        parent_id: t.event_id, source: 'ciclo', created_at: t.created_at,
        closed_with_event_at: t.closed_with_event_at,
        is_finalized_with_event: !!t.closed_with_event_at,
        observacoes: t.observacoes,
        subtasks: subsMap[t.id] || [],
      }));
    }

    // Tarefas de projetos
    if (!source || source === 'projeto') {
      const data = await fetchAll(() => {
        let q = supabase.from('project_tasks')
          .select('id, name, responsible, responsible_id, area, deadline, status, priority, is_milestone, project_id, created_at, projects(name)')
          .order('deadline', { nullsFirst: false });
        if (area) q = q.eq('area', area);
        return q;
      });
      data.forEach(t => results.push({
        ...t, source: 'projeto', parent_name: t.projects?.name || '—', parent_id: t.project_id,
      }));
    }

    // Tarefas de planejamento estratégico
    if (!source || source === 'planejamento') {
      const data = await fetchAll(() => {
        let q = supabase.from('strategic_tasks')
          .select('id, name, responsible, area, deadline, status, priority, is_milestone, plan_id, created_at, strategic_plans(name)')
          .order('deadline', { nullsFirst: false });
        if (area) q = q.eq('area', area);
        return q;
      });
      data.forEach(t => results.push({
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

    // ── Sincroniza card_completions quando dropdown muda status de tarefa de ciclo ──
    // Antes: dropdown só mexia em cycle_phase_tasks.status, mas a view
    // vw_phase_progress (usada pelo relatório IA via Haiku) conta
    // card_completions. Resultado: kanban verde mas relatório mostrava 0/N.
    // Best-effort: erro aqui não derruba o status update principal.
    if (source === 'ciclo') {
      try {
        if (newStatus === 'concluida') {
          // Idempotente: existe completion ativa?
          const { data: existing } = await supabase.from('card_completions')
            .select('id').eq('task_id', taskId).is('reopened_at', null).maybeSingle();
          if (!existing) {
            const { data: task } = await supabase.from('cycle_phase_tasks')
              .select('event_id, event_phase_id, titulo, area, subtasks:cycle_task_subtasks(name, done)')
              .eq('id', taskId).single();
            const { data: phase } = task?.event_phase_id
              ? await supabase.from('event_cycle_phases').select('numero_fase').eq('id', task.event_phase_id).maybeSingle()
              : { data: null };
            if (task) {
              await supabase.from('card_completions').insert({
                task_id: taskId,
                event_id: task.event_id,
                event_phase_id: task.event_phase_id || null,
                phase_number: phase?.numero_fase || 0,
                area: task.area || '',
                card_titulo: task.titulo || '',
                card_subtarefas: task.subtasks ? { items: task.subtasks } : null,
                observacao: null,
                completed_by: req.user.userId,
                completed_by_name: req.user.name,
              });
            }
          }
        } else {
          // Saiu de concluída → marca reopened nas completions ativas
          await supabase.from('card_completions').update({
            reopened_at: new Date().toISOString(),
            reopened_by: req.user.userId,
            reopen_reason: `Status alterado para ${newStatus}`,
          }).eq('task_id', taskId).is('reopened_at', null);
        }
      } catch (syncErr) {
        console.error('[Tasks] sync completion (não-bloqueante):', syncErr.message);
      }
    }

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
