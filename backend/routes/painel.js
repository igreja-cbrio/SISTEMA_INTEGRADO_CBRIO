// ============================================================================
// /api/painel/* - Endpoints do Painel CBRio (Fase 2 do Sistema OKR/NSM 2026)
//
// Endpoints:
//   GET /api/painel/mandalas    -> dados das 6 mandalas em uma chamada
//                                  (1 geral com 5 valores + 5 focadas em
//                                  cada valor com 6 áreas)
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase, query } = require('../utils/supabase');

router.use(authenticate);

// Lê TODAS as linhas de uma tabela contornando o cap de 1000 do PostgREST
// (paginação por .range). Usar quando o cálculo precisa do conjunto inteiro
// (ex.: snapshots "ativo no fim do período" sobre mem_grupo_membros/voluntarios,
// que já passam de 1000). `buildQuery(q)` aplica select/filtros no query base.
async function fetchAllPaginado(table, buildQuery) {
  const page = 1000;
  let from = 0;
  const todas = [];
  while (true) {
    let q = supabase.from(table);
    q = buildQuery(q).range(from, from + page - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    todas.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return todas;
}

// ============================================================================
// CACHE em memória (5 min TTL)
//
// Painel e a página mais visitada · cada usuário refresca = recalcula matriz
// (multiplas queries agregadas). Cache compartilhado entre todos os usuários
// reduz carga em ~95% (10 usuários simultaneos = 1 calculo).
//
// TTL curto (5 min) garante dados frescos. Em deploy serverless, cada
// instancia tem seu cache (sem coordenacao · ok pra read-only).
// ============================================================================
// Cache compartilhado via service · permite outros routes invalidarem
const painelCache = require('../services/painelCache');
const cacheGet = painelCache.get;
const cacheSet = painelCache.set;
const cacheBust = painelCache.bust;

// Endpoint manual pra invalidar cache (admin/diretor) · útil após ajuste de meta
router.post('/cache/bust', (req, res) => {
  if (!['admin', 'diretor'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Apenas admin/diretor' });
  }
  const prefix = req.body?.prefix || '';
  const removed = cacheBust(prefix);
  res.json({ ok: true, removed });
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

// ----------------------------------------------------------------------------
// Indicador principal (número absoluto · "pessoas engajadas") por valor.
// Vira o headline da mandala no lugar da % de KPIs no alvo (pedido do Marcos ·
// 2026-06-09): número absoluto comunica o tamanho real melhor que o placar de
// cumprimento. A COR da pétala continua vindo da saúde dos KPIs (status).
//
// Mês corrente · reusa calcularSerie() (mesma lógica do carrossel de tendências
// · função declarada mais abaixo, hoisted). Estes totais são da igreja inteira
// (não há recorte por Kids/AMI/Bridge/Sede/Online/CBA pra grupos/devocionais/
// voluntários/dízimo) · por isso as 6 áreas da mandala focada mostram "X/Y no
// alvo" e não o número por área.
// ----------------------------------------------------------------------------
const PRINCIPAL_INDICADOR = {
  seguir:       { dado: 'conversoes',         unidade: 'decisões' },
  conectar:     { dado: 'membros_em_grupos',  unidade: 'em grupos' },
  investir:     { dado: 'devocionais',        unidade: 'devocionais' },
  servir:       { dado: 'voluntarios_ativos', unidade: 'voluntários' },
  generosidade: { dado: 'dizimistas',         unidade: 'dizimistas' },
};

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function mesCorrenteRange() {
  const now = new Date();
  const inicio = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = now.toISOString().slice(0, 10);
  return { inicio, fim, mesLabel: MESES_PT[now.getMonth()] };
}

async function indicadorPrincipalMes(valor, range) {
  const cfg = PRINCIPAL_INDICADOR[valor];
  if (!cfg) return { numero: null, unidade: null };
  try {
    const serie = await calcularSerie(valor, cfg.dado, {
      inicio: range.inicio, fim: range.fim, culto: null, granularidade: 'mes',
    });
    const numero = (serie || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
    return { numero, unidade: cfg.unidade };
  } catch (e) {
    console.error(`indicadorPrincipalMes(${valor}):`, e.message);
    return { numero: null, unidade: cfg.unidade };
  }
}

// ----------------------------------------------------------------------------
// Cascata por ÁREA do indicador principal (pedido do Marcos · 2026-06-09):
// a mandala focada num valor abre o total (centro) no número de cada área.
// Só dado de CULTO tem recorte por área → hoje só "Seguir" (decisões) cascateia.
// Os demais valores mostram "—" nas áreas (sem dado por área · cliente decide
// quando a fonte ganhar a dimensão de área). Kids fica FORA da jornada: criança
// convertida não avança (não vai a grupo / não loga devocional / não serve /
// não dá pra trackear dízimo) → decisões kids não entram em Seguir.
//
// Filtros de culto espelham kpiAutoCollector.js (service_type_name · fallback nome).
// ----------------------------------------------------------------------------
function _isAmiCulto(c) {
  const t = (c.service_type_name || '').toLowerCase();
  if (t) return t === 'ami';
  const n = (c.nome || '').toLowerCase();
  return (n.includes('ami') || n.includes('sabado') || n.includes('sábado')) && !n.includes('bridge');
}
function _isBridgeCulto(c) {
  const t = (c.service_type_name || '').toLowerCase();
  if (t) return t === 'bridge';
  return (c.nome || '').toLowerCase().includes('bridge');
}
function _isSedeCulto(c) {
  const t = (c.service_type_name || '').toLowerCase();
  return t.startsWith('domingo') || t === 'quarta com deus';
}

// Decisões do mês repartidas por área de culto (presencial → sede/ami/bridge ·
// online → área própria · kids excluído). Retorna { porArea, total } · total =
// soma das áreas (garante que centro == soma das pétalas na cascata).
async function decisoesPorAreaMes(range) {
  const { data, error } = await supabase.from('vw_culto_stats')
    .select('nome, service_type_name, decisoes_presenciais, decisoes_online')
    .gte('data', range.inicio).lte('data', range.fim);
  if (error) throw error;
  const porArea = { sede: 0, ami: 0, bridge: 0, online: 0 };
  (data || []).forEach((c) => {
    const pres = Number(c.decisoes_presenciais) || 0;
    porArea.online += Number(c.decisoes_online) || 0; // online (stream) = área própria
    if (_isSedeCulto(c)) porArea.sede += pres;
    else if (_isAmiCulto(c)) porArea.ami += pres;
    else if (_isBridgeCulto(c)) porArea.bridge += pres;
    // culto não classificado: presencial não entra em nenhuma área (raro)
  });
  const total = porArea.sede + porArea.ami + porArea.bridge + porArea.online;
  return { porArea, total };
}

// Voluntários ativos no fim do mês repartidos por área (mem_voluntarios.area ·
// 2026-06-10). Sem área mapeada conta no TOTAL (centro) mas não nas pétalas —
// honesto: não chutamos a área de ninguém.
async function voluntariosPorAreaMes(range) {
  const data = await fetchAllPaginado('mem_voluntarios', (q) => q
    .select('area')
    .is('deleted_at', null)
    .lte('desde', range.fim)
    .or(`ate.is.null,ate.gt.${range.fim}`));
  const porArea = { kids: 0, sede: 0, ami: 0, bridge: 0, online: 0 };
  let semArea = 0;
  (data || []).forEach((v) => {
    if (v.area && porArea[v.area] !== undefined) porArea[v.area] += 1;
    else semArea += 1;
  });
  const total = porArea.kids + porArea.sede + porArea.ami + porArea.bridge + porArea.online + semArea;
  return { porArea, semArea, total };
}

// Servir (decisão do Matheus · 2026-06-22): TODOS os voluntários que SERVIRAM
// nos últimos 4 meses (não só os ligados a membro). Centro = distinto quem
// serviu (vol_servicos_historico · planilha + PCO). Pétalas por área = via time
// da escala do PCO (vol_schedules). Quem serviu sem time mapeável conta no
// centro mas não nas pétalas (honesto · não chuta área).
function _normServir(s) { return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function _areaDoTeam(t) {
  const n = _normServir(t); if (!n) return null;
  if (n.includes('kid')) return 'kids';
  if (n.includes('ami')) return 'ami';
  if (n.includes('bridge')) return 'bridge';
  if (n.includes('online')) return 'online';
  return 'sede';
}
async function voluntariosAtivos4mPorArea(range) {
  const fimISO = String(range.fim).slice(0, 10);
  const iniD = new Date(fimISO + 'T00:00:00'); iniD.setMonth(iniD.getMonth() - 4);
  const iniISO = iniD.toISOString().slice(0, 10);

  // Centro: distinto quem serviu na janela (vol_servicos_historico)
  const serv = await fetchAllPaginado('vol_servicos_historico', (q) => q
    .select('nome_norm').is('deleted_at', null).gte('data', iniISO).lte('data', fimISO));
  const totalSet = new Set();
  (serv || []).forEach((s) => { if (s.nome_norm) totalSet.add(s.nome_norm); });

  // Pétalas: área via time da escala do PCO na janela
  const sch = await fetchAllPaginado('vol_schedules', (q) => q
    .select('volunteer_name, team_name, confirmation_status, service:vol_services!inner(scheduled_at)')
    .neq('confirmation_status', 'declined')
    .gte('service.scheduled_at', iniISO).lte('service.scheduled_at', fimISO + 'T23:59:59'));
  const setPorArea = { kids: new Set(), sede: new Set(), ami: new Set(), bridge: new Set(), online: new Set() };
  const comArea = new Set();
  (sch || []).forEach((s) => {
    const nn = _normServir(s.volunteer_name); if (!nn) return;
    const a = _areaDoTeam(s.team_name);
    if (a && setPorArea[a]) { setPorArea[a].add(nn); comArea.add(nn); }
  });
  const porArea = {};
  Object.keys(setPorArea).forEach((a) => { porArea[a] = setPorArea[a].size; });
  let semArea = 0;
  totalSet.forEach((nn) => { if (!comArea.has(nn)) semArea += 1; });
  return { porArea, semArea, total: totalSet.size };
}

// Dizimistas do mês repartidos por área (mem_contribuicoes.area · estrutura
// pronta pra unificação financeira — preenche quando a importação chegar).
async function generosidadePorAreaMes(range) {
  const { data, error } = await supabase.from('mem_contribuicoes')
    .select('membro_id, area')
    .is('deleted_at', null)
    .eq('tipo', 'dizimo')
    .gte('data', range.inicio).lte('data', range.fim)
    .limit(10000);
  if (error) throw error;
  const setPorArea = { kids: new Set(), sede: new Set(), ami: new Set(), bridge: new Set(), online: new Set() };
  const semAreaSet = new Set();
  const totalSet = new Set();
  (data || []).forEach((c) => {
    if (!c.membro_id) return;
    totalSet.add(c.membro_id);
    if (c.area && setPorArea[c.area]) setPorArea[c.area].add(c.membro_id);
    else semAreaSet.add(c.membro_id);
  });
  const porArea = {};
  Object.keys(setPorArea).forEach(a => { porArea[a] = setPorArea[a].size; });
  return { porArea, semArea: semAreaSet.size, total: totalSet.size };
}

// Áreas cujo indicador principal já tem recorte por área (cascata real):
// Seguir (decisões por culto) · Servir (mem_voluntarios.area) · Generosidade
// (mem_contribuicoes.area). Conectar/Investir seguem "—" nas pétalas (grupos e
// devocionais não têm dimensão de área de culto na fonte).
const AREAS_DECISOES = ['sede', 'ami', 'bridge', 'online'];
const AREAS_5 = ['kids', 'sede', 'ami', 'bridge', 'online'];

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
    // Aceita ambos formatos · nomes unificados em 20260515200000:
    // verde/amarelo/vermelho/pendente OU legado no_alvo/atras/critico/sem_meta
    if (s === 'verde' || s === 'no_alvo') em_dia++;
    else if (s === 'amarelo' || s === 'atras') atras++;
    else if (s === 'vermelho' || s === 'critico') critico++;
  }
  const sem_dado = total - em_dia - atras - critico;
  const totalAvaliados = em_dia + atras + critico;
  const percentual = total > 0 ? Math.round((em_dia / total) * 100) : 0;
  // Conta OKRs distintos · KPIs do mesmo OKR (em cascata) contam como 1
  const okrIds = new Set();
  let kpisSemOkr = 0;
  for (const k of kpis) {
    if (k.objetivo_geral_id) okrIds.add(k.objetivo_geral_id);
    else kpisSemOkr++;
  }
  const totalOkrs = okrIds.size + kpisSemOkr; // KPI orfao conta sozinho
  return {
    total_kpis: total,
    total_okrs: totalOkrs,
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
      .select('id, area, valores, is_okr, objetivo_geral_id')
      .eq('ativo', true);
    if (ek) throw ek;

    // 2. Status de trajetoria de cada KPI
    const { data: trajetorias } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria');
    const statusByKpi = {};
    (trajetorias || []).forEach(t => { statusByKpi[t.kpi_id] = t.status_trajetoria; });

    // 3. Áreas ativas (para labels e ordem)
    const { data: areas } = await supabase
      .from('areas_kpi')
      .select('id, nome, cor_hex, ordem')
      .eq('ativa', true)
      .order('ordem');

    // 3.5 Indicador principal (número absoluto · pessoas engajadas) por valor ·
    // mês corrente. Headline da mandala no lugar da %.
    const _range = mesCorrenteRange();
    const indicadores = {};
    await Promise.all(VALORES.map(async (v) => {
      indicadores[v] = await indicadorPrincipalMes(v, _range);
    }));

    // 3.6 Cascata por área. Seguir: decisões por culto (total = soma das
    // pétalas). Servir/Generosidade (2026-06-10): área do registro
    // (mem_voluntarios.area / mem_contribuicoes.area) · registro sem área
    // conta no centro mas não nas pétalas (não chutamos área).
    let decisoesArea = { porArea: {}, total: null };
    try {
      decisoesArea = await decisoesPorAreaMes(_range);
      indicadores.seguir = { numero: decisoesArea.total, unidade: 'decisões' };
    } catch (e) {
      console.error('decisoesPorAreaMes:', e.message);
    }
    let servirArea = { porArea: {}, semArea: 0, total: null };
    try {
      servirArea = await voluntariosAtivos4mPorArea(_range);
      indicadores.servir = { numero: servirArea.total, unidade: 'voluntários' };
    } catch (e) {
      console.error('voluntariosPorAreaMes:', e.message);
    }
    let generosidadeArea = { porArea: {}, semArea: 0, total: null };
    try {
      generosidadeArea = await generosidadePorAreaMes(_range);
      indicadores.generosidade = { numero: generosidadeArea.total, unidade: 'dizimistas' };
    } catch (e) {
      console.error('generosidadePorAreaMes:', e.message);
    }

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
        numero: indicadores[v]?.numero ?? null,
        unidade: indicadores[v]?.unidade ?? null,
        ...tab,
      };
    });

    // 5. Mandalas 1-5 (focadas em cada valor): 6 áreas
    const por_valor = {};
    for (const v of VALORES) {
      const kpisDoValor = (kpis || []).filter(k =>
        Array.isArray(k.valores) && k.valores.includes(v)
      );
      const tabValor = tabularKpis(kpisDoValor, statusByKpi);

      // Cada área: KPIs daquele valor naquela área
      const areasDoValor = (areas || []).map(area => {
        const kpisArea = kpisDoValor.filter(k =>
          String(k.area || '').toLowerCase() === area.id
        );
        const tab = tabularKpis(kpisArea, statusByKpi);
        // Número do indicador principal repartido por área (cascata):
        // Seguir = decisões por culto · Servir = voluntários por área ·
        // Generosidade = dizimistas por área · Conectar/Investir ficam null
        // ("—" · grupos/devocionais não têm dimensão de área de culto).
        let numero_area = null;
        if (v === 'seguir' && AREAS_DECISOES.includes(area.id)) {
          numero_area = decisoesArea.porArea[area.id] ?? 0;
        } else if (v === 'servir' && AREAS_5.includes(area.id)) {
          numero_area = servirArea.porArea[area.id] ?? 0;
        } else if (v === 'generosidade' && AREAS_5.includes(area.id)) {
          numero_area = generosidadeArea.porArea[area.id] ?? 0;
        }
        return {
          id: area.id,
          nome: area.nome,
          cor_hex: area.cor_hex,
          numero_area,
          ...tab,
        };
      }).filter(a => a.total_kpis > 0); // so áreas que tem KPI desse valor

      por_valor[v] = {
        key: v,
        label: VALOR_LABELS[v],
        cor: VALOR_CORES[v],
        numero: indicadores[v]?.numero ?? null,
        unidade: indicadores[v]?.unidade ?? null,
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
      mes: _range.mesLabel,
    };
    cacheSet('mandalas', _resp);
    res.json(_resp);
  } catch (e) {
    console.error('painel/mandalas:', e.message);
    res.status(500).json({ error: 'Erro ao montar mandalas' });
  }
});

// ----------------------------------------------------------------------------
// GET /matriz - grid 6 áreas x 5 valores, com pior status de cada celula
// ----------------------------------------------------------------------------
router.get('/matriz', async (req, res) => {
  try {
    const cached = cacheGet('matriz');
    if (cached) return res.json(cached);

    const { data: kpis, error: ek } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, area, valores, objetivo_geral_id')
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
      .in('id', ['kids', 'bridge', 'ami', 'sede', 'online']) // 5 áreas · CBA removido (so coleta batismos/aceitacoes via dados_brutos)
      .order('ordem');

    // Pra cada celula (área x valor), agregar
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
          // Mapeia status do KPI (verde/amarelo/vermelho/pendente) ou legado
          // (no_alvo/atras/critico/sem_meta) pra cor da celula
          const statuses = kpisCelula.map(k => {
            const s = statusByKpi[k.id];
            if (s === 'verde'    || s === 'no_alvo')  return 'verde';
            if (s === 'amarelo'  || s === 'atras')    return 'amarelo';
            if (s === 'vermelho' || s === 'critico')  return 'vermelho';
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
// GET /matriz-adm - grid 8 áreas adm × 6 areas-cliente
//   Cada celula: % solicitações concluídas no SLA daquela área adm para
//   aquela area-cliente no mês corrente.
// ----------------------------------------------------------------------------
// 5 grupos visuais · cada um agrega 1 ou mais sub-areas adm
// (Criativo removido · vai ter matriz/OKR própria por ter natureza diferente)
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

// Legado mantido para outros endpoints que ainda referenciam áreas individuais
// (Criativo não listado · matriz separada futura)
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
  // CBA removido · so coleta dados batismos/aceitacoes via dados_brutos
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
      .select('id, formula_config, ativo, tipo_kpi, objetivo_geral_id')
      .eq('ativo', true)
      .eq('tipo_kpi', 'operacional');

    // Conta OKRs distintos por grupo (KPIs do mesmo OKR contam como 1)
    const okrsPorGrupo = {};
    (kpis || []).forEach(k => {
      const sub = k.formula_config?.area_responsavel;
      if (!sub || !k.objetivo_geral_id) return;
      const grupo = AREAS_ADM_GRUPOS.find(g => g.subareas.includes(sub));
      if (!grupo) return;
      if (!okrsPorGrupo[grupo.key]) okrsPorGrupo[grupo.key] = new Set();
      okrsPorGrupo[grupo.key].add(k.objetivo_geral_id);
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
          total_kpis: (okrsPorGrupo[g.key]?.size) || 0,
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
// GET /celula-adm/:area_adm/:area_cliente - solicitações daquela intersecao
// ----------------------------------------------------------------------------
// param area_adm pode ser grupo (hospitalidade) ou subarea (cozinha)
// Se for grupo, expande pras subareas
// ----------------------------------------------------------------------------
// Matriz Criativo · 3 grupos criativos × 6 areas-cliente
// (Mesma lógica da Gestão mas grupos diferentes)
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

    // KPIs criativos ativos por grupo · filtra por formula_config.area_responsavel
    // (Pega tanto ADM-C-* quanto qualquer outro KPI que aponte pra producao/adoracao/marketing,
    // ex.: MKT-ONL-* do OKR Engajamento Online)
    const { data: kpisAll } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, formula_config, ativo, tipo_kpi, area, objetivo_geral_id')
      .eq('ativo', true)
      .eq('tipo_kpi', 'operacional');

    // Conta OKRs distintos por celula (grupo x area_cliente)
    // KPIs do mesmo OKR (em cascata) contam como 1 OKR na celula
    // KPI com area='sede' (cross) entra em todas as colunas; com área especifica so na própria
    const okrsPorCelula = {};
    AREAS_CRIATIVO_GRUPOS.forEach(g => {
      AREAS_CLIENTE.forEach(cli => { okrsPorCelula[`${g.key}:${cli.id}`] = new Set(); });
    });
    (kpisAll || []).forEach(k => {
      const sub = k.formula_config?.area_responsavel;
      if (!sub || !k.objetivo_geral_id) return;
      const grupo = AREAS_CRIATIVO_GRUPOS.find(g => g.subareas.includes(sub));
      if (!grupo) return;
      const isCross = !k.area || k.area === 'sede';
      AREAS_CLIENTE.forEach(cli => {
        if (isCross || k.area === cli.id) {
          okrsPorCelula[`${grupo.key}:${cli.id}`].add(k.objetivo_geral_id);
        }
      });
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
          total_kpis: okrsPorCelula[`${g.key}:${cli.id}`].size || 0,
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

    // KPIs do grupo criativo · filtra por formula_config.area_responsavel
    // (Inclui ADM-C-* + MKT-ONL-* + qualquer outro KPI operacional vinculado)
    const { data: kpisAll } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, meta_descricao, meta_valor, unidade, tipo_kpi, is_okr, formula_config, ativo, area')
      .eq('ativo', true)
      .eq('tipo_kpi', 'operacional');

    const kpisDoGrupo = (kpisAll || []).filter(k => {
      const areaResp = k.formula_config?.area_responsavel;
      if (!areaResp || !subareas.includes(areaResp)) return false;
      // Se o KPI tem área especifica (ex: MKT-ONL-* tem area='online'), filtra
      // também pela area_cliente do clique. Se área do KPI e 'sede' (cross),
      // mostra em qualquer celula.
      if (k.area && k.area !== 'sede' && k.area !== area_cliente) return false;
      return true;
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

    // Solicitações da intersecao (últimos 30 dias)
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

    // Último valor de cada KPI
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

    // Líder (rh_funcionarios) — buscar nomes em lote
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
// Inclui: dados do KPI, trajetoria atual, histórico de registros (12),
// checkpoints (trajetoria completa), última revisão OKR (se houver)
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
    if (!kpi) return res.status(404).json({ error: 'KPI não encontrado' });

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

    // Histórico de registros (últimos 12)
    // Colunas reais: observações (plural) e user_id · antes estavam erradas
    // (`observação` e `preenchido_por_user_id`) e o SELECT silenciava com
    // registros=null · histórico aparecia vazio no /painel/kpi/:id.
    const { data: registros } = await supabase
      .from('kpi_registros')
      .select('id, periodo_referencia, valor_realizado, valor_texto, observacoes, origem, data_preenchimento, user_id')
      .eq('indicador_id', id)
      .order('periodo_referencia', { ascending: false })
      .limit(12);

    // Líder (rh_funcionarios)
    let lider = null;
    if (kpi.lider_funcionario_id) {
      const { data: l } = await supabase
        .from('rh_funcionarios')
        .select('id, nome, cargo, email')
        .eq('id', kpi.lider_funcionario_id)
        .maybeSingle();
      lider = l || null;
    }

    // Última revisão OKR (se existir tabela e KPI eh OKR)
    let revisoes = [];
    try {
      const { data: r } = await supabase
        .from('okr_revisoes')
        .select('id, periodo_referencia, status_revisao, status_no_periodo, causa_desvio, decisao, proximo_passo, prazo_proximo_passo, data_revisao, data_execucao, responsavel:rh_funcionarios(id, nome, cargo)')
        .eq('kpi_id', id)
        .order('data_revisao', { ascending: false })
        .limit(5);
      revisoes = r || [];
    } catch (_) { /* tabela pode não existir ainda */ }

    res.json({
      kpi,
      lider,
      trajetoria_atual: trajAtual,
      checkpoints: checkpoints || [],
      historico: (registros || []).reverse(), // mais antigo primeiro pra gráfico
      revisoes,
    });
  } catch (e) {
    console.error('painel/kpi/:id', e.message);
    res.status(500).json({ error: 'Erro ao carregar KPI' });
  }
});

// ----------------------------------------------------------------------------
// Catalogo de atividades por valor · alimenta os sub-filtros da NSM.
// Cada atividade = um sinal concreto de engajamento naquele valor.
// (frontend renderiza a partir do que o endpoint devolve em atividades_catalogo)
// ----------------------------------------------------------------------------
const NSM_ATIVIDADES = {
  seguir:       [
    { id: 'batismo',          label: 'Batismo' },
    { id: 'next',             label: 'Next' },
  ],
  conectar:     [
    { id: 'grupo', label: 'Em grupo' },
  ],
  investir:     [
    { id: 'investir', label: 'Investir' },
  ],
  servir:       [
    { id: 'voluntario', label: 'Voluntário' },
  ],
  generosidade: [
    { id: 'dizimo', label: 'Generosidade' },
  ],
};

// Calcula o intervalo [início, fim] e a janela de engajamento (em dias) a partir
// do ano selecionado + a janela escolhida (30 | 60 | 90 | acumulado).
//   - ano atual    -> fim = hoje
//   - ano anterior -> fim = 31/dez daquele ano
//   - acumulado    -> início = 1º de janeiro do ano (janela de engajamento = até o fim)
//   - 30/60/90     -> início = fim - N dias (sem sair do ano) · janela de engajamento = N
function nsmPeriodo(ano, janela) {
  const hoje = new Date();
  const anoNum = Number(ano) || hoje.getFullYear();
  const ehAtual = anoNum === hoje.getFullYear();
  const iso = (d) => d.toISOString().slice(0, 10);
  const fimDate = ehAtual ? hoje : new Date(anoNum, 11, 31);
  let inicioDate, janelaDias;
  if (janela === 'acumulado') {
    inicioDate = new Date(anoNum, 0, 1);
    janelaDias = null;
  } else {
    janelaDias = [30, 60, 90].includes(Number(janela)) ? Number(janela) : 60;
    inicioDate = new Date(fimDate);
    inicioDate.setDate(inicioDate.getDate() - janelaDias);
    const limiteAno = new Date(anoNum, 0, 1);
    if (inicioDate < limiteAno) inicioDate = limiteAno; // não escapa do ano selecionado
  }
  return { ano: anoNum, janela, janelaDias, inicio: iso(inicioDate), fim: iso(fimDate) };
}

function nsmChunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}


// Sinais de engajamento por convertido · ESPELHA fn_nsm_sinais_engajados (a função
// SQL do card · migration 20260619140000): sinais {batismo,next,grupo,investir,
// servir,generosidade}, janela ±60d da conversão, casa por id/cpf/nome (batismo/
// next · ~97% sem CPF → nome), grupo sem gate de data (entrou_em = data de import).
// 1º contato NÃO é sinal. Mantida em JS aqui só pra devolver a lista pra a UI;
// a regra de "engajado" é idêntica à do card. Map<membro_id, [{valor,atividade,data}]>.
async function nsmSinaisCohorte(pessoas) {
  const mapa = new Map();
  if (!pessoas.length) return mapa;
  const ids = pessoas.map(p => p.id);
  const dig = (v) => String(v || '').replace(/\D/g, '');
  const lower = (v) => String(v || '').trim().toLowerCase();
  const DIA = 86400000;
  const inWin = (d, dc) => {
    if (!d || !dc) return false;
    const t = new Date(String(d).slice(0, 10) + 'T12:00:00').getTime();
    const c = new Date(dc + 'T12:00:00').getTime();
    return t >= c - 60 * DIA && t <= c + 60 * DIA;
  };
  const add = (m, k, d) => { if (!k || !d) return; (m.get(k) || m.set(k, []).get(k)).push(d); };
  const pageAll = async (table, cols, build) => {
    const out = []; let f = 0;
    for (;;) {
      let q = supabase.from(table).select(cols).range(f, f + 999);
      if (build) q = build(q);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
      f += 1000;
    }
    return out;
  };
  // batismo / next · globais (casa por id/cpf/nome)
  const bat = await pageAll('batismo_inscricoes', 'membro_id, cpf, nome, data_batismo',
    q => q.eq('status', 'realizado').not('data_batismo', 'is', null));
  const bM = new Map(), bC = new Map(), bN = new Map();
  bat.forEach(b => { add(bM, b.membro_id, b.data_batismo); add(bC, dig(b.cpf).length === 11 ? dig(b.cpf) : null, b.data_batismo); add(bN, lower(b.nome) || null, b.data_batismo); });
  // Next "fez" = formado na turma (fonte única next_matriculas · o check-in legado
  // de next_inscricoes foi backfillado pra formado na migration 20260626180000).
  const nxM = await pageAll('next_matriculas', 'membro_id, cpf, nome, created_at', q => q.eq('status', 'formado').is('deleted_at', null));
  const nM = new Map(), nC = new Map(), nN = new Map();
  nxM.forEach(n => { add(nM, n.membro_id, n.created_at); add(nC, dig(n.cpf).length === 11 ? dig(n.cpf) : null, n.created_at); add(nN, lower(n.nome) || null, n.created_at); });
  // grupo (sem data) + investir/servir/generosidade (por membro_id) · chunked
  const gru = new Set(); const inv = new Map(), ser = new Map(), gen = new Map();
  for (const part of nsmChunk(ids, 150)) {
    const [g, dev, j, ac, vol, con] = await Promise.all([
      supabase.from('mem_grupo_membros').select('membro_id').is('deleted_at', null).in('membro_id', part).is('saiu_em', null),
      supabase.from('mem_devocionais').select('membro_id, data_devocional').in('membro_id', part).eq('concluida', true).not('data_devocional', 'is', null),
      supabase.from('cui_jornada180').select('membro_id, data_encontro, presente').is('deleted_at', null).in('membro_id', part).not('data_encontro', 'is', null),
      supabase.from('cui_acompanhamentos').select('membro_id, data_inicio').in('membro_id', part).not('data_inicio', 'is', null),
      supabase.from('mem_voluntarios').select('membro_id, desde').is('deleted_at', null).in('membro_id', part).is('ate', null).not('desde', 'is', null),
      supabase.from('mem_contribuicoes').select('membro_id, data, tipo').is('deleted_at', null).in('membro_id', part).in('tipo', ['dizimo', 'oferta']).not('data', 'is', null),
    ]);
    (g.data || []).forEach(r => gru.add(r.membro_id));
    (dev.data || []).forEach(r => add(inv, r.membro_id, r.data_devocional));
    (j.data || []).forEach(r => { if (r.presente !== false) add(inv, r.membro_id, r.data_encontro); });
    (ac.data || []).forEach(r => add(inv, r.membro_id, r.data_inicio));
    (vol.data || []).forEach(r => add(ser, r.membro_id, r.desde));
    (con.data || []).forEach(r => add(gen, r.membro_id, r.data));
  }
  const firstIn = (arrs, dc) => { for (const a of arrs) { if (!a) continue; for (const d of a) if (inWin(d, dc)) return d; } return null; };
  for (const p of pessoas) {
    const dc = p.data_decisao;
    const cpf = dig(p.cpf).length === 11 ? dig(p.cpf) : null;
    const nome = lower(p.nome);
    const atv = []; let d;
    if ((d = firstIn([bM.get(p.id), cpf && bC.get(cpf), bN.get(nome)], dc))) atv.push({ valor: 'seguir', atividade: 'batismo', data: String(d).slice(0, 10) });
    if ((d = firstIn([nM.get(p.id), cpf && nC.get(cpf), nN.get(nome)], dc))) atv.push({ valor: 'seguir', atividade: 'next', data: String(d).slice(0, 10) });
    if (gru.has(p.id)) atv.push({ valor: 'conectar', atividade: 'grupo', data: dc });
    if ((d = firstIn([inv.get(p.id)], dc))) atv.push({ valor: 'investir', atividade: 'investir', data: String(d).slice(0, 10) });
    if ((d = firstIn([ser.get(p.id)], dc))) atv.push({ valor: 'servir', atividade: 'voluntario', data: String(d).slice(0, 10) });
    if ((d = firstIn([gen.get(p.id)], dc))) atv.push({ valor: 'generosidade', atividade: 'dizimo', data: String(d).slice(0, 10) });
    if (atv.length) mapa.set(p.id, atv);
  }
  return mapa;
}

// ----------------------------------------------------------------------------
// GET /nsm/pessoas - convertidos + engajamento por valor/atividade (camada 4)
// query:
//   ?ano=2026                      ano de referência (default ano atual)
//   ?janela=30|60|90|acumulado     recorte de tempo (default 60)
//   ?status=todos|engajados|nao_engajados   (default todos)
//   ?valores=seguir,investir       valores marcados (CSV)
//   ?atividades=seguir:next,investir:aconselhamento   atividades marcadas (CSV "valor:atividade")
//   ?tipo=todos|presencial|online  origem da decisão (default todos)
//   ?segmento=central|online       (legado · segmento=online equivale a tipo=online)
//   ?limit=300                     max de pessoas retornadas
//
// Fonte = cui_convertidos (fonte canônica do convertido · por membro_id · data
// = data_culto da conversão). Bate com o numerador do card NSM (recalcular_nsm).
// A janela vale pra tudo: define quem decidiu no recorte E o horizonte de engajamento
// (30->30d após a decisão · acumulado->até o fim do período). Filtro = E entre
// valores, OU entre atividades do mesmo valor. Exceção: "seguir" marcado SEM
// atividade não exclui ninguém — a própria conversão já cumpre Seguir a Jesus
// (toda pessoa desta lista decidiu por Jesus); as atividades refinam.
// Resposta: totais do recorte (total_*) + totais da lista filtrada (match_*),
// pros cards da UI acompanharem o filtro ativo.
// ----------------------------------------------------------------------------
router.get('/nsm/pessoas', async (req, res) => {
  try {
    const segmento = String(req.query.segmento || 'central').toLowerCase();
    const janelaRaw = String(req.query.janela || '60').toLowerCase();
    const janela = ['30', '60', '90', 'acumulado'].includes(janelaRaw) ? janelaRaw : '60';
    const status = String(req.query.status || 'todos').toLowerCase();
    const tipoRaw = String(req.query.tipo || (segmento === 'online' ? 'online' : 'todos')).toLowerCase();
    const tipoDecisao = ['presencial', 'online'].includes(tipoRaw) ? tipoRaw : 'todos';
    const limit = Math.min(Number(req.query.limit) || 300, 1000);

    const valoresSel = String(req.query.valores || '').split(',').map(s => s.trim()).filter(Boolean);
    const atividadesSel = String(req.query.atividades || '').split(',').map(s => s.trim()).filter(Boolean);
    const atvPorValor = {};
    for (const a of atividadesSel) {
      const [v, id] = a.split(':');
      if (!v || !id) continue;
      (atvPorValor[v] = atvPorValor[v] || []).push(id);
    }
    const valoresFiltro = [...new Set([...valoresSel, ...Object.keys(atvPorValor)])];

    const periodo = nsmPeriodo(req.query.ano, janela);

    // 1. Convertidos no recorte · FONTE CANÔNICA cui_convertidos (por membro_id,
    //    data = data_culto da conversão). Página de 1000 (PostgREST capa em 1000).
    //    Online → area='online' (cui_convertidos não tem tipo_decisao · usa area).
    let convs = [];
    let from = 0;
    const page = 1000;
    for (;;) {
      let q = supabase
        .from('cui_convertidos')
        .select('membro_id, nome, telefone, cpf, area, data_culto')
        .is('deleted_at', null)
        .not('membro_id', 'is', null)
        .gte('data_culto', periodo.inicio)
        .lte('data_culto', periodo.fim)
        .range(from, from + page - 1);
      if (tipoDecisao === 'online') q = q.eq('area', 'online');
      else if (tipoDecisao === 'presencial') q = q.neq('area', 'online');
      const { data, error } = await q;
      if (error) throw error;
      convs = convs.concat(data || []);
      if (!data || data.length < page) break;
      from += page;
    }

    // dedup por membro · mantém a conversão mais recente no período
    const pessoaPorMembro = new Map();
    for (const c of convs) {
      const dataDec = c.data_culto;
      if (!dataDec) continue;
      const cur = pessoaPorMembro.get(c.membro_id);
      if (!cur || dataDec > cur.data_decisao) {
        pessoaPorMembro.set(c.membro_id, {
          id: c.membro_id,
          nome: c.nome,
          telefone: c.telefone,
          cpf: c.cpf,
          email: null,
          tipo_decisao: c.area === 'online' ? 'online' : 'presencial',
          data_decisao: dataDec,
        });
      }
    }
    const pessoas = [...pessoaPorMembro.values()];

    // Órfãos: convertidos da coorte SEM membro_id (não rastreáveis até reconciliar).
    // Entram no TOTAL (= denominador do card · accountability) como NÃO engajados,
    // marcados (orfao:true) pra virar worklist de reconciliação (Kevyn/Next-Batismo).
    // Sem isso, o card conta 112 e a página 101 (divergência que o Marcos pegou).
    const orfaoRows = [];
    let ofrom = 0;
    for (;;) {
      let oq = supabase
        .from('cui_convertidos')
        .select('id, nome, telefone, cpf, area, data_culto')
        .is('deleted_at', null)
        .is('membro_id', null)
        .gte('data_culto', periodo.inicio)
        .lte('data_culto', periodo.fim)
        .range(ofrom, ofrom + page - 1);
      if (tipoDecisao === 'online') oq = oq.eq('area', 'online');
      else if (tipoDecisao === 'presencial') oq = oq.neq('area', 'online');
      const { data, error } = await oq;
      if (error) throw error;
      orfaoRows.push(...(data || []));
      if (!data || data.length < page) break;
      ofrom += page;
    }
    const orfaos = orfaoRows.filter(c => c.data_culto).map(c => ({
      id: 'orf:' + c.id, nome: c.nome, telefone: c.telefone, cpf: c.cpf, email: null,
      tipo_decisao: c.area === 'online' ? 'online' : 'presencial',
      data_decisao: c.data_culto, orfao: true,
    }));

    const totalConvertidos = pessoas.length + orfaos.length;

    const baseResp = {
      segmento, ano: periodo.ano, janela, periodo,
      atividades_catalogo: NSM_ATIVIDADES,
      filtro: { valores: valoresFiltro, atividades: atividadesSel, status, tipo: tipoDecisao },
    };

    if (totalConvertidos === 0) {
      return res.json({
        ...baseResp,
        total_convertidos: 0, total_engajados: 0, total_nao_engajados: 0,
        pct_engajamento: 0, total_match: 0,
        match_engajados: 0, match_nao_engajados: 0, match_pct: 0,
        pessoas: [],
      });
    }

    // 2. Sinais de engajamento por convertido · MESMA regra do card
    //    (fn_nsm_sinais_engajados · ±60d · sinais, não valores). Só pros com membro_id.
    const sinMapa = await nsmSinaisCohorte(pessoas);

    // 3. Enriquece com os sinais (engajado = ≥1 sinal · igual ao numerador do card).
    //    Órfãos entram sempre como NÃO engajados (não há como rastrear sem membro_id).
    const hoje = new Date();
    const enrich = (p) => {
      const todas = p.orfao ? [] : (sinMapa.get(p.id) || []);
      const valoresEng = [...new Set(todas.map(a => a.valor))];
      const diasDecorridos = Math.floor((hoje - new Date(p.data_decisao + 'T12:00:00')) / 86400000);
      return { ...p, atividades: todas, valores_engajados: valoresEng, engajado: valoresEng.length > 0, dias_decorridos: diasDecorridos };
    };
    const enriquecidos = [...pessoas.map(enrich), ...orfaos.map(enrich)];

    const totalEngajados = enriquecidos.filter(p => p.engajado).length;

    // 4. Filtro de valores/atividades · E entre valores, OU dentro do mesmo valor.
    //    "seguir" sem atividade marcada passa todo mundo: a conversão (que põe a
    //    pessoa nesta lista) já cumpre o valor Seguir a Jesus.
    const matchFiltro = (p) => {
      for (const v of valoresFiltro) {
        const atvsDoValor = p.atividades.filter(a => a.valor === v);
        if (atvPorValor[v] && atvPorValor[v].length) {
          if (!atvsDoValor.some(a => atvPorValor[v].includes(a.atividade))) return false;
        } else if (v === 'seguir') {
          continue;
        } else if (atvsDoValor.length === 0) {
          return false;
        }
      }
      return true;
    };

    let lista = enriquecidos;
    if (status === 'engajados') lista = lista.filter(p => p.engajado);
    else if (status === 'nao_engajados') lista = lista.filter(p => !p.engajado);
    if (valoresFiltro.length) lista = lista.filter(matchFiltro);

    lista.sort((a, b) => (a.data_decisao < b.data_decisao ? 1 : -1)); // mais recentes primeiro

    const matchEngajados = lista.filter(p => p.engajado).length;

    res.json({
      ...baseResp,
      total_convertidos: totalConvertidos,
      total_engajados: totalEngajados,
      total_nao_engajados: totalConvertidos - totalEngajados,
      pct_engajamento: totalConvertidos > 0 ? Math.round((totalEngajados / totalConvertidos) * 100) : 0,
      total_match: lista.length,
      match_engajados: matchEngajados,
      match_nao_engajados: lista.length - matchEngajados,
      match_pct: lista.length > 0 ? Math.round((matchEngajados / lista.length) * 100) : 0,
      pessoas: lista.slice(0, limit),
    });
  } catch (e) {
    console.error('painel/nsm/pessoas:', e.message);
    res.status(500).json({ error: 'Erro ao carregar pessoas' });
  }
});

// ----------------------------------------------------------------------------
// GET /nsm/serie - tendência mensal do NSM (coorte por mês de conversão)
// query: ?meses=12 (1..36) · ?segmento=central|online
// Cada ponto = dos convertidos que decidiram no mês, % engajados em ±60d.
// ----------------------------------------------------------------------------
router.get('/nsm/serie', async (req, res) => {
  try {
    const meses = Math.min(Math.max(Number(req.query.meses) || 12, 1), 36);
    const segmento = String(req.query.segmento || 'central').toLowerCase();
    const area = segmento === 'online' ? 'online' : null;
    const cacheKey = `nsm-serie:${meses}:${area || 'all'}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const { data, error } = await supabase.rpc('fn_nsm_serie_mensal', { p_meses: meses, p_area: area });
    if (error) throw error;

    const resp = { meses, segmento, serie: data || [] };
    cacheSet(cacheKey, resp);
    res.json(resp);
  } catch (e) {
    console.error('painel/nsm/serie:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a série do NSM' });
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

// ============================================================================
// GET /nsm/sem-dados · cultos com gap entre decisões e pessoas registradas
//
// Marcos: "ao clicar para ver deve ter um filtro 'pessoas sem dados'"
//
// Usado no drilldown /painel/nsm/pessoas pra mostrar QUANTAS decisões não
// tem nome/contato cadastrado em cultos_decisoes_pessoas · accountability
// pela ausencia de dados.
// ============================================================================
router.get('/nsm/sem-dados', async (req, res) => {
  try {
    const dias = Math.min(Number(req.query.dias) || 90, 365);
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - dias);
    const dataLimiteStr = dataLimite.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('vw_nsm_sem_dados')
      .select('*')
      .gte('data_culto', dataLimiteStr)
      .order('data_culto', { ascending: false });
    if (error) throw error;

    const items = data || [];
    const resumo = {
      total_cultos:         items.length,
      total_decisoes:       items.reduce((s, c) => s + (c.total_decisoes || 0), 0),
      total_registradas:    items.reduce((s, c) => s + (c.total_registradas || 0), 0),
      total_sem_dados:      items.reduce((s, c) => s + (c.sem_dados || 0), 0),
      cultos_nenhuma_registrada: items.filter(c => c.gap_status === 'nenhuma_registrada').length,
      cultos_parcial:            items.filter(c => c.gap_status === 'parcial').length,
      cultos_completo:           items.filter(c => c.gap_status === 'completo').length,
    };

    res.json({ resumo, items });
  } catch (e) {
    console.error('painel/nsm/sem-dados:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dados sem registro' });
  }
});

// ============================================================================
// GET /serie-temporal · carrossel de valores no painel
//
// Marcos: "um carrossel de dados com filtro por valor. Um gráfico de linhas
//          por exemplo de Seguir a Jesus com filtro de conversoes, batismo
//          e frequência por todos os cultos · seleciona dado, culto, período"
//
// Query params:
//   valor          · seguir | conectar | investir | servir | generosidade
//   dado           · id do dado (varia por valor · ver /serie-temporal/dados)
//   culto          · uuid de vol_service_types (opcional · so faz sentido p/ seguir)
//   início         · ISO date (default = hoje - 12 meses)
//   fim            · ISO date (default = hoje)
//   granularidade  · mês (default) | semana
//
// Retorna: { label, dado, valor, granularidade, série: [{ período, valor }] }
// ============================================================================

const SERIE_DADOS = {
  seguir: [
    { id: 'conversoes', label: 'Decisões',       filtra_culto: true,  tabela: 'cultos' },
    { id: 'frequencia', label: 'Frequência',     filtra_culto: true,  tabela: 'cultos' },
    { id: 'batismos',   label: 'Batismos',       filtra_culto: false, tabela: 'batismo_inscricoes' },
  ],
  conectar: [
    { id: 'grupos_ativos',     label: 'Grupos ativos',           filtra_culto: false, tabela: 'mem_grupo_membros' },
    { id: 'membros_em_grupos', label: 'Membros em grupos ativos', filtra_culto: false, tabela: 'mem_grupo_membros' },
    { id: 'entradas_grupos',   label: 'Novas entradas em grupos', filtra_culto: false, tabela: 'mem_grupo_membros' },
  ],
  investir: [
    { id: 'devocionais', label: 'Devocionais concluídos', filtra_culto: false, tabela: 'mem_devocionais' },
    { id: 'jornada180',  label: 'Encontros Jornada 180',  filtra_culto: false, tabela: 'cui_jornada180' },
  ],
  servir: [
    { id: 'voluntarios_ativos', label: 'Voluntários ativos no mês', filtra_culto: false, tabela: 'mem_voluntarios' },
    { id: 'novos_voluntarios',  label: 'Novos voluntários',         filtra_culto: false, tabela: 'mem_voluntarios' },
  ],
  generosidade: [
    { id: 'dizimistas',      label: 'Dizimistas únicos',       filtra_culto: false, tabela: 'mem_contribuicoes' },
    { id: 'ofertantes',      label: 'Ofertantes únicos',       filtra_culto: false, tabela: 'mem_contribuicoes' },
    { id: 'doacoes_valor',   label: 'Valor doado (R$)',        filtra_culto: false, tabela: 'mem_contribuicoes' },
    { id: 'doadores_unicos', label: 'Doadores únicos no mês',  filtra_culto: false, tabela: 'mem_contribuicoes' },
  ],
};

function defaultRange() {
  const fim = new Date();
  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - 11);
  inicio.setDate(1);
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

function chavePeriodo(dataIso, granularidade) {
  if (!dataIso) return null;
  if (granularidade === 'semana') {
    const d = new Date(dataIso + 'T12:00:00');
    const dow = (d.getDay() + 6) % 7; // segunda = 0
    d.setDate(d.getDate() - dow);
    return d.toISOString().slice(0, 10);
  }
  // mês (default)
  return dataIso.slice(0, 7);
}

function preencherLacunas(serie, inicio, fim, granularidade) {
  // Garante pontos pra todos os períodos do range (mesmo zerados)
  const mapa = new Map(serie.map(p => [p.periodo, p.valor]));
  const out = [];
  if (granularidade === 'semana') {
    const start = new Date(inicio + 'T12:00:00');
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
    const end = new Date(fim + 'T12:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
      const k = d.toISOString().slice(0, 10);
      out.push({ periodo: k, valor: mapa.get(k) || 0 });
    }
  } else {
    const [yi, mi] = inicio.slice(0, 7).split('-').map(Number);
    const [yf, mf] = fim.slice(0, 7).split('-').map(Number);
    let y = yi, m = mi;
    while (y < yf || (y === yf && m <= mf)) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      out.push({ periodo: k, valor: mapa.get(k) || 0 });
      m++; if (m > 12) { m = 1; y++; }
    }
  }
  return out;
}

async function calcularSerie(valor, dado, { inicio, fim, culto, granularidade }) {
  const agg = new Map();
  const add = (dataIso, v) => {
    const k = chavePeriodo(dataIso, granularidade);
    if (!k) return;
    agg.set(k, (agg.get(k) || 0) + (Number(v) || 0));
  };

  // ----- SEGUIR -----
  if (valor === 'seguir' && dado === 'conversoes') {
    let q = supabase.from('cultos')
      .select('data, decisoes_presenciais, decisoes_online, service_type_id')
      .gte('data', inicio).lte('data', fim);
    if (culto) q = q.eq('service_type_id', culto);
    const { data, error } = await q;
    if (error) throw error;
    (data || []).forEach(r => add(r.data, (r.decisoes_presenciais || 0) + (r.decisoes_online || 0)));
  } else if (valor === 'seguir' && dado === 'frequencia') {
    let q = supabase.from('cultos')
      .select('data, presencial_adulto, presencial_kids, online_pico, service_type_id')
      .gte('data', inicio).lte('data', fim);
    if (culto) q = q.eq('service_type_id', culto);
    const { data, error } = await q;
    if (error) throw error;
    (data || []).forEach(r => add(r.data,
      (r.presencial_adulto || 0) + (r.presencial_kids || 0) + (r.online_pico || 0)
    ));
  } else if (valor === 'seguir' && dado === 'batismos') {
    const { data, error } = await supabase.from('batismo_inscricoes')
      .select('data_batismo')
      .eq('status', 'realizado')
      .gte('data_batismo', inicio).lte('data_batismo', fim);
    if (error) throw error;
    (data || []).forEach(r => add(r.data_batismo, 1));
  }
  // ----- CONECTAR -----
  else if (valor === 'conectar' && dado === 'grupos_ativos') {
    // Snapshot · grupos com pelo menos 1 membro ativo no fim de cada período
    const data = await fetchAllPaginado('mem_grupo_membros', (q) =>
      q.select('grupo_id, entrou_em, saiu_em'));
    const periodos = preencherLacunas([], inicio, fim, granularidade).map(p => p.periodo);
    for (const p of periodos) {
      const fimP = granularidade === 'semana'
        ? new Date(new Date(p + 'T12:00:00').setDate(new Date(p + 'T12:00:00').getDate() + 6)).toISOString().slice(0, 10)
        : new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0).toISOString().slice(0, 10);
      const gruposAtivos = new Set();
      (data || []).forEach(r => {
        if (r.entrou_em && r.entrou_em <= fimP && (!r.saiu_em || r.saiu_em > fimP)) {
          gruposAtivos.add(r.grupo_id);
        }
      });
      agg.set(p, gruposAtivos.size);
    }
  } else if (valor === 'conectar' && dado === 'membros_em_grupos') {
    // Snapshot por mês: quantas PESSOAS (membro_id distinto) estavam ativas em
    // grupos no fim do mês (entrou_em <= fim_do_mes AND (saiu_em IS NULL OR
    // saiu_em > fim_do_mes)). Conta pessoas únicas (quem está em 2 grupos não
    // conta 2x) e ignora vínculos removidos.
    const data = await fetchAllPaginado('mem_grupo_membros', (q) =>
      q.select('membro_id, entrou_em, saiu_em').is('deleted_at', null));
    const periodos = preencherLacunas([], inicio, fim, granularidade).map(p => p.periodo);
    for (const p of periodos) {
      const fimP = granularidade === 'semana'
        ? new Date(new Date(p + 'T12:00:00').setDate(new Date(p + 'T12:00:00').getDate() + 6)).toISOString().slice(0, 10)
        : new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0).toISOString().slice(0, 10);
      const ativos = new Set();
      (data || []).forEach(r => {
        if (r.entrou_em && r.entrou_em <= fimP && (!r.saiu_em || r.saiu_em > fimP)) ativos.add(r.membro_id);
      });
      agg.set(p, ativos.size);
    }
  } else if (valor === 'conectar' && dado === 'entradas_grupos') {
    const { data, error } = await supabase.from('mem_grupo_membros')
      .select('entrou_em')
      .gte('entrou_em', inicio).lte('entrou_em', fim);
    if (error) throw error;
    (data || []).forEach(r => add(r.entrou_em, 1));
  }
  // ----- INVESTIR -----
  else if (valor === 'investir' && dado === 'devocionais') {
    const { data, error } = await supabase.from('mem_devocionais')
      .select('data_devocional')
      .eq('concluida', true)
      .gte('data_devocional', inicio).lte('data_devocional', fim);
    if (error) throw error;
    (data || []).forEach(r => add(r.data_devocional, 1));
  } else if (valor === 'investir' && dado === 'jornada180') {
    const { data, error } = await supabase.from('cui_jornada180')
      .select('data_encontro, presente')
      .gte('data_encontro', inicio).lte('data_encontro', fim);
    if (error) throw error;
    (data || []).forEach(r => { if (r.presente !== false) add(r.data_encontro, 1); });
  }
  // ----- SERVIR -----
  else if (valor === 'servir' && dado === 'voluntarios_ativos') {
    // Snapshot por período: voluntários com (desde <= fim_periodo AND (até IS NULL OR até > fim_periodo))
    const data = await fetchAllPaginado('mem_voluntarios', (q) => q.select('desde, ate'));
    const periodos = preencherLacunas([], inicio, fim, granularidade).map(p => p.periodo);
    for (const p of periodos) {
      const fimP = granularidade === 'semana'
        ? new Date(new Date(p + 'T12:00:00').setDate(new Date(p + 'T12:00:00').getDate() + 6)).toISOString().slice(0, 10)
        : new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0).toISOString().slice(0, 10);
      const ativos = (data || []).filter(r =>
        r.desde && r.desde <= fimP &&
        (!r.ate || r.ate > fimP)
      ).length;
      agg.set(p, ativos);
    }
  } else if (valor === 'servir' && dado === 'novos_voluntarios') {
    const { data, error } = await supabase.from('mem_voluntarios')
      .select('desde')
      .gte('desde', inicio).lte('desde', fim);
    if (error) throw error;
    (data || []).forEach(r => add(r.desde, 1));
  }
  // ----- GENEROSIDADE -----
  else if (valor === 'generosidade' && (dado === 'dizimistas' || dado === 'ofertantes')) {
    const tipo = dado === 'dizimistas' ? 'dizimo' : 'oferta';
    const { data, error } = await supabase.from('mem_contribuicoes')
      .select('data, membro_id, tipo')
      .eq('tipo', tipo)
      .gte('data', inicio).lte('data', fim);
    if (error) throw error;
    const setsPorPeriodo = new Map();
    (data || []).forEach(r => {
      const k = chavePeriodo(r.data, granularidade);
      if (!k || !r.membro_id) return;
      if (!setsPorPeriodo.has(k)) setsPorPeriodo.set(k, new Set());
      setsPorPeriodo.get(k).add(r.membro_id);
    });
    setsPorPeriodo.forEach((set, k) => agg.set(k, set.size));
  } else if (valor === 'generosidade' && dado === 'doacoes_valor') {
    const { data, error } = await supabase.from('mem_contribuicoes')
      .select('data, valor')
      .gte('data', inicio).lte('data', fim);
    if (error) throw error;
    (data || []).forEach(r => add(r.data, Number(r.valor) || 0));
  } else if (valor === 'generosidade' && dado === 'doadores_unicos') {
    const { data, error } = await supabase.from('mem_contribuicoes')
      .select('data, membro_id')
      .gte('data', inicio).lte('data', fim);
    if (error) throw error;
    const setsPorPeriodo = new Map();
    (data || []).forEach(r => {
      const k = chavePeriodo(r.data, granularidade);
      if (!k || !r.membro_id) return;
      if (!setsPorPeriodo.has(k)) setsPorPeriodo.set(k, new Set());
      setsPorPeriodo.get(k).add(r.membro_id);
    });
    setsPorPeriodo.forEach((set, k) => agg.set(k, set.size));
  } else {
    const err = new Error(`Combinação valor=${valor} dado=${dado} não suportada`);
    err.status = 400;
    throw err;
  }

  const serie = Array.from(agg.entries()).map(([periodo, valor]) => ({ periodo, valor }));
  return preencherLacunas(serie, inicio, fim, granularidade);
}

router.get('/serie-temporal/dados', async (req, res) => {
  try {
    const { data: tipos } = await supabase.from('vol_service_types')
      .select('id, name, color')
      .order('recurrence_day').order('recurrence_time');
    res.json({
      valores: VALORES.map(v => ({
        key: v,
        label: VALOR_LABELS[v],
        cor: VALOR_CORES[v],
        dados: SERIE_DADOS[v] || [],
      })),
      cultos: tipos || [],
    });
  } catch (e) {
    console.error('painel/serie-temporal/dados:', e.message);
    res.status(500).json({ error: 'Erro ao listar dados disponíveis' });
  }
});

router.get('/serie-temporal', async (req, res) => {
  try {
    const valor = String(req.query.valor || '').toLowerCase();
    const dado  = String(req.query.dado || '').toLowerCase();
    if (!SERIE_DADOS[valor]) return res.status(400).json({ error: 'valor inválido' });
    const def = SERIE_DADOS[valor].find(d => d.id === dado);
    if (!def) return res.status(400).json({ error: 'dado inválido para esse valor' });

    const { inicio: defIni, fim: defFim } = defaultRange();
    const inicio = String(req.query.inicio || defIni).slice(0, 10);
    const fim    = String(req.query.fim || defFim).slice(0, 10);
    const granularidade = req.query.granularidade === 'semana' ? 'semana' : 'mes';
    const culto = def.filtra_culto ? (req.query.culto || null) : null;

    const cacheKey = `serie:${valor}:${dado}:${culto || 'all'}:${inicio}:${fim}:${granularidade}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const serie = await calcularSerie(valor, dado, { inicio, fim, culto, granularidade });
    const total = serie.reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const _resp = {
      valor, dado, label: def.label, granularidade,
      inicio, fim, culto,
      total,
      serie,
    };
    cacheSet(cacheKey, _resp);
    res.json(_resp);
  } catch (e) {
    console.error('painel/serie-temporal:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'Erro ao montar série temporal' });
  }
});

// ============================================================================
// GET /api/painel/monitoramento-okr
//
// Alimenta a aba "Monitoramento OKR" (planilha do Pr. Juninho · ótica enxuta:
// 1 NSM → 9 OKRs → ~25 indicadores táticos). A ESTRUTURA da planilha (textos,
// alvos, objetivos, áreas, memória de cálculo) vive no frontend — é o modelo
// fixo do Juninho. Aqui devolvemos APENAS os valores VIVOS dos indicadores que
// já têm fonte de dado real no sistema, indexados por uma chave estável
// (`metricas[chave]`). Os indicadores sem fonte ficam como preenchimento
// manual (o frontend mostra o alvo + a memória de cálculo da planilha).
//
// Read-only · sem migration · não toca a lógica dos 25 OKRs/150 KPIs do
// /painel (modelo separado, a pedido do Marcos).
// ============================================================================
router.get('/monitoramento-okr', async (req, res) => {
  try {
    const cacheKey = 'monitoramento-okr';
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const num = (v) => (v == null ? null : Number(v));

    // Tudo via 1 RPC pelo cliente supabase (REST/HTTPS) · fn_monitoramento_okr_raw.
    // ANTES eram 15 queries no pool pg direto (DATABASE_URL), que nao conecta no
    // serverless do Vercel -> metricas vinha vazia (200 + {}). A migration
    // 20260603220000_fn_monitoramento_okr_raw.sql moveu tudo pro banco.
    const { data: raw, error: rawErr } = await supabase.rpc('fn_monitoramento_okr_raw');
    if (rawErr) throw rawErr;
    const r = raw || {};
    const nsmRow = r.nsm || null;
    const batRatio = r.batRatio || null;
    const batMes = r.batMes || null;
    const tempoBat = r.tempoBat || null;
    const dsOnline = r.dsOnline || null;
    const assentos = r.assentos || null;
    const rotativ = r.rotativ || null;
    const batSerie = r.batSerie || [];
    const dsSerie = r.dsSerie || [];
    const assentosSerie = r.assentosSerie || [];
    const baseMembros = r.baseMembros || null;
    const freqGrupos = r.freqGrupos || null;
    const voluntAtivos = r.voluntAtivos || null;
    const dizimistas = r.dizimistas || null;
    const cafeAtend = r.cafeAtend || null;
    const engajamento = r.engajamento || null;
    const q12 = r.q12 || null;

    const nsm = nsmRow ? {
      percentual: num(nsmRow.percentual),
      meta: num(nsmRow.meta_percentual),
      status: nsmRow.status,
      totalConvertidos: num(nsmRow.total_convertidos_periodo),
      engajados: num(nsmRow.engajados_em_60d),
      janelaInicio: nsmRow.janela_inicio,
      janelaFim: nsmRow.janela_fim,
      atualizadoEm: nsmRow.atualizado_em,
    } : null;

    // metricas[chave] = { valor, unidade, detalhe }. Só inclui o que tem dado real.
    const metricas = {};
    const serieFmt = (rows) => Array.isArray(rows) ? rows.map(r => ({ mes: r.mes, valor: Number(r.valor) })) : [];
    const addM = (chave, valor, unidade, detalhe, serie) => {
      if (valor == null || Number.isNaN(valor)) return;
      metricas[chave] = { valor, unidade, detalhe };
      if (serie && serie.length) metricas[chave].serie = serie;
    };

    const batSerieFmt = serieFmt(batSerie);
    if (batRatio) {
      addM('okr_batismos', num(batRatio.pct), '%',
        `${batRatio.batismos} batismos / ${batRatio.conversoes} convertidos (90 dias)`, batSerieFmt);
    }
    if (batMes && batMes.ultimo != null) {
      addM('batismos_mes', num(batMes.ultimo), '',
        `${batMes.ultimo_label || 'último mês'} · média ${batMes.media ?? '—'}/mês`, batSerieFmt);
    }
    if (tempoBat && tempoBat.media_dias != null && Number(tempoBat.n) > 0) {
      addM('tempo_batismo', num(tempoBat.media_dias), ' dias',
        `média de ${tempoBat.n} batizados com data de conversão registrada`);
    }
    if (dsOnline) {
      addM('ds_online', num(dsOnline.ds_90d), '',
        'decisões online nos últimos 90 dias', serieFmt(dsSerie));
    }
    if (assentos && assentos.n > 0) {
      addM('assentos', num(assentos.pct), '%',
        `${assentos.media_pres} de 1050 lugares · média do Templo (90 dias)`, serieFmt(assentosSerie));
    }
    if (rotativ) {
      const ativos = num(rotativ.ativos) || 0;
      const demit = num(rotativ.demitidos) || 0;
      const pct = ativos > 0 ? Math.round((demit / ativos) * 1000) / 10 : null;
      addM('rotatividade', pct, '%', `${demit} saída(s) / ${ativos} ativos (12 meses)`);
    }
    // Automáticos cuja fonte já existe no banco mas hoje está ~0 (mostram o número, não "—")
    const baseAtivos = baseMembros ? num(baseMembros.n) : null;
    const sufixoBase = baseAtivos != null ? ` · base ${baseAtivos} membros ativos` : '';
    if (freqGrupos) {
      addM('freq_grupos', num(freqGrupos.pct), '%', `${num(freqGrupos.n)} em grupos ativos${sufixoBase}`);
    }
    if (voluntAtivos) {
      addM('volunt_ativos', num(voluntAtivos.pct), '%', `${num(voluntAtivos.n)} voluntários ativos${sufixoBase}`);
    }
    if (dizimistas) {
      addM('dizimistas', num(dizimistas.pct), '%', `${num(dizimistas.n)} dizimistas recorrentes${sufixoBase}`);
    }
    if (cafeAtend) {
      addM('cafe_atendidos', num(cafeAtend.pct), '%', `${num(cafeAtend.atendidos)} de ${num(cafeAtend.total)} convertidos atendidos (90 dias)`);
    }
    // Engajamento de conteúdo (Online · YouTube). Estrutura pronta em
    // online_engajamento; mostra 0 até a 1ª coleta da API (não "—").
    if (engajamento) {
      const sufEng = engajamento.mes_label
        ? ` · ${engajamento.mes_label}`
        : ' · aguardando dados da API do YouTube';
      addM('eng_retencao', num(engajamento.retencao), '%', `retenção média em vídeos${sufEng}`);
      addM('eng_compartilhamento', num(engajamento.compartilhamento), '%', `compartilhamentos ÷ alcance${sufEng}`);
      addM('eng_cliques_series', num(engajamento.cliques_series), '%', `CTR de séries de mensagens${sufEng}`);
    }
    // Nota Q12 (Gallup) · clima organizacional do staff (RH). Mostra "—" até o
    // RH lançar a 1ª nota; o detalhe traz o mês do lançamento.
    if (q12 && q12.nota != null) {
      addM('q12', num(q12.nota), '',
        `pesquisa Q12 do Gallup${q12.label ? ` · ${q12.label}` : ''}`);
    }

    // Pontualidade do culto (Produção) · tático "Índice de atrasos (pontualidade
    // final)". Lê culto_producao.duracao_minutos vs a meta do tipo de culto
    // (vol_service_types.meta_duracao_min, default 60) e devolve o ATRASO MÉDIO
    // (min) sobre o roteiro + a série mensal. É o elo "preenche na Produção →
    // aparece aqui": cada culto lançado (por momento, daqui pra frente; ou o
    // tempo total histórico) atualiza duracao_minutos e recompõe este número.
    // Janela de 18 meses · bem abaixo do cap de 1000 do PostgREST (paginar se
    // a base de cultos preenchidos crescer).
    try {
      const desde = new Date();
      desde.setMonth(desde.getMonth() - 18);
      const { data: prod, error: prodErr } = await supabase
        .from('culto_producao')
        .select('duracao_minutos, cultos!inner(data, vol_service_types(meta_duracao_min))')
        .not('duracao_minutos', 'is', null)
        .gte('cultos.data', desde.toISOString().slice(0, 10))
        .limit(1000);
      if (prodErr) throw prodErr;
      const linhas = (prod || []).map((row) => {
        const data = row.cultos?.data;
        const meta = num(row.cultos?.vol_service_types?.meta_duracao_min) ?? 60;
        if (!data || row.duracao_minutos == null) return null;
        return { mes: String(data).slice(0, 7), atraso: Number(row.duracao_minutos) - meta };
      }).filter(Boolean);
      if (linhas.length) {
        const porMes = {};
        for (const l of linhas) (porMes[l.mes] = porMes[l.mes] || []).push(l.atraso);
        const media = (arr) => Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
        const serie = Object.keys(porMes).sort().map((mes) => ({ mes, valor: media(porMes[mes]) }));
        addM('atraso_culto', media(linhas.map((l) => l.atraso)), ' min',
          `atraso médio sobre a meta de 60 min · ${linhas.length} culto(s) medido(s) na Produção`, serie);
      }
    } catch (e) {
      console.error('painel/monitoramento-okr · atraso_culto:', e.message);
    }

    // ── Métricas reais autorizadas pelo Marcos pra este módulo (override sobre o
    //    RPC). O OKR continua read-only: só LÊ do sistema, nada volta. ──
    const fetchPaged = async (table, cols, applyFilter) => {
      const out = []; let from = 0; const page = 1000;
      while (true) {
        let q = supabase.from(table).select(cols).range(from, from + page - 1);
        if (applyFilter) q = applyFilter(q);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) break;
        from += page;
      }
      return out;
    };
    const _hoje = new Date();
    const _diasAtras = (d) => { const x = new Date(_hoje); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
    const _h90 = _diasAtras(90), _h365 = _diasAtras(365);
    const _avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const _d10 = (v) => String(v || '').slice(0, 10);

    // 1) DS online · crescimento YoY (views do Dia Seguinte · YTD vs mesmo período do ano anterior)
    try {
      const anoAtual = _hoje.getFullYear();
      const hojeStr = _hoje.toISOString().slice(0, 10);
      const iniAtual = `${anoAtual}-01-01`;
      const iniAnt = `${anoAtual - 1}-01-01`;
      const fimAnt = (() => { const x = new Date(_hoje); x.setFullYear(x.getFullYear() - 1); return x.toISOString().slice(0, 10); })();
      const cs = await fetchPaged('cultos', 'data, online_ds',
        (q) => q.gte('data', iniAnt).lte('data', hojeStr).gt('online_ds', 0).is('deleted_at', null));
      let atual = 0, ant = 0;
      for (const c of cs) {
        const d = _d10(c.data), v = Number(c.online_ds) || 0;
        if (d >= iniAtual && d <= hojeStr) atual += v;
        else if (d >= iniAnt && d <= fimAnt) ant += v;
      }
      if (ant > 0) addM('ds_online', Math.round((atual - ant) / ant * 1000) / 10, '%',
        `${atual.toLocaleString('pt-BR')} views em ${anoAtual} vs ${ant.toLocaleString('pt-BR')} em ${anoAtual - 1} (mesmo período do ano)`);
    } catch (e) { console.error('okr · ds_online yoy:', e.message); }

    // 2) % assentos ocupados · SÓ domingos (exclui AMI/Quarta/Bridge) ÷ 1.050
    try {
      const cs = await fetchPaged('cultos', 'presencial_adulto, vol_service_types!inner(recurrence_day, name)',
        (q) => q.gte('data', _h90).gt('presencial_adulto', 0).is('deleted_at', null).eq('vol_service_types.recurrence_day', 0));
      const pres = cs
        .filter((c) => !String(c.vol_service_types?.name || '').toLowerCase().includes('bridge'))
        .map((c) => Number(c.presencial_adulto));
      const mp = _avg(pres);
      if (mp != null) addM('assentos', Math.round(mp / 1050 * 1000) / 10, '%',
        `${Math.round(mp)} de 1.050 lugares · média dos cultos de domingo (90 dias)`);
    } catch (e) { console.error('okr · assentos:', e.message); }

    // 3) Rotatividade = (admissões + demissões) / 2 ÷ ativos × 100 (12 meses)
    try {
      const fs = await fetchPaged('rh_funcionarios', 'data_admissao, data_demissao, status',
        (q) => q.is('deleted_at', null));
      const adm = fs.filter((f) => f.data_admissao && _d10(f.data_admissao) >= _h365).length;
      const dem = fs.filter((f) => f.data_demissao && _d10(f.data_demissao) >= _h365).length;
      const ativos = fs.filter((f) => f.status === 'ativo').length;
      if (ativos > 0) addM('rotatividade', Math.round(((adm + dem) / 2 / ativos * 100) * 10) / 10, '%',
        `(${adm} admissões + ${dem} demissões) ÷ 2 ÷ ${ativos} ativos (12 meses)`);
    } catch (e) { console.error('okr · rotatividade:', e.message); }

    // 4) Batismos · % de convertidos (90d) que se batizaram em ≤90 dias (coorte
    //    cruzada membro/cpf/nome). SOBRESCREVE okr_batismos (cabeçalho + tático do
    //    box usam essa chave) — é a conta "convertidos que se batizaram" (ex.: 2 de 117).
    try {
      const dig = (v) => String(v || '').replace(/\D/g, '');
      const convs = await fetchPaged('cui_convertidos', 'nome, cpf, membro_id, data_culto',
        (q) => q.is('deleted_at', null).gte('data_culto', _h90));
      if (convs.length) {
        const bat = await fetchPaged('batismo_inscricoes', 'membro_id, cpf, nome, data_batismo',
          (q) => q.eq('status', 'realizado').is('deleted_at', null).not('data_batismo', 'is', null));
        const byM = new Map(), byC = new Map(), byN = new Map();
        const put = (m, k, d) => { if (!k || !d) return; const c = m.get(k); if (!c || d < c) m.set(k, d); };
        for (const b of bat) {
          const d = _d10(b.data_batismo);
          put(byM, b.membro_id, d);
          put(byC, dig(b.cpf).length === 11 ? dig(b.cpf) : null, d);
          put(byN, String(b.nome || '').trim().toLowerCase() || null, d);
        }
        let ok = 0;
        for (const c of convs) {
          const cands = [c.membro_id ? byM.get(c.membro_id) : null,
            dig(c.cpf).length === 11 ? byC.get(dig(c.cpf)) : null,
            byN.get(String(c.nome || '').trim().toLowerCase())].filter(Boolean);
          const d = cands.length ? cands.sort()[0] : null;
          if (!d) continue;
          const dias = Math.floor((new Date(d + 'T12:00:00') - new Date(_d10(c.data_culto) + 'T12:00:00')) / 86400000);
          if (dias >= 0 && dias <= 90) ok++;
        }
        addM('okr_batismos', Math.round(ok / convs.length * 1000) / 10, '%',
          `${ok} de ${convs.length} convertidos batizados em ≤90 dias`);
      }
    } catch (e) { console.error('okr · batismos coorte:', e.message); }

    // 5) Taxa de engajamento YouTube = (curtidas + comentários) ÷ views × 100 (ano)
    try {
      const vids = await fetchPaged('online_videos', 'view_count, like_count, comment_count',
        (q) => q.gte('publicado_em', `${_hoje.getFullYear()}-01-01`));
      const sv = vids.reduce((a, v) => a + Number(v.view_count || 0), 0);
      const sl = vids.reduce((a, v) => a + Number(v.like_count || 0), 0);
      const sc = vids.reduce((a, v) => a + Number(v.comment_count || 0), 0);
      if (sv > 0) addM('eng_interacao', Math.round((sl + sc) / sv * 1000) / 10, '%',
        `(${sl} curtidas + ${sc} comentários) ÷ ${sv} views · ${vids.length} vídeos do ano`);
    } catch (e) { console.error('okr · eng_interacao:', e.message); }

    const resp = { geradoEm: new Date().toISOString(), nsm, metricas };
    cacheSet(cacheKey, resp);
    res.json(resp);
  } catch (e) {
    console.error('painel/monitoramento-okr:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao montar Monitoramento OKR' });
  }
});

module.exports = router;
