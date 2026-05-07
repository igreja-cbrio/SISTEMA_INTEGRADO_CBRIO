// ============================================================================
// /api/estrategia/* — Estrutura formal de OKR (Direcionador → Objetivo → KPI → KR)
//
// Substitui /api/okrs antigo. Centraliza:
//   - Direcionadores (UNIDADE, etc)
//   - Objetivos gerais (25 da planilha)
//   - KRs (gerais ligados a objetivo · especificos ligados a KPI)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ============================================================================
// DIRECIONADORES (read-only para todos · admin pode CRUD)
// ============================================================================
router.get('/direcionadores', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('direcionadores')
      .select('*')
      .eq('ativo', true)
      .order('ordem');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/direcionadores', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { nome, descricao, ordem } = req.body;
    if (!nome) return res.status(400).json({ error: 'nome obrigatorio' });
    const { data, error } = await supabase
      .from('direcionadores')
      .insert({ nome, descricao, ordem: ordem || 99, ativo: true })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/direcionadores/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['nome', 'descricao', 'ordem', 'ativo'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) update[k] = v;
    const { data, error } = await supabase
      .from('direcionadores')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// OBJETIVOS GERAIS
// ============================================================================
router.get('/objetivos', async (req, res) => {
  try {
    const ativos = req.query.ativos !== 'false';
    let q = supabase
      .from('kpi_objetivos_gerais')
      .select('*, direcionador:direcionadores(id, nome)')
      .order('ordem');
    if (ativos) q = q.eq('ativo', true);

    const { data, error } = await q;
    if (error) throw error;

    // Para cada objetivo, contar KPIs e KRs vinculados
    if (data && data.length > 0) {
      const ids = data.map(o => o.id);
      const { data: kpis } = await supabase
        .from('kpi_indicadores_taticos')
        .select('id, area, objetivo_geral_id, ativo')
        .in('objetivo_geral_id', ids);
      const { data: krs } = await supabase
        .from('kpi_krs')
        .select('id, objetivo_geral_id, ativo')
        .in('objetivo_geral_id', ids);

      const kpisByObj = {};
      (kpis || []).forEach(k => {
        if (k.ativo) {
          kpisByObj[k.objetivo_geral_id] = (kpisByObj[k.objetivo_geral_id] || 0) + 1;
        }
      });
      const krsByObj = {};
      (krs || []).forEach(k => {
        if (k.ativo) {
          krsByObj[k.objetivo_geral_id] = (krsByObj[k.objetivo_geral_id] || 0) + 1;
        }
      });

      data.forEach(o => {
        o.total_kpis = kpisByObj[o.id] || 0;
        o.total_krs  = krsByObj[o.id] || 0;
      });
    }

    res.json(data || []);
  } catch (e) {
    console.error('estrategia/objetivos:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/objetivos/:id', async (req, res) => {
  try {
    const { data: obj, error } = await supabase
      .from('kpi_objetivos_gerais')
      .select('*, direcionador:direcionadores(id, nome)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!obj) return res.status(404).json({ error: 'Objetivo nao encontrado' });

    // KPIs vinculados
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, area, valores, periodicidade, meta_descricao, is_okr, ativo')
      .eq('objetivo_geral_id', req.params.id)
      .eq('ativo', true)
      .order('area');

    // KRs gerais
    const { data: krs } = await supabase
      .from('kpi_krs')
      .select('*')
      .eq('objetivo_geral_id', req.params.id)
      .eq('ativo', true)
      .order('ordem');

    res.json({ ...obj, kpis: kpis || [], krs: krs || [] });
  } catch (e) {
    console.error('estrategia/objetivos/:id', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/objetivos', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['nome', 'descricao', 'indicador_geral', 'valores', 'ordem', 'direcionador_id', 'ativo'];
    const payload = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) payload[k] = v;
    if (!payload.nome) return res.status(400).json({ error: 'nome obrigatorio' });
    payload.ativo = payload.ativo !== false;

    const { data, error } = await supabase
      .from('kpi_objetivos_gerais')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ja existe objetivo com esse nome' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/objetivos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['nome', 'descricao', 'indicador_geral', 'valores', 'ordem', 'direcionador_id', 'ativo'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) update[k] = v;

    const { data, error } = await supabase
      .from('kpi_objetivos_gerais')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/objetivos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    // Soft delete: marcar inativo (preserva FKs)
    const { error } = await supabase
      .from('kpi_objetivos_gerais')
      .update({ ativo: false })
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// KRs (gerais ligados a objetivo · especificos ligados a KPI)
// ============================================================================

// GET /krs?objetivo_geral_id=xxx ou ?kpi_id=xxx
router.get('/krs', async (req, res) => {
  try {
    const { objetivo_geral_id, kpi_id } = req.query;
    let q = supabase.from('kpi_krs').select('*').eq('ativo', true).order('ordem');
    if (objetivo_geral_id) q = q.eq('objetivo_geral_id', objetivo_geral_id);
    if (kpi_id) q = q.eq('kpi_id', kpi_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/krs', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['objetivo_geral_id', 'kpi_id', 'titulo', 'descricao', 'formula_calculo', 'meta_valor', 'meta_texto', 'unidade', 'ordem'];
    const payload = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) payload[k] = v;
    if (!payload.titulo) return res.status(400).json({ error: 'titulo obrigatorio' });
    if (!payload.objetivo_geral_id && !payload.kpi_id) {
      return res.status(400).json({ error: 'KR deve estar ligado a um objetivo geral OU a um KPI' });
    }
    if (payload.objetivo_geral_id && payload.kpi_id) {
      return res.status(400).json({ error: 'KR nao pode estar ligado a ambos (objetivo E KPI)' });
    }
    payload.ativo = true;

    const { data, error } = await supabase
      .from('kpi_krs')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/krs/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['titulo', 'descricao', 'formula_calculo', 'meta_valor', 'meta_texto', 'unidade', 'ordem', 'ativo'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) update[k] = v;

    const { data, error } = await supabase
      .from('kpi_krs')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/krs/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('kpi_krs')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
