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

// ============================================================================
// CACHE em memoria (5 min TTL)
//
// Painel e a pagina mais visitada · cada usuario refresca = recalcula matriz
// (multiplas queries agregadas). Cache compartilhado entre todos os usuarios
// reduz carga em ~95% (10 usuarios simultaneos = 1 calculo).
//
// TTL curto (5 min) garante dados frescos. Em deploy serverless, cada
// instancia tem seu cache (sem coordenacao · ok pra read-only).
// ============================================================================
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cache = new Map();

function cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return e.v;
}
function cacheSet(key, v) {
  _cache.set(key, { v, t: Date.now() });
}
function cacheBust(prefix) {
  for (const k of _cache.keys()) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

// Endpoint manual pra invalidar cache (admin/diretor) · util apos ajuste de meta
router.post('/cache/bust', (req, res) => {
  if (!['admin', 'diretor'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Apenas admin/diretor' });
  }
  const prefix = req.body?.prefix || '';
  cacheBust(prefix);
  res.json({ ok: true });
});

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
    const cached = cacheGet('mandalas');
    if (cached) return res.json(cached);

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

    const _resp = {
      geral: { valores: geral_valores },
      por_valor,
    };
    cacheSet('mandalas', _resp);
    res.json(_resp);
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
    const cached = cacheGet('matriz');
    if (cached) return res.json(cached);

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

    const _resp = {
      areas: (areas || []).map(a => ({ id: a.id, nome: a.nome, cor_hex: a.cor_hex, categoria: a.categoria })),
      valores: VALORES.map(v => ({ key: v, label: VALOR_LABELS[v], cor: VALOR_CORES[v] })),
      cells,
    };
    cacheSet('matriz', _resp);
    res.json(_resp);
  } catch (e) {
    console.error('painel/matriz:', e.message);
    res.status(500).json({ error: 'Erro ao montar matriz' });
  }
});

// ----------------------------------------------------------------------------
// GET /matriz-adm - grid 8 areas adm × 6 areas-cliente
//   Cada celula: % solicitacoes concluidas no SLA daquela area adm para
//   aquela area-cliente no mes corrente.
// ----------------------------------------------------------------------------
// 5 grupos visuais · cada um agrega 1 ou mais sub-areas adm
// (Criativo removido · vai ter matriz/OKR propria por ter natureza diferente)
const AREAS_ADM_GRUPOS = [
  { key: 'hospitalidade', label: 'Hospitalidade', cor: '#8B5CF6',
    subareas: ['reserva_espaco', 'cozinha', 'manutencao'],
    sub_labels: ['Reserva', 'Cozinha', 'Manutenção'] },
  { key: 'logistica',     label: 'Logística',     cor: '#3B82F6',
    subareas: ['logistica_estoque', 'logistica_compras'],
    sub_labels: ['Estoque', 'Compras'] },
  { key: 'ti',            label: 'TI',            cor: '#10B981',
    subareas: ['ti'], sub_labels: ['TI'] },
  { key: 'rh',            label: 'RH',            cor: '#EF4444',
    subareas: ['rh'], sub_labels: ['RH'] },
  { key: 'financeiro',    label: 'Financeiro',    cor: '#84CC16',
    subareas: ['financeiro'], sub_labels: ['Financeiro'] },
];

// Legado mantido para outros endpoints que ainda referenciam areas individuais
// (Criativo nao listado · matriz separada futura)
const AREAS_ADM = [
  { key: 'reserva_espaco',     label: 'Reserva de Espaço', cor: '#8B5CF6' },
  { key: 'cozinha',            label: 'Cozinha',            cor: '#EC4899' },
  { key: 'manutencao',         label: 'Manutenção',         cor: '#F59E0B' },
  { key: 'logistica_estoque',  label: 'Log. Estoque',       cor: '#3B82F6' },
  { key: 'logistica_compras',  label: 'Log. Compras',       cor: '#06B6D4' },
  { key: 'ti',                 label: 'TI',                 cor: '#10B981' },
  { key: 'rh',                 label: 'RH',                 cor: '#EF4444' },
  { key: 'financeiro',         label: 'Financeiro',         cor: '#84CC16' },
];
const AREAS_CLIENTE = [
  { id: 'kids',   nome: 'CBKids' },
  { id: 'ami',    nome: 'AMI' },
  { id: 'bridge', nome: 'Bridge' },
  { id: 'sede',   nome: 'Sede' },
  { id: 'online', nome: 'Online' },
  { id: 'cba',    nome: 'CBA' },
];

router.get('/matriz-adm', async (req, res) => {
  try {
    const cached = cacheGet('matriz-adm');
    if (cached) return res.json(cached);

    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    const desdeStr = desde.toISOString().slice(0, 10);

    const { data: solicitacoes, error } = await supabase
      .from('vw_solicitacoes_sla')
      .select('area_responsavel, area_cliente, status, sla_resolucao_status, concluido_em, created_at')
      .gte('created_at', desdeStr);
    if (error) throw error;

    // KPIs operacionais ativos · agrupa por grupo (via subareas)
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, formula_config, ativo, tipo_kpi')
      .eq('ativo', true)
      .eq('tipo_kpi', 'operacional');

    const kpisPorGrupo = {}; // grupo.key -> count
    (kpis || []).forEach(k => {
      const sub = k.formula_config?.area_responsavel;
      if (!sub) return;
      const grupo = AREAS_ADM_GRUPOS.find(g => g.subareas.includes(sub));
      if (!grupo) return;
      kpisPorGrupo[grupo.key] = (kpisPorGrupo[grupo.key] || 0) + 1;
    });

    // Mapa de subarea_adm -> grupo (pra agregar)
    const SUB_TO_GRUPO = {};
    AREAS_ADM_GRUPOS.forEach(g => g.subareas.forEach(sub => { SUB_TO_GRUPO[sub] = g.key; }));

    // Agrega por (grupo_adm × area_cliente)
    const cells = {};
    AREAS_ADM_GRUPOS.forEach(g => {
      AREAS_CLIENTE.forEach(cli => {
        cells[`${g.key}:${cli.id}`] = {
          grupo_adm: g.key,
          grupo_label: g.label,
          grupo_cor: g.cor,
          subareas: g.subareas,
          area_cliente: cli.id,
          area_cliente_nome: cli.nome,
          total_kpis: kpisPorGrupo[g.key] || 0,
          total: 0,
          concluidos: 0,
          no_prazo: 0,
          atrasados: 0,
          em_andamento: 0,
        };
      });
    });

    (solicitacoes || []).forEach(s => {
      if (!s.area_responsavel || !s.area_cliente) return;
      const grupo = SUB_TO_GRUPO[s.area_responsavel];
      if (!grupo) return;
      const key = `${grupo}:${s.area_cliente}`;
      const c = cells[key];
      if (!c) return;
      c.total++;
      if (s.concluido_em) {
        c.concluidos++;
        if (s.sla_resolucao_status === 'concluiu_no_prazo') c.no_prazo++;
      } else if (s.sla_resolucao_status === 'atrasado') {
        c.atrasados++;
      } else {
        c.em_andamento++;
      }
    });

    Object.values(cells).forEach(c => {
      if (c.total === 0) {
        c.status = 'sem_dado';
        c.percentual = null;
      } else if (c.concluidos === 0) {
        c.status = c.atrasados > 0 ? 'vermelho' : 'sem_dado';
        c.percentual = c.atrasados > 0 ? 0 : null;
      } else {
        const pct = Math.round((c.no_prazo / c.concluidos) * 100);
        c.percentual = pct;
        if (c.atrasados > 0 || pct < 70) c.status = 'vermelho';
        else if (pct < 90) c.status = 'amarelo';
        else c.status = 'verde';
      }
    });

    const resp = {
      desde: desdeStr,
      grupos_adm: AREAS_ADM_GRUPOS,
      areas_cliente: AREAS_CLIENTE,
      cells,
    };
    cacheSet('matriz-adm', resp);
    res.json(resp);
  } catch (e) {
    console.error('painel/matriz-adm:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// GET /celula-adm/:area_adm/:area_cliente - solicitacoes daquela intersecao
// ----------------------------------------------------------------------------
// param area_adm pode ser grupo (hospitalidade) ou subarea (cozinha)
// Se for grupo, expande pras subareas
// ----------------------------------------------------------------------------
// Matriz Criativo · 3 grupos criativos × 6 areas-cliente
// (Mesma logica da Gestao mas grupos diferentes)
// ----------------------------------------------------------------------------
const AREAS_CRIATIVO_GRUPOS = [
  { key: 'producao',  label: 'Produção',  cor: '#F97316',
    subareas: ['producao'], sub_labels: ['Produção'] },
  { key: 'adoracao',  label: 'Adoração',  cor: '#A855F7',
    subareas: ['adoracao'], sub_labels: ['Adoração'] },
  { key: 'marketing', label: 'Marketing', cor: '#EC4899',
    subareas: ['marketing'], sub_labels: ['Marketing'] },
];

router.get('/matriz-criativo', async (req, res) => {
  try {
    const cached = cacheGet('matriz-criativo');
    if (cached) return res.json(cached);

    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    const desdeStr = desde.toISOString().slice(0, 10);

    const subareasCriativas = AREAS_CRIATIVO_GRUPOS.flatMap(g => g.subareas);
    const { data: solicitacoes, error } = await supabase
      .from('vw_solicitacoes_sla')
      .select('area_responsavel, area_cliente, status, sla_resolucao_status, concluido_em, created_at')
      .in('area_responsavel', subareasCriativas)
      .gte('created_at', desdeStr);
    if (error) throw error;

    // KPIs criativos ativos por grupo
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, formula_config, ativo, tipo_kpi')
      .eq('ativo', true)
      .eq('tipo_kpi', 'operacional')
      .like('id', 'ADM-C-%');

    const kpisPorGrupo = {};
    (kpis || []).forEach(k => {
      const sub = k.formula_config?.area_responsavel;
      if (!sub) return;
      const grupo = AREAS_CRIATIVO_GRUPOS.find(g => g.subareas.includes(sub));
      if (!grupo) return;
      kpisPorGrupo[grupo.key] = (kpisPorGrupo[grupo.key] || 0) + 1;
    });

    const SUB_TO_GRUPO = {};
    AREAS_CRIATIVO_GRUPOS.forEach(g => g.subareas.forEach(sub => { SUB_TO_GRUPO[sub] = g.key; }));

    const cells = {};
    AREAS_CRIATIVO_GRUPOS.forEach(g => {
      AREAS_CLIENTE.forEach(cli => {
        cells[`${g.key}:${cli.id}`] = {
          grupo_adm: g.key,
          grupo_label: g.label,
          grupo_cor: g.cor,
          subareas: g.subareas,
          area_cliente: cli.id,
          area_cliente_nome: cli.nome,
          total_kpis: kpisPorGrupo[g.key] || 0,
          total: 0, concluidos: 0, no_prazo: 0, atrasados: 0, em_andamento: 0,
        };
      });
    });

    (solicitacoes || []).forEach(s => {
      if (!s.area_responsavel || !s.area_cliente) return;
      const grupo = SUB_TO_GRUPO[s.area_responsavel];
      if (!grupo) return;
      const c = cells[`${grupo}:${s.area_cliente}`];
      if (!c) return;
      c.total++;
      if (s.concluido_em) {
        c.concluidos++;
        if (s.sla_resolucao_status === 'concluiu_no_prazo') c.no_prazo++;
      } else if (s.sla_resolucao_status === 'atrasado') c.atrasados++;
      else c.em_andamento++;
    });

    Object.values(cells).forEach(c => {
      if (c.total === 0) { c.status = 'sem_dado'; c.percentual = null; }
      else if (c.concluidos === 0) {
        c.status = c.atrasados > 0 ? 'vermelho' : 'sem_dado';
        c.percentual = c.atrasados > 0 ? 0 : null;
      } else {
        const pct = Math.round((c.no_prazo / c.concluidos) * 100);
        c.percentual = pct;
        if (c.atrasados > 0 || pct < 70) c.status = 'vermelho';
        else if (pct < 90) c.status = 'amarelo';
        else c.status = 'verde';
      }
    });

    const resp = {
      desde: desdeStr,
      grupos_adm: AREAS_CRIATIVO_GRUPOS,
      areas_cliente: AREAS_CLIENTE,
      cells,
    };
    cacheSet('matriz-criativo', resp);
    res.json(resp);
  } catch (e) {
    console.error('painel/matriz-criativo:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/celula-criativo/:area_adm/:area_cliente', async (req, res) => {
  try {
    const { area_adm, area_cliente } = req.params;
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    const desdeStr = desde.toISOString().slice(0, 10);

    const grupo = AREAS_CRIATIVO_GRUPOS.find(g => g.key === area_adm);
    const subareas = grupo ? grupo.subareas : [area_adm];

    const { data: solicitacoes, error } = await supabase
      .from('vw_solicitacoes_sla')
      .select('id, titulo, status, eh_urgente, sla_resolucao_status, horas_total, created_at, concluido_em, valor_estimado, area_responsavel')
      .in('area_responsavel', subareas)
      .eq('area_cliente', area_cliente)
      .gte('created_at', desdeStr)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const { data: kpisAll } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, meta_descricao, meta_valor, unidade, tipo_kpi, is_okr, formula_config, ativo')
      .eq('ativo', true)
      .eq('tipo_kpi', 'operacional')
      .like('id', 'ADM-C-%');

    const kpisDoGrupo = (kpisAll || []).filter(k => {
      const areaResp = k.formula_config?.area_responsavel;
      return areaResp && subareas.includes(areaResp);
    });

    let ultimoPorKpi = {};
    if (kpisDoGrupo.length > 0) {
      const ids = kpisDoGrupo.map(k => k.id);
      const { data: valores } = await supabase
        .from('kpi_valores_calculados')
        .select('kpi_id, valor_calculado, periodo_referencia, calculado_em')
        .in('kpi_id', ids)
        .order('calculado_em', { ascending: false });
      (valores || []).forEach(v => { if (!ultimoPorKpi[v.kpi_id]) ultimoPorKpi[v.kpi_id] = v; });
    }

    const kpis = kpisDoGrupo.map(k => ({
      ...k,
      area_responsavel: k.formula_config?.area_responsavel || null,
      ultimo_valor: ultimoPorKpi[k.id]?.valor_calculado ?? null,
      ultimo_periodo: ultimoPorKpi[k.id]?.periodo_referencia ?? null,
    }));

    res.json({ area_adm, area_cliente, subareas, solicitacoes: solicitacoes || [], kpis });
  } catch (e) {
    console.error('painel/celula-criativo:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/celula-adm/:area_adm/:area_cliente', async (req, res) => {
  try {
    const { area_adm, area_cliente } = req.params;
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    const desdeStr = desde.toISOString().slice(0, 10);

    const grupo = AREAS_ADM_GRUPOS.find(g => g.key === area_adm);
    const subareas = grupo ? grupo.subareas : [area_adm];

    // Solicitacoes da intersecao (ultimos 30 dias)
    const { data: solicitacoes, error } = await supabase
      .from('vw_solicitacoes_sla')
      .select('id, titulo, status, eh_urgente, sla_resolucao_status, horas_total, created_at, concluido_em, valor_estimado, area_responsavel')
      .in('area_responsavel', subareas)
      .eq('area_cliente', area_cliente)
      .gte('created_at', desdeStr)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    // KPIs especificos vinculados as subareas desse grupo
    // (formula_config.area_responsavel match com subareas)
    const { data: kpisAll } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, meta_descricao, meta_valor, unidade, tipo_kpi, is_okr, formula_config, ativo')
      .eq('ativo', true)
      .eq('tipo_kpi', 'operacional');

    const kpisDoGrupo = (kpisAll || []).filter(k => {
      const areaResp = k.formula_config?.area_responsavel;
      return areaResp && subareas.includes(areaResp);
    });

    // Ultimo valor de cada KPI
    let ultimoPorKpi = {};
    if (kpisDoGrupo.length > 0) {
      const ids = kpisDoGrupo.map(k => k.id);
      const { data: valores } = await supabase
        .from('kpi_valores_calculados')
        .select('kpi_id, valor_calculado, periodo_referencia, calculado_em')
        .in('kpi_id', ids)
        .order('calculado_em', { ascending: false });
      (valores || []).forEach(v => {
        if (!ultimoPorKpi[v.kpi_id]) ultimoPorKpi[v.kpi_id] = v;
      });
    }

    const kpis = kpisDoGrupo.map(k => ({
      ...k,
      area_responsavel: k.formula_config?.area_responsavel || null,
      ultimo_valor: ultimoPorKpi[k.id]?.valor_calculado ?? null,
      ultimo_periodo: ultimoPorKpi[k.id]?.periodo_referencia ?? null,
    }));

    res.json({
      area_adm, area_cliente, subareas,
      solicitacoes: solicitacoes || [],
      kpis,
    });
  } catch (e) {
    console.error('painel/celula-adm:', e.message);
    res.status(500).json({ error: e.message });
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
// GET /kpi/:id - Detalhe de 1 KPI (camada 3 do drilldown)
// Inclui: dados do KPI, trajetoria atual, historico de registros (12),
// checkpoints (trajetoria completa), ultima revisao OKR (se houver)
// ----------------------------------------------------------------------------
router.get('/kpi/:id', async (req, res) => {
  try {
    const id = req.params.id;

    // Dados do KPI
    const { data: kpi, error: ek } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, area, valores, periodicidade, periodo_offset_meses, meta_descricao, unidade, is_okr, lider_funcionario_id, ativo, memoria_calculo, observacoes, objetivo_geral_id')
      .eq('id', id)
      .maybeSingle();
    if (ek) throw ek;
    if (!kpi) return res.status(404).json({ error: 'KPI nao encontrado' });

    // Trajetoria atual (status calculado)
    const { data: trajAtual } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('*')
      .eq('kpi_id', id)
      .maybeSingle();

    // Trajetoria completa (todos checkpoints)
    const { data: checkpoints } = await supabase
      .from('kpi_trajetoria')
      .select('id, periodo_referencia, meta_valor, meta_texto, observacao, ativa, created_at')
      .eq('kpi_id', id)
      .order('periodo_referencia', { ascending: true });

    // Historico de registros (ultimos 12)
    const { data: registros } = await supabase
      .from('kpi_registros')
      .select('id, periodo_referencia, valor_realizado, valor_texto, observacao, data_preenchimento, preenchido_por_user_id')
      .eq('indicador_id', id)
      .order('data_preenchimento', { ascending: false })
      .limit(12);

    // Lider (rh_funcionarios)
    let lider = null;
    if (kpi.lider_funcionario_id) {
      const { data: l } = await supabase
        .from('rh_funcionarios')
        .select('id, nome, cargo, email')
        .eq('id', kpi.lider_funcionario_id)
        .maybeSingle();
      lider = l || null;
    }

    // Ultima revisao OKR (se existir tabela e KPI eh OKR)
    let revisoes = [];
    try {
      const { data: r } = await supabase
        .from('okr_revisoes')
        .select('id, periodo_referencia, status_revisao, status_no_periodo, causa_desvio, decisao, proximo_passo, prazo_proximo_passo, data_revisao, data_execucao, responsavel:rh_funcionarios(id, nome, cargo)')
        .eq('kpi_id', id)
        .order('data_revisao', { ascending: false })
        .limit(5);
      revisoes = r || [];
    } catch (_) { /* tabela pode nao existir ainda */ }

    res.json({
      kpi,
      lider,
      trajetoria_atual: trajAtual,
      checkpoints: checkpoints || [],
      historico: (registros || []).reverse(), // mais antigo primeiro pra grafico
      revisoes,
    });
  } catch (e) {
    console.error('painel/kpi/:id', e.message);
    res.status(500).json({ error: 'Erro ao carregar KPI' });
  }
});

// ----------------------------------------------------------------------------
// GET /nsm/pessoas - lista de pessoas convertidas (camada 4)
// query:
//   ?segmento=cbrio|online|cba|central (default central)
//   ?engajados=true|false  (default false = quem ainda nao engajou)
//   ?dias=90               (janela de decisoes a olhar, default 90)
//   ?limit=200             (max de pessoas)
// ----------------------------------------------------------------------------
router.get('/nsm/pessoas', async (req, res) => {
  try {
    const segmento = String(req.query.segmento || 'central').toLowerCase();
    const engajados = req.query.engajados === 'true';
    const dias = Math.min(Number(req.query.dias) || 90, 365);
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - dias);
    const dataLimiteStr = dataLimite.toISOString().slice(0, 10);

    // Filtro de igrejas conforme segmento
    let igrejaIds = null;
    if (segmento !== 'central') {
      const { data: seg } = await supabase
        .from('nsm_estado')
        .select('segmento_filtro, segmento_tipo')
        .eq('segmento', segmento)
        .maybeSingle();

      if (seg?.segmento_tipo === 'igreja_tipo' && seg?.segmento_filtro?.tipo) {
        const { data: igrejas } = await supabase
          .from('igrejas')
          .select('id')
          .eq('tipo', seg.segmento_filtro.tipo)
          .eq('ativa', true);
        igrejaIds = (igrejas || []).map(i => i.id);
      }
    }

    // 1. Visitantes convertidos no periodo
    let qVis = supabase
      .from('int_visitantes')
      .select('id, nome, telefone, email, data_visita, igreja_id, status, fez_decisao, tipo_decisao, observacoes')
      .eq('fez_decisao', true)
      .gte('data_visita', dataLimiteStr);
    if (igrejaIds && igrejaIds.length > 0) qVis = qVis.in('igreja_id', igrejaIds);
    else if (igrejaIds && igrejaIds.length === 0) qVis = qVis.eq('igreja_id', '00000000-0000-0000-0000-000000000000');

    const { data: visitantes } = await qVis;

    // 2. Membros novos (com data_decisao recente)
    // Por enquanto, focando em visitantes (fonte principal).
    // mem_membros tambem teria pessoas, mas requer campo data_decisao
    // que pode nao existir. Quando Fase 1.5 entrar, isso pode ser ampliado.

    const todosConvertidos = (visitantes || []).map(v => ({
      tipo: 'visitante',
      id: v.id,
      nome: v.nome,
      telefone: v.telefone,
      email: v.email,
      data_decisao: v.data_visita,
      igreja_id: v.igreja_id,
      status: v.status,
      tipo_decisao: v.tipo_decisao,
      observacao: v.observacoes,
    }));

    if (todosConvertidos.length === 0) {
      return res.json({
        segmento,
        engajados_filter: engajados,
        janela_dias: dias,
        total_convertidos: 0,
        pessoas: [],
      });
    }

    // 3. Eventos NSM dentro da janela 60d
    const visIds = todosConvertidos.filter(c => c.tipo === 'visitante').map(c => c.id);
    let eventos = [];
    if (visIds.length > 0) {
      const { data: evs } = await supabase
        .from('nsm_eventos')
        .select('id, visitante_id, valor_engajado, data_engajamento, dias_da_decisao, dentro_janela_60d, origem')
        .in('visitante_id', visIds)
        .eq('dentro_janela_60d', true);
      eventos = evs || [];
    }

    // Agrupar eventos por pessoa
    const eventosPorPessoa = {};
    for (const e of eventos) {
      const k = e.visitante_id;
      if (!eventosPorPessoa[k]) eventosPorPessoa[k] = [];
      eventosPorPessoa[k].push(e);
    }

    // Marcar cada convertido como engajado ou nao
    const hoje = new Date();
    const enriquecidos = todosConvertidos.map(p => {
      const evs = eventosPorPessoa[p.id] || [];
      const valoresEngajados = [...new Set(evs.map(e => e.valor_engajado))];
      const dDecisao = new Date(p.data_decisao);
      const diasDecorridos = Math.floor((hoje - dDecisao) / (1000 * 60 * 60 * 24));
      const dentroJanela = diasDecorridos <= 60;
      const diasRestantes = Math.max(0, 60 - diasDecorridos);

      return {
        ...p,
        engajado: valoresEngajados.length > 0,
        valores_engajados: valoresEngajados,
        total_eventos: evs.length,
        dias_decorridos: diasDecorridos,
        dentro_janela_60d: dentroJanela,
        dias_restantes_janela: diasRestantes,
        ja_passou_janela: !dentroJanela,
      };
    });

    // Filtrar por engajados ou nao
    const filtrados = enriquecidos.filter(p => engajados ? p.engajado : !p.engajado);

    // Ordenar: dias_restantes asc (mais urgente primeiro pra nao engajados;
    // mais recentes primeiro pra engajados)
    filtrados.sort((a, b) => {
      if (!engajados) {
        // nao engajados: ainda na janela primeiro (urgencia), depois por dias_decorridos
        if (a.dentro_janela_60d !== b.dentro_janela_60d) return a.dentro_janela_60d ? -1 : 1;
        return a.dias_restantes_janela - b.dias_restantes_janela;
      }
      return b.dias_decorridos - a.dias_decorridos;
    });

    res.json({
      segmento,
      engajados_filter: engajados,
      janela_dias: dias,
      total_convertidos: todosConvertidos.length,
      total_engajados: enriquecidos.filter(p => p.engajado).length,
      total_nao_engajados: enriquecidos.filter(p => !p.engajado).length,
      pessoas: filtrados.slice(0, limit),
    });
  } catch (e) {
    console.error('painel/nsm/pessoas:', e.message);
    res.status(500).json({ error: 'Erro ao carregar pessoas' });
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
    const cacheKey = `alertas:${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

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

    const _resp = {
      total_em_alerta: emAlerta.length,
      total_criticos:  emAlerta.filter(k => k.traj.status_trajetoria === 'critico').length,
      total_atrasados: emAlerta.filter(k => k.traj.status_trajetoria === 'atras').length,
      alertas: top,
    };
    cacheSet(cacheKey, _resp);
    res.json(_resp);
  } catch (e) {
    console.error('painel/alertas:', e.message);
    res.status(500).json({ error: 'Erro ao carregar alertas' });
  }
});

module.exports = router;
