// ============================================================================
// /api/producao · Produção de Culto
// ============================================================================
// (A) KPIs técnicos POR CULTO (espelha a aba de Integração):
//     - duração do culto (pontualidade · alvo 60min ou meta do tipo)
//     - ocorrências (falhas técnicas + instabilidade de estrutura · com rastro)
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
const { notificar } = require('../services/notificar');

router.use(authenticate);

// Responsáveis cadastrados da área Produção (pra notificar diretamente além
// das regras do módulo). Vazio é tolerado (notificar cai no fallback admin/diretor).
async function responsaveisProducao() {
  const { data } = await supabase
    .from('area_solicitacoes_responsaveis')
    .select('profile_id')
    .eq('area', 'producao');
  return (data || []).map(r => r.profile_id).filter(Boolean);
}

const SEVERIDADES = ['baixa', 'media', 'alta', 'critica'];
const TIPOS_OCORR = ['tecnica', 'estrutura'];
const SECOES = ['culto', 'pos_culto'];
const CATEGORIAS_ESPECIAIS = ['ceia', 'batismo', 'apresentacao_bebes', 'outros'];
const CATEGORIAS_ROTINA = ['ceia', 'batismo', 'apresentacao_bebes']; // 'outros' = fora da rotina

// ── Helpers ────────────────────────────────────────────────────────────────
// segundos · inteiro não-negativo ou null (tempo mm:ss de uma etapa)
function intSegOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

// itens de checklist aplicáveis a um culto (genéricos + do tipo do culto)
function itensAplicaveis(template, serviceTypeId) {
  return template.filter(i => i.service_type_id == null || i.service_type_id === serviceTypeId);
}

// roteiro aplicável a um culto: prefere o do tipo; senão cai no geral (NULL).
// Mantém UM cronograma coerente (não concatena geral + tipo).
function roteiroAplicavel(roteiro, serviceTypeId) {
  const doTipo = roteiro.filter(r => r.service_type_id === serviceTypeId);
  const base = doTipo.length ? doTipo : roteiro.filter(r => r.service_type_id == null);
  return base.slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}

// soma os executados/previstos das etapas e deriva os totais do satélite.
// A duração (executado) da seção 'culto' vira duracao_minutos (compat c/ o KPI
// de pontualidade). null quando ainda NÃO há executado lançado.
function recomputarTotais(etapas) {
  const acc = { culto: { ex: [], prev: [] }, pos_culto: { ex: [], prev: [] } };
  for (const e of etapas) {
    const sec = SECOES.includes(e.secao) ? e.secao : 'culto';
    if (e.executado_seg != null) acc[sec].ex.push(e.executado_seg);
    if (e.previsto_seg != null) acc[sec].prev.push(e.previsto_seg);
  }
  const orNull = (a) => (a.length ? a.reduce((x, y) => x + y, 0) : null);
  const duracao_segundos = orNull(acc.culto.ex);
  return {
    duracao_segundos,
    duracao_prevista_seg: orNull(acc.culto.prev),
    pos_culto_segundos: orNull(acc.pos_culto.ex),
    pos_culto_previsto_seg: orNull(acc.pos_culto.prev),
    duracao_minutos: duracao_segundos == null ? null : Math.round(duracao_segundos / 60),
  };
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

// Duração-alvo por tipo de culto (pontualidade · admin nível 3)
router.patch('/service-types/:id/meta', authorizeModule('producao', 3), async (req, res) => {
  const min = Number(req.body?.meta_duracao_min);
  if (!Number.isFinite(min) || min < 1 || min > 600) {
    return res.status(400).json({ error: 'meta_duracao_min deve ser entre 1 e 600 minutos' });
  }
  const { data, error } = await supabase
    .from('vol_service_types')
    .update({ meta_duracao_min: Math.round(min) })
    .eq('id', req.params.id)
    .select('id, name, meta_duracao_min').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Semana de cultos com os dados de produção mesclados ──────────────────────
// GET /api/producao/semana?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
router.get('/semana', authorizeModule('producao', 1), async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'início e fim são obrigatórios' });

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
          duracao_prevista_min: prod?.duracao_prevista_seg != null ? Math.round(prod.duracao_prevista_seg / 60) : null,
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

    const [{ data: prod }, { data: ocorr }, { data: template }, { data: marks }, { data: etapas }, { data: roteiro }] = await Promise.all([
      supabase.from('culto_producao').select('*').eq('culto_id', cultoId).maybeSingle(),
      supabase.from('culto_producao_ocorrencias').select('*').eq('culto_id', cultoId).order('created_at'),
      supabase.from('producao_checklist_itens').select('*').eq('ativo', true).order('ordem'),
      supabase.from('culto_producao_checklist').select('*').eq('culto_id', cultoId),
      supabase.from('culto_producao_etapas').select('*').eq('culto_id', cultoId).order('ordem'),
      supabase.from('producao_roteiro_etapas').select('*').eq('ativo', true).order('ordem'),
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

    // Roteiro padrão do tipo (pra pré-carregar quando o culto ainda não tem etapas)
    const roteiroDoCulto = roteiroAplicavel(roteiro || [], culto.service_type_id).map(r => ({
      titulo: r.titulo, previsto_seg: r.previsto_seg, secao: r.secao, ordem: r.ordem,
    }));

    res.json({
      culto,
      producao: prod || null,
      ocorrencias: ocorr || [],
      checklist: itens,
      etapas: (etapas || []).map(e => ({
        id: e.id, ordem: e.ordem, titulo: e.titulo,
        previsto_seg: e.previsto_seg, executado_seg: e.executado_seg,
        observacao: e.observacao, secao: e.secao,
        tipo: e.tipo || 'padrao', categoria_especial: e.categoria_especial || null,
      })),
      roteiro: roteiroDoCulto,
    });
  } catch (e) {
    console.error('producao/culto/:id:', e.message);
    res.status(500).json({ error: 'Erro ao buscar detalhe do culto' });
  }
});

// ── Salvar observações (upsert PARCIAL do satélite) ──────────────────────────
// A duração NÃO entra mais aqui — vem da soma das etapas (PUT /culto/:id/etapas).
// Upsert parcial: só toca pontualidade_obs/observacoes, preservando os totais
// (duracao_segundos etc.) já gravados pelas etapas.
router.put('/culto/:id', authorizeModule('producao', 2), async (req, res) => {
  try {
    const cultoId = req.params.id;
    const { pontualidade_obs, observacoes } = req.body || {};
    const payload = {
      culto_id: cultoId,
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

// ── Etapas do culto (cronograma · momentos) · replace + recálculo dos totais ──
// Body: { etapas: [{ ordem, titulo, previsto_seg, executado_seg, observacao, secao }] }
// Estratégia replace (delete-all + insert) · etapas são ad-hoc por culto.
// Grava os totais derivados no satélite (duracao_minutos = soma executado 'culto').
router.put('/culto/:id/etapas', authorizeModule('producao', 2), async (req, res) => {
  try {
    const cultoId = req.params.id;
    const entrada = Array.isArray(req.body?.etapas) ? req.body.etapas : [];

    const rows = entrada
      .filter(e => e && String(e.titulo || '').trim().length >= 1)
      .map((e, i) => {
        const especial = e.tipo === 'especial';
        return {
          culto_id: cultoId,
          ordem: Number.isFinite(Number(e.ordem)) ? Number(e.ordem) : i + 1,
          titulo: String(e.titulo).trim().slice(0, 200),
          previsto_seg: intSegOrNull(e.previsto_seg),
          executado_seg: intSegOrNull(e.executado_seg),
          observacao: e.observacao ? String(e.observacao).trim().slice(0, 500) : null,
          secao: SECOES.includes(e.secao) ? e.secao : 'culto',
          tipo: especial ? 'especial' : 'padrao',
          categoria_especial: especial && CATEGORIAS_ESPECIAIS.includes(e.categoria_especial)
            ? e.categoria_especial : null,
        };
      });

    // replace: limpa as etapas atuais do culto e reinsere
    const { error: delErr } = await supabase
      .from('culto_producao_etapas').delete().eq('culto_id', cultoId);
    if (delErr) return res.status(500).json({ error: delErr.message });

    let etapasSalvas = [];
    if (rows.length > 0) {
      const { data: ins, error: insErr } = await supabase
        .from('culto_producao_etapas').insert(rows).select().order('ordem');
      if (insErr) return res.status(500).json({ error: insErr.message });
      etapasSalvas = ins || [];
    }

    // recomputa os totais e grava (upsert PARCIAL) no satélite
    const totais = recomputarTotais(rows);
    const { error: upErr } = await supabase
      .from('culto_producao')
      .upsert({
        culto_id: cultoId,
        ...totais,
        preenchido_por: req.user?.id || null,
        preenchido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'culto_id' });
    if (upErr) return res.status(500).json({ error: upErr.message });

    painelCache.bust('');
    res.json({ ok: true, etapas: etapasSalvas, totais });
  } catch (e) {
    console.error('producao PUT etapas:', e.message);
    res.status(500).json({ error: 'Erro ao salvar as etapas do culto' });
  }
});

// ── Ocorrências (falhas técnicas / instabilidade) ────────────────────────────
router.post('/culto/:id/ocorrencias', authorizeModule('producao', 2), async (req, res) => {
  try {
    const cultoId = req.params.id;
    const { tipo, descricao, severidade, momento } = req.body || {};
    if (!TIPOS_OCORR.includes(tipo)) return res.status(400).json({ error: 'tipo inválido (técnica|estrutura)' });
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

    // Notificação imediata só pra ocorrência CRÍTICA · alerta o time de Produção
    if (data.severidade === 'critica') {
      try {
        const { data: culto } = await supabase
          .from('cultos').select('nome, data').eq('id', cultoId).maybeSingle();
        const ctx = culto ? `${culto.nome || 'culto'}${culto.data ? ` (${culto.data})` : ''}` : 'um culto';
        const labelTipo = data.tipo === 'tecnica' ? 'falha técnica' : 'instabilidade de estrutura';
        notificar({
          modulo: 'producao',
          tipo: 'producao_ocorrencia_critica',
          titulo: `⚠️ Ocorrência crítica · Produção`,
          mensagem: `${labelTipo} crítica em ${ctx}: ${data.descricao}`,
          link: '/producao',
          severidade: 'urgente',
          chaveDedup: `producao_ocorrencia_critica_${data.id}`,
          extraTargetIds: await responsaveisProducao(),
        }).catch(err => console.error('[PRODUCAO] notify ocorrencia:', err.message));
      } catch (err) {
        console.error('[PRODUCAO] notify ocorrencia (lookup):', err.message);
      }
    }

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
// Body: { marks: [{ item_id, feito, observação }] }
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

// ── Roteiro padrão (cronograma) por tipo de culto · aba admin nível 3 ─────────
// Define o "Previsto" de cada momento. service_type_id NULL = roteiro geral.
router.get('/roteiro-etapas', authorizeModule('producao', 1), async (req, res) => {
  const { data, error } = await supabase
    .from('producao_roteiro_etapas')
    .select('id, service_type_id, ordem, titulo, previsto_seg, secao, ativo')
    .order('service_type_id', { nullsFirst: true })
    .order('ordem');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/roteiro-etapas', authorizeModule('producao', 3), async (req, res) => {
  const { titulo, previsto_seg, service_type_id, ordem, secao } = req.body || {};
  if (!titulo || String(titulo).trim().length < 1) return res.status(400).json({ error: 'título obrigatório' });
  const { data, error } = await supabase
    .from('producao_roteiro_etapas')
    .insert({
      titulo: String(titulo).trim().slice(0, 200),
      previsto_seg: intSegOrNull(previsto_seg) ?? 0,
      service_type_id: service_type_id || null,
      ordem: Number.isFinite(Number(ordem)) ? Number(ordem) : 0,
      secao: SECOES.includes(secao) ? secao : 'culto',
      ativo: true,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.patch('/roteiro-etapas/:id', authorizeModule('producao', 3), async (req, res) => {
  const allowed = ['titulo', 'previsto_seg', 'service_type_id', 'ordem', 'secao', 'ativo'];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    if (k === 'previsto_seg') update[k] = intSegOrNull(v) ?? 0;
    else if (k === 'secao') update[k] = SECOES.includes(v) ? v : 'culto';
    else update[k] = v === '' ? null : v;
  }
  const { data, error } = await supabase
    .from('producao_roteiro_etapas').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/roteiro-etapas/:id', authorizeModule('producao', 3), async (req, res) => {
  // hard delete OK · template de config sem PII (não afeta etapas já lançadas)
  const { error } = await supabase
    .from('producao_roteiro_etapas').delete().eq('id', req.params.id);
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

    let prod = [], ocorr = [], marks = [], serviceTypes = [], etapas = [];
    if (ids.length > 0) {
      const r = await Promise.all([
        supabase.from('culto_producao').select('*').in('culto_id', ids),
        supabase.from('culto_producao_ocorrencias').select('*').in('culto_id', ids),
        supabase.from('culto_producao_checklist').select('culto_id, feito').in('culto_id', ids),
        supabase.from('vol_service_types').select('id, name, meta_duracao_min'),
        supabase.from('culto_producao_etapas').select('culto_id, titulo, previsto_seg, executado_seg, secao, tipo, categoria_especial').in('culto_id', ids),
      ]);
      prod = r[0].data || []; ocorr = r[1].data || []; marks = r[2].data || []; serviceTypes = r[3].data || []; etapas = r[4].data || [];
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

    // Previsto × executado (aderência ao roteiro)
    const comPrev = prod.filter(p => p.duracao_prevista_seg != null);
    const comAmbos = prod.filter(p =>
      p.duracao_segundos != null && p.duracao_prevista_seg != null && p.duracao_prevista_seg > 0);
    const desviosPct = comAmbos.map(p =>
      Math.abs(p.duracao_segundos - p.duracao_prevista_seg) / p.duracao_prevista_seg * 100);
    const mediaSeg = (arr, sel) => arr.length ? arr.reduce((a, x) => a + sel(x), 0) / arr.length : null;

    const totais = {
      cultos_no_periodo: cultos?.length || 0,
      cultos_preenchidos: prodComDur.length,
      pontualidade_pct: prodComDur.length ? Math.round((noHorario / prodComDur.length) * 100) : null,
      duracao_media_min: prodComDur.length
        ? Math.round(prodComDur.reduce((a, p) => a + p.duracao_minutos, 0) / prodComDur.length) : null,
      duracao_prevista_media_min: comPrev.length
        ? Math.round(mediaSeg(comPrev, p => p.duracao_prevista_seg) / 60) : null,
      // 100 − desvio médio absoluto (%) · quão fiel ao cronograma planejado
      aderencia_pct: comAmbos.length ? Math.max(0, Math.round(100 - mediaSeg(desviosPct, x => x))) : null,
      // desvio médio com sinal (seg) · positivo = estourou o previsto
      desvio_medio_seg: comAmbos.length
        ? Math.round(mediaSeg(comAmbos, p => p.duracao_segundos - p.duracao_prevista_seg)) : null,
      checklist_pct: marks.length ? Math.round((marcasFeitas / marks.length) * 100) : null,
      falhas_tecnicas: falhasTec,
      ocorrencias_estrutura: ocorrEstr,
    };

    // Detalhado por tipo de culto
    const porTipo = {};
    for (const c of cultos || []) {
      const key = c.service_type_name || 'Outros';
      if (!porTipo[key]) porTipo[key] = { tipo: key, cultos: 0, preenchidos: 0, no_horario: 0,
        soma_dur: 0, soma_prev_seg: 0, n_prev: 0, falhas: 0, estrutura: 0, marcas: 0, marcas_feitas: 0 };
      porTipo[key].cultos++;
    }
    for (const p of prodComDur) {
      const c = cultoById[p.culto_id]; if (!c) continue;
      const key = c.service_type_name || 'Outros';
      porTipo[key].preenchidos++;
      porTipo[key].soma_dur += p.duracao_minutos;
      if (p.duracao_minutos <= (metaByType[c.service_type_id] ?? 60)) porTipo[key].no_horario++;
    }
    for (const p of comPrev) {
      const c = cultoById[p.culto_id]; if (!c) continue;
      const key = c.service_type_name || 'Outros';
      if (!porTipo[key]) continue;
      porTipo[key].soma_prev_seg += p.duracao_prevista_seg;
      porTipo[key].n_prev++;
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
      duracao_prevista_media_min: t.n_prev ? Math.round(t.soma_prev_seg / t.n_prev / 60) : null,
      checklist_pct: t.marcas ? Math.round((t.marcas_feitas / t.marcas) * 100) : null,
      falhas_tecnicas: t.falhas,
      ocorrencias_estrutura: t.estrutura,
    })).sort((a, b) => b.cultos - a.cultos);

    // Estouro por etapa (momento) · onde o tempo mais foge do previsto.
    // Agrupa por título da etapa nos cultos do período (só etapas com executado).
    const porEtapaMap = {};
    for (const e of etapas) {
      const titulo = String(e.titulo || '').trim();
      if (!titulo || e.executado_seg == null) continue;
      if (!porEtapaMap[titulo]) porEtapaMap[titulo] = {
        titulo, secao: e.secao || 'culto', n: 0, soma_exec: 0,
        n_prev: 0, soma_prev: 0, n_ambos: 0, soma_desvio: 0, estouros: 0,
      };
      const g = porEtapaMap[titulo];
      g.n++; g.soma_exec += e.executado_seg;
      if (e.previsto_seg != null) {
        g.n_prev++; g.soma_prev += e.previsto_seg;
        g.n_ambos++; g.soma_desvio += (e.executado_seg - e.previsto_seg);
        if (e.executado_seg > e.previsto_seg) g.estouros++;
      }
    }
    const por_etapa = Object.values(porEtapaMap).map(g => ({
      titulo: g.titulo,
      secao: g.secao,
      ocorrencias: g.n,
      executado_medio_seg: Math.round(g.soma_exec / g.n),
      previsto_medio_seg: g.n_prev ? Math.round(g.soma_prev / g.n_prev) : null,
      desvio_medio_seg: g.n_ambos ? Math.round(g.soma_desvio / g.n_ambos) : null,
      estouro_pct: g.n_ambos ? Math.round((g.estouros / g.n_ambos) * 100) : null,
    })).sort((a, b) => (b.desvio_medio_seg ?? -1e9) - (a.desvio_medio_seg ?? -1e9));

    // Atividades especiais (ceia/batismo/apresentação/outros) · mapeia por que o
    // culto passa de 60. Conta quantos CULTOS tiveram especial + por categoria.
    const CAT_LABEL = { ceia: 'Ceia', batismo: 'Batismo', apresentacao_bebes: 'Apresentação de bebês', outros: 'Outros' };
    const espRows = etapas.filter(e => e.tipo === 'especial');
    const cultosComEspecial = new Set(espRows.map(e => e.culto_id));
    const cultosComRotina = new Set();
    const cultosComOutros = new Set();
    const catMap = {};
    for (const e of espRows) {
      const cat = CATEGORIAS_ESPECIAIS.includes(e.categoria_especial) ? e.categoria_especial : 'outros';
      if (CATEGORIAS_ROTINA.includes(cat)) cultosComRotina.add(e.culto_id); else cultosComOutros.add(e.culto_id);
      if (!catMap[cat]) catMap[cat] = { categoria: cat, label: CAT_LABEL[cat], ocorrencias: 0, soma_exec: 0, n_exec: 0 };
      catMap[cat].ocorrencias++;
      if (e.executado_seg != null) { catMap[cat].soma_exec += e.executado_seg; catMap[cat].n_exec++; }
    }
    const especiais = {
      cultos_no_periodo: cultos?.length || 0,
      cultos_com_especial: cultosComEspecial.size,
      cultos_rotina: cultosComRotina.size,
      cultos_outros: cultosComOutros.size,
      por_categoria: CATEGORIAS_ESPECIAIS.map(c => catMap[c]).filter(Boolean).map(g => ({
        categoria: g.categoria, label: g.label, ocorrencias: g.ocorrencias,
        rotina: CATEGORIAS_ROTINA.includes(g.categoria),
        duracao_media_seg: g.n_exec ? Math.round(g.soma_exec / g.n_exec) : null,
      })).sort((a, b) => b.ocorrencias - a.ocorrencias),
    };

    res.json({ periodo: { desde, ate }, totais, detalhado, por_etapa, especiais });
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
