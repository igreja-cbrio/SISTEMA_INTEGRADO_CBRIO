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
const painelCache = require('../services/painelCache');

router.use(authenticate);

// Toda mutacao de OKR/KR/KPI invalida o cache do painel · usuario ve mudanca
// no proximo refresh sem esperar TTL. Aplicado a TODAS as rotas POST/PUT/PATCH/DELETE
// deste router automaticamente.
router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) painelCache.bust('');
    });
  }
  next();
});

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
      .select('id, indicador, descricao, area, valores, periodicidade, meta_descricao, meta_valor, unidade, tipo_kpi, tipo_calculo, formula_config, is_okr, ativo')
      .eq('objetivo_geral_id', req.params.id)
      .eq('ativo', true)
      .order('area');

    // Ultimo valor calculado de cada KPI (pra mostrar no desdobramento operacional)
    let valoresPorKpi = {};
    if ((kpis || []).length > 0) {
      const ids = kpis.map(k => k.id);
      const { data: valores } = await supabase
        .from('kpi_valores_calculados')
        .select('kpi_id, valor_calculado, periodo_referencia, calculado_em')
        .in('kpi_id', ids)
        .order('calculado_em', { ascending: false });
      (valores || []).forEach(v => {
        if (!valoresPorKpi[v.kpi_id]) valoresPorKpi[v.kpi_id] = v;
      });
    }
    const kpisComValor = (kpis || []).map(k => ({
      ...k,
      ultimo_valor: valoresPorKpi[k.id]?.valor_calculado ?? null,
      ultimo_periodo: valoresPorKpi[k.id]?.periodo_referencia ?? null,
    }));

    // KRs (gerais + especificos por area · ordenado: gerais primeiro, depois por area)
    const { data: krs } = await supabase
      .from('kpi_krs')
      .select('*')
      .eq('objetivo_geral_id', req.params.id)
      .eq('ativo', true)
      .order('ordem')
      .order('area', { nullsFirst: true });

    res.json({ ...obj, kpis: kpisComValor, krs: krs || [] });
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

// ============================================================================
// METAS INSTITUCIONAIS · 1 por (tipo_kpi, ano)
// ============================================================================
router.get('/metas-institucionais', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kpi_metas_institucionais')
      .select('*')
      .eq('ativo', true)
      .order('ano', { ascending: false })
      .order('tipo_kpi');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/metas-institucionais', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['tipo_kpi', 'ano', 'meta_descricao', 'meta_valor', 'unidade', 'observacoes'];
    const payload = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) payload[k] = v;
    if (!payload.tipo_kpi || !payload.ano || !payload.meta_descricao) {
      return res.status(400).json({ error: 'tipo_kpi, ano e meta_descricao obrigatorios' });
    }
    const { data, error } = await supabase
      .from('kpi_metas_institucionais')
      .upsert(payload, { onConflict: 'tipo_kpi,ano' })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/metas-institucionais/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['meta_descricao', 'meta_valor', 'unidade', 'observacoes', 'ativo'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) update[k] = v;

    const { data, error } = await supabase
      .from('kpi_metas_institucionais')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Lista OKRs agrupados por tipo (qual / quant) · pra UI da aba Metas Institucionais
router.get('/okrs-por-tipo', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kpi_objetivos_gerais')
      .select('id, nome, indicador_geral, tipo_okr, dado_tipo_principal, meta_descricao, meta_valor, meta_valor_absoluto, ordem')
      .eq('ativo', true)
      .order('tipo_okr')
      .order('ordem');
    if (error) throw error;
    // tipo_okr aceita varios buckets · agrupar dinamicamente em vez de
    // assumir apenas qualitativo/quantitativo/sem_tipo (tinha 'operacional'
    // gerando erro 'cannot read properties of undefined' antes).
    const agrupado = { qualitativo: [], quantitativo: [], sem_tipo: [] };
    (data || []).forEach(o => {
      const bucket = o.tipo_okr || 'sem_tipo';
      if (!agrupado[bucket]) agrupado[bucket] = [];
      agrupado[bucket].push(o);
    });
    res.json(agrupado);
  } catch (e) {
    console.error('[estrategia/okrs-por-tipo]', e?.message, e?.stack);
    res.status(500).json({ error: e?.message || 'Erro ao carregar OKRs por tipo' });
  }
});

// Forca recalculo das metas institucionais em todos KPIs (admin/diretor)
router.post('/metas-institucionais/aplicar', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { tipo } = req.body || {};
    const { data, error } = await supabase.rpc('aplicar_meta_institucional', { p_tipo: tipo || null });
    if (error) throw error;
    res.json({ ok: true, resultado: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atualizar tipo_okr de um OKR individual (caso heuristica tenha errado)
router.put('/objetivos/:id/tipo', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { tipo_okr } = req.body || {};
    if (!['qualitativo', 'quantitativo', null].includes(tipo_okr)) {
      return res.status(400).json({ error: 'tipo_okr deve ser qualitativo, quantitativo ou null' });
    }
    const { data, error } = await supabase
      .from('kpi_objetivos_gerais')
      .update({ tipo_okr })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atualizar dado_tipo_principal de um OKR
router.put('/objetivos/:id/dado-tipo-principal', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { dado_tipo_principal } = req.body || {};
    const { data, error } = await supabase
      .from('kpi_objetivos_gerais')
      .update({ dado_tipo_principal })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
