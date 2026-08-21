// ============================================================================
// /api/estrategia/* — Estrutura formal de OKR (Direcionador → Objetivo → KPI → KR)
//
// Substitui /api/okrs antigo. Centraliza:
//   - Direcionadores (UNIDADE, etc)
//   - Objetivos gerais (25 da planilha)
//   - KRs (gerais ligados a objetivo · especificos ligados a KPI)
// ============================================================================

const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const painelCache = require('../services/painelCache');

router.use(authenticate);

// Toda mutacao de OKR/KR/KPI invalida o cache do painel · usuário ve mudança
// no próximo refresh sem esperar TTL. Aplicado a TODAS as rotas POST/PUT/PATCH/DELETE
// deste router automaticamente.
router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) painelCache.bust('');
    });
  }
  next();
});

// ============================================================================
// DIRECIONADORES (read-only para todos · admin pode CRUD)
// ============================================================================
router.get('/direcionadores', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('direcionadores')
      .select('*')
      .eq('ativo', true)
      .order('ordem');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/direcionadores', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { nome, descricao, ordem } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    const { data, error } = await supabase
      .from('direcionadores')
      .insert({ nome, descricao, ordem: ordem || 99, ativo: true })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/direcionadores/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['nome', 'descricao', 'ordem', 'ativo'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) update[k] = v;
    const { data, error } = await supabase
      .from('direcionadores')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// OBJETIVOS GERAIS
// ============================================================================
router.get('/objetivos', async (req, res) => {
  try {
    const ativos = req.query.ativos !== 'false';
    let q = supabase
      .from('kpi_objetivos_gerais')
      .select('*, direcionador:direcionadores(id, nome)')
      .order('ordem');
    if (ativos) q = q.eq('ativo', true);

    const { data, error } = await q;
    if (error) throw error;

    // Para cada objetivo, contar KPIs e KRs vinculados
    if (data && data.length > 0) {
      const ids = data.map(o => o.id);
      const { data: kpis } = await supabase
        .from('kpi_indicadores_taticos')
        .select('id, area, objetivo_geral_id, ativo')
        .in('objetivo_geral_id', ids);
      const { data: krs } = await supabase
        .from('kpi_krs')
        .select('id, objetivo_geral_id, ativo')
        .in('objetivo_geral_id', ids);

      const kpisByObj = {};
      (kpis || []).forEach(k => {
        if (k.ativo) {
          kpisByObj[k.objetivo_geral_id] = (kpisByObj[k.objetivo_geral_id] || 0) + 1;
        }
      });
      const krsByObj = {};
      (krs || []).forEach(k => {
        if (k.ativo) {
          krsByObj[k.objetivo_geral_id] = (krsByObj[k.objetivo_geral_id] || 0) + 1;
        }
      });

      data.forEach(o => {
        o.total_kpis = kpisByObj[o.id] || 0;
        o.total_krs  = krsByObj[o.id] || 0;
      });
    }

    res.json(data || []);
  } catch (e) {
    console.error('estrategia/objetivos:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Anexa `realizado` aos KRs que têm fonte_kpi_id · vem do KPI tático que os mede
// (vw_kpi_trajetoria_atual · cobre KPIs manual + calculado). KR sem fonte = sem medição.
async function enriquecerKrs(krs) {
  const arr = krs || [];
  const fontes = [...new Set(arr.map(k => k.fonte_kpi_id).filter(Boolean))];
  const byKpi = {};
  const sentidoKpi = {};
  if (fontes.length) {
    const { data: vals } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, ultimo_valor, ultimo_periodo, status, percentual_meta')
      .in('kpi_id', fontes);
    (vals || []).forEach(v => { byKpi[v.kpi_id] = v; });
    // O SENTIDO da meta vive no KPI (menor-é-melhor existe: prazo, rotatividade).
    // Consulta isolada: se a coluna faltar num deploy antigo, o KR cai no default
    // "maior é melhor" em vez de derrubar a página inteira.
    const { data: kpisMeta } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, sentido_meta')
      .in('id', fontes);
    (kpisMeta || []).forEach(k => { sentidoKpi[k.id] = k.sentido_meta; });
  }
  // 1) KRs com fonte direta (específicos) puxam do KPI que os mede
  //
  // ⚠️ O FAROL é do KR, não do KPI. O valor vem do indicador, mas quem decide
  // verde/vermelho é a meta escrita NO KR — as duas divergem de verdade: o KR
  // "Valor total 2026 cresce >=15%" com 26,6% apurado aparecia VERMELHO porque
  // herdava o status do KPI (que tem meta própria), e o KR ">=60% dos ativos com
  // 3+ meses" aparecia VERDE com 56,9%. Farol invertido é pior que farol ausente:
  // a diretoria decide em cima dele.
  const enr = arr.map(k => {
    if (!k.fonte_kpi_id) return { ...k };
    const v = byKpi[k.fonte_kpi_id];
    const valor = v?.ultimo_valor != null ? Number(v.ultimo_valor) : null;
    const metaKr = k.meta_valor != null ? Number(k.meta_valor) : null;

    let kr_status = v?.status ?? 'sem_dado';
    let percentual_meta = v?.percentual_meta ?? null;

    if (valor != null && metaKr != null && metaKr !== 0) {
      // ⚠️ O vocabulário da coluna é `maior_melhor` / `menor_melhor` (conferido no
      // banco: 164 e 4 KPIs ativos). Comparar com 'menor' seco não casaria nunca,
      // e o KR de prazo/rotatividade ficaria verde justamente quando estourasse.
      const menorEhMelhor = String(sentidoKpi[k.fonte_kpi_id] || '').toLowerCase().startsWith('menor');
      const atingiu = menorEhMelhor ? valor <= metaKr : valor >= metaKr;
      const quase = menorEhMelhor ? valor <= metaKr * 1.1 : valor >= metaKr * 0.9;
      kr_status = atingiu ? 'verde' : (quase ? 'amarelo' : 'vermelho');
      percentual_meta = menorEhMelhor
        ? Math.round((metaKr / valor) * 1000) / 10
        : Math.round((valor / metaKr) * 1000) / 10;
    }

    return {
      ...k,
      realizado: v?.ultimo_valor ?? null,
      realizado_periodo: v?.ultimo_periodo ?? null,
      kr_status,
      percentual_meta,
    };
  });
  // 2) KR geral (sem fonte) agrega dos filhos medidos · avg p/ %, soma caso contrário
  const filhosPorPai = {};
  enr.forEach(k => { if (k.kr_pai_id && k.realizado != null) (filhosPorPai[k.kr_pai_id] ||= []).push(k.realizado); });
  return enr.map(k => {
    if (k.fonte_kpi_id || k.kr_pai_id) return k;
    const fs = filhosPorPai[k.id];
    if (!fs || !fs.length) return k;
    const isPct = k.unidade === '%';
    const val = isPct ? Math.round(fs.reduce((a, b) => a + b, 0) / fs.length) : fs.reduce((a, b) => a + b, 0);
    const atingido = k.meta_valor != null ? (val >= Number(k.meta_valor)) : null;
    return { ...k, realizado: val, kr_status: atingido == null ? 'sem_dado' : (atingido ? 'verde' : 'vermelho'), agregado_de: fs.length };
  });
}

router.get('/objetivos/:id', async (req, res) => {
  try {
    const { data: obj, error } = await supabase
      .from('kpi_objetivos_gerais')
      .select('*, direcionador:direcionadores(id, nome)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!obj) return res.status(404).json({ error: 'Objetivo não encontrado' });

    // KPIs vinculados
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, area, valores, periodicidade, meta_descricao, meta_valor, unidade, tipo_kpi, tipo_calculo, formula_config, is_okr, ativo')
      .eq('objetivo_geral_id', req.params.id)
      .eq('ativo', true)
      .order('area');

    // Último valor calculado de cada KPI (pra mostrar no desdobramento operacional)
    let valoresPorKpi = {};
    if ((kpis || []).length > 0) {
      const ids = kpis.map(k => k.id);
      const { data: valores } = await supabase
        .from('kpi_valores_calculados')
        .select('kpi_id, valor_calculado, periodo_referencia, calculado_em')
        .in('kpi_id', ids)
        .order('calculado_em', { ascending: false });
      (valores || []).forEach(v => {
        if (!valoresPorKpi[v.kpi_id]) valoresPorKpi[v.kpi_id] = v;
      });
    }
    const kpisComValor = (kpis || []).map(k => ({
      ...k,
      ultimo_valor: valoresPorKpi[k.id]?.valor_calculado ?? null,
      ultimo_periodo: valoresPorKpi[k.id]?.periodo_referencia ?? null,
    }));

    // KRs (gerais + especificos por área · ordenado: gerais primeiro, depois por área)
    const { data: krs } = await supabase
      .from('kpi_krs')
      .select('*')
      .eq('objetivo_geral_id', req.params.id)
      .eq('ativo', true)
      .order('ordem')
      .order('area', { nullsFirst: true });

    res.json({ ...obj, kpis: kpisComValor, krs: await enriquecerKrs(krs) });
  } catch (e) {
    console.error('estrategia/objetivos/:id', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/objetivos', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['nome', 'descricao', 'indicador_geral', 'valores', 'ordem', 'direcionador_id', 'ativo'];
    const payload = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) payload[k] = v;
    if (!payload.nome) return res.status(400).json({ error: 'Nome obrigatório' });
    payload.ativo = payload.ativo !== false;

    const { data, error } = await supabase
      .from('kpi_objetivos_gerais')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Já existe objetivo com esse nome' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/objetivos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = [
      'nome', 'descricao', 'indicador_geral', 'valores', 'ordem',
      'direcionador_id', 'ativo',
      // Metas (gerenciaveis em /gestao aba Metas)
      'meta_descricao', 'meta_valor', 'meta_valor_absoluto',
    ];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!allowed.includes(k)) continue;
      if (k === 'meta_valor' || k === 'meta_valor_absoluto') {
        update[k] = (v === '' || v == null) ? null : Number(v);
      } else {
        update[k] = v;
      }
    }

    const { data, error } = await supabase
      .from('kpi_objetivos_gerais')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[estrategia/objetivos PUT]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

router.delete('/objetivos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    // Soft delete: marcar inativo (preserva FKs)
    const { error } = await supabase
      .from('kpi_objetivos_gerais')
      .update({ ativo: false })
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// KRs (gerais ligados a objetivo · especificos ligados a KPI)
// ============================================================================

// GET /krs?objetivo_geral_id=xxx ou ?kpi_id=xxx
router.get('/krs', async (req, res) => {
  try {
    const { objetivo_geral_id, kpi_id } = req.query;
    let q = supabase.from('kpi_krs').select('*').eq('ativo', true).order('ordem');
    if (objetivo_geral_id) q = q.eq('objetivo_geral_id', objetivo_geral_id);
    if (kpi_id) q = q.eq('kpi_id', kpi_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(await enriquecerKrs(data));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/krs', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['objetivo_geral_id', 'kpi_id', 'titulo', 'descricao', 'formula_calculo', 'meta_valor', 'meta_texto', 'unidade', 'ordem'];
    const payload = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) payload[k] = v;
    if (!payload.titulo) return res.status(400).json({ error: 'Título obrigatório' });
    if (!payload.objetivo_geral_id && !payload.kpi_id) {
      return res.status(400).json({ error: 'KR deve estar ligado a um objetivo geral OU a um KPI' });
    }
    if (payload.objetivo_geral_id && payload.kpi_id) {
      return res.status(400).json({ error: 'KR não pode estar ligado a ambos (objetivo E KPI)' });
    }
    payload.ativo = true;

    const { data, error } = await supabase
      .from('kpi_krs')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/krs/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['titulo', 'descricao', 'formula_calculo', 'meta_valor', 'meta_texto', 'unidade', 'ordem', 'ativo'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) update[k] = v;

    const { data, error } = await supabase
      .from('kpi_krs')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/krs/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('kpi_krs')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// METAS INSTITUCIONAIS · 1 por (tipo_kpi, ano)
// ============================================================================
router.get('/metas-institucionais', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kpi_metas_institucionais')
      .select('*')
      .eq('ativo', true)
      .order('ano', { ascending: false })
      .order('tipo_kpi');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/metas-institucionais', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['tipo_kpi', 'ano', 'meta_descricao', 'meta_valor', 'unidade', 'observacoes'];
    const payload = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) payload[k] = v;
    if (!payload.tipo_kpi || !payload.ano || !payload.meta_descricao) {
      return res.status(400).json({ error: 'tipo_kpi, ano e meta_descricao obrigatórios' });
    }
    const { data, error } = await supabase
      .from('kpi_metas_institucionais')
      .upsert(payload, { onConflict: 'tipo_kpi,ano' })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/metas-institucionais/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['meta_descricao', 'meta_valor', 'unidade', 'observacoes', 'ativo'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) update[k] = v;

    const { data, error } = await supabase
      .from('kpi_metas_institucionais')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Lista OKRs agrupados por tipo (qual / quant) · pra UI da aba Metas Institucionais
router.get('/okrs-por-tipo', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kpi_objetivos_gerais')
      .select('id, nome, indicador_geral, tipo_okr, dado_tipo_principal, meta_descricao, meta_valor, meta_valor_absoluto, ordem')
      .eq('ativo', true)
      .order('tipo_okr')
      .order('ordem');
    if (error) throw error;
    // tipo_okr aceita vários buckets · agrupar dinamicamente em vez de
    // assumir apenas qualitativo/quantitativo/sem_tipo (tinha 'operacional'
    // gerando erro 'cannot read properties of undefined' antes).
    const agrupado = { qualitativo: [], quantitativo: [], sem_tipo: [] };
    (data || []).forEach(o => {
      const bucket = o.tipo_okr || 'sem_tipo';
      if (!agrupado[bucket]) agrupado[bucket] = [];
      agrupado[bucket].push(o);
    });
    res.json(agrupado);
  } catch (e) {
    console.error('[estrategia/okrs-por-tipo]', e?.message, e?.stack);
    res.status(500).json({ error: e?.message || 'Erro ao carregar OKRs por tipo' });
  }
});

// Forca recalculo das metas institucionais em todos KPIs (admin/diretor)
router.post('/metas-institucionais/aplicar', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { tipo } = req.body || {};
    const { data, error } = await supabase.rpc('aplicar_meta_institucional', { p_tipo: tipo || null });
    if (error) throw error;
    res.json({ ok: true, resultado: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atualizar tipo_okr de um OKR individual (caso heuristica tenha errado)
router.put('/objetivos/:id/tipo', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { tipo_okr } = req.body || {};
    if (!['qualitativo', 'quantitativo', null].includes(tipo_okr)) {
      return res.status(400).json({ error: 'tipo_okr deve ser qualitativo, quantitativo ou null' });
    }
    const { data, error } = await supabase
      .from('kpi_objetivos_gerais')
      .update({ tipo_okr })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atualizar dado_tipo_principal de um OKR
router.put('/objetivos/:id/dado-tipo-principal', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { dado_tipo_principal } = req.body || {};
    const { data, error } = await supabase
      .from('kpi_objetivos_gerais')
      .update({ dado_tipo_principal })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================================
// ÍNDICE DA BASE · topo 2 da fatia da presidência (2026-08-21 · fase 2A)
// ============================================================================
// ⚠️⚠️ LENTE VIVA (base ~1,7 mil membros ativos). A fatia da presidência
// (`src/lib/monitoramentoOkrEstrutura.js`) usa base FIXA de 3.000 definida pelo
// Pr. Juninho, com numeradores próprios. NUNCA misturar as duas num mesmo
// documento — é assim que uma reunião vira discussão sobre qual número é o
// certo (lei de 18/08).
//
// É AGREGAÇÃO DERIVADA: só fórmula (`fn_indice_engajamento_base`), nunca
// cadastro. Agregado cadastrável na mesma prateleira dos componentes é a
// contagem dupla que derrubou a camada dos 637 KRs.
router.get('/indice-base', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('fn_indice_engajamento_base');
    if (error) throw error;
    res.json(data || null);
  } catch (e) {
    console.error('[estrategia/indice-base]', e?.message);
    // ⚠️ Erro NÃO vira índice zerado: "a base não está engajada" e "a consulta
    // falhou" levam a decisões opostas.
    res.status(500).json({ error: e?.message || 'Erro ao calcular o índice da base' });
  }
});

// ============================================================================
// LINHAGEM do KPI tático · etiqueta de LEITURA (nsm | jornada | sistema)
// ============================================================================
const LINHAGENS = ['nsm', 'jornada', 'sistema'];

router.get('/linhagem/resumo', async (req, res) => {
  try {
    // ⚠️ Deploy em 2 etapas: pedir uma coluna que ainda não existe faz o
    // PostgREST recusar a query INTEIRA (42703), e este endpoint alimenta o
    // seletor de KPI do modal de KR — sem tolerância, quem abrisse a tela antes
    // da migration veria uma lista vazia e não conseguiria cadastrar nada
    // (lição do `parcelas_max`). Sem a coluna, tudo cai em 'sistema'.
    let temColuna = true;
    const COLS_BASE = 'id, indicador, area, valores, ativo';

    // Leitura paginada: a tabela tem ~170 ativos hoje, longe do cap de 1000,
    // mas contagem que a diretoria lê não pode truncar em silêncio se crescer.
    const linhas = [];
    let offset = 0;
    for (;;) {
      let { data, error } = await supabase
        .from('kpi_indicadores_taticos')
        .select(temColuna ? `${COLS_BASE}, linhagem` : COLS_BASE)
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('id')
        .range(offset, offset + 999);
      if (error && temColuna && /linhagem/i.test(error.message || '')) {
        temColuna = false;
        console.warn('[estrategia/linhagem] coluna ausente — migration 20260821150000 não aplicada?');
        ({ data, error } = await supabase
          .from('kpi_indicadores_taticos')
          .select(COLS_BASE)
          .eq('ativo', true)
          .is('deleted_at', null)
          .order('id')
          .range(offset, offset + 999));
      }
      if (error) throw error;
      if (!data?.length) break;
      linhas.push(...data.map(k => ({ ...k, linhagem: k.linhagem || 'sistema' })));
      if (data.length < 1000) break;
      offset += 1000;
    }
    const porLinhagem = { nsm: [], jornada: [], sistema: [] };
    linhas.forEach(k => { (porLinhagem[k.linhagem] || porLinhagem.sistema).push(k); });
    res.json({
      total: linhas.length,
      contagem: {
        nsm: porLinhagem.nsm.length,
        jornada: porLinhagem.jornada.length,
        sistema: porLinhagem.sistema.length,
      },
      kpis: linhas,
    });
  } catch (e) {
    console.error('[estrategia/linhagem/resumo]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

router.put('/linhagem/:kpiId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { linhagem } = req.body || {};
    if (!LINHAGENS.includes(linhagem)) {
      return res.status(400).json({ error: `linhagem deve ser ${LINHAGENS.join(' | ')}` });
    }
    const { data, error } = await supabase
      .from('kpi_indicadores_taticos')
      .update({ linhagem })
      .eq('id', req.params.kpiId)
      .select('id, indicador, linhagem')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[estrategia/linhagem PUT]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// ============================================================================
// OKRs DE CICLO · a camada que substitui os KRs (2026-08-21 · fase 2A)
// ============================================================================
// ⚠️ NÃO reusar `kpi_krs`: aquela camada foi desativada em 21/08 por ser metas
// permanentes de KPI escritas como frase. Aqui o KR é DELTA pactuado com dono
// e prazo, e MORRE no fim do ciclo.

// O progresso de um KR de ciclo é a FRAÇÃO DO DELTA percorrida, não valor/alvo.
// ⚠️ `valor / alvo` (o jeito do KR antigo) ignora de onde a coisa partiu: sair
// de 40% para 45% com alvo 50% viraria "90% atingido" quando o percorrido é
// metade. E funciona igual em menor-é-melhor, porque numerador e denominador
// trocam de sinal juntos (baseline 10 · alvo 5 · valor 7 ⇒ 0,6).
function progressoDelta(baseline, alvo, valor) {
  if (baseline == null || alvo == null || valor == null) return null;
  const b = Number(baseline), a = Number(alvo), v = Number(valor);
  if (!Number.isFinite(b) || !Number.isFinite(a) || !Number.isFinite(v)) return null;
  if (a === b) return null; // delta zero não é KR
  const frac = (v - b) / (a - b);
  return Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10;
}

async function enriquecerCicloKrs(krs) {
  const arr = krs || [];
  if (!arr.length) return [];
  const kpiIds = [...new Set(arr.map(k => k.kpi_id).filter(Boolean))];
  const donoIds = [...new Set(arr.map(k => k.dono_id).filter(Boolean))];

  const byKpi = {};
  const byDono = {};

  // Blocos ISOLADOS e best-effort: KR sem valor apurado ainda é KR válido, e
  // uma falha ao resolver o NOME do dono não pode esvaziar a lista do ciclo.
  if (kpiIds.length) {
    try {
      const { data } = await supabase
        .from('vw_kpi_trajetoria_atual')
        .select('kpi_id, ultimo_valor, ultimo_periodo')
        .in('kpi_id', kpiIds);
      (data || []).forEach(v => { byKpi[v.kpi_id] = v; });
    } catch (e) { console.warn('[ciclo/krs] trajetoria:', e?.message); }
  }
  if (donoIds.length) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', donoIds);
      (data || []).forEach(p => { byDono[p.id] = p.name; });
    } catch (e) { console.warn('[ciclo/krs] donos:', e?.message); }
  }

  return arr.map(k => {
    const v = byKpi[k.kpi_id];
    const valor = v?.ultimo_valor != null ? Number(v.ultimo_valor) : null;
    const progresso = progressoDelta(k.baseline, k.alvo, valor);

    // ⚠️ O farol usa a `direcao` DA PRÓPRIA LINHA, não o `sentido_meta` do KPI:
    // aqui a direção foi pactuada no KR. E "sem valor" é `sem_dado`, nunca
    // vermelho — ausência de medição não é desempenho ruim.
    let farol = 'sem_dado';
    if (progresso != null) {
      farol = progresso >= 100 ? 'verde' : (progresso >= 70 ? 'amarelo' : 'vermelho');
    }

    return {
      ...k,
      dono_nome: k.dono_id ? (byDono[k.dono_id] || null) : null,
      realizado: v?.ultimo_valor ?? null,
      realizado_periodo: v?.ultimo_periodo ?? null,
      progresso_pct: progresso,
      farol,
    };
  });
}

// GET /ciclos · lista (mais recente primeiro)
router.get('/ciclos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('okr_ciclos')
      .select('*')
      .order('inicio', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[estrategia/ciclos]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// GET /ciclos/vigente · o ciclo ABERTO com os KRs enriquecidos
// ⚠️ Devolve `{ ciclo: null, krs: [] }` quando não há ciclo aberto — estado
// legítimo (entre trimestres), não erro.
router.get('/ciclos/vigente', async (req, res) => {
  try {
    const { data: ciclo, error } = await supabase
      .from('okr_ciclos')
      .select('*')
      .eq('status', 'aberto')
      .maybeSingle();
    if (error) throw error;
    if (!ciclo) return res.json({ ciclo: null, krs: [] });

    const { data: krs, error: eKr } = await supabase
      .from('okr_ciclo_krs')
      .select('*')
      .eq('ciclo_id', ciclo.id)
      .order('ordem');
    if (eKr) throw eKr;

    res.json({ ciclo, krs: await enriquecerCicloKrs(krs) });
  } catch (e) {
    console.error('[estrategia/ciclos/vigente]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// GET /ciclos/:id · um ciclo específico (histórico) com KRs
// ⚠️ Guarda de UUID em vez de confiar na ordem de declaração: rota literal
// acrescentada DEPOIS desta (`/ciclos/relatorio`, por exemplo) passa a ser
// alcançada sozinha. É o conserto de raiz do caso `/propostas/avaliar`, que
// caía aqui com `id='avaliar'` e devolvia 400 do PostgREST (22P02).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.get('/ciclos/:id', async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try {
    const { data: ciclo, error } = await supabase
      .from('okr_ciclos').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    const { data: krs } = await supabase
      .from('okr_ciclo_krs').select('*').eq('ciclo_id', ciclo.id).order('ordem');
    res.json({ ciclo, krs: await enriquecerCicloKrs(krs) });
  } catch (e) {
    console.error('[estrategia/ciclos/:id]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// POST /ciclos · abre ciclo novo
router.post('/ciclos', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { nome, inicio, fim, observacoes } = req.body || {};
    if (!nome || !inicio || !fim) {
      return res.status(400).json({ error: 'nome, inicio e fim são obrigatórios' });
    }
    if (String(fim) < String(inicio)) {
      return res.status(400).json({ error: 'fim não pode ser antes do início' });
    }

    // ⚠️ FECHA o ciclo aberto ANTES de inserir. O índice único é PARCIAL
    // (`WHERE status = 'aberto'`), então `ON CONFLICT` não infere (lei de
    // 04/08) — sem este UPDATE o INSERT estouraria 23505 e a tela veria só
    // "erro ao salvar".
    const { data: fechados, error: eFechar } = await supabase
      .from('okr_ciclos')
      .update({ status: 'fechado' })
      .eq('status', 'aberto')
      .select('id, nome');
    if (eFechar) throw eFechar;

    const { data, error } = await supabase
      .from('okr_ciclos')
      .insert({
        nome: String(nome).trim(),
        inicio,
        fim,
        observacoes: observacoes || null,
        status: 'aberto',
        criado_por: req.user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    // Declara o que foi fechado de tabela: abrir um ciclo encerra o anterior, e
    // quem clicou precisa saber disso sem ir conferir.
    res.status(201).json({ ...data, fechados: fechados || [] });
  } catch (e) {
    console.error('[estrategia/ciclos POST]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

router.patch('/ciclos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['nome', 'inicio', 'fim', 'status', 'observacoes'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) if (allowed.includes(k)) update[k] = v;
    if (update.status && !['aberto', 'fechado'].includes(update.status)) {
      return res.status(400).json({ error: 'status deve ser aberto ou fechado' });
    }
    // Reabrir exige que não haja outro aberto (o índice parcial recusaria com
    // 23505 · devolver o motivo em português é melhor que repassar o erro cru).
    if (update.status === 'aberto') {
      const { data: aberto } = await supabase
        .from('okr_ciclos').select('id, nome').eq('status', 'aberto').neq('id', req.params.id).maybeSingle();
      if (aberto) {
        return res.status(409).json({
          error: `O ciclo "${aberto.nome}" está aberto. Feche-o antes de reabrir este.`,
        });
      }
    }
    const { data, error } = await supabase
      .from('okr_ciclos').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[estrategia/ciclos PATCH]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// POST /ciclos/:id/krs · cria KR de ciclo
router.post('/ciclos/:id/krs', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['objetivo_texto', 'kpi_id', 'dono_id', 'baseline', 'alvo',
                     'unidade', 'direcao', 'ordem'];
    const payload = { ciclo_id: req.params.id };
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!allowed.includes(k)) continue;
      if (k === 'baseline' || k === 'alvo') payload[k] = (v === '' || v == null) ? null : Number(v);
      else payload[k] = (v === '' ? null : v);
    }
    if (!payload.objetivo_texto) {
      return res.status(400).json({ error: 'objetivo_texto é obrigatório' });
    }
    // ⚠️ Os 3 filtros de cadastro combinados em 21/08 — é o que impede a volta
    // dos 637: (1) delta com prazo, (2) dono que pactuou, (3) KPI que responde.
    if (payload.baseline == null || payload.alvo == null) {
      return res.status(400).json({
        error: 'KR de ciclo precisa de baseline e alvo — é um delta ("de X para Y"), não uma frase de meta.',
      });
    }
    if (Number(payload.baseline) === Number(payload.alvo)) {
      return res.status(400).json({ error: 'baseline e alvo iguais: delta zero não é um resultado-chave.' });
    }
    if (!payload.kpi_id) {
      return res.status(400).json({
        error: 'KR de ciclo precisa do KPI que o mede — sem fonte, ninguém consegue dizer se foi atingido.',
      });
    }
    if (!payload.dono_id) {
      return res.status(400).json({ error: 'KR de ciclo precisa de dono — meta sem quem pactuou é a meta cascateada de novo.' });
    }

    const { data, error } = await supabase
      .from('okr_ciclo_krs').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json((await enriquecerCicloKrs([data]))[0]);
  } catch (e) {
    console.error('[estrategia/ciclo krs POST]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

router.patch('/ciclo-krs/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const allowed = ['objetivo_texto', 'kpi_id', 'dono_id', 'baseline', 'alvo',
                     'unidade', 'direcao', 'status', 'nota_final', 'aprendizado', 'ordem'];
    const update = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!allowed.includes(k)) continue;
      if (['baseline', 'alvo', 'nota_final'].includes(k)) update[k] = (v === '' || v == null) ? null : Number(v);
      else update[k] = (v === '' ? null : v);
    }
    const { data, error } = await supabase
      .from('okr_ciclo_krs').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json((await enriquecerCicloKrs([data]))[0]);
  } catch (e) {
    console.error('[estrategia/ciclo-krs PATCH]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// DELETE · só para linha criada por engano. O caminho NORMAL de encerrar um KR
// que não vai acontecer é `status='abandonado'` (preserva o aprendizado do
// ciclo), e é isso que a tela oferece primeiro.
router.delete('/ciclo-krs/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('okr_ciclo_krs').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('[estrategia/ciclo-krs DELETE]', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

module.exports = router;
