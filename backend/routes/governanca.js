const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ── Helpers ──
function getWeekDate(year, month, weekNum) {
  // Retorna a data da quarta-feira da semana N do mes
  const first = new Date(year, month - 1, 1);
  const dayOfWeek = first.getDay(); // 0=dom, 3=qua
  const firstWed = dayOfWeek <= 3 ? 1 + (3 - dayOfWeek) : 1 + (10 - dayOfWeek);
  const day = firstWed + (weekNum - 1) * 7;
  const d = new Date(year, month - 1, day);
  return d.toISOString().split('T')[0];
}

// ══════════════════════════════════════════════
// TIPOS DE REUNIAO
// ══════════════════════════════════════════════

router.get('/types', async (req, res) => {
  try {
    const { data, error } = await supabase.from('governance_meeting_types').select('*').eq('ativo', true).order('sort_order');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// CICLOS MENSAIS
// ══════════════════════════════════════════════

// GET /api/governanca/cycles — lista de ciclos
router.get('/cycles', async (req, res) => {
  try {
    const { year } = req.query;
    let q = supabase.from('governance_cycles').select('*').order('year', { ascending: false }).order('month', { ascending: false });
    if (year) q = q.eq('year', Number(year));
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/governanca/cycles — criar ciclo mensal + reunioes + tarefas
router.post('/cycles', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { year, month } = req.body;
    if (!year || !month) return res.status(400).json({ error: 'year e month obrigatorios' });

    // Verifica duplicata
    const { data: existing } = await supabase.from('governance_cycles').select('id').eq('year', year).eq('month', month).maybeSingle();
    if (existing) return res.status(409).json({ error: `Ciclo ${month}/${year} ja existe` });

    // Criar ciclo
    const { data: cycle, error: cycleErr } = await supabase.from('governance_cycles')
      .insert({ year, month, created_by: req.user.userId }).select().single();
    if (cycleErr) throw cycleErr;

    // Buscar tipos ativos
    const { data: types } = await supabase.from('governance_meeting_types').select('*').eq('ativo', true).order('sort_order');

    // Filtrar por recorrencia
    const meetingTypes = (types || []).filter(t => {
      if (t.recorrencia === 'mensal') return true;
      if (t.recorrencia === 'quadrimestral') return [1, 5, 9].includes(month); // jan, mai, set
      if (t.recorrencia === 'semestral') return [6, 12].includes(month); // jun, dez
      return false;
    });

    // Criar reunioes
    const meetings = meetingTypes.map(t => ({
      cycle_id: cycle.id, type_id: t.id,
      date: getWeekDate(year, month, t.semana),
      created_by: req.user.userId,
    }));
    const { data: createdMeetings, error: meetErr } = await supabase.from('governance_meetings').insert(meetings).select();
    if (meetErr) throw meetErr;

    // Criar tarefas dos templates para cada reuniao
    const { data: templates } = await supabase.from('governance_task_templates').select('*').eq('ativo', true).order('sort_order');
    const tasks = [];
    for (const mtg of (createdMeetings || [])) {
      const mtgTemplates = (templates || []).filter(t => t.type_id === meetingTypes.find(mt => mt.id === mtg.type_id)?.id);
      for (const tmpl of mtgTemplates) {
        const prazo = new Date(mtg.date);
        prazo.setDate(prazo.getDate() + (tmpl.prazo_offset_dias || -3));
        tasks.push({
          meeting_id: mtg.id, titulo: tmpl.titulo, descricao: tmpl.descricao || '',
          responsavel: tmpl.responsavel_padrao || '', prazo: prazo.toISOString().split('T')[0],
          prioridade: tmpl.prioridade || 'normal', sort_order: tmpl.sort_order,
          created_by: req.user.userId,
        });
      }
    }
    if (tasks.length > 0) await supabase.from('governance_tasks').insert(tasks);

    res.json({ cycle, meetings: createdMeetings?.length || 0, tasks: tasks.length });
  } catch (err) { console.error('[GOV]', err); res.status(500).json({ error: err.message }); }
});

// POST /api/governanca/cycles/generate-year — gerar todos os ciclos de um ano
router.post('/cycles/generate-year', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { year } = req.body;
    if (!year) return res.status(400).json({ error: 'year obrigatorio' });

    let created = 0;
    let skipped = 0;
    for (let month = 1; month <= 12; month++) {
      const { data: existing } = await supabase.from('governance_cycles').select('id').eq('year', year).eq('month', month).maybeSingle();
      if (existing) { skipped++; continue; }

      // Criar ciclo + reunioes + tarefas (reusa logica)
      const { data: cycle } = await supabase.from('governance_cycles').insert({ year, month, created_by: req.user.userId }).select().single();
      if (!cycle) continue;

      const { data: types } = await supabase.from('governance_meeting_types').select('*').eq('ativo', true).order('sort_order');
      const meetingTypes = (types || []).filter(t => {
        if (t.recorrencia === 'mensal') return true;
        if (t.recorrencia === 'quadrimestral') return [1, 5, 9].includes(month);
        if (t.recorrencia === 'semestral') return [6, 12].includes(month);
        return false;
      });

      const meetings = meetingTypes.map(t => ({ cycle_id: cycle.id, type_id: t.id, date: getWeekDate(year, month, t.semana), created_by: req.user.userId }));
      const { data: createdMtgs } = await supabase.from('governance_meetings').insert(meetings).select();

      const { data: templates } = await supabase.from('governance_task_templates').select('*').eq('ativo', true).order('sort_order');
      const tasks = [];
      for (const mtg of (createdMtgs || [])) {
        const mtgTmpls = (templates || []).filter(t => t.type_id === meetingTypes.find(mt => mt.id === mtg.type_id)?.id);
        for (const tmpl of mtgTmpls) {
          const prazo = new Date(mtg.date);
          prazo.setDate(prazo.getDate() + (tmpl.prazo_offset_dias || -3));
          tasks.push({ meeting_id: mtg.id, titulo: tmpl.titulo, descricao: tmpl.descricao || '', responsavel: tmpl.responsavel_padrao || '', prazo: prazo.toISOString().split('T')[0], prioridade: tmpl.prioridade || 'normal', sort_order: tmpl.sort_order, created_by: req.user.userId });
        }
      }
      if (tasks.length > 0) await supabase.from('governance_tasks').insert(tasks);
      created++;
    }
    res.json({ created, skipped, year });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// REUNIOES — detalhe + update
// ══════════════════════════════════════════════

// GET /api/governanca/cycle/:year/:month — ciclo completo com reunioes e tarefas
router.get('/cycle/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const { data: cycle } = await supabase.from('governance_cycles').select('*').eq('year', Number(year)).eq('month', Number(month)).maybeSingle();
    if (!cycle) return res.json({ cycle: null, meetings: [] });

    const { data: meetings } = await supabase.from('governance_meetings')
      .select('*, governance_meeting_types(nome, sigla, cor, semana, descricao)')
      .eq('cycle_id', cycle.id).order('date');

    const meetingIds = (meetings || []).map(m => m.id);
    const { data: tasks } = meetingIds.length > 0
      ? await supabase.from('governance_tasks').select('*').in('meeting_id', meetingIds).order('sort_order')
      : { data: [] };

    const taskMap = {};
    (tasks || []).forEach(t => { if (!taskMap[t.meeting_id]) taskMap[t.meeting_id] = []; taskMap[t.meeting_id].push(t); });

    const enriched = (meetings || []).map(m => ({
      ...m,
      type_nome: m.governance_meeting_types?.nome,
      type_sigla: m.governance_meeting_types?.sigla,
      type_cor: m.governance_meeting_types?.cor,
      type_semana: m.governance_meeting_types?.semana,
      type_descricao: m.governance_meeting_types?.descricao,
      governance_meeting_types: undefined,
      tasks: taskMap[m.id] || [],
    }));

    res.json({ cycle, meetings: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/governanca/meetings/:id — atualizar reuniao (pauta, ata, status, etc.)
router.put('/meetings/:id', async (req, res) => {
  try {
    const allowed = ['date', 'status', 'pauta', 'ata', 'deliberacoes', 'participantes', 'quorum_presente', 'local', 'observacoes'];
    const update = { updated_at: new Date().toISOString() };
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    const { data, error } = await supabase.from('governance_meetings').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// TAREFAS
// ══════════════════════════════════════════════

router.post('/tasks', async (req, res) => {
  try {
    const { meeting_id, titulo, descricao, responsavel, prazo, prioridade } = req.body;
    if (!meeting_id || !titulo?.trim()) return res.status(400).json({ error: 'meeting_id e titulo obrigatorios' });
    const { data, error } = await supabase.from('governance_tasks').insert({
      meeting_id, titulo: titulo.trim(), descricao: descricao || '', responsavel: responsavel || '',
      prazo: prazo || null, prioridade: prioridade || 'normal', created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/tasks/:id', async (req, res) => {
  try {
    const allowed = ['titulo', 'descricao', 'responsavel', 'prazo', 'status', 'prioridade'];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    const { data, error } = await supabase.from('governance_tasks').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    await supabase.from('governance_tasks').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/governanca/calendar — reunioes para o calendario (por ano)
router.get('/calendar', async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'year obrigatorio' });
    const { data: cycles } = await supabase.from('governance_cycles').select('id').eq('year', Number(year));
    if (!cycles?.length) return res.json([]);
    const cycleIds = cycles.map(c => c.id);
    const { data, error } = await supabase.from('governance_meetings')
      .select('id, date, status, governance_meeting_types(nome, sigla, cor)')
      .in('cycle_id', cycleIds).order('date');
    if (error) throw error;
    res.json((data || []).map(m => ({
      id: m.id, date: m.date, status: m.status,
      name: m.governance_meeting_types?.nome || '',
      sigla: m.governance_meeting_types?.sigla || '',
      color: m.governance_meeting_types?.cor || '#00B39D',
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// DADOS AUTOMATICOS PARA APRESENTACAO
// ══════════════════════════════════════════════

router.get('/meetings/:id/dados', async (req, res) => {
  try {
    const { data: meeting } = await supabase.from('governance_meetings')
      .select('*, governance_meeting_types(sigla)').eq('id', req.params.id).single();
    if (!meeting) return res.status(404).json({ error: 'Reuniao nao encontrada' });

    const sigla = meeting.governance_meeting_types?.sigla;
    const dados = {};

    if (sigla === 'OKR') {
      // Projetos e expansao — status geral
      const { data: proj } = await supabase.from('projects').select('id, name, status, date_end, responsible, area').neq('status', 'concluido').neq('status', 'cancelado');
      const { data: marcos } = await supabase.from('expansion_milestones').select('id, name, status, date_end, responsible, area').neq('status', 'concluido').neq('status', 'cancelado');
      dados.projetos = proj || [];
      dados.marcos = marcos || [];
      dados.resumo = {
        projetos_ativos: (proj || []).length,
        projetos_atrasados: (proj || []).filter(p => p.date_end && p.date_end < new Date().toISOString().split('T')[0]).length,
        marcos_ativos: (marcos || []).length,
        marcos_atrasados: (marcos || []).filter(m => m.date_end && m.date_end < new Date().toISOString().split('T')[0]).length,
      };
    }

    if (sigla === 'DRE') {
      // Financeiro — dashboard
      const { data: contas } = await supabase.from('fin_contas').select('nome, saldo');
      const { data: transacoes } = await supabase.from('fin_transacoes').select('tipo, valor, data').gte('data', `${meeting.date?.slice(0, 7)}-01`).lte('data', meeting.date || '');
      dados.contas = contas || [];
      dados.transacoes_mes = transacoes || [];
      const receitas = (transacoes || []).filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
      const despesas = (transacoes || []).filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
      dados.resumo = { receitas, despesas, resultado: receitas - despesas };
    }

    if (sigla === 'KPI') {
      // KPIs dos cultos do mes
      const { data: cultos } = await supabase.from('vw_culto_stats').select('*').gte('data', `${meeting.date?.slice(0, 7)}-01`).lte('data', meeting.date || '').order('data');
      dados.cultos = cultos || [];
      dados.resumo = {
        total_cultos: (cultos || []).length,
        presenca_media: (cultos || []).length > 0 ? Math.round((cultos || []).reduce((s, c) => s + (c.presenca_total || 0), 0) / (cultos || []).length) : 0,
      };
    }

    if (sigla === 'CC') {
      // Consolidado: pendencias anteriores do conselho + resumo geral
      const { data: cycle } = await supabase.from('governance_cycles').select('id').eq('year', Number(meeting.date?.slice(0, 4))).eq('month', Number(meeting.date?.slice(5, 7))).maybeSingle();
      if (cycle) {
        const { data: allMeetings } = await supabase.from('governance_meetings').select('id').eq('cycle_id', cycle.id);
        const ids = (allMeetings || []).map(m => m.id);
        if (ids.length > 0) {
          const { data: pendencias } = await supabase.from('governance_tasks').select('*').in('meeting_id', ids).neq('status', 'concluida').order('prazo');
          dados.pendencias_abertas = pendencias || [];
        }
      }
      dados.resumo = { pendencias_abertas: (dados.pendencias_abertas || []).length };
    }

    res.json({ sigla, dados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// TEMPLATES DE TAREFAS (CRUD)
// ══════════════════════════════════════════════

router.get('/task-templates', async (req, res) => {
  try {
    const { data, error } = await supabase.from('governance_task_templates').select('*, governance_meeting_types(nome, sigla)').order('sort_order');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/task-templates', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('governance_task_templates').insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/task-templates/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('governance_task_templates').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
