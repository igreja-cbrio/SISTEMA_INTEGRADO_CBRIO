// ============================================================================
// /api/painel-area/:area · drill-down de TODOS os KPIs ativos da area
// ============================================================================
// Usado pelos modulos kids/ami/bridge/online (paginas read-only)
//
// Retorna kpis daquela area (kpi_indicadores_taticos.area = slug) com:
//   - trajetoria atual (vw_kpi_trajetoria_atual)
//   - dados do lider
//   - agrupamento por valor (Seguir/Conectar/...)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// Aceita kids, ami, bridge, online · qualquer um dos slugs em ROUTE_MODULE_MAP['painel-area']
const AREAS_VALIDAS = ['kids', 'ami', 'bridge', 'online', 'sede', 'cba'];

router.get('/:area', authorizeModule('painel-area', 1), async (req, res) => {
  try {
    const area = String(req.params.area).toLowerCase();
    if (!AREAS_VALIDAS.includes(area)) {
      return res.status(400).json({ error: 'Area invalida', validas: AREAS_VALIDAS });
    }

    // 1. KPIs ativos da area
    const { data: kpis, error } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, area, valores, periodicidade, meta_descricao, meta_valor, unidade, is_okr, tipo_kpi, lider_funcionario_id')
      .eq('ativo', true)
      .ilike('area', area)
      .order('indicador', { ascending: true });
    if (error) throw error;

    if (!kpis || kpis.length === 0) {
      return res.json({ area, kpis: [], total: 0 });
    }

    const ids = kpis.map(k => k.id);

    // 2. Trajetorias
    const { data: trajetorias } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria, ultimo_periodo, ultimo_valor, checkpoint_meta, percentual_meta, gap')
      .in('kpi_id', ids);
    const trajByKpi = {};
    (trajetorias || []).forEach(t => { trajByKpi[t.kpi_id] = t; });

    // 3. Lideres (rh_funcionarios)
    const liderIds = kpis.map(k => k.lider_funcionario_id).filter(Boolean);
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase
        .from('rh_funcionarios')
        .select('id, nome, cargo')
        .in('id', liderIds);
      (lideres || []).forEach(l => { lideresMap[l.id] = l; });
    }

    // 4. Monta resposta com agrupamento por valor
    const enriched = kpis.map(k => ({
      id: k.id,
      indicador: k.indicador,
      descricao: k.descricao,
      area: k.area,
      valores: Array.isArray(k.valores) ? k.valores : [],
      periodicidade: k.periodicidade,
      meta_descricao: k.meta_descricao,
      meta_valor: k.meta_valor,
      unidade: k.unidade,
      is_okr: k.is_okr,
      tipo_kpi: k.tipo_kpi,
      lider: lideresMap[k.lider_funcionario_id] || null,
      trajetoria: trajByKpi[k.id] || null,
    }));

    // Agrupa por valor (pode aparecer em varios)
    const porValor = {};
    const sem_valor = [];
    for (const k of enriched) {
      if (k.valores.length === 0) {
        sem_valor.push(k);
      } else {
        for (const v of k.valores) {
          if (!porValor[v]) porValor[v] = [];
          porValor[v].push(k);
        }
      }
    }

    // Estatisticas
    const total = enriched.length;
    const com_meta = enriched.filter(k => k.trajetoria?.checkpoint_meta != null).length;
    const no_alvo = enriched.filter(k => k.trajetoria?.status_trajetoria === 'no_alvo').length;
    const atrasado = enriched.filter(k => k.trajetoria?.status_trajetoria === 'atrasado').length;
    const critico = enriched.filter(k => k.trajetoria?.status_trajetoria === 'critico').length;

    res.json({
      area,
      total,
      stats: { com_meta, no_alvo, atrasado, critico },
      por_valor: porValor,
      sem_valor,
      kpis: enriched,
    });
  } catch (e) {
    console.error('painel-area:', e.message);
    res.status(500).json({ error: 'Erro ao buscar dados da area' });
  }
});

module.exports = router;
