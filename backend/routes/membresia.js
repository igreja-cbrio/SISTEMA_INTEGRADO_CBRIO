const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ── Membros ──

// GET /api/membresia/membros
router.get('/membros', async (req, res) => {
  try {
    const { status, busca } = req.query;
    let query = supabase
      .from('mem_membros')
      .select('*, familia:mem_familias(id, nome)')
      .eq('active', true)
      .order('nome');

    if (status) query = query.eq('status', status);
    if (busca) query = query.ilike('nome', `%${busca}%`);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
});

// GET /api/membresia/membros/:id (detalhe com trilha e histórico)
router.get('/membros/:id', async (req, res) => {
  try {
    const { data: membro, error } = await supabase
      .from('mem_membros')
      .select('*, familia:mem_familias(id, nome)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    // Familiares
    let familiares = [];
    if (membro.familia_id) {
      const { data: fam } = await supabase
        .from('mem_membros')
        .select('id, nome, status, foto_url')
        .eq('familia_id', membro.familia_id)
        .neq('id', membro.id)
        .eq('active', true);
      familiares = fam || [];
    }

    // Trilha dos valores
    const { data: trilha } = await supabase
      .from('mem_trilha_valores')
      .select('*')
      .eq('membro_id', membro.id)
      .order('created_at');

    // Histórico
    const { data: historico } = await supabase
      .from('mem_historico')
      .select('*, registrado:profiles(name)')
      .eq('membro_id', membro.id)
      .order('data', { ascending: false })
      .limit(20);

    res.json({ ...membro, familiares, trilha: trilha || [], historico: historico || [] });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar membro' });
  }
});

// POST /api/membresia/membros
router.post('/membros', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_membros')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar membro' });
  }
});

// PUT /api/membresia/membros/:id
router.put('/membros/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_membros')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar membro' });
  }
});

// DELETE /api/membresia/membros/:id (soft delete)
router.delete('/membros/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('mem_membros').update({ active: false }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

// ── Trilha dos Valores ──

// POST /api/membresia/trilha
router.post('/trilha', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_trilha_valores')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar etapa da trilha' });
  }
});

// PATCH /api/membresia/trilha/:id
router.patch('/trilha/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_trilha_valores')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar trilha' });
  }
});

// ── Famílias ──

// GET /api/membresia/familias
router.get('/familias', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_familias')
      .select('*, membros:mem_membros(id, nome, status)')
      .order('nome');
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar famílias' });
  }
});

// POST /api/membresia/familias
router.post('/familias', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_familias')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar família' });
  }
});

// ── Histórico ──

// POST /api/membresia/historico
router.post('/historico', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const body = { ...req.body, registrado_por: req.user.id };
    const { data, error } = await supabase
      .from('mem_historico')
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar histórico' });
  }
});

// ── KPIs ──
router.get('/kpis', async (req, res) => {
  try {
    const { data: membros } = await supabase
      .from('mem_membros')
      .select('status')
      .eq('active', true);

    const total = membros?.length || 0;
    const byStatus = {};
    (membros || []).forEach(m => {
      byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    });

    const { count: familias } = await supabase
      .from('mem_familias')
      .select('id', { count: 'exact', head: true });

    res.json({ total, byStatus, familias: familias || 0 });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar KPIs' });
  }
});

module.exports = router;
