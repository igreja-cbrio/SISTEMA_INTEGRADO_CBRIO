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

module.exports = router;
