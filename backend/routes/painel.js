// ============================================================================
// /api/painel/* - Endpoints do Painel CBRio (Fase 2 do Sistema OKR/NSM 2026)
//
// Endpoints:
//   GET /api/painel/mandalas    -> dados das 6 mandalas em uma chamada
//                                  (1 geral com 5 valores + 5 focadas em
//                                  cada valor com 6 areas)
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const VALORES = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];

const VALOR_LABELS = {
  seguir:        'Seguir a Jesus',
  conectar:      'Conectar com Pessoas',
  investir:      'Investir Tempo com Deus',
  servir:        'Servir em Comunidade',
  generosidade:  'Viver Generosamente',
};

const VALOR_CORES = {
  seguir:       '#8B5CF6',
  conectar:     '#3B82F6',
  investir:     '#F59E0B',
  servir:       '#10B981',
  generosidade: '#EC4899',
};

function calcStatus(percentual, totalAvaliados) {
  if (totalAvaliados === 0) return 'sem_dado';
  if (percentual >= 70) return 'verde';
  if (percentual >= 40) return 'amarelo';
  return 'vermelho';
}

function tabularKpis(kpis, statusByKpi) {
  const total = kpis.length;
  let em_dia = 0, atras = 0, critico = 0;
  for (const k of kpis) {
    const s = statusByKpi[k.id];
    if (s === 'no_alvo') em_dia++;
    else if (s === 'atras') atras++;
    else if (s === 'critico') critico++;
  }
  const sem_dado = total - em_dia - atras - critico;
  const totalAvaliados = em_dia + atras + critico;
  const percentual = total > 0 ? Math.round((em_dia / total) * 100) : 0;
  return {
    total_kpis: total,
    em_dia, atras, critico, sem_dado,
    percentual,
    status: calcStatus(percentual, totalAvaliados),
    tem_dados: totalAvaliados > 0,
  };
}

// ----------------------------------------------------------------------------
// Helper: pior status (para celulas da matriz)
// vermelho > amarelo > sem_dado > verde
// ----------------------------------------------------------------------------
function piorStatus(statuses) {
  if (statuses.includes('vermelho')) return 'vermelho';
  if (statuses.includes('amarelo'))  return 'amarelo';
  if (statuses.length === 0)         return 'na';
  if (statuses.every(s => s === 'sem_dado')) return 'sem_dado';
  return 'verde';
}

// ----------------------------------------------------------------------------
// GET /mandalas - dados das 6 mandalas (1 geral + 5 focadas em cada valor)
// ----------------------------------------------------------------------------
router.get('/mandalas', async (req, res) => {
  try {
    // 1. KPIs ativos com valores preenchidos
    const { data: kpis, error: ek } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, area, valores, is_okr')
      .eq('ativo', true);
    if (ek) throw ek;

    // 2. Status de trajetoria de cada KPI
    const { data: trajetorias } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria');
    const statusByKpi = {};
    (trajetorias || []).forEach(t => { statusByKpi[t.kpi_id] = t.status_trajetoria; });

    // 3. Areas ativas (para labels e ordem)
    const { data: areas } = await supabase
      .from('areas_kpi')
      .select('id, nome, cor_hex, ordem')
      .eq('ativa', true)
      .order('ordem');

    // 4. Mandala 0 (geral): 5 valores agregados
    const geral_valores = VALORES.map(v => {
      const kpisDoValor = (kpis || []).filter(k =>
        Array.isArray(k.valores) && k.valores.includes(v)
      );
      const tab = tabularKpis(kpisDoValor, statusByKpi);
      return {
        key: v,
        label: VALOR_LABELS[v],
        cor: VALOR_CORES[v],
        ...tab,
      };
    });

    // 5. Mandalas 1-5 (focadas em cada valor): 6 areas
    const por_valor = {};
    for (const v of VALORES) {
      const kpisDoValor = (kpis || []).filter(k =>
        Array.isArray(k.valores) && k.valores.includes(v)
      );
      const tabValor = tabularKpis(kpisDoValor, statusByKpi);

      // Cada area: KPIs daquele valor naquela area
      const areasDoValor = (areas || []).map(area => {
        const kpisArea = kpisDoValor.filter(k =>
          String(k.area || '').toLowerCase() === area.id
        );
        const tab = tabularKpis(kpisArea, statusByKpi);
        return {
          id: area.id,
          nome: area.nome,
          cor_hex: area.cor_hex,
          ...tab,
        };
      }).filter(a => a.total_kpis > 0); // so areas que tem KPI desse valor

      por_valor[v] = {
        key: v,
        label: VALOR_LABELS[v],
        cor: VALOR_CORES[v],
        percentual_geral: tabValor.percentual,
        total_kpis: tabValor.total_kpis,
        em_dia: tabValor.em_dia,
        tem_dados: tabValor.tem_dados,
        status: tabValor.status,
        areas: areasDoValor,
      };
    }

    res.json({
      geral: { valores: geral_valores },
      por_valor,
    });
  } catch (e) {
    console.error('painel/mandalas:', e.message);
    res.status(500).json({ error: 'Erro ao montar mandalas' });
  }
});

// ----------------------------------------------------------------------------
// GET /matriz - grid 6 areas x 5 valores, com pior status de cada celula
// ----------------------------------------------------------------------------
router.get('/matriz', async (req, res) => {
  try {
    const { data: kpis, error: ek } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, area, valores')
      .eq('ativo', true);
    if (ek) throw ek;

    const { data: trajetorias } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria');
    const statusByKpi = {};
    (trajetorias || []).forEach(t => { statusByKpi[t.kpi_id] = t.status_trajetoria; });

    const { data: areas } = await supabase
      .from('areas_kpi')
      .select('id, nome, cor_hex, ordem, categoria')
      .eq('ativa', true)
      .in('id', ['kids', 'bridge', 'ami', 'sede', 'online', 'cba']) // so as 6 areas da matriz
      .order('ordem');

    // Pra cada celula (area x valor), agregar
    const cells = {};
    for (const area of (areas || [])) {
      for (const v of VALORES) {
        const kpisCelula = (kpis || []).filter(k =>
          String(k.area || '').toLowerCase() === area.id &&
          Array.isArray(k.valores) && k.valores.includes(v)
        );
        const tab = tabularKpis(kpisCelula, statusByKpi);

        // Status da celula = pior status entre os KPIs (mas se 0 KPIs = na)
        let cellStatus;
        if (tab.total_kpis === 0) {
          cellStatus = 'na';
        } else {
          // Mapeia status_trajetoria de cada KPI para verde/amarelo/vermelho/sem_dado
          const statuses = kpisCelula.map(k => {
            const s = statusByKpi[k.id];
            if (s === 'no_alvo')  return 'verde';
            if (s === 'atras')    return 'amarelo';
            if (s === 'critico')  return 'vermelho';
            return 'sem_dado';
          });
          cellStatus = piorStatus(statuses);
        }

        cells[`${area.id}:${v}`] = {
          area_id: area.id,
          area_nome: area.nome,
          valor_key: v,
          valor_label: VALOR_LABELS[v],
          valor_cor: VALOR_CORES[v],
          status: cellStatus,
          ...tab,
        };
      }
    }

    res.json({
      areas: (areas || []).map(a => ({ id: a.id, nome: a.nome, cor_hex: a.cor_hex, categoria: a.categoria })),
      valores: VALORES.map(v => ({ key: v, label: VALOR_LABELS[v], cor: VALOR_CORES[v] })),
      cells,
    });
  } catch (e) {
    console.error('painel/matriz:', e.message);
    res.status(500).json({ error: 'Erro ao montar matriz' });
  }
});

// ----------------------------------------------------------------------------
// GET /celula/:area/:valor - KPIs detalhados daquela intersecao (pra modal)
// ----------------------------------------------------------------------------
router.get('/celula/:area/:valor', async (req, res) => {
  try {
    const areaId = String(req.params.area).toLowerCase();
    const valor = String(req.params.valor).toLowerCase();

    if (!VALORES.includes(valor)) {
      return res.status(400).json({ error: 'Valor invalido' });
    }

    // KPIs daquela intersecao + dados de trajetoria
    const { data: kpis, error } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, area, valores, periodicidade, meta_descricao, unidade, is_okr, lider_funcionario_id')
      .eq('ativo', true)
      .ilike('area', areaId);
    if (error) throw error;

    const filtrados = (kpis || []).filter(k =>
      Array.isArray(k.valores) && k.valores.includes(valor)
    );

    if (filtrados.length === 0) {
      return res.json({ area: areaId, valor, kpis: [] });
    }

    const ids = filtrados.map(k => k.id);

    // Trajetoria atual
    const { data: trajetorias } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria, ultimo_periodo, ultimo_valor, checkpoint_meta, percentual_meta')
      .in('kpi_id', ids);
    const trajByKpi = {};
    (trajetorias || []).forEach(t => { trajByKpi[t.kpi_id] = t; });

    // Lider (rh_funcionarios) — buscar nomes em lote
    const liderIds = filtrados.map(k => k.lider_funcionario_id).filter(Boolean);
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase
        .from('rh_funcionarios')
        .select('id, nome, cargo')
        .in('id', liderIds);
      (lideres || []).forEach(l => { lideresMap[l.id] = l; });
    }

    const result = filtrados.map(k => ({
      id: k.id,
      indicador: k.indicador,
      descricao: k.descricao,
      area: k.area,
      valores: k.valores,
      periodicidade: k.periodicidade,
      meta_descricao: k.meta_descricao,
      unidade: k.unidade,
      is_okr: k.is_okr,
      lider: lideresMap[k.lider_funcionario_id] || null,
      trajetoria: trajByKpi[k.id] || null,
    }));

    res.json({ area: areaId, valor, kpis: result });
  } catch (e) {
    console.error('painel/celula:', e.message);
    res.status(500).json({ error: 'Erro ao buscar celula' });
  }
});

// ----------------------------------------------------------------------------
// GET /alertas - KPIs em alerta (criticos primeiro, depois atrasados)
// query: ?limit=3 (default 3, max 20)
//
// Ordem de prioridade:
//   1. status='critico'
//   2. is_okr=true (estrategicos pesam mais)
//   3. menor percentual_meta (mais distante da meta)
// ----------------------------------------------------------------------------
router.get('/alertas', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 3, 20);

    const { data: kpis, error } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, area, valores, is_okr, periodicidade, meta_descricao, unidade')
      .eq('ativo', true);
    if (error) throw error;

    const { data: trajetorias } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria, ultimo_valor, ultimo_periodo, percentual_meta');
    const trajByKpi = {};
    (trajetorias || []).forEach(t => { trajByKpi[t.kpi_id] = t; });

    // Filtrar KPIs em alerta
    const emAlerta = (kpis || [])
      .map(k => ({
        ...k,
        traj: trajByKpi[k.id] || null,
      }))
      .filter(k => k.traj && (k.traj.status_trajetoria === 'critico' || k.traj.status_trajetoria === 'atras'));

    // Ordenar
    emAlerta.sort((a, b) => {
      // 1. critico antes de atras
      const aCrit = a.traj.status_trajetoria === 'critico' ? 0 : 1;
      const bCrit = b.traj.status_trajetoria === 'critico' ? 0 : 1;
      if (aCrit !== bCrit) return aCrit - bCrit;

      // 2. OKR antes de nao-OKR
      const aOkr = a.is_okr ? 0 : 1;
      const bOkr = b.is_okr ? 0 : 1;
      if (aOkr !== bOkr) return aOkr - bOkr;

      // 3. menor % da meta primeiro
      const aPct = a.traj.percentual_meta ?? 100;
      const bPct = b.traj.percentual_meta ?? 100;
      return aPct - bPct;
    });

    const top = emAlerta.slice(0, limit).map(k => ({
      kpi_id: k.id,
      indicador: k.indicador,
      area: k.area,
      valores: k.valores,
      is_okr: k.is_okr,
      periodicidade: k.periodicidade,
      meta_descricao: k.meta_descricao,
      unidade: k.unidade,
      status: k.traj.status_trajetoria,
      ultimo_valor: k.traj.ultimo_valor,
      ultimo_periodo: k.traj.ultimo_periodo,
      percentual_meta: k.traj.percentual_meta,
    }));

    res.json({
      total_em_alerta: emAlerta.length,
      total_criticos:  emAlerta.filter(k => k.traj.status_trajetoria === 'critico').length,
      total_atrasados: emAlerta.filter(k => k.traj.status_trajetoria === 'atras').length,
      alertas: top,
    });
  } catch (e) {
    console.error('painel/alertas:', e.message);
    res.status(500).json({ error: 'Erro ao carregar alertas' });
  }
});

module.exports = router;
