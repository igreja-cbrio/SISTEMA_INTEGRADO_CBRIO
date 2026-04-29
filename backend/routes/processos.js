const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// GET /api/processos — lista com filtros
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

// GET /api/processos/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('processos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Processo nao encontrado' });
    res.json(data);
  } catch (e) {
    console.error('processos get:', e.message);
    res.status(500).json({ error: 'Erro ao buscar processo' });
  }
});

// POST /api/processos
router.post('/', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase
      .from('processos')
      .insert({
        nome: d.nome,
        descricao: d.descricao || null,
        responsavel_id: d.responsavel_id || null,
        responsavel_nome: d.responsavel_nome || null,
        area: d.area,
        categoria: d.categoria,
        indicador_ids: d.indicador_ids || [],
        is_okr: d.is_okr || false,
        status: d.status || 'ativo',
        created_by: req.user.userId,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('processos create:', e.message);
    res.status(500).json({ error: 'Erro ao criar processo' });
  }
});

// PUT /api/processos/:id
router.put('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase
      .from('processos')
      .update({
        nome: d.nome,
        descricao: d.descricao,
        responsavel_id: d.responsavel_id,
        responsavel_nome: d.responsavel_nome,
        area: d.area,
        categoria: d.categoria,
        indicador_ids: d.indicador_ids,
        is_okr: d.is_okr,
        status: d.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('processos update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar processo' });
  }
});

// DELETE /api/processos/:id — soft delete (arquiva)
router.delete('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('processos')
      .update({ status: 'arquivado', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('processos delete:', e.message);
    res.status(500).json({ error: 'Erro ao arquivar processo' });
  }
});

// ── Agenda semanal (template de preenchimento) ──

// GET /api/processos/agenda/all — toda a agenda
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

// PUT /api/processos/agenda/bulk — salvar agenda inteira (upsert)
router.put('/agenda/bulk', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const items = req.body.items; // [{indicador_id, dia_semana, area}]
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items deve ser array' });

    // Limpa agenda existente e recria
    const areas = [...new Set(items.map(i => i.area))];
    for (const a of areas) {
      await supabase.from('indicador_agenda').delete().eq('area', a);
    }

    if (items.length > 0) {
      const rows = items.map(i => ({
        indicador_id: i.indicador_id,
        dia_semana: i.dia_semana,
        area: i.area,
      }));
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

// GET /api/processos/registros?processo_id=&indicador_id=
router.get('/registros/list', async (req, res) => {
  try {
    const { processo_id, indicador_id } = req.query;
    let q = supabase.from('processo_registros').select('*').order('data_preenchimento', { ascending: false }).limit(50);
    if (processo_id) q = q.eq('processo_id', processo_id);
    if (indicador_id) q = q.eq('indicador_id', indicador_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('registros list:', e.message);
    res.status(500).json({ error: 'Erro ao listar registros' });
  }
});

// POST /api/processos/registros
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
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('registros create:', e.message);
    res.status(500).json({ error: 'Erro ao criar registro' });
  }
});

module.exports = router;
