// ============================================================================
// KPIs V2 - Hierarquia estrategica (NSM -> Direcionadores -> KPIs -> Taticos)
//
// Endpoints:
//   GET  /api/kpis/v2/nsm                   - NSM do ano corrente
//   GET  /api/kpis/v2/direcionadores        - 5 direcionadores + KPIs
//   GET  /api/kpis/v2/estrategicos          - 17 KPIs com rollup dos taticos
//   GET  /api/kpis/v2/taticos               - 55 indicadores + status atual
//   GET  /api/kpis/v2/taticos/:id           - detalhe de um tatico + historico
//   GET  /api/kpis/v2/areas                 - lista de areas com contagens
//   POST /api/kpis/v2/registros             - lancar valor
//   PUT  /api/kpis/v2/registros/:id         - editar lancamento
//   GET  /api/kpis/v2/registros             - lista filtravel
//   DELETE /api/kpis/v2/registros/:id       - remover lancamento
// ============================================================================

const express = require('express');
const router = express.Router();
const { authenticate, authorize, authorizeKpiArea } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { coletarTodos } = require('../services/kpiAutoCollector');

const CRON_SECRET = process.env.CRON_SECRET;

// ----------------------------------------------------------------------------
// Cron / coletor automatico (publico com auth de cron)
// Definido ANTES do router.use(authenticate) para nao exigir login.
// ----------------------------------------------------------------------------
async function autorizaCron(req, res, next) {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  if (!isVercelCron && auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

router.get('/cron/coletar', autorizaCron, async (_req, res) => {
  try {
    const resultados = await coletarTodos();
    const ok = resultados.filter(r => r.status === 'ok').length;
    res.json({ ok, total: resultados.length, resultados });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cron/coletar', autorizaCron, async (_req, res) => {
  try {
    const resultados = await coletarTodos();
    const ok = resultados.filter(r => r.status === 'ok').length;
    res.json({ ok, total: resultados.length, resultados });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.use(authenticate);

// ----------------------------------------------------------------------------
// Trigger manual (admin) - dry-run ou execucao
// ----------------------------------------------------------------------------
router.post('/coletar', async (req, res) => {
  try {
    const dryRun = req.query.dry_run === 'true' || req.body?.dry_run === true;
    const fontes = req.query.fontes ? String(req.query.fontes).split(',').filter(Boolean) : null;
    const areas = req.query.areas ? String(req.query.areas).split(',').filter(Boolean) : null;
    const resultados = await coletarTodos({ dryRun, fontes, areas });
    res.json({ dryRun, fontes, areas, total: resultados.length, resultados });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// Helpers de periodo
// ----------------------------------------------------------------------------
function periodoAtual(periodicidade, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  switch (periodicidade) {
    case 'semanal': {
      // ISO week (1-53)
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    case 'mensal':     return `${y}-${m}`;
    case 'trimestral': return `${y}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    case 'semestral':  return `${y}-S${date.getUTCMonth() < 6 ? 1 : 2}`;
    case 'anual':      return `${y}`;
    default:           return `${y}-${m}`;
  }
}

function statusFromPeriodo(periodicidade, ultimoPeriodo) {
  if (!ultimoPeriodo) return 'pendente';
  return ultimoPeriodo === periodoAtual(periodicidade) ? 'verde' : 'vermelho';
}

// ----------------------------------------------------------------------------
// GET /nsm - NSM do ano (default: ano corrente)
// ----------------------------------------------------------------------------
router.get('/nsm', async (req, res) => {
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const { data, error } = await supabase
    .from('kpi_nsm')
    .select('*')
    .eq('ano', ano)
    .eq('ativo', true)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// GET /direcionadores - lista com KPIs aninhados
// ----------------------------------------------------------------------------
router.get('/direcionadores', async (req, res) => {
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const { data: direcionadores, error: e1 } = await supabase
    .from('kpi_direcionadores')
    .select('*')
    .eq('ano', ano)
    .eq('ativo', true)
    .order('sort_order');
  if (e1) return res.status(500).json({ error: e1.message });

  const { data: kpis, error: e2 } = await supabase
    .from('kpi_estrategicos')
    .select('*')
    .eq('ano', ano)
    .eq('ativo', true)
    .order('sort_order');
  if (e2) return res.status(500).json({ error: e2.message });

  const result = direcionadores.map(d => ({
    ...d,
    kpis: kpis.filter(k => k.direcionador_id === d.id),
  }));
  res.json(result);
});

// ----------------------------------------------------------------------------
// GET /estrategicos - KPIs com rollup dos taticos (count + status agregado)
// ----------------------------------------------------------------------------
router.get('/estrategicos', async (req, res) => {
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const { data: kpis, error: e1 } = await supabase
    .from('kpi_estrategicos')
    .select('*')
    .eq('ano', ano)
    .eq('ativo', true)
    .order('sort_order');
  if (e1) return res.status(500).json({ error: e1.message });

  const { data: status, error: e2 } = await supabase
    .from('vw_kpi_taticos_status')
    .select('kpi_estrategico_id, status');
  if (e2) return res.status(500).json({ error: e2.message });

  const result = kpis.map(k => {
    const taticos = status.filter(s => s.kpi_estrategico_id === k.id);
    const verde = taticos.filter(t => t.status === 'verde').length;
    const vermelho = taticos.filter(t => t.status === 'vermelho').length;
    const pendente = taticos.filter(t => t.status === 'pendente').length;
    const total = taticos.length;
    let saude = 'sem_dados';
    if (total > 0) {
      const pctVerde = verde / total;
      if (pctVerde >= 0.8) saude = 'saudavel';
      else if (pctVerde >= 0.5) saude = 'atencao';
      else saude = 'critico';
    }
    return { ...k, taticos_total: total, taticos_verde: verde, taticos_vermelho: vermelho, taticos_pendente: pendente, saude };
  });
  res.json(result);
});

// ----------------------------------------------------------------------------
// GET /taticos - lista de indicadores taticos com status atual
// Filtros: ?area=ami | ?kpi=MIN-CAFE | ?status=vermelho | ?periodicidade=semanal
// ----------------------------------------------------------------------------
router.get('/taticos', async (req, res) => {
  const { area, kpi, status, periodicidade } = req.query;
  let query = supabase
    .from('vw_kpi_taticos_status')
    .select('*')
    .order('area')
    .order('sort_order');
  if (area) query = query.eq('area', area);
  if (kpi) query = query.eq('kpi_estrategico_id', kpi);
  if (status) query = query.eq('status', status);
  if (periodicidade) query = query.eq('periodicidade', periodicidade);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// GET /taticos/:id - detalhe + historico de registros
// ----------------------------------------------------------------------------
router.get('/taticos/:id', async (req, res) => {
  const { id } = req.params;
  const limit = Number(req.query.limit) || 24;

  const { data: tatico, error: e1 } = await supabase
    .from('kpi_indicadores_taticos')
    .select('*, kpi_estrategicos(id, nome, alvo_descricao, kpi_direcionadores(nome, cor))')
    .eq('id', id)
    .maybeSingle();
  if (e1) return res.status(500).json({ error: e1.message });
  if (!tatico) return res.status(404).json({ error: 'Indicador nao encontrado' });

  const { data: registros, error: e2 } = await supabase
    .from('kpi_registros')
    .select('*')
    .eq('indicador_id', id)
    .order('data_preenchimento', { ascending: false })
    .limit(limit);
  if (e2) return res.status(500).json({ error: e2.message });

  const ultimo = registros[0] || null;
  res.json({
    ...tatico,
    historico: registros,
    ultimo_registro: ultimo,
    periodo_atual: periodoAtual(tatico.periodicidade),
    status: statusFromPeriodo(tatico.periodicidade, ultimo?.periodo_referencia),
  });
});

// ----------------------------------------------------------------------------
// PUT /taticos/:id - editar indicador (apenas admin/diretor)
// Campos editaveis: indicador, descricao, area, periodicidade, periodo_offset_meses,
//                   meta_descricao, meta_valor, unidade, responsavel_area,
//                   apuracao, sort_order, ativo, kpi_estrategico_id, fonte_auto,
//                   valores, pilar
// ----------------------------------------------------------------------------
// Helper: extrai area de um indicador tatico pelo seu id
async function fetchIndicadorArea(indicadorId) {
  if (!indicadorId) return null;
  const { data } = await supabase.from('kpi_indicadores_taticos')
    .select('area').eq('id', indicadorId).maybeSingle();
  return data?.area || null;
}

router.put('/taticos/:id', authorizeKpiArea(req => fetchIndicadorArea(req.params.id)), async (req, res) => {
  const { id } = req.params;
  const allowed = [
    'indicador', 'descricao', 'area', 'periodicidade', 'periodo_offset_meses',
    'meta_descricao', 'meta_valor', 'unidade', 'responsavel_area', 'apuracao',
    'sort_order', 'ativo', 'kpi_estrategico_id', 'fonte_auto', 'valores', 'pilar',
    'is_okr', 'lider_funcionario_id',
  ];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    if (k === 'meta_valor') {
      update[k] = (v === '' || v == null) ? null : Number(v);
    } else if (k === 'sort_order' || k === 'periodo_offset_meses') {
      update[k] = (v === '' || v == null) ? 0 : Number(v);
    } else if (k === 'ativo' || k === 'is_okr') {
      update[k] = !!v;
    } else if (k === 'valores') {
      update[k] = Array.isArray(v) ? v.filter(Boolean) : [];
    } else if (k === 'area' && typeof v === 'string') {
      update[k] = v.toLowerCase(); // normaliza pra lowercase no DB
    } else {
      update[k] = v === '' ? null : v;
    }
  }
  // Se vai marcar OKR, exige valores nao-vazio (no payload OU ja existente)
  if (update.is_okr === true) {
    let valores = update.valores;
    if (!Array.isArray(valores)) {
      const { data: cur } = await supabase
        .from('kpi_indicadores_taticos').select('valores').eq('id', id).maybeSingle();
      valores = cur?.valores || [];
    }
    if (!valores || valores.length === 0) {
      return res.status(400).json({ error: 'KPI marcado como OKR precisa ter pelo menos 1 valor da jornada vinculado' });
    }
  }
  const { data, error } = await supabase
    .from('kpi_indicadores_taticos')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// POST /taticos - criar novo indicador (apenas admin/diretor)
// Body: { id, indicador, area, periodicidade, ... }
// id deve ser unico (ex: 'GRUP-06') e respeita PK existente.
// ----------------------------------------------------------------------------
router.post('/taticos', authorizeKpiArea(req => req.body?.area), async (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.indicador || !b.area || !b.periodicidade) {
    return res.status(400).json({ error: 'id, indicador, area e periodicidade sao obrigatorios' });
  }
  const VALID = ['semanal','mensal','trimestral','semestral','anual'];
  if (!VALID.includes(b.periodicidade)) {
    return res.status(400).json({ error: `periodicidade deve ser: ${VALID.join('|')}` });
  }
  const valores = Array.isArray(b.valores) ? b.valores.filter(Boolean) : [];
  const isOkr = !!b.is_okr;
  if (isOkr && valores.length === 0) {
    return res.status(400).json({ error: 'KPI marcado como OKR precisa ter pelo menos 1 valor da jornada vinculado' });
  }
  const payload = {
    id: b.id,
    indicador: b.indicador,
    descricao: b.descricao ?? null,
    area: String(b.area).toLowerCase(),  // DB sempre em lowercase
    periodicidade: b.periodicidade,
    periodo_offset_meses: Number.isFinite(Number(b.periodo_offset_meses)) ? Number(b.periodo_offset_meses) : 0,
    meta_descricao: b.meta_descricao ?? null,
    meta_valor: (b.meta_valor === '' || b.meta_valor == null) ? null : Number(b.meta_valor),
    unidade: b.unidade ?? null,
    responsavel_area: b.responsavel_area ?? null,
    apuracao: b.apuracao ?? null,
    sort_order: Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0,
    ativo: b.ativo === false ? false : true,
    kpi_estrategico_id: b.kpi_estrategico_id ?? null,
    fonte_auto: b.fonte_auto ?? null,
    valores,
    pilar: b.pilar ?? null,
    is_okr: isOkr,
    lider_funcionario_id: b.lider_funcionario_id ?? null,
  };
  const { data, error } = await supabase
    .from('kpi_indicadores_taticos')
    .insert(payload)
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'id ja existe' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// ----------------------------------------------------------------------------
// DELETE /taticos/:id - soft delete (ativo=false). Preserva historico.
// Use ?hard=true para remover de fato (requer admin e nenhum registro vinculado).
// ----------------------------------------------------------------------------
router.delete('/taticos/:id', authorizeKpiArea(req => fetchIndicadorArea(req.params.id)), async (req, res) => {
  const { id } = req.params;
  const hard = req.query.hard === 'true';
  if (hard) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'hard delete requer admin' });
    }
    const { count } = await supabase
      .from('kpi_registros').select('id', { count: 'exact', head: true })
      .eq('indicador_id', id);
    if ((count || 0) > 0) {
      return res.status(409).json({ error: `KPI tem ${count} registros. Use soft delete (sem ?hard=true).` });
    }
    const { error } = await supabase.from('kpi_indicadores_taticos').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }
  const { data, error } = await supabase
    .from('kpi_indicadores_taticos')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// GET /areas - lista de areas com contagens (saude da area)
// ----------------------------------------------------------------------------
router.get('/areas', async (req, res) => {
  const { data, error } = await supabase
    .from('vw_kpi_taticos_status')
    .select('area, status');
  if (error) return res.status(500).json({ error: error.message });

  const areasMap = {};
  for (const row of data) {
    if (!areasMap[row.area]) {
      areasMap[row.area] = { area: row.area, total: 0, verde: 0, vermelho: 0, pendente: 0 };
    }
    areasMap[row.area].total += 1;
    areasMap[row.area][row.status] = (areasMap[row.area][row.status] || 0) + 1;
  }
  const areas = Object.values(areasMap)
    .map(a => ({
      ...a,
      pendentes_ou_atrasados: a.vermelho + a.pendente,
      pct_verde: a.total > 0 ? Math.round((a.verde / a.total) * 100) : 0,
    }))
    .sort((a, b) => b.pendentes_ou_atrasados - a.pendentes_ou_atrasados);
  res.json(areas);
});

// ----------------------------------------------------------------------------
// GET /registros - lista filtravel de lancamentos
// ----------------------------------------------------------------------------
router.get('/registros', async (req, res) => {
  const { indicador_id, area, periodo, limit = 100, offset = 0 } = req.query;
  let query = supabase
    .from('kpi_registros')
    .select('*, kpi_indicadores_taticos!inner(id, area, indicador, periodicidade, unidade, meta_valor)')
    .order('data_preenchimento', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);
  if (indicador_id) query = query.eq('indicador_id', indicador_id);
  if (area) query = query.eq('kpi_indicadores_taticos.area', area);
  if (periodo) query = query.eq('periodo_referencia', periodo);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// POST /registros - lancar valor (upsert por indicador+periodo)
// ----------------------------------------------------------------------------
router.post('/registros', async (req, res) => {
  const { indicador_id, periodo_referencia, valor_realizado, valor_texto, observacoes, responsavel } = req.body;
  if (!indicador_id || !periodo_referencia) {
    return res.status(400).json({ error: 'indicador_id e periodo_referencia sao obrigatorios' });
  }

  // Verifica que o indicador existe
  const { data: tatico, error: eTat } = await supabase
    .from('kpi_indicadores_taticos')
    .select('id, indicador, area')
    .eq('id', indicador_id)
    .maybeSingle();
  if (eTat) return res.status(500).json({ error: eTat.message });
  if (!tatico) return res.status(404).json({ error: 'Indicador nao encontrado' });

  // Autoriza por area: admin/diretor passa direto; lider so da sua kpi_area
  if (!['admin', 'diretor'].includes(req.user?.role)) {
    const myAreas = (req.user?.kpi_areas || []).map(a => String(a).toLowerCase());
    if (!myAreas.includes(String(tatico.area || '').toLowerCase())) {
      return res.status(403).json({ error: `Sem permissao para registrar KPIs da area "${tatico.area}"` });
    }
  }

  const payload = {
    indicador_id,
    periodo_referencia,
    valor_realizado: valor_realizado != null && valor_realizado !== '' ? Number(valor_realizado) : null,
    valor_texto: valor_texto || null,
    observacoes: observacoes || null,
    responsavel: responsavel || req.user?.email || null,
    user_id: req.user?.id || null,
    data_preenchimento: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Upsert (atualiza se ja existe registro do mesmo indicador+periodo)
  const { data, error } = await supabase
    .from('kpi_registros')
    .upsert(payload, { onConflict: 'indicador_id,periodo_referencia' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// PUT /registros/:id - editar
// ----------------------------------------------------------------------------
router.put('/registros/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = ['valor_realizado', 'valor_texto', 'observacoes', 'responsavel', 'periodo_referencia'];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body)) {
    if (allowed.includes(k)) {
      update[k] = (k === 'valor_realizado' && v !== null && v !== '') ? Number(v) : (v === '' ? null : v);
    }
  }
  const { data, error } = await supabase
    .from('kpi_registros')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// DELETE /registros/:id
// ----------------------------------------------------------------------------
router.delete('/registros/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('kpi_registros').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// GET /periodo-atual?periodicidade=semanal - util pro frontend saber o periodo
// ----------------------------------------------------------------------------
router.get('/periodo-atual', (req, res) => {
  const { periodicidade = 'mensal' } = req.query;
  res.json({ periodicidade, periodo: periodoAtual(periodicidade) });
});

module.exports = router;
