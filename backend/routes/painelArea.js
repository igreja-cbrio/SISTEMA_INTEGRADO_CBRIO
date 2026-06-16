// ============================================================================
// /api/painel-area/:área · drill-down completo de KPIs + DADOS BRUTOS + saúde
// ============================================================================
// Usado pelos módulos kids/ami/bridge/online · páginas read-only
//
// Retorna:
//   - kpis: indicadores calculados (kpi_indicadores_taticos) com trajetoria
//   - dados: dados_brutos agregados por tipo · último valor + tendência
//   - saúde: score 0-100 + breakdown
//   - NPS de culto destacado no topo (CULTO-NPS-*)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const AREAS_VALIDAS = ['kids', 'ami', 'bridge', 'online', 'sede', 'cba'];

// Filtra cultos da `vw_culto_stats` pela área pedida · usa service_type_name
// porque eh mais robusto que nome livre (mesma lógica do kpiAutoCollector)
function filtrarCultosPorArea(cultos, area) {
  if (!cultos || cultos.length === 0) return [];
  const n = (s) => String(s || '').toLowerCase();
  if (area === 'ami') {
    return cultos.filter(c => {
      const st = n(c.service_type_name);
      const nm = n(c.nome);
      return (st.includes('ami') || nm.includes('ami')) && !st.includes('bridge') && !nm.includes('bridge');
    });
  }
  if (area === 'bridge') {
    return cultos.filter(c => {
      const st = n(c.service_type_name);
      const nm = n(c.nome);
      return st.includes('bridge') || nm.includes('bridge');
    });
  }
  if (area === 'online') {
    // Todos cultos com transmissão online (pico online > 0 OU has_online)
    return cultos.filter(c => (c.online_pico || 0) > 0);
  }
  if (area === 'kids') {
    // Cultos com Kids presencial · Sede (manha/noite) + Quarta com Kids
    return cultos.filter(c => {
      const st = n(c.service_type_name);
      const nm = n(c.nome);
      // Sede ou quarta com kids · cultos que tem campo presencial_kids
      const sede = st.startsWith('domingo') || nm.startsWith('domingo');
      const quartaKids = st.includes('quarta') || nm.includes('quarta');
      return (sede || quartaKids) && (c.presencial_kids != null);
    });
  }
  if (area === 'sede') {
    return cultos.filter(c => {
      const st = n(c.service_type_name);
      return st.startsWith('domingo') || st.includes('quarta');
    });
  }
  return cultos;
}

router.get('/:area', authorizeModule('painel-area', 1), async (req, res) => {
  try {
    const area = String(req.params.area).toLowerCase();
    if (!AREAS_VALIDAS.includes(area)) {
      return res.status(400).json({ error: 'Area invalida', validas: AREAS_VALIDAS });
    }

    // Filtro de período via query param · desde=YYYY-MM-DD&ate=YYYY-MM-DD
    // OU periodo=30d|90d|180d|365d (default 180d)
    const hoje = new Date();
    let desde = req.query.desde;
    let ate = req.query.ate || hoje.toISOString().slice(0, 10);
    if (!desde) {
      const periodo = String(req.query.periodo || '180d');
      const dias = parseInt(periodo, 10) || 180;
      const d = new Date(hoje); d.setDate(d.getDate() - dias);
      desde = d.toISOString().slice(0, 10);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 1. KPIs ativos da área + trajetoria + líderes + formula (pra cruzar com dados)
    // ──────────────────────────────────────────────────────────────────────
    const { data: kpisRaw } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, area, valores, periodicidade, meta_descricao, meta_valor, unidade, is_okr, tipo_kpi, lider_funcionario_id, formula_config')
      .eq('ativo', true)
      .ilike('area', area)
      .order('indicador', { ascending: true });
    const kpis = kpisRaw || [];

    const kpiIds = kpis.map(k => k.id);
    let trajByKpi = {};
    let lideresMap = {};

    if (kpiIds.length > 0) {
      const { data: traj } = await supabase
        .from('vw_kpi_trajetoria_atual')
        .select('kpi_id, status_trajetoria, ultimo_periodo, ultimo_valor, checkpoint_meta, percentual_meta, gap')
        .in('kpi_id', kpiIds);
      (traj || []).forEach(t => { trajByKpi[t.kpi_id] = t; });

      const liderIds = kpis.map(k => k.lider_funcionario_id).filter(Boolean);
      if (liderIds.length > 0) {
        const { data: lideres } = await supabase
          .from('rh_funcionarios')
          .select('id, nome, cargo')
          .in('id', liderIds);
        (lideres || []).forEach(l => { lideresMap[l.id] = l; });
      }
    }

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

    const porValor = {};
    const semValor = [];
    for (const k of enriched) {
      if (k.valores.length === 0) semValor.push(k);
      else for (const v of k.valores) {
        if (!porValor[v]) porValor[v] = [];
        porValor[v].push(k);
      }
    }

    // ──────────────────────────────────────────────────────────────────────
    // 2. Dados brutos · TODOS os tipos esperados (do formula_config dos KPIs)
    //    + registros existentes (se houver). Tipos sem registro retornam
    //    placeholder vazio · UI mostra card aguardando preenchimento.
    // ──────────────────────────────────────────────────────────────────────
    const mesAtual = hoje.toISOString().slice(0, 7);
    const mesAnteriorD = new Date(hoje); mesAnteriorD.setMonth(mesAnteriorD.getMonth() - 1);
    const mesAnterior = mesAnteriorD.toISOString().slice(0, 7);
    const dataLimiteStr = desde;

    // 2a. Extrai tipos esperados a partir de formula_config dos KPIs +
    //     mapeia valores da Jornada que cada tipo alimenta
    const tiposEsperados = new Set();
    const valoresPorTipo = new Map();
    for (const k of kpis) {
      const fc = k.formula_config || {};
      const candidatos = [fc.dado_tipo, fc.numerador, fc.denominador].filter(Boolean);
      const tiposK = [];
      for (const c of candidatos) {
        if (Array.isArray(c)) tiposK.push(...c);
        else tiposK.push(c);
      }
      const vals = Array.isArray(k.valores) ? k.valores : [];
      for (const t of tiposK) {
        if (!t) continue;
        tiposEsperados.add(t);
        if (!valoresPorTipo.has(t)) valoresPorTipo.set(t, new Set());
        vals.forEach(v => valoresPorTipo.get(t).add(v));
      }
    }

    // 2b. Busca metadados de TODOS os tipos esperados (sempre aparecem
    //     na UI, mesmo sem registro)
    const tiposIds = Array.from(tiposEsperados);
    let tiposCatalogo = [];
    if (tiposIds.length > 0) {
      const { data: catalogo } = await supabase
        .from('tipos_dado_bruto')
        .select('id, nome, descricao, unidade, agregacao, granularidade, ordem')
        .in('id', tiposIds);
      tiposCatalogo = catalogo || [];
    }

    // 2c. Busca registros existentes (no período · pra sparkline + variacao)
    const { data: dadosRaw } = await supabase
      .from('dados_brutos')
      .select('tipo_id, data, valor')
      .eq('area', area)
      .gte('data', dataLimiteStr)
      .lte('data', ate)
      .order('data', { ascending: false });

    // Indexa registros por tipo
    const registrosPorTipo = new Map();
    for (const d of dadosRaw || []) {
      if (!registrosPorTipo.has(d.tipo_id)) registrosPorTipo.set(d.tipo_id, []);
      registrosPorTipo.get(d.tipo_id).push({ data: d.data, valor: Number(d.valor) });
    }

    // 2d. Monta a lista final · 1 entrada por tipo esperado · com ou sem dado
    const dados = tiposCatalogo.map(t => {
      const regs = registrosPorTipo.get(t.id) || []; // já em ordem desc
      const ultimo = regs[0] || null;
      const historico6 = regs.slice(0, 6).reverse();
      const totalMesAtual = regs
        .filter(r => r.data.startsWith(mesAtual))
        .reduce((a, r) => a + r.valor, 0);
      const totalMesAnterior = regs
        .filter(r => r.data.startsWith(mesAnterior))
        .reduce((a, r) => a + r.valor, 0);
      const variacaoMes = totalMesAnterior > 0
        ? ((totalMesAtual - totalMesAnterior) / totalMesAnterior) * 100
        : null;
      const valoresJornada = Array.from(valoresPorTipo.get(t.id) || []);
      return {
        tipo_id: t.id,
        tipo_nome: t.nome,
        descricao: t.descricao,
        unidade: t.unidade,
        agregacao: t.agregacao,
        granularidade: t.granularidade,
        ordem: t.ordem ?? 999,
        valores_jornada: valoresJornada,
        total_registros: regs.length,
        ultimo_valor: ultimo?.valor ?? null,
        ultima_data: ultimo?.data ?? null,
        total_mes_atual: totalMesAtual,
        total_mes_anterior: totalMesAnterior,
        variacao_mes_pct: variacaoMes,
        historico_6: historico6,
        vazio: regs.length === 0,  // ← UI usa pra mostrar placeholder
      };
    }).sort((a, b) => a.ordem - b.ordem);

    // ──────────────────────────────────────────────────────────────────────
    // 2e. Cultos recentes da área · principal fonte de dado pro líder hoje
    // ──────────────────────────────────────────────────────────────────────
    // Marcos: "decisão arquitetural · pode ler de vw_culto_stats, bom adicionar
    // filtro por data também". Os 4 módulos veem os cultos da sua área
    // diretamente (cultos.X eh source-of-truth de frequencia/decisoes/batismos
    // hoje, NÃO dados_brutos).
    let cultosRecentes = [];
    let totaisCultos = null;
    let serieCultos = [];
    if (area !== 'sede' && area !== 'cba') {
      const { data: cultosRaw } = await supabase
        .from('vw_culto_stats')
        .select('id, data, hora, nome, service_type_name, presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online, decisoes_kids, online_pico, online_ds, online_ddus, observacoes')
        .gte('data', dataLimiteStr)
        .lte('data', ate)
        .order('data', { ascending: false });

      const cultosArea = filtrarCultosPorArea(cultosRaw || [], area);
      cultosRecentes = cultosArea.slice(0, 60); // limit · mais que isso virou ruido

      // Totais agregados pro card de header
      if (cultosArea.length > 0) {
        const sum = (arr, k) => arr.reduce((a, c) => a + (Number(c[k]) || 0), 0);
        const total_pres = sum(cultosArea, 'presencial_adulto');
        const total_kids = sum(cultosArea, 'presencial_kids');
        const total_dec_pres = sum(cultosArea, 'decisoes_presenciais');
        const total_dec_onl = sum(cultosArea, 'decisoes_online');
        const total_dec_kids = sum(cultosArea, 'decisoes_kids');
        const total_pico = sum(cultosArea, 'online_pico');
        const total_ddus = sum(cultosArea, 'online_ddus');
        totaisCultos = {
          total_cultos: cultosArea.length,
          presencial_adulto: total_pres,
          presencial_kids: total_kids,
          decisoes_presenciais: total_dec_pres,
          decisoes_online: total_dec_onl,
          decisoes_kids: total_dec_kids,
          decisoes_total: total_dec_pres + total_dec_onl + total_dec_kids,
          online_pico_total: total_pico,
          online_ddus_total: total_ddus,
        };
      }

      // Série mensal agregada · cobre o período INTEIRO (cultos_recentes é
      // limitado a 60 e truncaria o gráfico em períodos longos)
      const freqDe = (c) => area === 'kids' ? (Number(c.presencial_kids) || 0)
        : area === 'online' ? (Number(c.online_pico) || 0)
        : (Number(c.presencial_adulto) || 0);
      const decDe = (c) => area === 'kids' ? (Number(c.decisoes_kids) || 0)
        : area === 'online' ? (Number(c.decisoes_online) || 0)
        : (Number(c.decisoes_presenciais) || 0) + (Number(c.decisoes_online) || 0);
      const porMes = new Map();
      for (const c of cultosArea) {
        const mes = String(c.data).slice(0, 7);
        if (!porMes.has(mes)) porMes.set(mes, { mes, cultos: 0, frequencia: 0, decisoes: 0 });
        const m = porMes.get(mes);
        m.cultos += 1;
        m.frequencia += freqDe(c);
        m.decisoes += decDe(c);
      }
      serieCultos = Array.from(porMes.values())
        .sort((a, b) => a.mes.localeCompare(b.mes))
        .map(m => ({ ...m, media_freq: m.cultos > 0 ? Math.round(m.frequencia / m.cultos) : 0 }));
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. Score de saúde
    // ──────────────────────────────────────────────────────────────────────
    const totalKpis = enriched.length;
    const noAlvo = enriched.filter(k => k.trajetoria?.status_trajetoria === 'no_alvo').length;
    const atrasado = enriched.filter(k => k.trajetoria?.status_trajetoria === 'atrasado').length;
    const critico = enriched.filter(k => k.trajetoria?.status_trajetoria === 'critico').length;
    const semDado = enriched.filter(k => !k.trajetoria || k.trajetoria.ultimo_valor == null).length;
    const comMeta = enriched.filter(k => k.trajetoria?.checkpoint_meta != null).length;

    // Dados com registro nos últimos 30 dias
    const limite30 = new Date(hoje); limite30.setDate(limite30.getDate() - 30);
    const limite30Str = limite30.toISOString().slice(0, 10);
    const dadosRecentes = dados.filter(d => d.ultima_data && d.ultima_data >= limite30Str).length;
    const totalTipos = dados.length;

    const kpisAtivosCobertos = totalKpis > 0 ? (totalKpis - semDado) : 0;
    const pctKpisNoAlvo = totalKpis > 0 ? Math.round((noAlvo / totalKpis) * 100) : 0;
    const pctKpisCobertos = totalKpis > 0 ? Math.round((kpisAtivosCobertos / totalKpis) * 100) : 0;
    const pctDadosRecentes = totalTipos > 0 ? Math.round((dadosRecentes / totalTipos) * 100) : 0;

    // Score = media ponderada (kpis no alvo · 50%, cobertura de dado · 30%, dados recentes · 20%)
    const score = Math.round(
      (pctKpisNoAlvo * 0.5) +
      (pctKpisCobertos * 0.3) +
      (pctDadosRecentes * 0.2)
    );

    const saude = {
      score,
      diagnostico: score >= 75 ? 'saudavel' : score >= 50 ? 'atencao' : score >= 25 ? 'risco' : 'critico',
      kpis_total: totalKpis,
      kpis_no_alvo: noAlvo,
      kpis_atrasado: atrasado,
      kpis_critico: critico,
      kpis_sem_dado: semDado,
      kpis_com_meta: comMeta,
      pct_no_alvo: pctKpisNoAlvo,
      pct_cobertos: pctKpisCobertos,
      tipos_dado: totalTipos,
      dados_recentes_30d: dadosRecentes,
      pct_dados_recentes: pctDadosRecentes,
    };

    res.json({
      area,
      total: totalKpis,
      periodo: { desde: dataLimiteStr, ate },
      stats: { com_meta: comMeta, no_alvo: noAlvo, atrasado, critico },
      por_valor: porValor,
      sem_valor: semValor,
      kpis: enriched,
      dados,
      saude,
      cultos_recentes: cultosRecentes,
      totais_cultos: totaisCultos,
      serie_cultos: serieCultos,
    });
  } catch (e) {
    console.error('painel-area:', e.message);
    res.status(500).json({ error: 'Erro ao buscar dados da área' });
  }
});

// ============================================================================
// GET /:area/series · tendências históricas por valor da Jornada (área-scoped)
// ============================================================================
// Espelho do carrossel de valores do /painel, filtrado pela área:
//   - Seguir: frequência média por culto + decisões (cultos da área)
//   - Demais valores: tipos de dados_brutos da área, mapeados pelo
//     formula_config dos KPIs (mesma lógica do GET principal)
// Tudo num payload só (volume por área é pequeno) · trocar de slide/dado no
// front é instantâneo, só o período refaz a chamada.
//
// Query: meses=3|6|12|24|60 (default 12)
// ============================================================================

const VALOR_LABELS = {
  seguir: 'Seguir a Jesus',
  conectar: 'Conectar com Pessoas',
  investir: 'Investir Tempo com Deus',
  servir: 'Servir em Comunidade',
  generosidade: 'Viver Generosamente',
};
const VALOR_CORES = {
  seguir: '#8B5CF6',
  conectar: '#3B82F6',
  investir: '#F59E0B',
  servir: '#10B981',
  generosidade: '#EC4899',
};
const ORDEM_VALORES = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];

function mesesDoRange(inicio, fim) {
  const out = [];
  let [y, m] = inicio.slice(0, 7).split('-').map(Number);
  const [yf, mf] = fim.slice(0, 7).split('-').map(Number);
  while (y < yf || (y === yf && m <= mf)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

router.get('/:area/series', authorizeModule('painel-area', 1), async (req, res) => {
  try {
    const area = String(req.params.area).toLowerCase();
    if (!AREAS_VALIDAS.includes(area)) {
      return res.status(400).json({ error: 'Area invalida', validas: AREAS_VALIDAS });
    }
    const mesesPermitidos = [3, 6, 12, 24, 60];
    const meses = mesesPermitidos.includes(parseInt(req.query.meses, 10))
      ? parseInt(req.query.meses, 10) : 12;
    const hoje = new Date();
    const fim = hoje.toISOString().slice(0, 10);
    const ini = new Date(hoje); ini.setMonth(ini.getMonth() - (meses - 1)); ini.setDate(1);
    const inicio = ini.toISOString().slice(0, 10);
    const mesesRange = mesesDoRange(inicio, fim);

    const porValor = {}; // valor → [{ id, label, unidade, agregacao, serie }]
    const pushDado = (valor, dado) => {
      if (!porValor[valor]) porValor[valor] = [];
      porValor[valor].push(dado);
    };

    // ── 1. Seguir · cultos da área ──────────────────────────────────────────
    if (area !== 'cba') {
      const { data: cultosRaw } = await supabase
        .from('vw_culto_stats')
        .select('id, data, nome, service_type_name, presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online, decisoes_kids, online_pico')
        .gte('data', inicio)
        .lte('data', fim);
      const cultosArea = filtrarCultosPorArea(cultosRaw || [], area);

      const freqDe = (c) => area === 'kids' ? (Number(c.presencial_kids) || 0)
        : area === 'online' ? (Number(c.online_pico) || 0)
        : (Number(c.presencial_adulto) || 0);
      const decDe = (c) => area === 'kids' ? (Number(c.decisoes_kids) || 0)
        : area === 'online' ? (Number(c.decisoes_online) || 0)
        : (Number(c.decisoes_presenciais) || 0) + (Number(c.decisoes_online) || 0);

      const porMes = new Map();
      for (const c of cultosArea) {
        const mes = String(c.data).slice(0, 7);
        if (!porMes.has(mes)) porMes.set(mes, { cultos: 0, freq: 0, dec: 0 });
        const m = porMes.get(mes);
        m.cultos += 1; m.freq += freqDe(c); m.dec += decDe(c);
      }
      if (cultosArea.length > 0) {
        // Frequência = MÉDIA por culto (robusta a mês com nº de cultos variável)
        // · mês sem culto fica null (não zera o gráfico)
        pushDado('seguir', {
          id: 'frequencia',
          label: area === 'online' ? 'Pico médio por culto' : 'Frequência média por culto',
          unidade: 'pessoas',
          agregacao: 'media',
          serie: mesesRange.map(mes => {
            const m = porMes.get(mes);
            return { periodo: mes, valor: m && m.cultos > 0 ? Math.round(m.freq / m.cultos) : null };
          }),
        });
        pushDado('seguir', {
          id: 'decisoes',
          label: 'Decisões',
          unidade: 'pessoas',
          agregacao: 'soma',
          serie: mesesRange.map(mes => ({ periodo: mes, valor: porMes.get(mes)?.dec ?? 0 })),
        });
      }
    }

    // ── 2. Demais valores · dados_brutos da área mapeados pelos KPIs ────────
    const { data: kpisRaw } = await supabase
      .from('kpi_indicadores_taticos')
      .select('valores, formula_config')
      .eq('ativo', true)
      .ilike('area', area);
    const valoresPorTipo = new Map();
    for (const k of kpisRaw || []) {
      const fc = k.formula_config || {};
      const candidatos = [fc.dado_tipo, fc.numerador, fc.denominador].filter(Boolean);
      const tiposK = [];
      for (const c of candidatos) {
        if (Array.isArray(c)) tiposK.push(...c);
        else tiposK.push(c);
      }
      const vals = Array.isArray(k.valores) ? k.valores : [];
      for (const t of tiposK) {
        if (!t) continue;
        if (!valoresPorTipo.has(t)) valoresPorTipo.set(t, new Set());
        vals.forEach(v => valoresPorTipo.get(t).add(v));
      }
    }
    const tiposIds = Array.from(valoresPorTipo.keys());
    if (tiposIds.length > 0) {
      const [{ data: catalogo }, { data: registros }] = await Promise.all([
        supabase.from('tipos_dado_bruto')
          .select('id, nome, unidade, agregacao, ordem')
          .in('id', tiposIds),
        supabase.from('dados_brutos')
          .select('tipo_id, data, valor')
          .eq('area', area)
          .in('tipo_id', tiposIds)
          .gte('data', inicio)
          .lte('data', fim),
      ]);
      const regsPorTipo = new Map();
      for (const r of registros || []) {
        if (!regsPorTipo.has(r.tipo_id)) regsPorTipo.set(r.tipo_id, []);
        regsPorTipo.get(r.tipo_id).push(r);
      }
      const catalogoOrdenado = (catalogo || []).sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
      for (const t of catalogoOrdenado) {
        const regs = regsPorTipo.get(t.id) || [];
        if (regs.length === 0) continue; // tipo sem registro não vira gráfico vazio
        const ehMedia = String(t.agregacao || '').toLowerCase().startsWith('med');
        const porMes = new Map();
        for (const r of regs) {
          const mes = String(r.data).slice(0, 7);
          if (!porMes.has(mes)) porMes.set(mes, { soma: 0, n: 0 });
          const m = porMes.get(mes);
          m.soma += Number(r.valor) || 0; m.n += 1;
        }
        const serie = mesesRange.map(mes => {
          const m = porMes.get(mes);
          if (!m) return { periodo: mes, valor: ehMedia ? null : 0 };
          return { periodo: mes, valor: ehMedia ? Math.round((m.soma / m.n) * 100) / 100 : m.soma };
        });
        const dado = { id: t.id, label: t.nome, unidade: t.unidade, agregacao: ehMedia ? 'media' : 'soma', serie };
        const valsDoTipo = Array.from(valoresPorTipo.get(t.id) || []);
        for (const v of valsDoTipo) {
          if (!ORDEM_VALORES.includes(v)) continue;
          pushDado(v, dado);
        }
      }
    }

    res.json({
      area,
      inicio,
      fim,
      meses,
      valores: ORDEM_VALORES
        .filter(v => (porValor[v] || []).length > 0)
        .map(v => ({
          key: v,
          label: VALOR_LABELS[v],
          cor: VALOR_CORES[v],
          dados: porValor[v],
        })),
    });
  } catch (e) {
    console.error('painel-area/series:', e.message);
    res.status(500).json({ error: 'Erro ao montar séries da área' });
  }
});

// ============================================================================
// POST /:area/nps · registra NPS mensal da área (coord da área · nível >= 3)
// ============================================================================
// Os 5 KPIs CULTO-NPS-* (kids/ami/bridge/online/sede) já apontam pra
// tipo_id='nps_culto' via formula_config. So falta o canal de coleta ·
// este endpoint grava nota agregada em dados_brutos · trigger SQL recalcula.
//
// Body: { nota: 0-10, mês: 'YYYY-MM' (default mês atual), qtd_respostas?: number, observação?: string }
//
// Pra automacao futura: quando o módulo NPS rodar com pesquisa pos-culto,
// substituir este endpoint por agregacao automática.
// ============================================================================
router.post('/:area/nps', authorizeModule('painel-area', 3), async (req, res) => {
  try {
    const area = String(req.params.area).toLowerCase();
    if (!AREAS_VALIDAS.includes(area)) {
      return res.status(400).json({ error: 'Area invalida', validas: AREAS_VALIDAS });
    }
    const { nota, mes, qtd_respostas, observacao } = req.body || {};
    const notaNum = Number(nota);
    if (!Number.isFinite(notaNum) || notaNum < 0 || notaNum > 10) {
      return res.status(400).json({ error: 'nota deve ser entre 0 e 10' });
    }
    const mesUsado = (mes && /^\d{4}-\d{2}$/.test(mes)) ? mes : new Date().toISOString().slice(0, 7);
    // Data canonica: dia 1 do mês (granularidade mensal do tipo nps_culto)
    const dataReg = `${mesUsado}-01`;

    const payload = {
      tipo_id: 'nps_culto',
      area,
      data: dataReg,
      valor: notaNum,
      contexto: qtd_respostas ? { qtd_respostas: Number(qtd_respostas) } : {},
      observacao: observacao ? String(observacao).slice(0, 500) : null,
      registrado_por: req.user?.id || null,
      origem: 'painel-area-nps',
    };

    // UNIQUE em (tipo, área, data, contexto) · UPSERT
    const { data, error } = await supabase
      .from('dados_brutos')
      .upsert(payload, { onConflict: 'tipo_id,area,data,contexto' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, registro: data });
  } catch (e) {
    console.error('painel-area/nps:', e.message);
    res.status(500).json({ error: 'Erro ao registrar NPS' });
  }
});

// ============================================================
// Aba "Pessoas" do AMI / Bridge · lista quem declarou frequentar a área
// (mem_membros.frequenta_area) com faixa etária. Detalhe SEM contribuições.
// ============================================================

// Faixa etária pela data de nascimento (espelha fn_faixa_etaria do banco).
function faixaEtaria(dataNasc) {
  if (!dataNasc) return null;
  const n = new Date(dataNasc);
  if (isNaN(n.getTime())) return null;
  const h = new Date();
  let idade = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) idade--;
  if (idade < 13) return 'crianca';
  if (idade <= 17) return 'adolescente';
  if (idade <= 30) return 'jovem';
  return 'adulto';
}

// GET /:area/pessoas — lista de pessoas que frequentam o ministério (ami/bridge)
router.get('/:area/pessoas', authorizeModule('painel-area', 1), async (req, res) => {
  try {
    const area = String(req.params.area).toLowerCase();
    if (!['ami', 'bridge'].includes(area)) {
      return res.status(400).json({ error: 'Aba Pessoas só existe para AMI e Bridge' });
    }
    const { data, error } = await supabase
      .from('mem_membros')
      .select('id, nome, foto_url, telefone, data_nascimento, status')
      .eq('frequenta_area', area)
      .is('deleted_at', null)
      .order('nome')
      .limit(1000);
    if (error) throw error;

    const pessoas = (data || []).map((m) => ({ ...m, faixa_etaria: faixaEtaria(m.data_nascimento) }));
    const por_faixa = pessoas.reduce((acc, p) => {
      const f = p.faixa_etaria || 'sem_data';
      acc[f] = (acc[f] || 0) + 1;
      return acc;
    }, {});
    res.json({ pessoas, total: pessoas.length, por_faixa });
  } catch (e) {
    console.error('painel-area/pessoas:', e.message);
    res.status(500).json({ error: 'Erro ao listar pessoas' });
  }
});

// GET /:area/pessoas/:id — detalhe da pessoa (SEM contribuições/financeiro)
router.get('/:area/pessoas/:id', authorizeModule('painel-area', 1), async (req, res) => {
  try {
    const area = String(req.params.area).toLowerCase();
    if (!['ami', 'bridge'].includes(area)) {
      return res.status(400).json({ error: 'Area invalida' });
    }
    const { id } = req.params;

    const { data: m, error } = await supabase
      .from('mem_membros')
      .select('id, nome, foto_url, telefone, email, data_nascimento, status, frequenta_area, familia_id, created_at')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!m) return res.status(404).json({ error: 'Pessoa não encontrada' });
    // só pessoas do ministério desta área (defesa: líder de área não bisbilhota fora)
    if (m.frequenta_area !== area) {
      return res.status(403).json({ error: 'Esta pessoa não frequenta este ministério.' });
    }

    // família (nome)
    let familia = null;
    if (m.familia_id) {
      const { data: f } = await supabase.from('mem_familias').select('id, nome').eq('id', m.familia_id).maybeSingle();
      familia = f || null;
    }
    // grupo de conexão atual
    let grupo = null;
    const { data: gm } = await supabase
      .from('mem_grupo_membros')
      .select('grupo_id, funcao, mem_grupos(id, nome)')
      .eq('membro_id', id)
      .is('saiu_em', null)
      .limit(1)
      .maybeSingle();
    if (gm) {
      const g = Array.isArray(gm.mem_grupos) ? gm.mem_grupos[0] : gm.mem_grupos;
      grupo = g ? { id: g.id, nome: g.nome, funcao: gm.funcao || null } : null;
    }
    // ministérios em que serve (voluntariado ativo)
    const { data: vols } = await supabase
      .from('mem_voluntarios')
      .select('ministerio, area, desde')
      .eq('membro_id', id)
      .is('ate', null);
    // trilha (marcos concluídos)
    const { data: trilha } = await supabase
      .from('mem_trilha_valores')
      .select('etapa, concluida, concluida_em')
      .eq('membro_id', id);

    res.json({
      membro: { ...m, faixa_etaria: faixaEtaria(m.data_nascimento) },
      familia,
      grupo,
      ministerios: vols || [],
      trilha: trilha || [],
      // contribuições NÃO são retornadas aqui (regra: líder de área não vê doação)
    });
  } catch (e) {
    console.error('painel-area/pessoas/:id:', e.message);
    res.status(500).json({ error: 'Erro ao abrir pessoa' });
  }
});

module.exports = router;
