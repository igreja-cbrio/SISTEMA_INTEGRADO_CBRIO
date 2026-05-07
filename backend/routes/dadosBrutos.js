// ============================================================================
// /api/dados-brutos/* — Dados brutos (numeros absolutos)
//
// Conceito: lider preenche numeros absolutos (frequencia, conversoes,
// batismos, etc). KPIs com tipo_calculo automatico leem daqui e calculam.
//
// Endpoints:
//   GET    /tipos                        - catalogo de tipos
//   POST   /tipos                        - criar tipo (admin)
//   PUT    /tipos/:id                    - editar tipo (admin)
//   GET    /                             - listar dados (filtros)
//   POST   /                             - registrar dado
//   PUT    /:id                          - editar dado
//   DELETE /:id                          - remover dado
// ============================================================================

const router = require('express').Router();
const { authenticate, authorize, authorizeKpiArea } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ----------------------------------------------------------------------------
// TIPOS DE DADO BRUTO (catalogo)
// ----------------------------------------------------------------------------
router.get('/tipos', async (req, res) => {
  try {
    const ativos = req.query.ativos !== 'false';
    let q = supabase.from('tipos_dado_bruto').select('*').order('ordem');
    if (ativos) q = q.eq('ativo', true);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tipos', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['id', 'nome', 'descricao', 'unidade', 'agregacao', 'granularidade', 'origem_tabela', 'ordem', 'ativo'];
    const payload = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) payload[k] = v;
    if (!payload.id || !payload.nome) {
      return res.status(400).json({ error: 'id e nome obrigatorios' });
    }
    const { data, error } = await supabase
      .from('tipos_dado_bruto')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ja existe tipo com esse id' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/tipos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['nome', 'descricao', 'unidade', 'agregacao', 'granularidade', 'origem_tabela', 'ordem', 'ativo'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) update[k] = v;
    const { data, error } = await supabase
      .from('tipos_dado_bruto')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// DADOS BRUTOS (registros)
// ----------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { tipo_id, area, desde, ate } = req.query;
    const limit = Math.min(Number(req.query.limit) || 200, 2000);

    let q = supabase
      .from('vw_dados_brutos_completo')
      .select('*')
      .order('data', { ascending: false })
      .limit(limit);

    if (tipo_id) q = q.eq('tipo_id', tipo_id);
    if (area)    q = q.eq('area', area);
    if (desde)   q = q.gte('data', desde);
    if (ate)     q = q.lte('data', ate);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/',
  authorizeKpiArea(req => (req.body?.area || '').toLowerCase()),
  async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.tipo_id || !b.area || !b.data || b.valor == null) {
        return res.status(400).json({ error: 'tipo_id, area, data e valor obrigatorios' });
      }
      const payload = {
        tipo_id: b.tipo_id,
        area: String(b.area).toLowerCase(),
        data: b.data,
        valor: Number(b.valor),
        contexto: b.contexto || {},
        observacao: b.observacao || null,
        origem: b.origem || 'manual',
        registrado_por: req.user?.id || null,
      };
      const { data, error } = await supabase
        .from('dados_brutos')
        .upsert(payload, { onConflict: 'tipo_id,area,data,contexto' })
        .select()
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

router.put('/:id', async (req, res) => {
  try {
    // Para edicao: validar permissao via area do registro existente
    const { data: cur, error: errCur } = await supabase
      .from('dados_brutos')
      .select('area')
      .eq('id', req.params.id)
      .maybeSingle();
    if (errCur) throw errCur;
    if (!cur) return res.status(404).json({ error: 'Registro nao encontrado' });

    // Se nao admin/diretor, conferir kpi_areas
    if (!['admin', 'diretor'].includes(req.user?.role)) {
      const myAreas = (req.user.kpi_areas || []).map(a => a.toLowerCase());
      if (!myAreas.includes(cur.area.toLowerCase())) {
        return res.status(403).json({ error: 'Sem permissao para esta area' });
      }
    }

    const allowed = ['valor', 'contexto', 'observacao'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (allowed.includes(k)) update[k] = v;
    }
    if (update.valor != null) update.valor = Number(update.valor);

    const { data, error } = await supabase
      .from('dados_brutos')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// POST /:id/validar — lider de area da OK (validacao final de ciclo)
// ----------------------------------------------------------------------------
router.post('/:id/validar', async (req, res) => {
  try {
    const { data: cur } = await supabase
      .from('dados_brutos')
      .select('area, validado_em')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Registro nao encontrado' });

    // Conferir permissao de validacao (lider de area + admin/diretor)
    if (!['admin', 'diretor'].includes(req.user?.role)) {
      const myAreas = (req.user.kpi_areas || []).map(a => a.toLowerCase());
      if (!myAreas.includes(cur.area.toLowerCase())) {
        return res.status(403).json({ error: 'Apenas lider de area pode validar dados da sua area' });
      }
    }

    const { data, error } = await supabase
      .from('dados_brutos')
      .update({
        validado_por_user_id: req.user?.userId || null,
        validado_em: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /:id/validar — desfaz validacao
router.delete('/:id/validar', async (req, res) => {
  try {
    const { data: cur } = await supabase
      .from('dados_brutos')
      .select('area')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Registro nao encontrado' });

    if (!['admin', 'diretor'].includes(req.user?.role)) {
      const myAreas = (req.user.kpi_areas || []).map(a => a.toLowerCase());
      if (!myAreas.includes(cur.area.toLowerCase())) {
        return res.status(403).json({ error: 'Sem permissao' });
      }
    }

    const { error } = await supabase
      .from('dados_brutos')
      .update({ validado_por_user_id: null, validado_em: null })
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { data: cur } = await supabase
      .from('dados_brutos')
      .select('area')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Registro nao encontrado' });

    if (!['admin', 'diretor'].includes(req.user?.role)) {
      const myAreas = (req.user.kpi_areas || []).map(a => a.toLowerCase());
      if (!myAreas.includes(cur.area.toLowerCase())) {
        return res.status(403).json({ error: 'Sem permissao' });
      }
    }

    const { error } = await supabase.from('dados_brutos').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
