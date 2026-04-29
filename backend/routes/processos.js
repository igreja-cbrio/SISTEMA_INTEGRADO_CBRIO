const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { coletarTodos } = require('../services/kpiAutoCollector');

const CRON_SECRET = process.env.CRON_SECRET;

// ── Cron / coletor automatico (auth via x-cron-secret ou Vercel cron) ──
// Definido ANTES de router.use(authenticate) para nao exigir login.
async function autorizaCron(req, res, next) {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  if (!isVercelCron && auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

router.get('/cron/coletar', autorizaCron, async (_req, res) => {
  try {
    const resultados = await coletarTodos();
    const ok = resultados.filter(r => r.status === 'ok').length;
    res.json({ ok, total: resultados.length, resultados });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cron/coletar', autorizaCron, async (_req, res) => {
  try {
    const resultados = await coletarTodos();
    const ok = resultados.filter(r => r.status === 'ok').length;
    res.json({ ok, total: resultados.length, resultados });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.use(authenticate);

// ═══ Rotas ESPECIFICAS primeiro (antes de /:id) ═══

// ── Trigger manual do coletor (admin/diretor) — dry_run opcional ──
router.post('/coletar', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const dryRun = req.query.dry_run === 'true' || req.body?.dry_run === true;
    const resultados = await coletarTodos({ dryRun });
    const ok = resultados.filter(r => r.status === 'ok').length;
    res.json({ dryRun, ok, total: resultados.length, resultados });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Agenda semanal ──
router.get('/agenda/all', async (req, res) => {
  try {
    const { area } = req.query;
    let q = supabase.from('indicador_agenda').select('*').order('dia_semana').order('area');
    if (area) q = q.eq('area', area);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('agenda list:', e.message);
    res.status(500).json({ error: 'Erro ao listar agenda' });
  }
});

router.put('/agenda/bulk', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const items = req.body.items;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items deve ser array' });
    const areas = [...new Set(items.map(i => i.area))];
    for (const a of areas) {
      await supabase.from('indicador_agenda').delete().eq('area', a);
    }
    if (items.length > 0) {
      const rows = items.map(i => ({ indicador_id: i.indicador_id, dia_semana: i.dia_semana, area: i.area }));
      const { error } = await supabase.from('indicador_agenda').insert(rows);
      if (error) throw error;
    }
    res.json({ success: true, count: items.length });
  } catch (e) {
    console.error('agenda bulk:', e.message);
    res.status(500).json({ error: 'Erro ao salvar agenda' });
  }
});

// ── Registros de preenchimento ──
router.get('/registros/list', async (req, res) => {
  try {
    const { processo_id, indicador_id, data_inicio, data_fim } = req.query;
    let q = supabase.from('processo_registros').select('*').order('data_preenchimento', { ascending: false }).limit(200);
    if (processo_id) q = q.eq('processo_id', processo_id);
    if (indicador_id) q = q.eq('indicador_id', indicador_id);
    if (data_inicio) q = q.gte('data_preenchimento', data_inicio);
    if (data_fim) q = q.lte('data_preenchimento', data_fim);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('registros list:', e.message);
    res.status(500).json({ error: 'Erro ao listar registros' });
  }
});

router.post('/registros', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase
      .from('processo_registros')
      .insert({
        processo_id: d.processo_id,
        indicador_id: d.indicador_id,
        valor: d.valor,
        periodo: d.periodo || null,
        data_preenchimento: d.data_preenchimento || new Date().toISOString().slice(0, 10),
        responsavel_id: req.user.userId,
        responsavel_nome: req.user.name || null,
        observacoes: d.observacoes || null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('registros create:', e.message);
    res.status(500).json({ error: 'Erro ao criar registro' });
  }
});

// ── Tarefas pessoais ──
router.get('/tarefas/list', async (req, res) => {
  try {
    const { area, data_inicio, data_fim } = req.query;
    let q = supabase.from('tarefas_pessoais').select('*').order('data');
    if (area) q = q.eq('area', area);
    if (data_inicio) q = q.gte('data', data_inicio);
    if (data_fim) q = q.lte('data', data_fim);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('tarefas list:', e.message);
    res.status(500).json({ error: 'Erro ao listar tarefas' });
  }
});

router.post('/tarefas', async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase
      .from('tarefas_pessoais')
      .insert({ titulo: d.titulo, data: d.data, area: d.area || null, created_by: req.user.userId })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('tarefas create:', e.message);
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
});

router.patch('/tarefas/:id', async (req, res) => {
  try {
    const { done } = req.body;
    const { data, error } = await supabase
      .from('tarefas_pessoais')
      .update({ done })
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('tarefas toggle:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
});

router.delete('/tarefas/:tid', async (req, res) => {
  try {
    const { error } = await supabase.from('tarefas_pessoais').delete().eq('id', req.params.tid);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('tarefas delete:', e.message);
    res.status(500).json({ error: 'Erro ao remover tarefa' });
  }
});

// ═══ Rotas GENERICAS (/:id por ultimo) ═══

router.get('/', async (req, res) => {
  try {
    const { area, categoria, is_okr, status } = req.query;
    let q = supabase.from('processos').select('*').order('area').order('nome');
    if (area) q = q.eq('area', area);
    if (categoria) q = q.eq('categoria', categoria);
    if (is_okr === 'true') q = q.eq('is_okr', true);
    if (status) q = q.eq('status', status);
    else q = q.neq('status', 'arquivado');
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('processos list:', e.message);
    res.status(500).json({ error: 'Erro ao listar processos' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('processos').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Processo nao encontrado' });
    res.json(data);
  } catch (e) {
    console.error('processos get:', e.message);
    res.status(500).json({ error: 'Erro ao buscar processo' });
  }
});

router.post('/', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('processos').insert({
      nome: d.nome, descricao: d.descricao || null, responsavel_id: d.responsavel_id || null,
      responsavel_nome: d.responsavel_nome || null, area: d.area, categoria: d.categoria,
      indicador_ids: d.indicador_ids || [], is_okr: d.is_okr || false,
      status: d.status || 'ativo', created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('processos create:', e.message);
    res.status(500).json({ error: 'Erro ao criar processo' });
  }
});

router.put('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('processos').update({
      nome: d.nome, descricao: d.descricao, responsavel_id: d.responsavel_id,
      responsavel_nome: d.responsavel_nome, area: d.area, categoria: d.categoria,
      indicador_ids: d.indicador_ids, is_okr: d.is_okr, status: d.status,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('processos update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar processo' });
  }
});

router.delete('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('processos')
      .update({ status: 'arquivado', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('processos delete:', e.message);
    res.status(500).json({ error: 'Erro ao arquivar processo' });
  }
});

module.exports = router;
