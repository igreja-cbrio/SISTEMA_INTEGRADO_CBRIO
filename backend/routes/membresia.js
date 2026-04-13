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

    // Grupo de Conexão — participação atual + histórico
    const { data: participacoes } = await supabase
      .from('mem_grupo_membros')
      .select('*, grupo:mem_grupos(id, nome, categoria, local, dia_semana, horario, lider:mem_membros!lider_id(id, nome))')
      .eq('membro_id', membro.id)
      .order('entrou_em', { ascending: false });

    const grupo_atual = (participacoes || []).find(p => !p.saiu_em) || null;
    const grupo_historico = (participacoes || []).filter(p => p.saiu_em);

    res.json({
      ...membro,
      familiares,
      trilha: trilha || [],
      historico: historico || [],
      grupo_atual,
      grupo_historico,
    });
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

// ── Grupos de Conexão ──

// GET /api/membresia/grupos
router.get('/grupos', async (req, res) => {
  try {
    const { ativo } = req.query;
    let query = supabase
      .from('mem_grupos')
      .select('*, lider:mem_membros!lider_id(id, nome), membros:mem_grupo_membros(id, membro_id, entrou_em, saiu_em)')
      .order('nome');

    if (ativo === 'true') query = query.eq('ativo', true);
    if (ativo === 'false') query = query.eq('ativo', false);

    const { data, error } = await query;
    if (error) throw error;

    // Injeta total_ativos (só participações com saiu_em null)
    const withCount = (data || []).map(g => ({
      ...g,
      total_ativos: (g.membros || []).filter(m => !m.saiu_em).length,
    }));
    res.json(withCount);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupos' });
  }
});

// GET /api/membresia/grupos/:id (detalhe com membros ativos e históricos)
router.get('/grupos/:id', async (req, res) => {
  try {
    const { data: grupo, error } = await supabase
      .from('mem_grupos')
      .select('*, lider:mem_membros!lider_id(id, nome)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    const { data: participacoes } = await supabase
      .from('mem_grupo_membros')
      .select('*, membro:mem_membros(id, nome, status)')
      .eq('grupo_id', grupo.id)
      .order('entrou_em', { ascending: false });

    const ativos = (participacoes || []).filter(p => !p.saiu_em);
    const historico = (participacoes || []).filter(p => p.saiu_em);

    res.json({ ...grupo, ativos, historico });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupo' });
  }
});

// POST /api/membresia/grupos
router.post('/grupos', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.lider_id === '') delete payload.lider_id;
    if (payload.dia_semana === '' || payload.dia_semana == null) delete payload.dia_semana;
    if (payload.horario === '') delete payload.horario;

    const { data, error } = await supabase.from('mem_grupos').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
});

// PUT /api/membresia/grupos/:id
router.put('/grupos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.lider_id === '') payload.lider_id = null;
    if (payload.dia_semana === '') payload.dia_semana = null;
    if (payload.horario === '') payload.horario = null;

    const { data, error } = await supabase.from('mem_grupos').update(payload).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar grupo' });
  }
});

// DELETE /api/membresia/grupos/:id (soft delete: ativo = false)
router.delete('/grupos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_grupos').update({ ativo: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao desativar grupo' });
  }
});

// POST /api/membresia/grupos/:id/membros — adicionar membro ao grupo
// Se o membro já estava em outro grupo ativo, fecha o registro anterior (saiu_em = hoje).
router.post('/grupos/:id/membros', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const grupoId = req.params.id;
    const { membro_id, entrou_em } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatório' });

    const hoje = new Date().toISOString().slice(0, 10);

    // Fecha participação ativa anterior (se houver)
    await supabase
      .from('mem_grupo_membros')
      .update({ saiu_em: hoje, motivo_saida: 'Transferido para outro grupo' })
      .eq('membro_id', membro_id)
      .is('saiu_em', null);

    // Cria nova
    const { data, error } = await supabase
      .from('mem_grupo_membros')
      .insert({ grupo_id: grupoId, membro_id, entrou_em: entrou_em || hoje })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao adicionar membro ao grupo' });
  }
});

// PATCH /api/membresia/grupo-membros/:id/sair — remover membro do grupo (marca saiu_em)
router.patch('/grupo-membros/:id/sair', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { motivo } = req.body || {};
    const { data, error } = await supabase
      .from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().slice(0, 10), motivo_saida: motivo || null })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover membro do grupo' });
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
