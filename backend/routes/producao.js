// ============================================================================
// /api/producao · Produção de Culto
// ============================================================================
// (A) KPIs técnicos POR CULTO (espelha a aba de Integração):
//     - duração do culto (pontualidade · alvo 60min ou meta do tipo)
//     - ocorrências (falhas técnicas + estabilidade de estrutura · com rastro)
//     - checklist técnico itemizado (% executado)
// (B) KPIs gerais que já existem (read-only · expostos aqui):
//     - SLA das solicitações da Produção (ADM-C-G-PRODUCAO)
//     - NPS interno da Produção vs outras áreas criativas (ADM-C-Q-*)
//
// Reaproveita a tabela `cultos` (satélite 1:1 em culto_producao). Os KPIs
// PROD-CULTO-* recalculam via trigger SQL (migration 20260602140000).
// ============================================================================

const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const painelCache = require('../services/painelCache');

router.use(authenticate);

const SEVERIDADES = ['baixa', 'media', 'alta', 'critica'];
const TIPOS_OCORR = ['tecnica', 'estrutura'];

// ── Helpers ────────────────────────────────────────────────────────────────
function nonNegOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

// itens de checklist aplicáveis a um culto (genéricos + do tipo do culto)
function itensAplicaveis(template, serviceTypeId) {
  return template.filter(i => i.service_type_id == null || i.service_type_id === serviceTypeId);
}

// ── Tipos de culto (com a meta de duração) ───────────────────────────────────
router.get('/service-types', authorizeModule('producao', 1), async (req, res) => {
  const { data, error } = await supabase
    .from('vol_service_types')
    .select('id, name, color, recurrence_day, recurrence_time, meta_duracao_min, is_active')
    .eq('is_active', true)
    .order('recurrence_day')
    .order('recurrence_time');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── Semana de cultos com os dados de produção mesclados ──────────────────────
// GET /api/producao/semana?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
router.get('/semana', authorizeModule('producao', 1), async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'inicio e fim são obrigatórios' });

    const { data: cultos, error } = await supabase
      .from('vw_culto_stats')
      .select('*')
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: true })
      .order('hora', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });

    const ids = (cultos || []).map(c => c.id);
    let prodById = {}, ocorrByCulto = {}, marksByCulto = {};
    let template = [];

    // template ativo (pra contar itens aplicáveis por culto)
    const { data: tpl } = await supabase
      .from('producao_checklist_itens')
      .select('id, service_type_id, ativo')
      .eq('ativo', true);
    template = tpl || [];

    if (ids.length > 0) {
      const [{ data: prod }, { data: ocorr }, { data: marks }] = await Promise.all([
        supabase.from('culto_producao').select('*').in('culto_id', ids),
        supabase.from('culto_producao_ocorrencias').select('culto_id, tipo').in('culto_id', ids),
        supabase.from('culto_producao_checklist').select('culto_id, feito').in('culto_id', ids),
      ]);
      (prod || []).forEach(p => { prodById[p.culto_id] = p; });
      (ocorr || []).forEach(o => {
        if (!ocorrByCulto[o.culto_id]) ocorrByCulto[o.culto_id] = { tecnica: 0, estrutura: 0 };
        if (o.tipo === 'tecnica' || o.tipo === 'estrutura') ocorrByCulto[o.culto_id][o.tipo]++;
      });
      (marks || []).forEach(m => {
        if (!marksByCulto[m.culto_id]) marksByCulto[m.culto_id] = { feitos: 0, marcados: 0 };
        marksByCulto[m.culto_id].marcados++;
        if (m.feito) marksByCulto[m.culto_id].feitos++;
      });
    }

    const merged = (cultos || []).map(c => {
      const prod = prodById[c.id] || null;
      const totalAplicavel = itensAplicaveis(template, c.service_type_id).length;
      const marcas = marksByCulto[c.id] || { feitos: 0, marcados: 0 };
      const ocorr = ocorrByCulto[c.id] || { tecnica: 0, estrutura: 0 };
      const preenchido = !!(prod && prod.duracao_minutos != null) || marcas.marcados > 0
        || ocorr.tecnica > 0 || ocorr.estrutura > 0;
      return {
        ...c,
        producao: {
          duracao_minutos: prod?.duracao_minutos ?? null,
          pontualidade_obs: prod?.pontualidade_obs ?? null,
          observacoes: prod?.observacoes ?? null,
          meta_duracao_min: c.meta_duracao_min ?? 60,
        },
        ocorrencias: ocorr,
        checklist: { feitos: marcas.feitos, total: totalAplicavel },
        producao_preenchido: preenchido,
      };
    });

    res.json(merged);
  } catch (e) {
    console.error('producao/semana:', e.message);
    res.status(500).json({ error: 'Erro ao buscar a semana' });
  }
});

// ── Detalhe de produção de um culto (modal) ──────────────────────────────────
router.get('/culto/:id', authorizeModule('producao', 1), async (req, res) => {
  try {
    const cultoId = req.params.id;
    const { data: culto } = await supabase
      .from('vw_culto_stats').select('*').eq('id', cultoId).single();
    if (!culto) return res.status(404).json({ error: 'Culto não encontrado' });

    const [{ data: prod }, { data: ocorr }, { data: template }, { data: marks }] = await Promise.all([
      supabase.from('culto_producao').select('*').eq('culto_id', cultoId).maybeSingle(),
      supabase.from('culto_producao_ocorrencias').select('*').eq('culto_id', cultoId).order('created_at'),
      supabase.from('producao_checklist_itens').select('*').eq('ativo', true).order('ordem'),
      supabase.from('culto_producao_checklist').select('*').eq('culto_id', cultoId),
    ]);

    const marksByItem = {};
    (marks || []).forEach(m => { marksByItem[m.item_id] = m; });
    const itens = itensAplicaveis(template || [], culto.service_type_id).map(it => ({
      item_id: it.id,
      titulo: it.titulo,
      descricao: it.descricao,
      ordem: it.ordem,
      feito: marksByItem[it.id]?.feito ?? false,
      observacao: marksByItem[it.id]?.observacao ?? null,
    }));

    res.json({
      culto,
      producao: prod || null,
      ocorrencias: ocorr || [],
      checklist: itens,
    });
  } catch (e) {
    console.error('producao/culto/:id:', e.message);
    res.status(500).json({ error: 'Erro ao buscar detalhe do culto' });
  }
});

// ── Salvar duração + observações (upsert do satélite) ────────────────────────
router.put('/culto/:id', authorizeModule('producao', 2), async (req, res) => {
  try {
    const cultoId = req.params.id;
    const { duracao_minutos, pontualidade_obs, observacoes } = req.body || {};
    const payload = {
      culto_id: cultoId,
      duracao_minutos: nonNegOrNull(duracao_minutos),
      pontualidade_obs: pontualidade_obs ? String(pontualidade_obs).slice(0, 1000) : null,
      observacoes: observacoes ? String(observacoes).slice(0, 2000) : null,
      preenchido_por: req.user?.id || null,
      preenchido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('culto_producao')
      .upsert(payload, { onConflict: 'culto_id' })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    painelCache.bust('');
    res.json(data);
  } catch (e) {
    console.error('producao PUT culto:', e.message);
    res.status(500).json({ error: 'Erro ao salvar produção do culto' });
  }
});

// ── Ocorrências (falhas técnicas / estabilidade) ─────────────────────────────
router.post('/culto/:id/ocorrencias', authorizeModule('producao', 2), async (req, res) => {
  try {
    const cultoId = req.params.id;
    const { tipo, descricao, severidade, momento } = req.body || {};
    if (!TIPOS_OCORR.includes(tipo)) return res.status(400).json({ error: 'tipo inválido (tecnica|estrutura)' });
    if (!descricao || String(descricao).trim().length < 3) {
      return res.status(400).json({ error: 'descrição obrigatória (o rastro do erro)' });
    }
    const { data, error } = await supabase
      .from('culto_producao_ocorrencias')
      .insert({
        culto_id: cultoId,
        tipo,
        descricao: String(descricao).trim().slice(0, 2000),
        severidade: SEVERIDADES.includes(severidade) ? severidade : 'media',
        momento: momento ? String(momento).slice(0, 120) : null,
        registrado_por: req.user?.id || null,
      })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    painelCache.bust('');
    res.json(data);
  } catch (e) {
    console.error('producao POST ocorrencia:', e.message);
    res.status(500).json({ error: 'Erro ao registrar ocorrência' });
  }
});

router.delete('/ocorrencias/:id', authorizeModule('producao', 2), async (req, res) => {
  const { error } = await supabase
    .from('culto_producao_ocorrencias').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  painelCache.bust('');
  res.json({ ok: true });
});

// ── Checklist por culto · bulk upsert das marcações ──────────────────────────
// Body: { marks: [{ item_id, feito, observacao }] }
router.put('/culto/:id/checklist', authorizeModule('producao', 2), async (req, res) => {
  try {
    const cultoId = req.params.id;
    const marks = Array.isArray(req.body?.marks) ? req.body.marks : [];
    if (marks.length === 0) return res.json({ ok: true, atualizados: 0 });
    const agora = new Date().toISOString();
    const rows = marks
      .filter(m => m && m.item_id)
      .map(m => ({
        culto_id: cultoId,
        item_id: m.item_id,
        feito: !!m.feito,
        observacao: m.observacao ? String(m.observacao).slice(0, 500) : null,
        marcado_por: req.user?.id || null,
        marcado_em: agora,
      }));
    const { error } = await supabase
      .from('culto_producao_checklist')
      .upsert(rows, { onConflict: 'culto_id,item_id' });
    if (error) return res.status(500).json({ error: error.message });
    painelCache.bust('');
    res.json({ ok: true, atualizados: rows.length });
  } catch (e) {
    console.error('producao PUT checklist:', e.message);
    res.status(500).json({ error: 'Erro ao salvar checklist' });
  }
});

// ── Template do checklist (aba Checklists · admin nível 3) ────────────────────
router.get('/checklist-itens', authorizeModule('producao', 1), async (req, res) => {
  const { data, error } = await supabase
    .from('producao_checklist_itens')
    .select('id, titulo, descricao, service_type_id, ordem, ativo')
    .order('ordem');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/checklist-itens', authorizeModule('producao', 3), async (req, res) => {
  const { titulo, descricao, service_type_id, ordem } = req.body || {};
  if (!titulo || String(titulo).trim().length < 2) return res.status(400).json({ error: 'título obrigatório' });
  const { data, error } = await supabase
    .from('producao_checklist_itens')
    .insert({
      titulo: String(titulo).trim().slice(0, 200),
      descricao: descricao ? String(descricao).slice(0, 500) : null,
      service_type_id: service_type_id || null,
      ordem: Number.isFinite(Number(ordem)) ? Number(ordem) : 0,
      ativo: true,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.patch('/checklist-itens/:id', authorizeModule('producao', 3), async (req, res) => {
  const allowed = ['titulo', 'descricao', 'service_type_id', 'ordem', 'ativo'];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    update[k] = v === '' ? null : v;
  }
  const { data, error } = await supabase
    .from('producao_checklist_itens').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/checklist-itens/:id', authorizeModule('producao', 3), async (req, res) => {
  // hard delete OK · catálogo de config sem PII (ON DELETE CASCADE limpa marcas)
  const { error } = await supabase
    .from('producao_checklist_itens').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Acumulado + detalhado por tipo de culto ──────────────────────────────────
// GET /api/producao/acumulado?inicio=&fim=
router.get('/acumulado', authorizeModule('producao', 1), async (req, res) => {
  try {
    const hoje = new Date();
    const ate = req.query.fim || hoje.toISOString().slice(0, 10);
    let desde = req.query.inicio;
    if (!desde) { const d = new Date(hoje); d.setDate(d.getDate() - 180); desde = d.toISOString().slice(0, 10); }

    const { data: cultos } = await supabase
      .from('vw_culto_stats')
      .select('id, data, nome, service_type_id, service_type_name')
      .gte('data', desde).lte('data', ate);
    const ids = (cultos || []).map(c => c.id);
    const cultoById = {};
    (cultos || []).forEach(c => { cultoById[c.id] = c; });

    let prod = [], ocorr = [], marks = [], serviceTypes = [];
    if (ids.length > 0) {
      const r = await Promise.all([
        supabase.from('culto_producao').select('*').in('culto_id', ids),
        supabase.from('culto_producao_ocorrencias').select('*').in('culto_id', ids),
        supabase.from('culto_producao_checklist').select('culto_id, feito').in('culto_id', ids),
        supabase.from('vol_service_types').select('id, name, meta_duracao_min'),
      ]);
      prod = r[0].data || []; ocorr = r[1].data || []; marks = r[2].data || []; serviceTypes = r[3].data || [];
    }
    const metaByType = {};
    serviceTypes.forEach(s => { metaByType[s.id] = s.meta_duracao_min ?? 60; });

    // Totais
    const prodComDur = prod.filter(p => p.duracao_minutos != null);
    const noHorario = prodComDur.filter(p => {
      const c = cultoById[p.culto_id]; if (!c) return false;
      return p.duracao_minutos <= (metaByType[c.service_type_id] ?? 60);
    }).length;
    const marcasFeitas = marks.filter(m => m.feito).length;
    const falhasTec = ocorr.filter(o => o.tipo === 'tecnica').length;
    const ocorrEstr = ocorr.filter(o => o.tipo === 'estrutura').length;

    const totais = {
      cultos_no_periodo: cultos?.length || 0,
      cultos_preenchidos: prodComDur.length,
      pontualidade_pct: prodComDur.length ? Math.round((noHorario / prodComDur.length) * 100) : null,
      duracao_media_min: prodComDur.length
        ? Math.round(prodComDur.reduce((a, p) => a + p.duracao_minutos, 0) / prodComDur.length) : null,
      checklist_pct: marks.length ? Math.round((marcasFeitas / marks.length) * 100) : null,
      falhas_tecnicas: falhasTec,
      ocorrencias_estrutura: ocorrEstr,
    };

    // Detalhado por tipo de culto
    const porTipo = {};
    for (const c of cultos || []) {
      const key = c.service_type_name || 'Outros';
      if (!porTipo[key]) porTipo[key] = { tipo: key, cultos: 0, preenchidos: 0, no_horario: 0,
        soma_dur: 0, falhas: 0, estrutura: 0, marcas: 0, marcas_feitas: 0 };
      porTipo[key].cultos++;
    }
    for (const p of prodComDur) {
      const c = cultoById[p.culto_id]; if (!c) continue;
      const key = c.service_type_name || 'Outros';
      porTipo[key].preenchidos++;
      porTipo[key].soma_dur += p.duracao_minutos;
      if (p.duracao_minutos <= (metaByType[c.service_type_id] ?? 60)) porTipo[key].no_horario++;
    }
    for (const o of ocorr) {
      const c = cultoById[o.culto_id]; if (!c) continue;
      const key = c.service_type_name || 'Outros';
      if (!porTipo[key]) continue;
      if (o.tipo === 'tecnica') porTipo[key].falhas++; else porTipo[key].estrutura++;
    }
    for (const m of marks) {
      const c = cultoById[m.culto_id]; if (!c) continue;
      const key = c.service_type_name || 'Outros';
      if (!porTipo[key]) continue;
      porTipo[key].marcas++;
      if (m.feito) porTipo[key].marcas_feitas++;
    }
    const detalhado = Object.values(porTipo).map(t => ({
      tipo: t.tipo,
      cultos: t.cultos,
      preenchidos: t.preenchidos,
      pontualidade_pct: t.preenchidos ? Math.round((t.no_horario / t.preenchidos) * 100) : null,
      duracao_media_min: t.preenchidos ? Math.round(t.soma_dur / t.preenchidos) : null,
      checklist_pct: t.marcas ? Math.round((t.marcas_feitas / t.marcas) * 100) : null,
      falhas_tecnicas: t.falhas,
      ocorrencias_estrutura: t.estrutura,
    })).sort((a, b) => b.cultos - a.cultos);

    res.json({ periodo: { desde, ate }, totais, detalhado });
  } catch (e) {
    console.error('producao/acumulado:', e.message);
    res.status(500).json({ error: 'Erro ao agregar dados' });
  }
});

// ── Desempenho · KPIs próprios + SLA + NPS vs outras áreas criativas ──────────
router.get('/desempenho', authorizeModule('producao', 1), async (req, res) => {
  try {
    // KPIs próprios (PROD-CULTO-*) + SLA (ADM-C-G-PRODUCAO) + NPS criativos (ADM-C-Q-*)
    const ids = [
      'PROD-CULTO-PONTUAL', 'PROD-CULTO-CHECKLIST', 'PROD-CULTO-FALHAS', 'PROD-CULTO-ESTAB',
      'ADM-C-G-PRODUCAO', 'ADM-C-Q-PRODUCAO', 'ADM-C-Q-ADORACAO', 'ADM-C-Q-MARKETING',
    ];
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, periodicidade, meta_descricao, meta_valor, unidade')
      .in('id', ids).eq('ativo', true);

    const { data: traj } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria, ultimo_periodo, ultimo_valor, percentual_meta')
      .in('kpi_id', ids);
    const trajById = {};
    (traj || []).forEach(t => { trajById[t.kpi_id] = t; });

    const byId = {};
    (kpis || []).forEach(k => {
      byId[k.id] = {
        id: k.id, indicador: k.indicador, descricao: k.descricao,
        periodicidade: k.periodicidade, meta_descricao: k.meta_descricao,
        meta_valor: k.meta_valor, unidade: k.unidade,
        valor: trajById[k.id]?.ultimo_valor ?? null,
        periodo: trajById[k.id]?.ultimo_periodo ?? null,
        status: trajById[k.id]?.status_trajetoria ?? null,
        percentual_meta: trajById[k.id]?.percentual_meta ?? null,
      };
    });

    const especificos = ['PROD-CULTO-PONTUAL', 'PROD-CULTO-CHECKLIST', 'PROD-CULTO-FALHAS', 'PROD-CULTO-ESTAB']
      .map(id => byId[id]).filter(Boolean);

    const npsComparativo = [
      { area: 'Produção', ...(byId['ADM-C-Q-PRODUCAO'] || {}), destaque: true },
      { area: 'Adoração', ...(byId['ADM-C-Q-ADORACAO'] || {}) },
      { area: 'Marketing', ...(byId['ADM-C-Q-MARKETING'] || {}) },
    ].filter(x => x.id);

    res.json({
      especificos,
      sla: byId['ADM-C-G-PRODUCAO'] || null,
      nps_producao: byId['ADM-C-Q-PRODUCAO'] || null,
      nps_comparativo: npsComparativo,
    });
  } catch (e) {
    console.error('producao/desempenho:', e.message);
    res.status(500).json({ error: 'Erro ao buscar desempenho' });
  }
});

module.exports = router;
