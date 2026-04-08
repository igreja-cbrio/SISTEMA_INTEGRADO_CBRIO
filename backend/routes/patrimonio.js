const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate, authorize('admin', 'diretor'));

// ── DASHBOARD ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [bens, categorias, localizacoes, inventarios] = await Promise.all([
      supabase.from('pat_bens').select('id, status, categoria_id, localizacao_id, valor_aquisicao'),
      supabase.from('pat_categorias').select('id, nome'),
      supabase.from('pat_localizacoes').select('id, nome'),
      supabase.from('pat_inventarios').select('id, status'),
    ]);

    const b = bens.data || [];
    const valorTotal = b.reduce((s, item) => s + Number(item.valor_aquisicao || 0), 0);

    const porStatus = {};
    b.forEach(item => { porStatus[item.status] = (porStatus[item.status] || 0) + 1; });

    const porCategoria = {};
    b.forEach(item => {
      const cat = (categorias.data || []).find(c => c.id === item.categoria_id);
      const nome = cat?.nome || 'Sem categoria';
      porCategoria[nome] = (porCategoria[nome] || 0) + 1;
    });

    const porLocalizacao = {};
    b.forEach(item => {
      const loc = (localizacoes.data || []).find(l => l.id === item.localizacao_id);
      const nome = loc?.nome || 'Sem localização';
      porLocalizacao[nome] = (porLocalizacao[nome] || 0) + 1;
    });

    res.json({
      totalBens: b.length,
      ativos: b.filter(i => i.status === 'ativo').length,
      manutencao: b.filter(i => i.status === 'manutencao').length,
      baixados: b.filter(i => i.status === 'baixado').length,
      extraviados: b.filter(i => i.status === 'extraviado').length,
      valorTotal,
      porCategoria,
      porLocalizacao,
      inventariosAbertos: (inventarios.data || []).filter(i => i.status === 'em_andamento').length,
    });
  } catch (e) {
    console.error('[PAT] Dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard patrimônio' });
  }
});

// ── CATEGORIAS ─────────────────────────────────────────────
router.get('/categorias', async (req, res) => {
  try {
    const { data, error } = await supabase.from('pat_categorias').select('*').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar categorias' }); }
});

router.post('/categorias', async (req, res) => {
  try {
    const { nome, icone, pai_id } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase.from('pat_categorias')
      .insert({ nome, icone: icone || null, pai_id: pai_id || null }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar categoria' }); }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('pat_categorias').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover categoria' }); }
});

// ── LOCALIZAÇÕES ───────────────────────────────────────────
router.get('/localizacoes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('pat_localizacoes').select('*').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar localizações' }); }
});

router.post('/localizacoes', async (req, res) => {
  try {
    const { nome, pai_id } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase.from('pat_localizacoes')
      .insert({ nome, pai_id: pai_id || null }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar localização' }); }
});

router.delete('/localizacoes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('pat_localizacoes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover localização' }); }
});

// ── BENS ───────────────────────────────────────────────────
router.get('/bens', async (req, res) => {
  try {
    const { status, categoria_id, localizacao_id, busca } = req.query;
    let query = supabase.from('pat_bens').select('*, pat_categorias(nome), pat_localizacoes(nome)').order('nome');
    if (status) query = query.eq('status', status);
    if (categoria_id) query = query.eq('categoria_id', categoria_id);
    if (localizacao_id) query = query.eq('localizacao_id', localizacao_id);
    if (busca) query = query.ilike('nome', `%${busca}%`);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar bens' }); }
});

router.get('/bens/:id', async (req, res) => {
  try {
    const { data: bem, error } = await supabase.from('pat_bens')
      .select('*, pat_categorias(nome), pat_localizacoes(nome)').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Bem não encontrado' });
    const { data: movs } = await supabase.from('pat_movimentacoes')
      .select('*, profiles!responsavel_id(name)').eq('bem_id', req.params.id).order('data_movimentacao', { ascending: false });
    res.json({ ...bem, movimentacoes: movs || [] });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar bem' }); }
});

router.post('/bens', async (req, res) => {
  try {
    const { codigo_barras, nome, descricao, categoria_id, localizacao_id, numero_serie, marca, modelo, valor_aquisicao, data_aquisicao, observacoes } = req.body;
    if (!codigo_barras || !nome) return res.status(400).json({ error: 'Código de barras e nome são obrigatórios' });
    const { data, error } = await supabase.from('pat_bens')
      .insert({ codigo_barras, nome, descricao: descricao || null, categoria_id: categoria_id || null, localizacao_id: localizacao_id || null, numero_serie: numero_serie || null, marca: marca || null, modelo: modelo || null, valor_aquisicao: valor_aquisicao || null, data_aquisicao: data_aquisicao || null, observacoes: observacoes || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao cadastrar bem' }); }
});

router.put('/bens/:id', async (req, res) => {
  try {
    const { codigo_barras, nome, descricao, categoria_id, localizacao_id, numero_serie, marca, modelo, valor_aquisicao, data_aquisicao, status, observacoes } = req.body;
    const { data, error } = await supabase.from('pat_bens')
      .update({ codigo_barras, nome, descricao, categoria_id, localizacao_id, numero_serie, marca, modelo, valor_aquisicao, data_aquisicao, status, observacoes })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar bem' }); }
});

router.delete('/bens/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('pat_bens').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover bem' }); }
});

// ── MOVIMENTAÇÕES ──────────────────────────────────────────
router.post('/bens/:id/movimentacoes', async (req, res) => {
  try {
    const { tipo, localizacao_origem_id, localizacao_destino_id, motivo } = req.body;
    if (!tipo) return res.status(400).json({ error: 'Tipo é obrigatório' });
    const { data, error } = await supabase.from('pat_movimentacoes')
      .insert({ bem_id: req.params.id, tipo, localizacao_origem_id: localizacao_origem_id || null, localizacao_destino_id: localizacao_destino_id || null, responsavel_id: req.user.userId, motivo: motivo || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    // Atualizar localização do bem se for transferência
    if (tipo === 'transferencia' && localizacao_destino_id) {
      await supabase.from('pat_bens').update({ localizacao_id: localizacao_destino_id }).eq('id', req.params.id);
    }
    if (tipo === 'manutencao') {
      await supabase.from('pat_bens').update({ status: 'manutencao' }).eq('id', req.params.id);
    }
    if (tipo === 'baixa') {
      await supabase.from('pat_bens').update({ status: 'baixado' }).eq('id', req.params.id);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar movimentação' }); }
});

// ── INVENTÁRIOS ────────────────────────────────────────────
router.get('/inventarios', async (req, res) => {
  try {
    const { data, error } = await supabase.from('pat_inventarios').select('*, profiles!responsavel_id(name)').order('data_inicio', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar inventários' }); }
});

router.post('/inventarios', async (req, res) => {
  try {
    const { nome, data_inicio, observacoes } = req.body;
    if (!nome || !data_inicio) return res.status(400).json({ error: 'Nome e data início são obrigatórios' });
    const { data, error } = await supabase.from('pat_inventarios')
      .insert({ nome, data_inicio, responsavel_id: req.user.userId, observacoes: observacoes || null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar inventário' }); }
});

router.patch('/inventarios/:id', async (req, res) => {
  try {
    const { status, data_fim, observacoes } = req.body;
    const update = {};
    if (status) update.status = status;
    if (data_fim) update.data_fim = data_fim;
    if (observacoes !== undefined) update.observacoes = observacoes;
    const { data, error } = await supabase.from('pat_inventarios')
      .update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar inventário' }); }
});

module.exports = router;
