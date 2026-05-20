// ============================================================================
// /api/dashboard-semanal/* · módulo de apresentação semanal pra diretoria
//
// Endpoints:
//   GET  /semanal?ano=&semana=&culto=         · dados da semana selecionada
//   GET  /mensal?ano[]=&meses[]=&culto=       · comparativo ano-a-ano por mês
//   GET  /semanas-disponiveis?ano=            · lista (ano, semana, label, range)
//   GET  /cultos                              · lista service_types ativos
//   GET  /metas                               · metas salvas
//   POST /metas                               · cria meta
//   PUT  /metas/:id                           · atualiza meta
//   DELETE /metas/:id                         · remove meta
//   POST /ia/sugerir-indicador                · gera sugestão de indicador via IA
//   GET  /indicadores-custom                  · lista indicadores customizados
//   PATCH /indicadores-custom/:id             · atualiza status (rascunho/ativo)
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const Anthropic = require('@anthropic-ai/sdk');

router.use(authenticate);

const CAPACIDADE_TEMPLO = 1200;

const INDICADORES = {
  frequencia:        { coluna: 'frequencia',        rotulo: 'Frequência',        usa_ocupacao: true },
  frequencia_kids:   { coluna: 'frequencia_kids',   rotulo: 'Frequência Kids',   usa_ocupacao: false },
  aceitacoes:        { coluna: 'aceitacoes',        rotulo: 'Aceitações',        usa_ocupacao: false },
  aceitacoes_online: { coluna: 'aceitacoes_online', rotulo: 'Aceitações Online', usa_ocupacao: false },
  ao_vivo:           { coluna: 'ao_vivo',           rotulo: 'Ao vivo',           usa_ocupacao: false },
  online_ds:         { coluna: 'online_ds',         rotulo: 'Online DS',         usa_ocupacao: false },
  online_ddus:       { coluna: 'online_ddus',       rotulo: 'Online DDUS',       usa_ocupacao: false },
  voluntariado:      { coluna: 'voluntariado',      rotulo: 'Voluntariado',      usa_ocupacao: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de data ISO (week)
// ─────────────────────────────────────────────────────────────────────────────
function isoWeekRange(ano, semana) {
  // Quinta da semana ISO determina o ano ISO · usar 4 de jan e ajustar
  const simple = new Date(Date.UTC(ano, 0, 4));
  const dow = simple.getUTCDay() || 7; // 1..7, segunda=1
  const isoWeek1Mon = new Date(simple);
  isoWeek1Mon.setUTCDate(simple.getUTCDate() - dow + 1);
  const inicio = new Date(isoWeek1Mon);
  inicio.setUTCDate(isoWeek1Mon.getUTCDate() + (semana - 1) * 7);
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 6);
  return { inicio, fim };
}

function fmtDateBr(d) {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { ano: d.getUTCFullYear(), semana: week };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /cultos · lista service_types ativos
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cultos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_service_types')
      .select('id, name, recurrence_day, recurrence_time, color')
      .eq('is_active', true)
      .order('recurrence_day', { ascending: true })
      .order('recurrence_time', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[DASH-SEM] cultos', e.message);
    res.status(500).json({ error: 'Erro ao listar cultos' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /semanas-disponiveis?ano=2026 · lista todas as semanas com dados
// ─────────────────────────────────────────────────────────────────────────────
router.get('/semanas-disponiveis', async (req, res) => {
  try {
    const ano = parseInt(req.query.ano, 10) || new Date().getUTCFullYear();
    const { data, error } = await supabase
      .from('vw_dashboard_semanal')
      .select('ano_iso, semana_iso')
      .eq('ano_iso', ano);
    if (error) throw error;

    const setKey = new Set();
    for (const r of (data || [])) setKey.add(`${r.ano_iso}-${r.semana_iso}`);
    const semanas = [];
    for (const k of setKey) {
      const [a, s] = k.split('-').map(Number);
      const { inicio, fim } = isoWeekRange(a, s);
      semanas.push({
        ano: a,
        semana: s,
        label: `Sem ${s} · ${fmtDateBr(inicio)} a ${fmtDateBr(fim)}`,
        inicio: inicio.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
      });
    }
    semanas.sort((a, b) => b.semana - a.semana);
    res.json(semanas);
  } catch (e) {
    console.error('[DASH-SEM] semanas', e.message);
    res.status(500).json({ error: 'Erro ao listar semanas' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /semanal · dados da semana selecionada
//   query: ano, semana, indicador (default frequencia), culto (uuid opcional)
//
// Resposta:
//   {
//     ano, semana, inicio, fim, indicador, rotulo,
//     items: [{ service_type_id, nome, cor, valor_absoluto, media, taxa_ocupacao }],
//     resumo: { total, media_geral, variacao_pct, taxa_ocupacao_geral },
//     meta: { meta_valor, indicador } | null
//   }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/semanal', async (req, res) => {
  try {
    const ano = parseInt(req.query.ano, 10);
    const semana = parseInt(req.query.semana, 10);
    const indicadorKey = req.query.indicador || 'frequencia';
    const cultoId = req.query.culto && req.query.culto !== 'todos' ? req.query.culto : null;

    if (!ano || !semana) return res.status(400).json({ error: 'ano e semana são obrigatórios' });
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });

    // Linhas da semana selecionada
    let q = supabase
      .from('vw_dashboard_semanal')
      .select(`service_type_id, service_type_name, service_type_color, recurrence_day, recurrence_time,
               ${indDef.coluna}, total_presencial, total_cultos`)
      .eq('ano_iso', ano)
      .eq('semana_iso', semana);
    if (cultoId) q = q.eq('service_type_id', cultoId);
    const { data: semanaData, error } = await q;
    if (error) throw error;

    // Média histórica · últimos 52 semanas anteriores à atual por service_type
    const { inicio: inicioAtual } = isoWeekRange(ano, semana);
    const inicioJanela = new Date(inicioAtual);
    inicioJanela.setUTCDate(inicioJanela.getUTCDate() - 52 * 7);

    // Pega janela ampla e filtra "anterior à semana atual" em JS pra simplificar
    // Volume é trivial (1 linha por (ano, semana, tipo) · ~1000 rows em 5 anos)
    let qHist = supabase
      .from('vw_dashboard_semanal')
      .select(`service_type_id, ${indDef.coluna}, ano_iso, semana_iso`)
      .gte('ano_iso', ano - 1)
      .lte('ano_iso', ano);
    if (cultoId) qHist = qHist.eq('service_type_id', cultoId);
    const { data: histDataRaw, error: errHist } = await qHist;
    if (errHist) throw errHist;
    const histData = (histDataRaw || []).filter(r => {
      if (r.ano_iso < ano) return true;
      return r.ano_iso === ano && r.semana_iso < semana;
    });

    // Agrupa histórico por service_type
    const histPorTipo = new Map();
    for (const r of (histData || [])) {
      const arr = histPorTipo.get(r.service_type_id) || [];
      arr.push(Number(r[indDef.coluna]) || 0);
      histPorTipo.set(r.service_type_id, arr);
    }

    const items = (semanaData || []).map(r => {
      const valores = histPorTipo.get(r.service_type_id) || [];
      const media = valores.length
        ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length)
        : 0;
      const valor_absoluto = Number(r[indDef.coluna]) || 0;
      return {
        service_type_id: r.service_type_id,
        nome: r.service_type_name,
        cor: r.service_type_color,
        recurrence_day: r.recurrence_day,
        recurrence_time: r.recurrence_time,
        valor_absoluto,
        media,
        total_presencial: r.total_presencial,
        taxa_ocupacao: indDef.usa_ocupacao && valor_absoluto > 0
          ? Math.round((valor_absoluto / CAPACIDADE_TEMPLO) * 1000) / 10
          : null,
      };
    });

    items.sort((a, b) => {
      const da = a.recurrence_day ?? 99;
      const db = b.recurrence_day ?? 99;
      if (da !== db) return da - db;
      return (a.recurrence_time || '').localeCompare(b.recurrence_time || '');
    });

    const total = items.reduce((s, i) => s + i.valor_absoluto, 0);
    const sumMedias = items.reduce((s, i) => s + i.media, 0);
    const mediaGeral = items.length ? Math.round(sumMedias / items.length) : 0;
    const variacao_pct = mediaGeral > 0 ? Math.round(((total - mediaGeral) / mediaGeral) * 100) : 0;
    const totalPresencial = items.reduce((s, i) => s + (i.total_presencial || 0), 0);
    const taxa_ocupacao_geral = indDef.usa_ocupacao
      ? Math.round((total / CAPACIDADE_TEMPLO) * 1000) / 10
      : Math.round((totalPresencial / CAPACIDADE_TEMPLO) * 1000) / 10;

    // Meta semanal salva
    const { data: meta } = await supabase
      .from('dashboard_metas')
      .select('id, meta_valor, rotulo')
      .eq('indicador', indicadorKey)
      .eq('periodicidade', 'semanal')
      .eq('ativa', true)
      .maybeSingle();

    const { inicio, fim } = isoWeekRange(ano, semana);

    res.json({
      ano,
      semana,
      inicio: inicio.toISOString().slice(0, 10),
      fim: fim.toISOString().slice(0, 10),
      indicador: indicadorKey,
      rotulo: indDef.rotulo,
      capacidade_templo: CAPACIDADE_TEMPLO,
      items,
      resumo: {
        total,
        media_geral: mediaGeral,
        variacao_pct,
        taxa_ocupacao_geral,
      },
      meta: meta ? { id: meta.id, meta_valor: Number(meta.meta_valor), rotulo: meta.rotulo } : null,
    });
  } catch (e) {
    console.error('[DASH-SEM] semanal', e.message, e);
    res.status(500).json({ error: 'Erro ao montar dashboard semanal' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mensal · comparativo ano-a-ano por mês
//   query: anos (csv, default 3 anos), indicador, culto, meses (csv opcional)
//
// Resposta:
//   {
//     indicador, rotulo, anos: [...],
//     series: [{ mes: 1, mes_nome: 'janeiro', '2024': X, '2025': Y, '2026': Z }, ...]
//   }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/mensal', async (req, res) => {
  try {
    const indicadorKey = req.query.indicador || 'aceitacoes';
    const cultoId = req.query.culto && req.query.culto !== 'todos' ? req.query.culto : null;
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });

    const anoAtual = new Date().getUTCFullYear();
    const anos = req.query.anos
      ? String(req.query.anos).split(',').map(Number).filter(Number.isInteger)
      : [anoAtual - 2, anoAtual - 1, anoAtual];

    const meses = req.query.meses
      ? String(req.query.meses).split(',').map(Number).filter(n => n >= 1 && n <= 12)
      : null;

    let q = supabase
      .from('vw_dashboard_semanal')
      .select(`ano_calendario, mes, service_type_id, ${indDef.coluna}`)
      .in('ano_calendario', anos);
    if (cultoId) q = q.eq('service_type_id', cultoId);
    const { data, error } = await q;
    if (error) throw error;

    const filtered = meses ? (data || []).filter(r => meses.includes(r.mes)) : (data || []);

    const acc = new Map();
    for (const r of filtered) {
      const key = `${r.mes}-${r.ano_calendario}`;
      acc.set(key, (acc.get(key) || 0) + (Number(r[indDef.coluna]) || 0));
    }

    const MES_NOMES = ['janeiro','fevereiro','março','abril','maio','junho',
                       'julho','agosto','setembro','outubro','novembro','dezembro'];
    const mesesUsados = meses || [1,2,3,4,5,6,7,8,9,10,11,12];
    const series = mesesUsados.map(m => {
      const row = { mes: m, mes_nome: MES_NOMES[m - 1] };
      for (const a of anos) row[String(a)] = acc.get(`${m}-${a}`) || 0;
      return row;
    });

    res.json({
      indicador: indicadorKey,
      rotulo: indDef.rotulo,
      anos,
      series,
    });
  } catch (e) {
    console.error('[DASH-SEM] mensal', e.message);
    res.status(500).json({ error: 'Erro ao montar dashboard mensal' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /metas/sugerir · calcula meta sugerida com base em histórico
//   query: indicador, base (mes_anterior | trimestre_anterior | ano_anterior | mesmo_mes_ano_anterior)
//          periodicidade (semanal | mensal · default semanal)
//          culto (uuid opcional)
//
// Retorna: { sugestao, base_label, periodo_referencia, valores_amostra }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/metas/sugerir', async (req, res) => {
  try {
    const indicadorKey = req.query.indicador;
    const base = req.query.base || 'mes_anterior';
    const periodicidade = req.query.periodicidade || 'semanal';
    const cultoId = req.query.culto && req.query.culto !== 'todos' ? req.query.culto : null;
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });

    const hoje = new Date();
    let inicio, fim, baseLabel;

    if (base === 'mes_anterior') {
      const mesAtual = hoje.getUTCMonth();
      const anoAtual = hoje.getUTCFullYear();
      const inicioMesAnt = new Date(Date.UTC(anoAtual, mesAtual - 1, 1));
      const fimMesAnt = new Date(Date.UTC(anoAtual, mesAtual, 0)); // último dia mês anterior
      inicio = inicioMesAnt;
      fim = fimMesAnt;
      baseLabel = `mês anterior (${formatMesAno(inicioMesAnt)})`;
    } else if (base === 'trimestre_anterior') {
      const inicioTri = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 3, 1));
      const fimTri = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 0));
      inicio = inicioTri;
      fim = fimTri;
      baseLabel = 'últimos 3 meses';
    } else if (base === 'ano_anterior') {
      const inicioAno = new Date(Date.UTC(hoje.getUTCFullYear() - 1, 0, 1));
      const fimAno = new Date(Date.UTC(hoje.getUTCFullYear() - 1, 11, 31));
      inicio = inicioAno;
      fim = fimAno;
      baseLabel = `ano anterior (${hoje.getUTCFullYear() - 1})`;
    } else if (base === 'mesmo_mes_ano_anterior') {
      const inicioMes = new Date(Date.UTC(hoje.getUTCFullYear() - 1, hoje.getUTCMonth(), 1));
      const fimMes = new Date(Date.UTC(hoje.getUTCFullYear() - 1, hoje.getUTCMonth() + 1, 0));
      inicio = inicioMes;
      fim = fimMes;
      baseLabel = `mesmo mês ano passado (${formatMesAno(inicioMes)})`;
    } else {
      return res.status(400).json({ error: 'base inválida' });
    }

    // Pega dados brutos da tabela cultos no período
    let q = supabase
      .from('cultos')
      .select(`data, service_type_id, ${colunaCrua(indicadorKey)}`)
      .gte('data', inicio.toISOString().slice(0, 10))
      .lte('data', fim.toISOString().slice(0, 10));
    if (cultoId) q = q.eq('service_type_id', cultoId);

    const { data, error } = await q;
    if (error) throw error;

    // Agrupa por (semana ISO) ou (mês) e soma
    const grupos = new Map();
    for (const row of (data || [])) {
      const d = new Date(row.data + 'T12:00:00Z');
      let key;
      if (periodicidade === 'semanal') {
        const w = isoWeekOfDate(d);
        key = `${w.ano}-W${w.semana}`;
      } else if (periodicidade === 'mensal') {
        key = `${d.getUTCFullYear()}-M${d.getUTCMonth() + 1}`;
      } else {
        key = String(d.getUTCFullYear());
      }
      const valor = Number(row[colunaCrua(indicadorKey)]) || 0;
      grupos.set(key, (grupos.get(key) || 0) + valor);
    }

    const valores = Array.from(grupos.values()).filter(v => v > 0);
    if (valores.length === 0) {
      return res.json({
        sugestao: 0,
        base_label: baseLabel,
        periodo_referencia: `${inicio.toISOString().slice(0, 10)} a ${fim.toISOString().slice(0, 10)}`,
        amostra: 0,
        valores_amostra: [],
        aviso: 'Sem dados preenchidos no período. Verifique os cultos.',
      });
    }

    const media = valores.reduce((s, v) => s + v, 0) / valores.length;
    const sugestao = Math.round(media);

    res.json({
      sugestao,
      base_label: baseLabel,
      periodo_referencia: `${inicio.toISOString().slice(0, 10)} a ${fim.toISOString().slice(0, 10)}`,
      amostra: valores.length,
      valores_amostra: valores.slice(0, 8),
      media_exata: Math.round(media * 100) / 100,
    });
  } catch (e) {
    console.error('[DASH-SEM] meta sugerir', e.message, e);
    res.status(500).json({ error: 'Erro ao calcular sugestão' });
  }
});

function colunaCrua(indKey) {
  // Mapeia indicador (slug do dashboard) pra coluna real em cultos
  const map = {
    frequencia:        'presencial_adulto',
    frequencia_kids:   'presencial_kids',
    aceitacoes:        'decisoes_presenciais',
    aceitacoes_online: 'decisoes_online',
    ao_vivo:           'online_pico',
    online_ds:         'online_ds',
    online_ddus:       'online_ddus',
    voluntariado:      'voluntarios',
  };
  return map[indKey] || indKey;
}

function isoWeekOfDate(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { ano: d.getUTCFullYear(), semana: week };
}

function formatMesAno(d) {
  const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// METAS · CRUD
// ─────────────────────────────────────────────────────────────────────────────
router.get('/metas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dashboard_metas')
      .select('*')
      .order('indicador', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[DASH-SEM] metas list', e.message);
    res.status(500).json({ error: 'Erro ao listar metas' });
  }
});

router.post('/metas', async (req, res) => {
  try {
    const { indicador, rotulo, meta_valor, periodicidade, service_type_id, cor, tipo_grafico } = req.body || {};
    if (!indicador || !rotulo || !meta_valor) {
      return res.status(400).json({ error: 'indicador, rotulo e meta_valor são obrigatórios' });
    }
    const payload = {
      indicador, rotulo,
      meta_valor: Number(meta_valor),
      periodicidade: periodicidade || 'semanal',
      service_type_id: service_type_id || null,
      cor: cor || null,
      tipo_grafico: tipo_grafico || 'barra',
      criado_por: req.user?.userId || null,
    };
    const { data, error } = await supabase
      .from('dashboard_metas')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[DASH-SEM] meta create', e.message);
    res.status(500).json({ error: 'Erro ao criar meta' });
  }
});

router.put('/metas/:id', async (req, res) => {
  try {
    const allowed = ['indicador','rotulo','meta_valor','periodicidade','service_type_id','cor','ativa','tipo_grafico'];
    const payload = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (req.body[k] !== undefined) payload[k] = req.body[k];
    if (payload.meta_valor !== undefined) payload.meta_valor = Number(payload.meta_valor);

    const { data, error } = await supabase
      .from('dashboard_metas')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[DASH-SEM] meta update', e.message);
    res.status(500).json({ error: 'Erro ao atualizar meta' });
  }
});

router.delete('/metas/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('dashboard_metas')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[DASH-SEM] meta delete', e.message);
    res.status(500).json({ error: 'Erro ao remover meta' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IA · sugerir indicador customizado
//
// Marcos digita o que quer medir · Claude retorna estrutura sugerida (nome,
// fórmula, tipo de gráfico, métricas relacionadas). Salva como rascunho.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/ia/sugerir-indicador', async (req, res) => {
  try {
    const pergunta = (req.body?.pergunta || '').trim();
    if (!pergunta) return res.status(400).json({ error: 'pergunta é obrigatória' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada' });
    }

    const client = new Anthropic();

    // Catálogo de dados disponíveis para a IA usar como referência
    const dadosDisponiveis = `
Tabelas principais do CBRio com dados de cultos:
- cultos: data, service_type_id, presencial_adulto, presencial_kids,
  decisoes_presenciais, decisoes_online, decisoes_kids, online_pico,
  online_ds, online_ddus, voluntarios
- vol_service_types: tipos de culto (Domingo 08:30, 10:00, 11:30, 19:00,
  Quarta com Deus, AMI, Bridge)
- mem_membros: cadastro de membros
- mem_contribuicoes: data, membro_id, valor, tipo (dizimo/oferta)
- mem_grupo_membros: ligação membro-grupo (desde, saiu_em)
- mem_voluntarios: voluntários ativos (desde, ate)
- batismo_inscricoes: status, data_batismo
- int_visitantes: visitantes
- mem_devocionais: check-ins de devocional
- cultos_decisoes_pessoas: pessoas que decidiram em cada culto

Capacidade do templo: 1200 lugares.

Indicadores já existentes no Dashboard Semanal:
- frequencia, frequencia_kids, aceitacoes, aceitacoes_online,
  ao_vivo, online_ds, online_ddus, voluntariado
    `.trim();

    const system = `Você é um analista de dados especializado em métricas ministeriais para a igreja CBRio.
Sua tarefa é, dado um objetivo de medição em linguagem natural, retornar um JSON puro com a estrutura do indicador sugerido.

${dadosDisponiveis}

Responda APENAS com o JSON, sem comentários nem texto extra, no formato:
{
  "nome": "Nome curto do indicador (max 60 chars)",
  "descricao": "1-2 frases explicando o que mede e por que é útil",
  "formula": "Fórmula em pseudo-SQL ou descrição matemática clara",
  "tipo_grafico": "barra | linha | area | pizza | gauge | radar",
  "eixo_x": "O que vai no eixo X (período, categoria, etc)",
  "eixo_y": "O que vai no eixo Y (valor numérico medido)",
  "periodicidade_sugerida": "semanal | mensal | trimestral | anual",
  "metricas_relacionadas": ["lista", "de", "indicadores", "complementares"],
  "tabelas_envolvidas": ["lista", "de", "tabelas", "do", "schema"],
  "exemplo_consulta": "SELECT ... FROM ... pseudocódigo do que o sistema deveria buscar",
  "alertas": ["pontos de atenção ao implementar"]
}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: pergunta }],
    });

    const raw = (response.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Extrai JSON do raw (Claude às vezes embrulha em ```json)
    let sugestao;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      sugestao = JSON.parse(match ? match[0] : raw);
    } catch {
      return res.status(500).json({ error: 'IA não retornou JSON válido', raw });
    }

    // Salva como rascunho
    const { data: salvo, error: errSave } = await supabase
      .from('dashboard_indicadores_custom')
      .insert({
        nome: sugestao.nome || 'Indicador sem nome',
        descricao: sugestao.descricao || null,
        pergunta_usuario: pergunta,
        sugestao_ia: sugestao,
        status: 'rascunho',
        criado_por: req.user?.userId || null,
      })
      .select()
      .single();
    if (errSave) throw errSave;

    res.json({
      ok: true,
      sugestao,
      registro: salvo,
      tokens_in: response.usage?.input_tokens || 0,
      tokens_out: response.usage?.output_tokens || 0,
    });
  } catch (e) {
    console.error('[DASH-SEM] ia sugerir', e.message);
    res.status(500).json({ error: e.message || 'Erro ao consultar IA' });
  }
});

router.get('/indicadores-custom', async (req, res) => {
  try {
    const { status } = req.query;
    let q = supabase
      .from('dashboard_indicadores_custom')
      .select('*')
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[DASH-SEM] indic custom', e.message);
    res.status(500).json({ error: 'Erro ao listar indicadores' });
  }
});

router.patch('/indicadores-custom/:id', async (req, res) => {
  try {
    const allowed = ['status', 'nome', 'descricao'];
    const payload = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (req.body[k] !== undefined) payload[k] = req.body[k];

    const { data, error } = await supabase
      .from('dashboard_indicadores_custom')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[DASH-SEM] indic patch', e.message);
    res.status(500).json({ error: 'Erro ao atualizar indicador' });
  }
});

router.delete('/indicadores-custom/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('dashboard_indicadores_custom')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[DASH-SEM] indic delete', e.message);
    res.status(500).json({ error: 'Erro ao remover indicador' });
  }
});

module.exports = router;
