// ============================================================================
// Devocionais (Gap 3) - tracking pessoal/familiar/grupo
// Alimenta KID-04 (familias com devocionais) via mem_devocionais.
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais — lista paginada com filtros
// query: ?membro_id=&tipo=&desde=&ate=&page=&limit=
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { membro_id, tipo, desde, ate, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let q = supabase
      .from('mem_devocionais')
      .select('*, mem_membros(nome, foto_url)', { count: 'exact' })
      .order('data_devocional', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (membro_id) q = q.eq('membro_id', membro_id);
    if (tipo) q = q.eq('tipo', tipo);
    if (desde) q = q.gte('data_devocional', desde);
    if (ate) q = q.lte('data_devocional', ate);

    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data: data || [], total: count || 0 });
  } catch (e) {
    console.error('devocionais list:', e.message);
    res.status(500).json({ error: 'Erro ao listar devocionais' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais/membro/:id — historico de um membro
// ─────────────────────────────────────────────────────────────
router.get('/membro/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_devocionais')
      .select('*')
      .eq('membro_id', req.params.id)
      .order('data_devocional', { ascending: false })
      .limit(60);
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (e) {
    console.error('devocionais membro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar devocionais do membro' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais/stats — agregados para dashboard
// query: ?desde=&ate=
// ─────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { desde, ate } = req.query;
    const hoje = new Date().toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const inicio = desde || d30;
    const fim = ate || hoje;

    const { data } = await supabase
      .from('mem_devocionais')
      .select('membro_id, tipo, mem_membros(familia_id)')
      .gte('data_devocional', inicio)
      .lte('data_devocional', fim);

    const rows = data || [];
    const familias = new Set();
    const membros = new Set();
    const porTipo = { pessoal: 0, familiar: 0, grupo: 0 };

    rows.forEach(r => {
      membros.add(r.membro_id);
      if (porTipo[r.tipo] !== undefined) porTipo[r.tipo]++;
      const fid = r.mem_membros?.familia_id;
      if (r.tipo === 'familiar' && fid) familias.add(fid);
    });

    res.json({
      periodo: { inicio, fim },
      total_registros: rows.length,
      familias_com_devocional_familiar: familias.size,
      membros_com_devocional: membros.size,
      por_tipo: porTipo,
    });
  } catch (e) {
    console.error('devocionais stats:', e.message);
    res.status(500).json({ error: 'Erro ao calcular stats' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/devocionais — registrar 1 devocional
// body: { membro_id, data_devocional?, tipo, topico?, observacoes? }
// ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { membro_id, data_devocional, tipo, topico, observacoes } = req.body || {};
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });
    if (!tipo || !['pessoal', 'familiar', 'grupo'].includes(tipo)) {
      return res.status(400).json({ error: "tipo deve ser 'pessoal', 'familiar' ou 'grupo'" });
    }

    const payload = {
      membro_id,
      data_devocional: data_devocional || new Date().toISOString().slice(0, 10),
      tipo,
      topico: topico || null,
      observacoes: observacoes || null,
      created_by: req.user?.id || null,
    };

    const { data, error } = await supabase
      .from('mem_devocionais')
      .insert(payload)
      .select()
      .single();

    if (error) {
      // 23505 = unique violation (mesmo membro+data+tipo)
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Devocional ja registrado para esse membro/dia/tipo' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('devocionais create:', e.message);
    res.status(500).json({ error: 'Erro ao registrar devocional' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/devocionais/:id
// ─────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { tipo, topico, observacoes, concluida } = req.body || {};
    const patch = {};
    if (tipo !== undefined) {
      if (!['pessoal', 'familiar', 'grupo'].includes(tipo)) {
        return res.status(400).json({ error: 'tipo invalido' });
      }
      patch.tipo = tipo;
    }
    if (topico !== undefined) patch.topico = topico;
    if (observacoes !== undefined) patch.observacoes = observacoes;
    if (concluida !== undefined) patch.concluida = !!concluida;

    const { data, error } = await supabase
      .from('mem_devocionais')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('devocionais update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar devocional' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/devocionais/:id
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('mem_devocionais')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('devocionais delete:', e.message);
    res.status(500).json({ error: 'Erro ao deletar devocional' });
  }
});

module.exports = router;
