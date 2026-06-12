// ============================================================================
// Devocionais (Gap 3) - tracking pessoal/familiar/grupo
// Alimenta KID-04 (famílias com devocionais) via mem_devocionais.
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais — lista paginada com filtros
// query: ?membro_id=&tipo=&desde=&ate=&page=&limit=
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { membro_id, tipo, desde, ate, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let q = supabase
      .from('mem_devocionais')
      .select('*, mem_membros(nome, foto_url)', { count: 'exact' })
      .order('data_devocional', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (membro_id) q = q.eq('membro_id', membro_id);
    if (tipo) q = q.eq('tipo', tipo);
    if (desde) q = q.gte('data_devocional', desde);
    if (ate) q = q.lte('data_devocional', ate);

    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data: data || [], total: count || 0 });
  } catch (e) {
    console.error('devocionais list:', e.message);
    res.status(500).json({ error: 'Erro ao listar devocionais' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais/membro/:id — histórico de um membro
// ─────────────────────────────────────────────────────────────
router.get('/membro/:id', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 90, 366);
    const { data, error } = await supabase
      .from('mem_devocionais')
      .select('*, devocional_itens(id, titulo, passagem)')
      .eq('membro_id', req.params.id)
      .order('data_devocional', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = data || [];

    // Sequência atual: dias consecutivos com check-in terminando hoje ou ontem
    const dias = new Set(rows.map(r => r.data_devocional));
    let streak = 0;
    const umDia = 86400000;
    let cursor = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    if (!dias.has(fmt(cursor))) cursor = new Date(cursor.getTime() - umDia);
    while (dias.has(fmt(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - umDia);
    }

    const { count: total } = await supabase
      .from('mem_devocionais')
      .select('id', { count: 'exact', head: true })
      .eq('membro_id', req.params.id);

    const inicioMes = new Date();
    inicioMes.setDate(1);
    const noMes = rows.filter(r => r.data_devocional >= fmt(inicioMes)).length;

    res.json({ data: rows, resumo: { total: total || 0, streak, no_mes: noMes } });
  } catch (e) {
    console.error('devocionais membro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar devocionais do membro' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais/kpis — arquitetura KPI/OKR do devocional
//   Resumo do mês + séries + KPIs DEV-* (matriz Investir) + KRs ligados.
// ─────────────────────────────────────────────────────────────
router.get('/kpis', async (req, res) => {
  try {
    const hoje = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const d30 = new Date(hoje.getTime() - 29 * 86400000);
    const m6 = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);

    // Check-ins dos últimos 6 meses (paginado · cap 1000 do PostgREST)
    const rows = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('mem_devocionais')
        .select('membro_id, data_devocional, tipo, mem_membros(familia_id)')
        .gte('data_devocional', fmt(m6))
        .order('data_devocional', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    const inicioMesStr = fmt(inicioMes);
    const d30Str = fmt(d30);

    const mesAtual = { checkins: 0, pessoas: new Set(), familias: new Set() };
    const porDia = {};
    const porMes = {};
    for (const r of rows) {
      const mes = r.data_devocional.slice(0, 7);
      porMes[mes] = porMes[mes] || { checkins: 0, pessoas: new Set() };
      porMes[mes].checkins++;
      if (r.membro_id) porMes[mes].pessoas.add(r.membro_id);
      if (r.data_devocional >= d30Str) {
        porDia[r.data_devocional] = (porDia[r.data_devocional] || 0) + 1;
      }
      if (r.data_devocional >= inicioMesStr) {
        mesAtual.checkins++;
        if (r.membro_id) mesAtual.pessoas.add(r.membro_id);
        if (r.tipo === 'familiar' && r.mem_membros?.familia_id) mesAtual.familias.add(r.mem_membros.familia_id);
      }
    }

    const serieDiaria = [];
    for (let i = 29; i >= 0; i--) {
      const d = fmt(new Date(hoje.getTime() - i * 86400000));
      serieDiaria.push({ data: d, checkins: porDia[d] || 0 });
    }
    const serieMensal = Object.keys(porMes).sort().map(m => ({
      mes: m, checkins: porMes[m].checkins, pessoas: porMes[m].pessoas.size,
    }));

    // KPIs da matriz (DEV-*) + status da view oficial
    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, periodicidade, meta_valor, valores, area, fonte_auto')
      .like('id', 'DEV-%')
      .eq('ativo', true);
    const ids = (kpis || []).map(k => k.id);
    let trajetoria = [];
    if (ids.length) {
      const { data: tr } = await supabase
        .from('vw_kpi_trajetoria_atual')
        .select('kpi_id, ultimo_valor, ultimo_periodo, status, percentual_meta')
        .in('kpi_id', ids);
      trajetoria = tr || [];
    }
    const trMap = new Map(trajetoria.map(t => [t.kpi_id, t]));

    // OKR: objetivo + KRs do devocional (medidos via fonte_kpi_id)
    const { data: objetivo } = await supabase
      .from('kpi_objetivos_gerais')
      .select('id, nome, meta_descricao')
      .eq('id', '576c04ec-88a2-40f3-6ba2-9d03fe65de96')
      .maybeSingle();
    const { data: krs } = await supabase
      .from('kpi_krs')
      .select('id, titulo, meta_valor, meta_texto, unidade, fonte_kpi_id, ativo, kr_pai_id')
      .eq('objetivo_geral_id', '576c04ec-88a2-40f3-6ba2-9d03fe65de96')
      .eq('ativo', true)
      .is('kr_pai_id', null);

    const diasNoMes = hoje.getDate();
    res.json({
      mes_atual: {
        checkins: mesAtual.checkins,
        pessoas: mesAtual.pessoas.size,
        familias: mesAtual.familias.size,
        media_dia: diasNoMes ? Math.round((mesAtual.checkins / diasNoMes) * 10) / 10 : 0,
      },
      serie_diaria: serieDiaria,
      serie_mensal: serieMensal,
      kpis: (kpis || []).map(k => ({ ...k, trajetoria: trMap.get(k.id) || null })),
      okr: {
        objetivo: objetivo || null,
        krs: (krs || []).map(k => {
          const t = k.fonte_kpi_id ? trMap.get(k.fonte_kpi_id) : null;
          return { ...k, realizado: t?.ultimo_valor ?? null, realizado_periodo: t?.ultimo_periodo ?? null, kr_status: t?.status ?? 'sem_dado' };
        }),
      },
    });
  } catch (e) {
    console.error('devocionais kpis:', e.message);
    res.status(500).json({ error: 'Erro ao calcular KPIs do devocional' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocionais/stats — agregados para dashboard
// query: ?desde=&ate=
// ─────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { desde, ate } = req.query;
    const hoje = new Date().toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const inicio = desde || d30;
    const fim = ate || hoje;

    const { data } = await supabase
      .from('mem_devocionais')
      .select('membro_id, tipo, mem_membros(familia_id)')
      .gte('data_devocional', inicio)
      .lte('data_devocional', fim);

    const rows = data || [];
    const familias = new Set();
    const membros = new Set();
    const porTipo = { pessoal: 0, familiar: 0, grupo: 0 };

    rows.forEach(r => {
      membros.add(r.membro_id);
      if (porTipo[r.tipo] !== undefined) porTipo[r.tipo]++;
      const fid = r.mem_membros?.familia_id;
      if (r.tipo === 'familiar' && fid) familias.add(fid);
    });

    res.json({
      periodo: { inicio, fim },
      total_registros: rows.length,
      familias_com_devocional_familiar: familias.size,
      membros_com_devocional: membros.size,
      por_tipo: porTipo,
    });
  } catch (e) {
    console.error('devocionais stats:', e.message);
    res.status(500).json({ error: 'Erro ao calcular stats' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/devocionais — registrar 1 devocional
// body: { membro_id, data_devocional?, tipo, topico?, observações? }
// ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { membro_id, data_devocional, tipo, topico, observacoes } = req.body || {};
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });
    if (!tipo || !['pessoal', 'familiar', 'grupo'].includes(tipo)) {
      return res.status(400).json({ error: "tipo deve ser 'pessoal', 'familiar' ou 'grupo'" });
    }

    const payload = {
      membro_id,
      data_devocional: data_devocional || new Date().toISOString().slice(0, 10),
      tipo,
      topico: topico || null,
      observacoes: observacoes || null,
      created_by: req.user?.id || null,
    };

    const { data, error } = await supabase
      .from('mem_devocionais')
      .insert(payload)
      .select()
      .single();

    if (error) {
      // 23505 = unique violation (mesmo membro+data+tipo)
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Devocional já registrado para esse membro/dia/tipo' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('devocionais create:', e.message);
    res.status(500).json({ error: 'Erro ao registrar devocional' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/devocionais/:id
// ─────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { tipo, topico, observacoes, concluida } = req.body || {};
    const patch = {};
    if (tipo !== undefined) {
      if (!['pessoal', 'familiar', 'grupo'].includes(tipo)) {
        return res.status(400).json({ error: 'tipo invalido' });
      }
      patch.tipo = tipo;
    }
    if (topico !== undefined) patch.topico = topico;
    if (observacoes !== undefined) patch.observacoes = observacoes;
    if (concluida !== undefined) patch.concluida = !!concluida;

    const { data, error } = await supabase
      .from('mem_devocionais')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('devocionais update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar devocional' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/devocionais/:id
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('mem_devocionais')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('devocionais delete:', e.message);
    res.status(500).json({ error: 'Erro ao deletar devocional' });
  }
});

module.exports = router;
