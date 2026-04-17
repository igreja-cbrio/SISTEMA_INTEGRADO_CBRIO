const router = require('express').Router();
const { authenticate, authorizeCycle, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
// Templates agora vem do banco (adm_task_templates)
const { SHAREPOINT_CONFIGURED } = require('../services/storageService');

router.use(authenticate);

// ── Helper: buscar subtarefas em batches (evita URL >8KB no PostgREST) ──
async function fetchSubtasksBatched(taskIds) {
  if (!taskIds || taskIds.length === 0) return {};
  const BATCH = 50;
  const allSubs = [];
  for (let i = 0; i < taskIds.length; i += BATCH) {
    const batch = taskIds.slice(i, i + BATCH);
    const { data } = await supabase.from('cycle_task_subtasks').select('*').in('task_id', batch).order('sort_order');
    if (data) allSubs.push(...data);
  }
  const map = {};
  allSubs.forEach(s => { if (!map[s.task_id]) map[s.task_id] = []; map[s.task_id].push(s); });
  return map;
}

// ── SharePoint: criar estrutura de pastas ao ativar ciclo ──
async function createSharePointFolders(eventName, phaseTemplates) {
  if (!SHAREPOINT_CONFIGURED) return;
  require('dotenv').config();

  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const DRIVE_ID = 'b!EA-1BDLqukCEvUSjs47ip_Zq_pRk8F1Fr8Vno3f16CycaaIn52TbSKQ7nZOyjaOa'; // Planejamento

  // Get token
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  const { access_token } = await tokenRes.json();
  if (!access_token) throw new Error('Failed to get Graph token');

  const sanitize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_\-. ]/g, '').replace(/\s+/g, '_').slice(0, 100);
  const eventFolder = sanitize(eventName);

  const createFolder = async (parentPath, name) => {
    const endpoint = parentPath
      ? `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${parentPath}:/children`
      : `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root/children`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.error?.code !== 'nameAlreadyExists') throw new Error(`Folder ${name}: ${err.error?.message}`);
    }
  };

  // Criar: Eventos/{NomeEvento}
  await createFolder('Eventos', eventFolder);

  // Criar subpastas para cada fase: Eventos/{NomeEvento}/Fase 01 - Pre Briefing
  for (const t of phaseTemplates) {
    const phaseName = sanitize(`Fase ${String(t.numero).padStart(2, '0')} - ${t.nome}`);
    await createFolder(`Eventos/${eventFolder}`, phaseName);
  }
}

// Helper: calcular datas das fases a partir do Dia D
// calcDates: semanas_inicio/semanas_fim agora armazenam DIAS (não semanas)
function calcDates(diaDDate, diasInicio, diasFim) {
  const diaD = new Date(diaDDate);
  const inicio = new Date(diaD); inicio.setDate(diaD.getDate() + diasInicio);
  const fim = new Date(diaD); fim.setDate(diaD.getDate() + diasFim);
  return {
    data_inicio_prevista: inicio.toISOString().split('T')[0],
    data_fim_prevista: fim.toISOString().split('T')[0],
  };
}

// Template da trilha ADM (24 tarefas, semanas -5 a 0)
const ADM_TRACK = [
  { semana: -5, area: 'compras', titulo: 'Receber lista de compras do marketing', descricao: 'Receber lista consolidada de todas as peças, materiais e serviços', entrega_esperada: 'Lista de compras consolidada' },
  { semana: -5, area: 'compras', titulo: 'Levantar fornecedores e cotar itens', descricao: 'Levantar fornecedores e cotar cada item da lista', entrega_esperada: 'Cotações enviadas ao financeiro' },
  { semana: -5, area: 'financeiro', titulo: 'Verificar disponibilidade orçamentária', descricao: 'Receber estimativa de custos e verificar disponibilidade', entrega_esperada: 'Parecer financeiro: itens aprovados, pendentes e fora do orçamento' },
  { semana: -5, area: 'manutencao', titulo: 'Vistoria inicial dos espaços', descricao: 'Fazer vistoria inicial dos espaços que serão utilizados', entrega_esperada: 'Relatório de vistoria com lista de intervenções' },
  { semana: -5, area: 'limpeza', titulo: 'Ciência e planejamento do evento', descricao: 'Tomar ciência do evento: espaços, data e público estimado', entrega_esperada: 'Planejamento interno' },
  { semana: -4, area: 'compras', titulo: 'Emitir ordens de compra', descricao: 'Emitir ordens de compra para itens aprovados', entrega_esperada: 'Ordens de compra emitidas e confirmadas' },
  { semana: -4, area: 'financeiro', titulo: 'Aprovar itens e processar pagamentos', descricao: 'Aprovar ou rejeitar itens pendentes. Processar pagamentos de entrada', entrega_esperada: 'Aprovações e pagamentos de sinal processados' },
  { semana: -4, area: 'manutencao', titulo: 'Iniciar intervenções estruturais', descricao: 'Iniciar intervenções com maior prazo de execução', entrega_esperada: 'Cronograma de execução aprovado' },
  { semana: -4, area: 'limpeza', titulo: 'Planejar cronograma de limpeza', descricao: 'Planejar cronograma de limpeza pré-evento', entrega_esperada: 'Plano de limpeza com datas e responsáveis' },
  { semana: -3, area: 'compras', titulo: 'Receber e conferir materiais', descricao: 'Receber e conferir materiais dos fornecedores', entrega_esperada: 'Confirmação de recebimento' },
  { semana: -3, area: 'financeiro', titulo: 'Processar pagamentos finais', descricao: 'Processar pagamentos finais e consolidar custo total', entrega_esperada: 'Relatório de custo consolidado' },
  { semana: -3, area: 'manutencao', titulo: 'Concluir montagem e pré-testes', descricao: 'Concluir intervenções e participar dos pré-testes', entrega_esperada: 'Espaços prontos para pré-testes' },
  { semana: -3, area: 'limpeza', titulo: 'Limpeza profunda pós-intervenções', descricao: 'Limpeza profunda após intervenções da manutenção', entrega_esperada: 'Espaços limpos e prontos' },
  { semana: -2, area: 'compras', titulo: 'Resolver pendências de entrega', descricao: 'Resolver pendências e compras emergenciais', entrega_esperada: 'Todas as compras concluídas' },
  { semana: -2, area: 'financeiro', titulo: 'Relatório financeiro preliminar', descricao: 'Processar pagamentos restantes e emitir relatório', entrega_esperada: 'Relatório financeiro preliminar' },
  { semana: -2, area: 'manutencao', titulo: 'Ajustes finais e cronograma Dia D', descricao: 'Ajustes finais com base nos pré-testes', entrega_esperada: 'Cronograma do Dia D da manutenção' },
  { semana: -2, area: 'limpeza', titulo: 'Confirmar cronograma limpeza Dia D', descricao: 'Confirmar cronograma de limpeza do Dia D', entrega_esperada: 'Cronograma de limpeza aprovado' },
  { semana: -1, area: 'compras', titulo: 'Checklist final de compras', descricao: 'Confirmar que todos os itens foram recebidos', entrega_esperada: 'Checklist 100% conferido' },
  { semana: -1, area: 'financeiro', titulo: 'Liberar verba do Dia D', descricao: 'Liberar verba para despesas do Dia D', entrega_esperada: 'Caixa do Dia D autorizado' },
  { semana: -1, area: 'manutencao', titulo: 'Vistoria final e alinhamento', descricao: 'Vistoria final dos espaços e confirmar equipe', entrega_esperada: 'Vistoria concluída, equipe escalada' },
  { semana: -1, area: 'limpeza', titulo: 'Limpeza final e alinhamento', descricao: 'Limpeza final completa e alinhamento operacional', entrega_esperada: 'Espaços 100% limpos e prontos' },
  { semana: 0, area: 'compras', titulo: 'Standby para emergências', descricao: 'Manter contato disponível para emergências', entrega_esperada: 'Standby' },
  { semana: 0, area: 'financeiro', titulo: 'Caixa e registro despesas Dia D', descricao: 'Caixa liberado e registro de despesas do dia', entrega_esperada: 'Registro de despesas do Dia D' },
  { semana: 0, area: 'manutencao', titulo: 'On-site: montagem e desmontagem', descricao: 'On-site desde montagem até desmontagem', entrega_esperada: 'Espaços desmontados e devolvidos' },
  { semana: 0, area: 'limpeza', titulo: 'On-site: limpeza pré, durante e pós', descricao: 'Limpeza de preparação, manutenção durante e pós-evento', entrega_esperada: 'Espaços limpos e liberados' },
];

// GET /api/cycles/summary/all (DEVE vir antes de /:eventId)
router.get('/summary/all', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vw_cycle_summary').select('*');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cycles/kanban/all — todos os ciclos com fases + tarefas + subtarefas
router.get('/kanban/all', async (req, res) => {
  try {
    const { data: cycles } = await supabase.from('event_cycles').select('event_id, status, events(name, status)').eq('status', 'ativo');
    // Filtrar eventos concluídos
    const activeCycles = (cycles || []).filter(c => c.events?.status !== 'concluido');
    if (!activeCycles || activeCycles.length === 0) return res.json({ events: [], phases: [], tasks: [] });

    const eventIds = activeCycles.map(c => c.event_id);

    const [phasesRes, tasksRes] = await Promise.all([
      supabase.from('event_cycle_phases').select('*, cycle_phase_templates(descricao, entregas_padrao, responsavel_padrao)').in('event_id', eventIds).order('numero_fase'),
      supabase.from('cycle_phase_tasks').select('*').in('event_id', eventIds),
    ]);

    // Subtarefas (batched para evitar URL overflow no PostgREST)
    const taskIds = (tasksRes.data || []).map(t => t.id);
    const subsMap = await fetchSubtasksBatched(taskIds);
    const tasksWithSubs = (tasksRes.data || []).map(t => ({ ...t, subtasks: subsMap[t.id] || [] }));

    // Enriquecer fases com dados do template
    const enrichedPhases = (phasesRes.data || []).map(p => ({
      ...p,
      entregas_padrao: p.cycle_phase_templates?.entregas_padrao || null,
      descricao_fase: p.cycle_phase_templates?.descricao || null,
      cycle_phase_templates: undefined,
    }));

    const events = activeCycles.map(c => ({ id: c.event_id, name: c.events?.name || '—' }));

    // Buscar eventos SEM ciclo (simples) que não estão concluídos
    const { data: allActiveEvents } = await supabase.from('events').select('id, name').neq('status', 'concluido');
    const cycleEventIds = new Set(eventIds);
    const simpleEvents = (allActiveEvents || []).filter(e => !cycleEventIds.has(e.id));

    // Buscar tarefas dos eventos simples
    const simpleIds = simpleEvents.map(e => e.id);
    const { data: simpleTasks } = simpleIds.length > 0
      ? await supabase.from('event_tasks').select('*').in('event_id', simpleIds)
      : { data: [] };

    // Mapear event_tasks para formato compatível com cycle_phase_tasks
    const mappedSimpleTasks = (simpleTasks || []).map(t => ({
      id: t.id, event_phase_id: 'simple', event_id: t.event_id,
      titulo: t.name, responsavel_nome: t.responsible, area: t.area || 'adm',
      prazo: t.deadline, status: t.status === 'pendente' ? 'a_fazer' : t.status === 'em-andamento' ? 'em_andamento' : t.status,
      prioridade: t.priority || 'normal', observacoes: '', subtasks: [],
      _source: 'simple',
    }));

    const allEvents = [...events, ...simpleEvents.map(e => ({ id: e.id, name: e.name, _simple: true }))];

    res.json({
      events: allEvents,
      phases: enrichedPhases,
      tasks: [...tasksWithSubs, ...mappedSimpleTasks],
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// POST /api/cycles/activate/:eventId
router.post('/activate/:eventId', authorize('admin', 'diretor'), async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.userId;
  try {
    const { data: event, error: evErr } = await supabase.from('events').select('id, date, name').eq('id', eventId).single();
    if (evErr || !event) return res.status(404).json({ error: 'Evento não encontrado' });

    const { data: existing } = await supabase.from('event_cycles').select('id').eq('event_id', eventId).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Ciclo já ativado para este evento' });

    const diaDDate = event.date;
    const { data: cycle, error: cycleErr } = await supabase.from('event_cycles')
      .insert({ event_id: eventId, ativado_por: userId, data_dia_d: diaDDate })
      .select().single();
    if (cycleErr) throw cycleErr;

    const { data: templates } = await supabase.from('cycle_phase_templates').select('*').order('numero');
    const phases = templates.map(t => ({
      event_id: eventId, template_id: t.id, numero_fase: t.numero,
      nome_fase: t.nome, area: t.area, momento_chave: t.momento_chave, status: 'pendente',
      ...calcDates(diaDDate, t.semanas_inicio, t.semanas_fim),
    }));
    const { error: phasesErr } = await supabase.from('event_cycle_phases').insert(phases);
    if (phasesErr) throw phasesErr;

    const diaDObj = new Date(diaDDate);
    const admTrack = ADM_TRACK.map(t => {
      const dp = new Date(diaDObj); dp.setDate(diaDObj.getDate() + t.semana * 7);
      return { event_id: eventId, semana: t.semana, area: t.area, titulo: t.titulo,
        descricao: t.descricao, entrega_esperada: t.entrega_esperada,
        data_prevista: dp.toISOString().split('T')[0], status: 'pendente' };
    });
    const { error: admErr } = await supabase.from('event_adm_track').insert(admTrack);
    if (admErr) throw admErr;

    await supabase.from('event_budgets').insert({ event_id: eventId, orcamento_aprovado: 0, created_by: userId });

    // Buscar fases criadas para vincular tarefas por etapa
    const { data: createdPhases } = await supabase.from('event_cycle_phases')
      .select('id, nome_fase').eq('event_id', eventId);
    const phaseMap = {};
    (createdPhases || []).forEach(p => { phaseMap[p.nome_fase] = p.id; });

    // Mapear etapas da planilha para fases do ciclo
    const etapaToFase = {
      'Pré-Briefing': 'Pré Briefing',
      'Aprovação': 'Aprovação',
      'Execução Estratégica': 'Execução Estratégica',
      'Pré-Testes': 'Pré-Testes',
      'Finalizações': 'Finalizações',
      'Alinhamentos Operacionais Finais': 'Alinhamentos Operacionais Finais',
      'Dia D': 'Dia D',
      'Debriefing': 'Debrief',
    };

    // Criar tarefas detalhadas com subtarefas do banco
    const { data: admTemplates } = await supabase.from('adm_task_templates').select('*, adm_task_template_subtasks(*)').eq('ativo', true).order('sort_order');
    for (const tmpl of (admTemplates || [])) {
      const faseNome = etapaToFase[tmpl.etapa] || tmpl.etapa;
      const phaseId = phaseMap[faseNome] || null;
      const dataInicio = new Date(diaDObj); dataInicio.setDate(diaDObj.getDate() + tmpl.offset_start);
      const dataFim = new Date(diaDObj); dataFim.setDate(diaDObj.getDate() + tmpl.offset_end);

      const { data: task, error: taskErr } = await supabase.from('cycle_phase_tasks').insert({
        event_phase_id: phaseId,
        event_id: eventId,
        titulo: tmpl.titulo,
        area: tmpl.area,
        prazo: dataFim.toISOString().split('T')[0],
        status: 'a_fazer',
        prioridade: 'normal',
        observacoes: `Área: ${tmpl.area} | Início: ${dataInicio.toISOString().split('T')[0]} | Fim: ${dataFim.toISOString().split('T')[0]}`,
      }).select().single();

      if (taskErr) { console.error('Erro criando tarefa ADM:', taskErr.message); continue; }

      const subs = (tmpl.adm_task_template_subtasks || []).sort((a, b) => a.sort_order - b.sort_order);
      if (subs.length > 0 && task) {
        await supabase.from('cycle_task_subtasks').insert(subs.map((s, i) => ({
          task_id: task.id, name: s.name, offset_start: s.offset_start, offset_end: s.offset_end, sort_order: i,
        })));
      }
    }

    // ── Criar pastas no SharePoint para cada fase ──
    if (SHAREPOINT_CONFIGURED) {
      try {
        await createSharePointFolders(event.name, templates);
        console.log(`[CYCLE] SharePoint folders created for ${event.name}`);
      } catch (spErr) {
        console.error('[CYCLE] SharePoint folder creation failed (non-blocking):', spErr.message);
      }
    }

    res.json({ success: true, cycle, message: `Ciclo criativo ativado para ${event.name}` });
  } catch (err) {
    console.error('[CYCLE ACTIVATE]', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// TAREFAS PADRAO (DEVE vir antes de /:eventId)
// ══════════════════════════════════════════════

// GET /api/cycles/adm-templates
router.get('/adm-templates', async (req, res) => {
  try {
    const { data, error } = await supabase.from('adm_task_templates').select('*, adm_task_template_subtasks(*)').order('etapa').order('area').order('sort_order');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cycles/:eventId
router.get('/:eventId', async (req, res) => {
  const { eventId } = req.params;
  try {
    // Usar maybeSingle() em vez de single() para não dar erro quando não tem ciclo
    const { data: cycleData } = await supabase.from('event_cycles').select('*').eq('event_id', eventId).maybeSingle();

    // Se não tem ciclo, retornar null sem erro
    if (!cycleData) {
      return res.json({ cycle: null, phases: [], tasks: [], admTrack: [], budget: null });
    }

    const [phasesRes, tasksRes, admRes, budgetRes] = await Promise.all([
      supabase.from('event_cycle_phases').select('*, cycle_phase_templates(descricao, entregas_padrao, responsavel_padrao)').eq('event_id', eventId).order('numero_fase'),
      supabase.from('cycle_phase_tasks').select('*').eq('event_id', eventId),
      supabase.from('event_adm_track').select('*').eq('event_id', eventId).order('semana').order('area'),
      supabase.from('event_budgets').select('*').eq('event_id', eventId).maybeSingle(),
    ]);

    let totalGasto = 0;
    if (budgetRes.data) {
      const { data: expenses } = await supabase.from('event_expenses')
        .select('valor').eq('event_id', eventId).in('status', ['registrado', 'aprovado']);
      totalGasto = (expenses || []).reduce((acc, e) => acc + Number(e.valor), 0);
    }

    // Buscar subtarefas de todas as tasks do ciclo (batched)
    const taskIds = (tasksRes.data || []).map(t => t.id);
    const subsMap = await fetchSubtasksBatched(taskIds);
    const tasksWithSubs = (tasksRes.data || []).map(t => ({ ...t, subtasks: subsMap[t.id] || [] }));

    // Enriquecer fases com dados do template (entregas_padrao, descricao)
    const phases = (phasesRes.data || []).map(p => ({
      ...p,
      entregas_padrao: p.cycle_phase_templates?.entregas_padrao || null,
      descricao_fase: p.cycle_phase_templates?.descricao || null,
      responsavel_padrao: p.cycle_phase_templates?.responsavel_padrao || null,
      cycle_phase_templates: undefined,
    }));

    res.json({
      cycle: cycleData,
      phases,
      tasks: tasksWithSubs,
      admTrack: admRes.data || [],
      budget: budgetRes.data ? { ...budgetRes.data, total_gasto: totalGasto } : null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cycles/phases/:phaseId
router.patch('/phases/:phaseId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_cycle_phases')
      .update({ status: req.body.status, observacoes: req.body.observacoes, updated_by: req.user.userId })
      .eq('id', req.params.phaseId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cycles/phases — criar fase custom
router.post('/phases', async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('event_cycle_phases').insert({
      event_id: d.event_id, template_id: d.template_id || null,
      numero_fase: d.numero_fase || 99, nome_fase: d.nome_fase,
      area: d.area || 'ambos', momento_chave: d.momento_chave || false,
      data_inicio_prevista: d.data_inicio_prevista || null,
      data_fim_prevista: d.data_fim_prevista || null,
      status: 'pendente',
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/cycles/phases/:phaseId — excluir fase (cascade exclui tarefas)
router.delete('/phases/:phaseId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('cycle_phase_tasks').delete().eq('event_phase_id', req.params.phaseId);
    await supabase.from('event_cycle_phases').delete().eq('id', req.params.phaseId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/cycles/tasks/:taskId — excluir tarefa (limpa completions e subtarefas)
router.delete('/tasks/:taskId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('card_completions').delete().eq('task_id', req.params.taskId);
    await supabase.from('cycle_task_subtasks').delete().eq('task_id', req.params.taskId);
    await supabase.from('cycle_phase_tasks').delete().eq('id', req.params.taskId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cycles/tasks
router.post('/tasks', async (req, res) => {
  try {
    const { data, error } = await supabase.from('cycle_phase_tasks')
      .insert({ ...req.body, created_by: req.user.userId }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cycles/tasks/:taskId/subtasks — criar subtarefa
router.post('/tasks/:taskId/subtasks', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const { data: maxSort } = await supabase.from('cycle_task_subtasks')
      .select('sort_order').eq('task_id', req.params.taskId).order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.from('cycle_task_subtasks')
      .insert({ task_id: req.params.taskId, name, done: false, sort_order: (maxSort?.sort_order || 0) + 1 }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/cycles/subtasks/:subId — excluir subtarefa
router.delete('/subtasks/:subId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('cycle_task_subtasks').delete().eq('id', req.params.subId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cycles/subtasks/:subId — toggle subtarefa done
router.patch('/subtasks/:subId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('cycle_task_subtasks')
      .update({ done: req.body.done }).eq('id', req.params.subId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cycles/tasks/:taskId
router.patch('/tasks/:taskId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('cycle_phase_tasks')
      .update(req.body).eq('id', req.params.taskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cycles/adm/:itemId
router.patch('/adm/:itemId', async (req, res) => {
  try {
    const patch = { status: req.body.status, observacoes: req.body.observacoes,
      checked_by: req.user.userId, checked_at: new Date().toISOString() };
    const { data, error } = await supabase.from('event_adm_track')
      .update(patch).eq('id', req.params.itemId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cycles/expenses
router.post('/expenses', async (req, res) => {
  try {
    const { event_id } = req.body;
    const { data: expense, error } = await supabase.from('event_expenses')
      .insert({ ...req.body, registrado_por: req.user.userId }).select().single();
    if (error) throw error;

    const { data: budget } = await supabase.from('event_budgets')
      .select('orcamento_aprovado').eq('event_id', event_id).single();

    if (budget && budget.orcamento_aprovado > 0) {
      const { data: allExp } = await supabase.from('event_expenses')
        .select('valor').eq('event_id', event_id).in('status', ['registrado', 'aprovado']);
      const totalGasto = (allExp || []).reduce((acc, e) => acc + Number(e.valor), 0);

      if (totalGasto > budget.orcamento_aprovado) {
        await supabase.from('budget_alerts').insert({
          event_id, expense_id: expense.id, orcamento_aprovado: budget.orcamento_aprovado,
          total_gasto_atual: totalGasto, valor_excedido: totalGasto - budget.orcamento_aprovado,
        });
        return res.json({ expense, alert: true, totalGasto, orcamento: budget.orcamento_aprovado,
          message: `Orçamento excedido em R$ ${(totalGasto - budget.orcamento_aprovado).toFixed(2)}` });
      }
    }
    res.json({ expense, alert: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// KPIs DE EVENTOS
// ══════════════════════════════════════════════

// Helper: calcula score de um card_completion
function calcScore(cc) {
  let score = 0;
  // Entrega no prazo: 40pts
  if (cc.completed_at || cc.delivered_at) {
    if (!cc.deadline_at || (cc.delivered_at || cc.completed_at) <= cc.deadline_at) score += 40;
  }
  // Aprovado: 30pts
  if (cc.approved_by) score += 30;
  // Qualidade OK: 20pts
  if (cc.quality_rating === 'ok') score += 20;
  // Documento anexado: 10pts
  if (cc.file_name) score += 10;
  return score;
}

// POST /api/cycles/card-completions/:id/deliver — marcar como entregue
router.post('/card-completions/:id/deliver', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data: cc, error: getErr } = await supabase.from('card_completions').select('*').eq('id', req.params.id).single();
    if (getErr) throw getErr;

    const updates = {
      delivered_at: now,
      completed_at: cc.completed_at || now,
      completed_by: cc.completed_by || req.user.userId,
      completed_by_name: cc.completed_by_name || req.user.name,
      quality_rating: req.body.quality_rating || 'ok',
    };
    if (req.body.file_name) updates.file_name = req.body.file_name;
    if (req.body.file_url) updates.file_url = req.body.file_url;

    updates.score = calcScore({ ...cc, ...updates });

    const { data, error } = await supabase.from('card_completions').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper: buscar ou criar card_completion para um task
async function getOrCreateCompletion(taskId, userId, userName) {
  const { data: rows } = await supabase.from('card_completions').select('*').eq('task_id', taskId).order('completed_at', { ascending: false }).limit(1);
  if (rows?.length) return rows[0];

  // Buscar dados do task
  const { data: task } = await supabase.from('cycle_phase_tasks').select('*, event_cycle_phases(numero_fase, nome_fase)').eq('id', taskId).single();
  if (!task) throw new Error('Task nao encontrada');

  const { data: cc, error } = await supabase.from('card_completions').insert({
    task_id: taskId, event_id: task.event_id, event_phase_id: task.event_phase_id,
    phase_number: task.event_cycle_phases?.numero_fase, area: task.area,
    card_titulo: task.titulo, completed_by: userId, completed_by_name: userName,
    completed_at: new Date().toISOString(), quality_rating: 'pendente',
  }).select().single();
  if (error) throw error;
  return cc;
}

// PATCH /api/cycles/card-completions/:taskId/approve — aprovar (usa task ID)
router.patch('/card-completions/:taskId/approve', async (req, res) => {
  try {
    const cc = await getOrCreateCompletion(req.params.taskId, req.user.userId, req.user.name);
    const updates = { approved_by: req.user.userId, approved_at: new Date().toISOString() };
    updates.score = calcScore({ ...cc, ...updates });

    const { data, error } = await supabase.from('card_completions').update(updates).eq('id', cc.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cycles/card-completions/:taskId/quality — qualidade (usa task ID)
router.patch('/card-completions/:taskId/quality', async (req, res) => {
  try {
    const cc = await getOrCreateCompletion(req.params.taskId, req.user.userId, req.user.name);
    const updates = { quality_rating: req.body.quality_rating || 'ok' };
    updates.score = calcScore({ ...cc, ...updates });

    const { data, error } = await supabase.from('card_completions').update(updates).eq('id', cc.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cycles/kpis/evento/:eventId — KPI de um evento especifico (nivel 2+3)
router.get('/kpis/evento/:eventId', async (req, res) => {
  try {
    // KPI por area (nivel 2) — vem da view que calcula direto dos cards
    const { data: areas } = await supabase.from('vw_event_area_kpi').select('*').eq('event_id', req.params.eventId);
    // KPI do evento (nivel 3)
    const { data: evento } = await supabase.from('vw_event_kpi').select('*').eq('event_id', req.params.eventId).maybeSingle();
    // Cards individuais (as entregas reais)
    const { data: tasks } = await supabase.from('cycle_phase_tasks').select('*, event_cycle_phases(nome_fase, data_fim_prevista)').eq('event_id', req.params.eventId).order('area');
    // Card completions para dados de aprovacao/qualidade/arquivo
    const { data: completions } = await supabase.from('card_completions').select('*').eq('event_id', req.params.eventId);
    const compMap = {};
    (completions || []).forEach(c => { compMap[c.task_id] = c; });

    // Enriquecer tasks com dados de completion
    const docs = (tasks || []).map(t => {
      const cc = compMap[t.id] || {};
      const prazofase = t.event_cycle_phases?.data_fim_prevista;
      const onTime = t.status === 'concluida' && prazofase ? t.updated_at <= prazofase + 'T23:59:59' : null;
      return {
        id: t.id, card_titulo: t.titulo, area: t.area, status: t.status,
        fase: t.event_cycle_phases?.nome_fase, prazo_fase: prazofase,
        is_critical: t.is_critical,
        approved_by: cc.approved_by, quality_rating: cc.quality_rating || null,
        file_name: cc.file_name, delivered_at: cc.delivered_at || cc.completed_at,
        on_time: onTime, updated_at: t.updated_at,
        score: (onTime !== false && t.status === 'concluida' ? 40 : 0) + (cc.approved_by ? 30 : 0) + (cc.quality_rating === 'ok' ? 20 : 0) + (cc.file_name ? 10 : 0),
      };
    });

    // Calcular breakdown por area
    const breakdownMap = {};
    docs.forEach(d => {
      if (!breakdownMap[d.area]) breakdownMap[d.area] = { total: 0, no_prazo: 0, aprovados: 0, qualidade_ok: 0, com_arquivo: 0, score_prazo: 0, score_aprovacao: 0, score_qualidade: 0, score_arquivo: 0 };
      const b = breakdownMap[d.area];
      b.total++;
      if (d.on_time !== false && d.status === 'concluida') { b.no_prazo++; b.score_prazo += 40; }
      if (d.approved_by) { b.aprovados++; b.score_aprovacao += 30; }
      if (d.quality_rating === 'ok') { b.qualidade_ok++; b.score_qualidade += 20; }
      if (d.file_name) { b.com_arquivo++; b.score_arquivo += 10; }
    });

    // Enriquecer areas com breakdown
    const areasComBreakdown = (areas || []).map(a => ({
      ...a,
      breakdown: breakdownMap[a.area] || { total: 0, no_prazo: 0, aprovados: 0, qualidade_ok: 0, com_arquivo: 0, score_prazo: 0, score_aprovacao: 0, score_qualidade: 0, score_arquivo: 0 },
    }));

    res.json({ kpi_evento: evento, kpi_areas: areasComBreakdown, documentos: docs });
  } catch (err) { console.error('[KPI evento]', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/cycles/kpis/cross — KPI cross-eventos (nivel 4) com filtro serie/evento
router.get('/kpis/cross', async (req, res) => {
  try {
    const { tipo } = req.query; // 'serie' | 'evento' | undefined (todos)

    // Buscar todos os eventos com ciclo criativo
    let q = supabase.from('event_cycles').select('event_id, events(id, name, status, date, category_id, event_categories(name))').eq('status', 'ativo');
    const { data: cycles } = await q;

    let eventIds = (cycles || [])
      .filter(c => c.events?.status !== 'concluido')
      .map(c => c.event_id);

    // Filtrar por tipo (serie vs evento)
    if (tipo === 'serie') {
      eventIds = (cycles || []).filter(c => c.events?.event_categories?.name === 'Série').map(c => c.event_id);
    } else if (tipo === 'evento') {
      eventIds = (cycles || []).filter(c => c.events?.event_categories?.name !== 'Série').map(c => c.event_id);
    }

    if (eventIds.length === 0) return res.json({ eventos: [], kpi_medio: 0, ranking_areas: [], ranking_responsaveis: [] });

    // KPIs por evento
    const { data: kpis } = await supabase.from('vw_event_kpi').select('*').in('event_id', eventIds);
    const { data: areaKpis } = await supabase.from('vw_event_area_kpi').select('*').in('event_id', eventIds);

    // Enriquecer com nome do evento
    const eventos = (kpis || []).map(k => {
      const cycle = (cycles || []).find(c => c.event_id === k.event_id);
      return { ...k, event_name: cycle?.events?.name || '', category: cycle?.events?.event_categories?.name || '', date: cycle?.events?.date };
    });

    // KPI medio
    const scores = eventos.map(e => e.kpi_evento).filter(s => s != null);
    const kpiMedio = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // Ranking de areas cross-eventos
    const areaMap = {};
    (areaKpis || []).forEach(a => {
      if (!areaMap[a.area]) areaMap[a.area] = { scores: [], total_docs: 0, docs_ok: 0 };
      areaMap[a.area].scores.push(a.kpi_area);
      areaMap[a.area].total_docs += Number(a.total_docs);
      areaMap[a.area].docs_ok += Number(a.docs_ok);
    });
    const rankingAreas = Object.entries(areaMap).map(([area, d]) => ({
      area, kpi: Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length),
      total_docs: d.total_docs, docs_ok: d.docs_ok,
    })).sort((a, b) => b.kpi - a.kpi);

    res.json({ eventos, kpi_medio: kpiMedio, ranking_areas: rankingAreas });
  } catch (err) { console.error('[KPI cross]', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/cycles/kpis/doc-resumo/:taskId — resumo do Cerebro para o documento do card
router.get('/kpis/doc-resumo/:taskId', async (req, res) => {
  try {
    // Buscar card_completion com arquivo
    const { data: rows } = await supabase.from('card_completions').select('file_name, file_url, file_sharepoint_path').eq('task_id', req.params.taskId).order('completed_at', { ascending: false }).limit(1);
    const cc = rows?.[0];
    if (!cc?.file_name) return res.json({ resumo: null, message: 'Nenhum arquivo anexado a este card' });

    // Buscar na fila do Cerebro pelo nome do arquivo
    const { data: cerebro } = await supabase.from('cerebro_fila')
      .select('resumo, tags, nota_path, status, nome_arquivo, processado_em')
      .or(`nome_arquivo.ilike.%${cc.file_name.replace(/[^a-zA-Z0-9]/g, '%')}%`)
      .order('processado_em', { ascending: false }).limit(1);

    if (cerebro?.length && cerebro[0].resumo) {
      return res.json({ resumo: cerebro[0].resumo, tags: cerebro[0].tags, nota_path: cerebro[0].nota_path, status: cerebro[0].status, file_name: cc.file_name, file_url: cc.file_url });
    }

    // Fallback: buscar pelo path do SharePoint
    if (cc.file_sharepoint_path) {
      const { data: byPath } = await supabase.from('cerebro_fila')
        .select('resumo, tags, nota_path, status, nome_arquivo')
        .ilike('sharepoint_url', `%${cc.file_sharepoint_path.split('/').pop()}%`)
        .order('processado_em', { ascending: false }).limit(1);
      if (byPath?.length && byPath[0].resumo) {
        return res.json({ resumo: byPath[0].resumo, tags: byPath[0].tags, nota_path: byPath[0].nota_path, file_name: cc.file_name, file_url: cc.file_url });
      }
    }

    res.json({ resumo: null, file_name: cc.file_name, file_url: cc.file_url, message: 'Documento ainda nao processado pelo Cerebro' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cycles/tasks/:taskId/critical — toggle critico
router.patch('/tasks/:taskId/critical', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('cycle_phase_tasks')
      .update({ is_critical: req.body.is_critical ?? false })
      .eq('id', req.params.taskId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cycles/kpis/area-weights — pesos de area por categoria
router.get('/kpis/area-weights', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_area_weights').select('*, event_categories(name)');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/cycles/kpis/area-weights — atualizar peso
router.put('/kpis/area-weights/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_area_weights').update({ weight: req.body.weight }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// TAREFAS PADRAO — CRUD (GET ja registrado acima de /:eventId)
// ══════════════════════════════════════════════

// Helper: propagar template para todos os eventos ativos com ciclo
async function propagarParaEventosAtivos(tmpl) {
  const etapaToFase = { 'Pré-Briefing': 'Pré Briefing', 'Aprovação': 'Aprovação', 'Execução Estratégica': 'Execução Estratégica', 'Pré-Testes': 'Pré-Testes', 'Finalizações': 'Finalizações', 'Alinhamentos Operacionais Finais': 'Alinhamentos Operacionais Finais', 'Dia D': 'Dia D', 'Debriefing': 'Debrief' };
  const faseNome = etapaToFase[tmpl.etapa] || tmpl.etapa;

  const { data: cycles } = await supabase.from('event_cycles').select('event_id, data_dia_d').eq('status', 'ativo');
  let propagados = 0;
  for (const c of (cycles || [])) {
    const { data: phase } = await supabase.from('event_cycle_phases').select('id').eq('event_id', c.event_id).eq('nome_fase', faseNome).maybeSingle();
    if (!phase) continue;
    const diaD = new Date(c.data_dia_d);
    const dataFim = new Date(diaD); dataFim.setDate(diaD.getDate() + tmpl.offset_end);
    const { data: task } = await supabase.from('cycle_phase_tasks').insert({
      event_phase_id: phase.id, event_id: c.event_id, titulo: tmpl.titulo,
      area: tmpl.area, prazo: dataFim.toISOString().split('T')[0], status: 'a_fazer', prioridade: 'normal',
    }).select().single();
    if (task && tmpl.adm_task_template_subtasks?.length) {
      await supabase.from('cycle_task_subtasks').insert(tmpl.adm_task_template_subtasks.map((s, i) => ({ task_id: task.id, name: s.name, sort_order: i })));
    }
    propagados++;
  }
  return propagados;
}

// POST /api/cycles/adm-templates — criar template + propagar para eventos ativos
router.post('/adm-templates', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('adm_task_templates').insert({
      area: d.area, etapa: d.etapa, titulo: d.titulo,
      offset_start: d.offset_start || 0, offset_end: d.offset_end || 0, sort_order: d.sort_order || 0,
    }).select('*, adm_task_template_subtasks(*)').single();
    if (error) throw error;

    // Propagar para eventos ativos nao concluidos
    const propagados = await propagarParaEventosAtivos(data);
    res.json({ ...data, propagados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/cycles/adm-templates/:id — atualizar
router.put('/adm-templates/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('adm_task_templates').update({
      area: d.area, etapa: d.etapa, titulo: d.titulo,
      offset_start: d.offset_start, offset_end: d.offset_end, ativo: d.ativo ?? true,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/cycles/adm-templates/:id — remove template + tarefas nao concluidas dos eventos ativos
router.delete('/adm-templates/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    // Buscar template antes de deletar pra saber titulo/area
    const { data: tmpl } = await supabase.from('adm_task_templates').select('titulo, area').eq('id', req.params.id).single();

    // Remover tarefas nao concluidas de eventos ativos que batem com esse template
    if (tmpl) {
      const { data: cycles } = await supabase.from('event_cycles').select('event_id').eq('status', 'ativo');
      const eventIds = (cycles || []).map(c => c.event_id);
      if (eventIds.length > 0) {
        // Buscar tasks que batem titulo+area e nao estao concluidas
        const { data: tasks } = await supabase.from('cycle_phase_tasks').select('id').in('event_id', eventIds).eq('titulo', tmpl.titulo).eq('area', tmpl.area).neq('status', 'concluida');
        const taskIds = (tasks || []).map(t => t.id);
        if (taskIds.length > 0) {
          await supabase.from('card_completions').delete().in('task_id', taskIds);
          await supabase.from('cycle_task_subtasks').delete().in('task_id', taskIds);
          await supabase.from('cycle_phase_tasks').delete().in('id', taskIds);
        }
      }
    }

    await supabase.from('adm_task_template_subtasks').delete().eq('template_id', req.params.id);
    await supabase.from('adm_task_templates').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cycles/adm-templates/:id/toggle — ativar/desativar
router.patch('/adm-templates/:id/toggle', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data: current } = await supabase.from('adm_task_templates').select('ativo').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('adm_task_templates').update({ ativo: !current.ativo }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cycles/adm-templates/:id/subtasks — adicionar subtarefa + propagar
router.post('/adm-templates/:id/subtasks', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('adm_task_template_subtasks').insert({
      template_id: req.params.id, name: req.body.name, offset_start: req.body.offset_start || 0, offset_end: req.body.offset_end || 0,
    }).select().single();
    if (error) throw error;

    // Propagar: adicionar subtarefa em todas as tasks nao concluidas dos eventos ativos
    const { data: tmpl } = await supabase.from('adm_task_templates').select('titulo, area').eq('id', req.params.id).single();
    if (tmpl) {
      const { data: cycles } = await supabase.from('event_cycles').select('event_id').eq('status', 'ativo');
      const eventIds = (cycles || []).map(c => c.event_id);
      if (eventIds.length > 0) {
        const { data: tasks } = await supabase.from('cycle_phase_tasks').select('id').in('event_id', eventIds).eq('titulo', tmpl.titulo).eq('area', tmpl.area).neq('status', 'concluida');
        if (tasks?.length) {
          const inserts = tasks.map(t => ({ task_id: t.id, name: req.body.name, sort_order: 99 }));
          await supabase.from('cycle_task_subtasks').insert(inserts);
        }
      }
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/cycles/adm-template-subtasks/:id — remover subtarefa + propagar
router.delete('/adm-template-subtasks/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    // Buscar nome da subtarefa e template pai antes de deletar
    const { data: sub } = await supabase.from('adm_task_template_subtasks').select('name, template_id').eq('id', req.params.id).single();
    if (sub) {
      const { data: tmpl } = await supabase.from('adm_task_templates').select('titulo, area').eq('id', sub.template_id).single();
      if (tmpl) {
        // Encontrar tasks nao concluidas nos eventos ativos
        const { data: cycles } = await supabase.from('event_cycles').select('event_id').eq('status', 'ativo');
        const eventIds = (cycles || []).map(c => c.event_id);
        if (eventIds.length > 0) {
          const { data: tasks } = await supabase.from('cycle_phase_tasks').select('id').in('event_id', eventIds).eq('titulo', tmpl.titulo).eq('area', tmpl.area).neq('status', 'concluida');
          const taskIds = (tasks || []).map(t => t.id);
          if (taskIds.length > 0) {
            // Remover subtarefas com mesmo nome dessas tasks
            await supabase.from('cycle_task_subtasks').delete().in('task_id', taskIds).eq('name', sub.name);
          }
        }
      }
    }

    await supabase.from('adm_task_template_subtasks').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
