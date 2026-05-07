// ============================================================================
// /api/ritual/* — Ritual Mensal de Revisao OKR
//
// "Regra de ouro": todo desvio gera causa, decisao, responsavel, proximo passo.
//
// Endpoints:
//   GET  /pendentes              — KPIs em vermelho/amarelo nao revisados no mes
//   GET  /revisados              — KPIs ja revisados no mes
//   GET  /resumo                 — stats do mes corrente
//   POST /:kpi_id/revisar        — registrar revisao
//   PATCH /revisao/:id           — atualizar (executar/cancelar)
//   GET  /historico              — historico de revisoes (filtravel)
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

function periodoMensalAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ----------------------------------------------------------------------------
// GET /resumo - estatisticas do mes corrente
// ----------------------------------------------------------------------------
router.get('/resumo', async (req, res) => {
  try {
    const periodo = req.query.periodo || periodoMensalAtual();

    // KPIs em alerta (vermelho/amarelo) — fonte: vw_kpi_trajetoria_atual
    const { data: trajetorias } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria');

    const emAlerta = (trajetorias || []).filter(t =>
      t.status_trajetoria === 'critico' || t.status_trajetoria === 'atras'
    );
    const totalAlerta = emAlerta.length;

    // Quantos ja foram revisados no mes
    const ids = emAlerta.map(t => t.kpi_id);
    let revisadosIds = new Set();
    if (ids.length > 0) {
      const { data: revs } = await supabase
        .from('okr_revisoes')
        .select('kpi_id')
        .in('kpi_id', ids)
        .eq('periodo_referencia', periodo);
      (revs || []).forEach(r => revisadosIds.add(r.kpi_id));
    }

    const totalRevisados = revisadosIds.size;
    const totalPendentes = totalAlerta - totalRevisados;

    // Dias ate fim do mes
    const hoje = new Date();
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    const diasRestantes = Math.max(0, Math.ceil((ultimoDia - hoje) / (1000 * 60 * 60 * 24)));

    res.json({
      periodo,
      total_em_alerta: totalAlerta,
      total_revisados: totalRevisados,
      total_pendentes: totalPendentes,
      percentual_concluido: totalAlerta > 0 ? Math.round((totalRevisados / totalAlerta) * 100) : 100,
      dias_restantes_mes: diasRestantes,
    });
  } catch (e) {
    console.error('ritual/resumo:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// GET /pendentes - KPIs em alerta nao revisados no mes
// ----------------------------------------------------------------------------
router.get('/pendentes', async (req, res) => {
  try {
    const periodo = req.query.periodo || periodoMensalAtual();

    const { data: trajetorias } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('*')
      .or('status_trajetoria.eq.critico,status_trajetoria.eq.atras');

    const ids = (trajetorias || []).map(t => t.kpi_id);
    if (ids.length === 0) return res.json([]);

    // Buscar dados completos dos KPIs
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, area, valores, periodicidade, meta_descricao, unidade, is_okr, lider_funcionario_id, objetivo_geral_id')
      .in('id', ids);

    // Quem ja foi revisado no periodo
    const { data: revs } = await supabase
      .from('okr_revisoes')
      .select('kpi_id')
      .in('kpi_id', ids)
      .eq('periodo_referencia', periodo);
    const revisadosSet = new Set((revs || []).map(r => r.kpi_id));

    // Buscar lideres em batch
    const liderIds = (kpis || []).map(k => k.lider_funcionario_id).filter(Boolean);
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: ls } = await supabase
        .from('rh_funcionarios')
        .select('id, nome, cargo')
        .in('id', liderIds);
      (ls || []).forEach(l => { lideresMap[l.id] = l; });
    }

    // Combinar e filtrar pendentes
    const trajByKpi = {};
    (trajetorias || []).forEach(t => { trajByKpi[t.kpi_id] = t; });

    const pendentes = (kpis || [])
      .filter(k => !revisadosSet.has(k.id))
      .map(k => ({
        ...k,
        trajetoria: trajByKpi[k.id],
        lider: lideresMap[k.lider_funcionario_id] || null,
      }))
      // Ordenar: critico > atras, OKR > nao-OKR, menor % meta primeiro
      .sort((a, b) => {
        const aCrit = a.trajetoria?.status_trajetoria === 'critico' ? 0 : 1;
        const bCrit = b.trajetoria?.status_trajetoria === 'critico' ? 0 : 1;
        if (aCrit !== bCrit) return aCrit - bCrit;
        const aOkr = a.is_okr ? 0 : 1;
        const bOkr = b.is_okr ? 0 : 1;
        if (aOkr !== bOkr) return aOkr - bOkr;
        const aPct = a.trajetoria?.percentual_meta ?? 100;
        const bPct = b.trajetoria?.percentual_meta ?? 100;
        return aPct - bPct;
      });

    res.json(pendentes);
  } catch (e) {
    console.error('ritual/pendentes:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// GET /revisados - KPIs ja revisados no mes
// ----------------------------------------------------------------------------
router.get('/revisados', async (req, res) => {
  try {
    const periodo = req.query.periodo || periodoMensalAtual();

    const { data, error } = await supabase
      .from('okr_revisoes')
      .select('*, kpi:kpi_indicadores_taticos(id, indicador, area), responsavel:rh_funcionarios(id, nome)')
      .eq('periodo_referencia', periodo)
      .order('data_revisao', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('ritual/revisados:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// POST /:kpi_id/revisar - registrar revisao
// ----------------------------------------------------------------------------
router.post('/:kpi_id/revisar', async (req, res) => {
  try {
    const b = req.body || {};
    const periodo = b.periodo_referencia || periodoMensalAtual();

    if (!b.causa_desvio || !b.decisao) {
      return res.status(400).json({ error: 'causa_desvio e decisao obrigatorios' });
    }

    // Marcar KPI como is_okr=true se ainda nao for (auto-promocao)
    const { data: kpi } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, is_okr, indicador')
      .eq('id', req.params.kpi_id)
      .maybeSingle();
    if (!kpi) return res.status(404).json({ error: 'KPI nao encontrado' });
    if (!kpi.is_okr) {
      await supabase.from('kpi_indicadores_taticos').update({ is_okr: true }).eq('id', kpi.id);
    }

    const payload = {
      kpi_id: req.params.kpi_id,
      periodo_referencia: periodo,
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
        return res.status(409).json({ error: 'Ja existe revisao deste KPI neste periodo' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('ritual/revisar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// PATCH /revisao/:id - atualizar revisao (executar / cancelar)
// ----------------------------------------------------------------------------
router.patch('/revisao/:id', async (req, res) => {
  try {
    const allowed = [
      'status_revisao', 'observacao_execucao', 'data_execucao',
      'causa_desvio', 'decisao', 'proximo_passo', 'prazo_proximo_passo',
      'responsavel_funcionario_id', 'status_no_periodo',
    ];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) update[k] = v;
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
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// GET /historico - todas as revisoes (filtravel)
// ----------------------------------------------------------------------------
router.get('/historico', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { data, error } = await supabase
      .from('okr_revisoes')
      .select('*, kpi:kpi_indicadores_taticos(id, indicador, area), responsavel:rh_funcionarios(id, nome)')
      .order('data_revisao', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
