// ============================================================================
// /api/okrs/* - Revisoes de OKR (regra de ouro do ritual mensal)
//
// "Todo desvio deve gerar causa, decisao, responsavel e proximo passo"
//
// Endpoints:
//  GET  /api/okrs/revisoes               -> lista global (filtravel)
//  GET  /api/okrs/revisoes/abertas       -> dashboard de governance
//  GET  /api/okrs/:kpiId/revisoes        -> historico de um KPI
//  POST /api/okrs/:kpiId/revisoes        -> criar revisao
//  PATCH /api/okrs/revisoes/:id          -> atualizar (executar/cancelar)
//  DELETE /api/okrs/revisoes/:id         -> remover (admin only)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ----------------------------------------------------------------------------
// GET /revisoes - lista global filtravel
// query: ?status=aberta|executada|cancelada
//        ?responsavel=:funcionario_id
//        ?kpi_area=:area
//        ?limit=50
// ----------------------------------------------------------------------------
router.get('/revisoes', async (req, res) => {
  try {
    const { status, responsavel, kpi_area } = req.query;
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    let q = supabase.from('vw_okr_revisoes_abertas').select('*');
    // A view filtra por status='aberta'. Para outros, query a tabela direto.
    if (status && status !== 'aberta') {
      q = supabase.from('okr_revisoes')
        .select('*, kpi:kpi_indicadores_taticos(id, indicador, area, valores, is_okr), responsavel:rh_funcionarios(id, nome, cargo)')
        .eq('status_revisao', status);
    }
    if (responsavel) q = q.eq('responsavel_funcionario_id', responsavel);
    if (kpi_area) q = q.eq('kpi_area', kpi_area);

    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('okrs/revisoes list:', e.message);
    res.status(500).json({ error: 'Erro ao listar revisoes' });
  }
});

// ----------------------------------------------------------------------------
// GET /revisoes/abertas - dashboard simplificado
// Retorna contagens por status_no_periodo, prazo_status, area
// ----------------------------------------------------------------------------
router.get('/revisoes/abertas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_okr_revisoes_abertas')
      .select('*')
      .order('prazo_proximo_passo', { ascending: true, nullsFirst: false });
    if (error) throw error;

    const items = data || [];
    const resumo = {
      total: items.length,
      vencidas: items.filter(r => r.prazo_status === 'vencido').length,
      proximas: items.filter(r => r.prazo_status === 'proximo').length,
      sem_prazo: items.filter(r => r.prazo_status === 'sem_prazo').length,
      por_area: {},
      por_status_periodo: { verde: 0, amarelo: 0, vermelho: 0, pendente: 0 },
    };
    items.forEach(r => {
      const a = r.kpi_area || 'sem_area';
      resumo.por_area[a] = (resumo.por_area[a] || 0) + 1;
      if (resumo.por_status_periodo[r.status_no_periodo] !== undefined) {
        resumo.por_status_periodo[r.status_no_periodo]++;
      }
    });

    res.json({ resumo, items });
  } catch (e) {
    console.error('okrs/revisoes/abertas:', e.message);
    res.status(500).json({ error: 'Erro ao buscar resumo' });
  }
});

// ----------------------------------------------------------------------------
// GET /:kpiId/revisoes - historico de um KPI
// ----------------------------------------------------------------------------
router.get('/:kpiId/revisoes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('okr_revisoes')
      .select('*, responsavel:rh_funcionarios(id, nome, cargo)')
      .eq('kpi_id', req.params.kpiId)
      .order('data_revisao', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('okrs revisoes by kpi:', e.message);
    res.status(500).json({ error: 'Erro ao buscar historico' });
  }
});

// ----------------------------------------------------------------------------
// POST /:kpiId/revisoes - criar revisao
// body: {
//   periodo_referencia, data_revisao?, status_no_periodo,
//   causa_desvio, decisao,
//   responsavel_funcionario_id?, proximo_passo?, prazo_proximo_passo?
// }
// ----------------------------------------------------------------------------
router.post('/:kpiId/revisoes', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.causa_desvio || !b.decisao) {
      return res.status(400).json({ error: 'causa_desvio e decisao obrigatorios' });
    }
    if (!b.periodo_referencia) {
      return res.status(400).json({ error: 'periodo_referencia obrigatorio (ex: 2026-04, 2026-Q1)' });
    }

    // Verifica que o KPI existe e esta marcado como OKR
    const { data: kpi, error: ek } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, is_okr, indicador')
      .eq('id', req.params.kpiId)
      .maybeSingle();
    if (ek) throw ek;
    if (!kpi) return res.status(404).json({ error: 'KPI nao encontrado' });
    if (!kpi.is_okr) {
      return res.status(400).json({ error: `${kpi.indicador} nao esta marcado como OKR. Marque is_okr=true antes de criar revisao.` });
    }

    const payload = {
      kpi_id: req.params.kpiId,
      periodo_referencia: b.periodo_referencia,
      data_revisao: b.data_revisao || new Date().toISOString().slice(0, 10),
      status_no_periodo: b.status_no_periodo || 'vermelho',
      causa_desvio: b.causa_desvio,
      decisao: b.decisao,
      responsavel_funcionario_id: b.responsavel_funcionario_id || null,
      proximo_passo: b.proximo_passo || null,
      prazo_proximo_passo: b.prazo_proximo_passo || null,
      criado_por_user_id: req.user?.id || null,
    };

    const { data, error } = await supabase
      .from('okr_revisoes')
      .insert(payload)
      .select('*, responsavel:rh_funcionarios(id, nome, cargo)')
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ja existe revisao aberta deste OKR neste periodo. Atualize a existente.' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('okrs revisoes create:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// PATCH /revisoes/:id - executar / cancelar / atualizar campos
// body: {
//   status_revisao?: 'executada'|'cancelada',
//   observacao_execucao?,
//   data_execucao?,
//   causa_desvio?, decisao?, proximo_passo?, prazo_proximo_passo?,
//   responsavel_funcionario_id?
// }
// ----------------------------------------------------------------------------
router.patch('/revisoes/:id', async (req, res) => {
  try {
    const allowed = [
      'status_revisao', 'observacao_execucao', 'data_execucao',
      'causa_desvio', 'decisao', 'proximo_passo', 'prazo_proximo_passo',
      'responsavel_funcionario_id', 'status_no_periodo',
    ];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (allowed.includes(k)) update[k] = v;
    }
    // Se marcando como executada, preencher data_execucao automatico
    if (update.status_revisao === 'executada' && !update.data_execucao) {
      update.data_execucao = new Date().toISOString().slice(0, 10);
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nada a atualizar' });
    }
    const { data, error } = await supabase
      .from('okr_revisoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*, responsavel:rh_funcionarios(id, nome, cargo)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('okrs revisao patch:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// DELETE /revisoes/:id - admin only
// ----------------------------------------------------------------------------
router.delete('/revisoes/:id', authorize('admin'), async (req, res) => {
  try {
    const { error } = await supabase.from('okr_revisoes').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('okrs revisao delete:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
