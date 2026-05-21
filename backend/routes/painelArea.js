// ============================================================================
// /api/painel-area/:area · drill-down completo de KPIs + DADOS BRUTOS + saude
// ============================================================================
// Usado pelos modulos kids/ami/bridge/online · paginas read-only
//
// Retorna:
//   - kpis: indicadores calculados (kpi_indicadores_taticos) com trajetoria
//   - dados: dados_brutos agregados por tipo · ultimo valor + tendencia
//   - saude: score 0-100 + breakdown
//   - NPS de culto destacado no topo (CULTO-NPS-*)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const AREAS_VALIDAS = ['kids', 'ami', 'bridge', 'online', 'sede', 'cba'];

// Filtra cultos da `vw_culto_stats` pela area pedida · usa service_type_name
// porque eh mais robusto que nome livre (mesma logica do kpiAutoCollector)
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
    // Todos cultos com transmissao online (pico online > 0 OU has_online)
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

    // Filtro de periodo via query param · desde=YYYY-MM-DD&ate=YYYY-MM-DD
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
    // 1. KPIs ativos da area + trajetoria + lideres + formula (pra cruzar com dados)
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

    // 2c. Busca registros existentes (no periodo · pra sparkline + variacao)
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
      const regs = registrosPorTipo.get(t.id) || []; // ja em ordem desc
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
    // 2e. Cultos recentes da area · principal fonte de dado pro lider hoje
    // ──────────────────────────────────────────────────────────────────────
    // Marcos: "decisao arquitetural · pode ler de vw_culto_stats, bom adicionar
    // filtro por data tambem". Os 4 modulos veem os cultos da sua area
    // diretamente (cultos.X eh source-of-truth de frequencia/decisoes/batismos
    // hoje, NAO dados_brutos).
    let cultosRecentes = [];
    let totaisCultos = null;
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
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. Score de saude
    // ──────────────────────────────────────────────────────────────────────
    const totalKpis = enriched.length;
    const noAlvo = enriched.filter(k => k.trajetoria?.status_trajetoria === 'no_alvo').length;
    const atrasado = enriched.filter(k => k.trajetoria?.status_trajetoria === 'atrasado').length;
    const critico = enriched.filter(k => k.trajetoria?.status_trajetoria === 'critico').length;
    const semDado = enriched.filter(k => !k.trajetoria || k.trajetoria.ultimo_valor == null).length;
    const comMeta = enriched.filter(k => k.trajetoria?.checkpoint_meta != null).length;

    // Dados com registro nos ultimos 30 dias
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
    });
  } catch (e) {
    console.error('painel-area:', e.message);
    res.status(500).json({ error: 'Erro ao buscar dados da area' });
  }
});

// ============================================================================
// POST /:area/nps · registra NPS mensal da area (coord da area · nivel >= 3)
// ============================================================================
// Os 5 KPIs CULTO-NPS-* (kids/ami/bridge/online/sede) ja apontam pra
// tipo_id='nps_culto' via formula_config. So falta o canal de coleta ·
// este endpoint grava nota agregada em dados_brutos · trigger SQL recalcula.
//
// Body: { nota: 0-10, mes: 'YYYY-MM' (default mes atual), qtd_respostas?: number, observacao?: string }
//
// Pra automacao futura: quando o modulo NPS rodar com pesquisa pos-culto,
// substituir este endpoint por agregacao automatica.
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
    // Data canonica: dia 1 do mes (granularidade mensal do tipo nps_culto)
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

    // UNIQUE em (tipo, area, data, contexto) · UPSERT
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

module.exports = router;
