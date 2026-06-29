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

const CAPACIDADE_TEMPLO = 1050;

const INDICADORES = {
  frequencia:        { coluna: 'frequencia',        rotulo: 'Frequência',        usa_ocupacao: true },
  frequencia_kids:   { coluna: 'frequencia_kids',   rotulo: 'Frequência Kids',   usa_ocupacao: false },
  aceitacoes:        { coluna: 'aceitacoes',        rotulo: 'Aceitações',        usa_ocupacao: false },
  aceitacoes_online: { coluna: 'aceitacoes_online', rotulo: 'Aceitações Online', usa_ocupacao: false },
  // Compostos · somam vários canais (ver INDICADORES_COMPOSTOS). coluna = pseudo-coluna.
  frequencia_total:  { coluna: 'frequencia_total',  rotulo: 'Frequência Total (Templo + Kids)',   usa_ocupacao: false },
  aceitacoes_total:  { coluna: 'aceitacoes_total',  rotulo: 'Aceitações (Presencial + Online)',   usa_ocupacao: false },
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
//   query: ano, semana, indicador (default frequência), culto (uuid opcional)
//
// Resposta:
//   {
//     ano, semana, início, fim, indicador, rotulo,
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
               ${colunasView(indicadorKey).join(', ')}, total_presencial, total_cultos`)
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
      .select(`service_type_id, ${colunasView(indicadorKey).join(', ')}, ano_iso, semana_iso`)
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
      arr.push(somaColunas(r, colunasView(indicadorKey)));
      histPorTipo.set(r.service_type_id, arr);
    }

    const items = (semanaData || []).map(r => {
      const valores = histPorTipo.get(r.service_type_id) || [];
      const media = valores.length
        ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length)
        : 0;
      const valor_absoluto = somaColunas(r, colunasView(indicadorKey));
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

    // Indicadores de Kids não se aplicam a cultos sem ministério infantil
    // (AMI, Bridge · has_kids=false). Remove pra não poluir o gráfico com zeros.
    let itemsVisiveis = items;
    if (indicadorKey.includes('kids')) {
      const { data: semKids } = await supabase
        .from('vol_service_types')
        .select('id')
        .eq('has_kids', false);
      const excluir = new Set((semKids || []).map(s => s.id));
      itemsVisiveis = items.filter(it => !excluir.has(it.service_type_id));
    }

    // Ordem lógica dos cultos: Quarta -> Bridge/AMI (sab) -> Domingos.
    // Semana comecando na segunda (Seg=0..Dom=6).
    const ordemSeg = (d) => (d === null || d === undefined ? 99 : ((Number(d) + 6) % 7));
    itemsVisiveis.sort((a, b) => {
      const da = ordemSeg(a.recurrence_day);
      const db = ordemSeg(b.recurrence_day);
      if (da !== db) return da - db;
      return (a.recurrence_time || '').localeCompare(b.recurrence_time || '');
    });

    const total = itemsVisiveis.reduce((s, i) => s + i.valor_absoluto, 0);
    const sumMedias = itemsVisiveis.reduce((s, i) => s + i.media, 0);
    const mediaGeral = itemsVisiveis.length ? Math.round(sumMedias / itemsVisiveis.length) : 0;
    const variacao_pct = mediaGeral > 0 ? Math.round(((total - mediaGeral) / mediaGeral) * 100) : 0;
    const totalPresencial = itemsVisiveis.reduce((s, i) => s + (i.total_presencial || 0), 0);
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
      items: itemsVisiveis,
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
// GET /ranking · melhor e pior semana de um ano (top/bottom 1)
//   query: ano, indicador (default frequência), culto (uuid opcional)
//
// Soma o indicador por semana ISO (mesma regra do /semanal · exclui cultos
// sem kids quando o indicador é de kids, respeita filtro de culto). Considera
// só semanas com total > 0 (ignora semanas futuras/sem dado).
//
// Resposta: { ano, indicador, rotulo,
//             melhor: { semana, total, label, início, fim } | null,
//             pior:   { semana, total, label, início, fim } | null,
//             amostra }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ranking', async (req, res) => {
  try {
    const ano = parseInt(req.query.ano, 10);
    const indicadorKey = req.query.indicador || 'frequencia';
    const cultoId = req.query.culto && req.query.culto !== 'todos' ? req.query.culto : null;
    if (!ano) return res.status(400).json({ error: 'ano é obrigatório' });
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });

    let q = supabase
      .from('vw_dashboard_semanal')
      .select(`service_type_id, semana_iso, ${colunasView(indicadorKey).join(', ')}`)
      .eq('ano_iso', ano);
    if (cultoId) q = q.eq('service_type_id', cultoId);
    const { data, error } = await q;
    if (error) throw error;

    // Indicadores de Kids não se aplicam a cultos sem ministério infantil
    let excluir = new Set();
    if (indicadorKey.includes('kids')) {
      const { data: semKids } = await supabase
        .from('vol_service_types')
        .select('id')
        .eq('has_kids', false);
      excluir = new Set((semKids || []).map(s => s.id));
    }

    const porSemana = new Map();
    for (const r of (data || [])) {
      if (excluir.has(r.service_type_id)) continue;
      const v = somaColunas(r, colunasView(indicadorKey));
      porSemana.set(r.semana_iso, (porSemana.get(r.semana_iso) || 0) + v);
    }

    // Só semanas com dado real (total > 0) entram no ranking
    const semanas = [...porSemana.entries()]
      .filter(([, total]) => total > 0)
      .map(([semana, total]) => ({ semana, total }));

    if (!semanas.length) {
      return res.json({ ano, indicador: indicadorKey, rotulo: indDef.rotulo, melhor: null, pior: null, amostra: 0 });
    }

    const decorar = ({ semana, total }) => {
      const { inicio, fim } = isoWeekRange(ano, semana);
      return {
        semana,
        total,
        label: `Sem ${semana} · ${fmtDateBr(inicio)} a ${fmtDateBr(fim)}`,
        inicio: inicio.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
      };
    };

    const melhor = decorar(semanas.reduce((a, b) => (b.total > a.total ? b : a)));
    const pior = decorar(semanas.reduce((a, b) => (b.total < a.total ? b : a)));

    res.json({ ano, indicador: indicadorKey, rotulo: indDef.rotulo, melhor, pior, amostra: semanas.length });
  } catch (e) {
    console.error('[DASH-SEM] ranking', e.message);
    res.status(500).json({ error: 'Erro ao calcular ranking de semanas' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mensal · comparativo ano-a-ano por mês
//   query: anos (csv, default 3 anos), indicador, culto, meses (csv opcional)
//
// Resposta:
//   {
//     indicador, rotulo, anos: [...],
//     séries: [{ mês: 1, mes_nome: 'janeiro', '2024': X, '2025': Y, '2026': Z }, ...]
//   }
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// GET /yoy · total da mesma semana ISO em vários anos (year-over-year)
//   query: semana, indicador, culto, anos (csv, default 3 anos)
//
// Soma o indicador por semana ISO (mesma regra do /semanal: exclui cultos
// sem kids quando indicador eh de kids · respeita filtro de culto). Permite
// comparar S20-2024 vs S20-2025 vs S20-2026 etc.
//
// Resposta:
//   {
//     semana, indicador, rotulo, anos,
//     resultados: [{ ano, total, tem_dado }]
//   }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/yoy', async (req, res) => {
  try {
    const semana = parseInt(req.query.semana, 10);
    if (!semana) return res.status(400).json({ error: 'semana é obrigatório' });
    const indicadorKey = req.query.indicador || 'frequencia';
    const cultoId = req.query.culto && req.query.culto !== 'todos' ? req.query.culto : null;
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });

    const anoAtual = new Date().getUTCFullYear();
    const anos = req.query.anos
      ? String(req.query.anos).split(',').map(Number).filter(Number.isInteger)
      : [anoAtual - 2, anoAtual - 1, anoAtual];

    let q = supabase
      .from('vw_dashboard_semanal')
      .select(`service_type_id, ano_iso, ${colunasView(indicadorKey).join(', ')}`)
      .in('ano_iso', anos)
      .eq('semana_iso', semana);
    if (cultoId) q = q.eq('service_type_id', cultoId);
    const { data, error } = await q;
    if (error) throw error;

    // Indicadores de Kids · exclui cultos sem kids
    let excluir = new Set();
    if (indicadorKey.includes('kids')) {
      const { data: semKids } = await supabase
        .from('vol_service_types')
        .select('id')
        .eq('has_kids', false);
      excluir = new Set((semKids || []).map(s => s.id));
    }

    const porAno = new Map(); // ano -> { total, linhas }
    for (const r of (data || [])) {
      if (excluir.has(r.service_type_id)) continue;
      const v = somaColunas(r, colunasView(indicadorKey));
      const acc = porAno.get(r.ano_iso) || { total: 0, linhas: 0 };
      acc.total += v;
      acc.linhas += 1;
      porAno.set(r.ano_iso, acc);
    }

    const resultados = anos.map(ano => {
      const acc = porAno.get(ano);
      // tem_dado = ao menos 1 linha de culto naquela (ano, semana). Permite
      // distinguir "semana 53 não existe naquele ano" de "semana existe mas
      // valor 0" (ex: aceitacoes zeradas).
      return {
        ano,
        total: acc?.total || 0,
        tem_dado: !!acc?.linhas,
      };
    });

    res.json({ semana, indicador: indicadorKey, rotulo: indDef.rotulo, anos, resultados });
  } catch (e) {
    console.error('[DASH-SEM] yoy', e.message);
    res.status(500).json({ error: 'Erro ao calcular comparativo YoY' });
  }
});

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
      .select(`ano_calendario, mes, service_type_id, ${colunasView(indicadorKey).join(', ')}`)
      .in('ano_calendario', anos);
    if (cultoId) q = q.eq('service_type_id', cultoId);
    const { data, error } = await q;
    if (error) throw error;

    const filtered = meses ? (data || []).filter(r => meses.includes(r.mes)) : (data || []);

    const acc = new Map();
    for (const r of filtered) {
      const v = somaColunas(r, colunasView(indicadorKey));
      if (!v) continue; // 0/null = sem dado · não cria ponto (linha não cai a 0)
      const key = `${r.mes}-${r.ano_calendario}`;
      acc.set(key, (acc.get(key) || 0) + v);
    }

    const MES_NOMES = ['janeiro','fevereiro','março','abril','maio','junho',
                       'julho','agosto','setembro','outubro','novembro','dezembro'];
    const mesesUsados = meses || [1,2,3,4,5,6,7,8,9,10,11,12];
    const series = mesesUsados.map(m => {
      const row = { mes: m, mes_nome: MES_NOMES[m - 1] };
      // null (não 0) onde não há culto naquele mês/ano · linha de gráfico não cai a 0
      for (const a of anos) {
        const key = `${m}-${a}`;
        row[String(a)] = acc.has(key) ? acc.get(key) : null;
      }
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
// GET /resumo-semana?ano=&semana= · números consolidados da semana (1 card)
//   { presencas, presencas_delta_pct, kids, online, decisoes, cultos_lancados,
//     maior_culto: { nome, valor }, semana, inicio, fim }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/resumo-semana', async (req, res) => {
  try {
    const hojeIso = isoWeekOf(new Date());
    const ano = parseInt(req.query.ano, 10) || hojeIso.ano;
    const semana = parseInt(req.query.semana, 10) || hojeIso.semana;

    const cols = 'service_type_name, recurrence_day, recurrence_time, frequencia, frequencia_kids, aceitacoes, aceitacoes_online, aceitacoes_kids, ao_vivo, total_cultos, total_presencial';
    const semAnt = semana - 1 > 0 ? semana - 1 : 52;
    const anoAnt = semana - 1 > 0 ? ano : ano - 1;

    const [atualRes, antRes] = await Promise.all([
      supabase.from('vw_dashboard_semanal').select(cols).eq('ano_iso', ano).eq('semana_iso', semana),
      supabase.from('vw_dashboard_semanal').select('total_presencial').eq('ano_iso', anoAnt).eq('semana_iso', semAnt),
    ]);
    if (atualRes.error) throw atualRes.error;

    const linhas = atualRes.data || [];
    const sum = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    // Presenças = templo + kids (total_presencial). Kids segue como card separado.
    const presencas = sum(linhas, 'total_presencial');
    const kids = sum(linhas, 'frequencia_kids');
    const online = sum(linhas, 'ao_vivo');
    // Decisões = presenciais + online + kids.
    const decisoes = sum(linhas, 'aceitacoes') + sum(linhas, 'aceitacoes_online') + sum(linhas, 'aceitacoes_kids');
    const cultosLancados = sum(linhas, 'total_cultos');

    const presencasAnt = sum(antRes.data || [], 'total_presencial');
    const presencasDelta = presencasAnt > 0 ? ((presencas - presencasAnt) / presencasAnt) * 100 : null;

    let maior = null;
    for (const r of linhas) {
      const v = Number(r.frequencia) || 0;
      if (!maior || v > maior.valor) maior = { nome: r.service_type_name, valor: v };
    }

    const { inicio, fim } = isoWeekRange(ano, semana);
    res.json({
      ano, semana,
      inicio: inicio.toISOString().slice(0, 10),
      fim: fim.toISOString().slice(0, 10),
      label: `Semana ${semana} · ${fmtDateBr(inicio)} a ${fmtDateBr(fim)}`,
      presencas, kids, online, decisoes,
      cultos_lancados: cultosLancados,
      presencas_delta_pct: presencasDelta,
      maior_culto: maior && maior.valor > 0 ? maior : null,
    });
  } catch (e) {
    console.error('[DASH-SEM] resumo-semana', e.message);
    res.status(500).json({ error: 'Erro ao montar resumo da semana' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /resumo-mes?ano=&mes= · números consolidados do mês (1 card)
//   { presencas, presencas_delta_pct, decisoes, decisoes_delta_pct, kids,
//     batismos, novos_membros, maior_culto: { valor }, mes, ano, mes_nome }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/resumo-mes', async (req, res) => {
  try {
    const hoje = new Date();
    const ano = parseInt(req.query.ano, 10) || hoje.getUTCFullYear();
    const mes = parseInt(req.query.mes, 10) || (hoje.getUTCMonth() + 1);

    const pad = (n) => String(n).padStart(2, '0');
    const ini = `${ano}-${pad(mes)}-01`;
    const fimDate = new Date(Date.UTC(ano, mes, 0)); // último dia do mês
    const fim = fimDate.toISOString().slice(0, 10);
    // mês anterior
    const mesAntDate = new Date(Date.UTC(ano, mes - 2, 1));
    const anoAnt = mesAntDate.getUTCFullYear();
    const mesAnt = mesAntDate.getUTCMonth() + 1;
    const iniAnt = `${anoAnt}-${pad(mesAnt)}-01`;
    const fimAnt = new Date(Date.UTC(anoAnt, mesAnt, 0)).toISOString().slice(0, 10);

    const cultoCols = 'data, presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online, decisoes_kids';
    const [cultosMes, cultosAnt, batismos, novosMembros] = await Promise.all([
      supabase.from('cultos').select(cultoCols).gte('data', ini).lte('data', fim),
      supabase.from('cultos').select('presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online, decisoes_kids').gte('data', iniAnt).lte('data', fimAnt),
      supabase.from('batismo_inscricoes').select('id', { count: 'exact', head: true })
        .eq('status', 'realizado').gte('data_batismo', ini).lte('data_batismo', fim),
      // "Novos membros" = cadastros reais no mês · EXCLUI 'wifi' (captura do
      // portal wifi gera mem_membros pra todo mundo que conecta · não é membro).
      supabase.from('mem_membros').select('id', { count: 'exact', head: true })
        .is('deleted_at', null).gte('created_at', `${ini}T00:00:00`).lte('created_at', `${fim}T23:59:59`)
        .or('origem_cadastro.is.null,origem_cadastro.neq.wifi'),
    ]);
    if (cultosMes.error) throw cultosMes.error;

    const lc = cultosMes.data || [];
    const sum = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    // Presenças = templo + kids; Decisões = presenciais + online + kids.
    const presencas = sum(lc, 'presencial_adulto') + sum(lc, 'presencial_kids');
    const kids = sum(lc, 'presencial_kids');
    const decisoes = sum(lc, 'decisoes_presenciais') + sum(lc, 'decisoes_online') + sum(lc, 'decisoes_kids');

    const la = cultosAnt.data || [];
    const presencasAnt = sum(la, 'presencial_adulto') + sum(la, 'presencial_kids');
    const decisoesAnt = sum(la, 'decisoes_presenciais') + sum(la, 'decisoes_online') + sum(la, 'decisoes_kids');
    const delta = (a, b) => b > 0 ? ((a - b) / b) * 100 : null;

    let maior = 0;
    for (const r of lc) maior = Math.max(maior, Number(r.presencial_adulto) || 0);

    const MESES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    res.json({
      ano, mes,
      mes_nome: MESES_NOME[mes - 1] || '',
      presencas,
      presencas_delta_pct: delta(presencas, presencasAnt),
      decisoes,
      decisoes_delta_pct: delta(decisoes, decisoesAnt),
      kids,
      batismos: batismos.count || 0,
      novos_membros: novosMembros.count || 0,
      maior_culto: maior > 0 ? { valor: maior } : null,
    });
  } catch (e) {
    console.error('[DASH-SEM] resumo-mes', e.message);
    res.status(500).json({ error: 'Erro ao montar resumo do mês' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /media-movel · média móvel da frequência presencial · comparação ano-a-ano
//   query:
//     granularidade · 'semana' | 'mês' (default semana)
//     janela        · nº de períodos da média móvel (default 2 · min 2)
//     anos          · csv (default últimos 3 anos)
//     culto         · service_type_id opcional (default todos somados)
//   resposta: { granularidade, janela, anos, rotulo,
//               séries: [{ período, label, '2024': mm|null, '2025': mm|null, ... }] }
//   regra: cada ano é uma linha própria; MM calculada dentro do próprio ano;
//          null onde não há dado (a linha para, não cai a 0).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/media-movel', async (req, res) => {
  try {
    // Média móvel é fixa em frequência presencial
    const indDef = INDICADORES.frequencia;

    const granularidade = req.query.granularidade === 'mes' ? 'mes' : 'semana';
    const cultoId = req.query.culto && req.query.culto !== 'todos' ? req.query.culto : null;
    const janela = Math.max(2, parseInt(req.query.janela, 10) || 2);

    const anoAtual = new Date().getUTCFullYear();
    const anos = req.query.anos
      ? String(req.query.anos).split(',').map(Number).filter(Number.isInteger)
      : [anoAtual - 2, anoAtual - 1, anoAtual];

    let q = supabase
      .from('vw_dashboard_semanal')
      .select(`service_type_id, ${indDef.coluna}, ano_iso, semana_iso, ano_calendario, mes`);
    if (cultoId) q = q.eq('service_type_id', cultoId);
    const { data, error } = await q;
    if (error) throw error;

    const MES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const maxPeriodo = granularidade === 'mes' ? 12 : 53;

    // valores[ano][período] = soma da frequência presencial naquele período/ano
    const valores = {};
    for (const a of anos) valores[a] = new Map();

    for (const r of (data || [])) {
      const v = Number(r[indDef.coluna]) || 0;
      if (!v) continue; // 0/null = sem dado (culto futuro materializado ou não preenchido)
      let ano, periodo;
      if (granularidade === 'mes') {
        ano = r.ano_calendario;
        periodo = r.mes;
      } else {
        ano = r.ano_iso;
        periodo = r.semana_iso;
      }
      if (ano == null || periodo == null) continue;
      if (!valores[ano]) continue; // ano fora do filtro
      valores[ano].set(periodo, (valores[ano].get(periodo) || 0) + v);
    }

    // Média móvel por ano: média dos últimos `janela` períodos COM dado, até o período i.
    // Só emite valor se o próprio período i tem dado E há ao menos `janela` períodos
    // acumulados (janela completa). Caso contrário null → a linha não cai a 0.
    const mmPorAno = {};
    let maxPeriodoComDado = 0;
    for (const a of anos) {
      const mapa = valores[a];
      const periodosComDado = [...mapa.keys()].sort((x, y) => x - y);
      if (periodosComDado.length) {
        maxPeriodoComDado = Math.max(maxPeriodoComDado, periodosComDado[periodosComDado.length - 1]);
      }
      const mm = new Map();
      for (let idx = 0; idx < periodosComDado.length; idx++) {
        if (idx + 1 < janela) continue; // janela ainda incompleta
        let soma = 0;
        for (let k = idx - janela + 1; k <= idx; k++) soma += mapa.get(periodosComDado[k]);
        mm.set(periodosComDado[idx], Math.round(soma / janela));
      }
      mmPorAno[a] = mm;
    }

    const limite = maxPeriodoComDado || maxPeriodo;
    const series = [];
    for (let p = 1; p <= limite; p++) {
      const row = {
        periodo: p,
        label: granularidade === 'mes' ? MES_CURTO[p - 1] : `S${p}`,
      };
      for (const a of anos) {
        const mm = mmPorAno[a];
        row[String(a)] = mm.has(p) ? mm.get(p) : null;
      }
      series.push(row);
    }

    res.json({
      granularidade,
      janela,
      anos,
      rotulo: indDef.rotulo,
      series,
    });
  } catch (e) {
    console.error('[DASH-SEM] media-movel', e.message);
    res.status(500).json({ error: 'Erro ao montar média móvel' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /metas/valor-atual · valor acumulado do indicador no período corrente
//   query: indicador, periodicidade (semanal | mensal | anual)
//
// Semanal: soma da semana anterior completa (que termina no último domingo)
// Mensal:  soma do mês atual
// Anual:   soma do ano atual
// ─────────────────────────────────────────────────────────────────────────────
router.get('/metas/valor-atual', async (req, res) => {
  try {
    const indicadorKey = req.query.indicador;
    const periodicidade = req.query.periodicidade || 'semanal';
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });

    const hoje = new Date();
    let inicio, fim, label;

    if (periodicidade === 'semanal') {
      // Semana anterior · de segunda a domingo
      const ultimoDomingo = new Date(hoje);
      const dow = ultimoDomingo.getUTCDay();
      const diasParaUltimoDomingo = dow === 0 ? 7 : dow;
      ultimoDomingo.setUTCDate(ultimoDomingo.getUTCDate() - diasParaUltimoDomingo);
      const segunda = new Date(ultimoDomingo);
      segunda.setUTCDate(segunda.getUTCDate() - 6);
      inicio = segunda;
      fim = ultimoDomingo;
      label = `semana ${segunda.toISOString().slice(0,10)} a ${ultimoDomingo.toISOString().slice(0,10)}`;
    } else if (periodicidade === 'mensal') {
      inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
      fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0));
      label = `${formatMesAno(inicio)}`;
    } else if (periodicidade === 'anual') {
      inicio = new Date(Date.UTC(hoje.getUTCFullYear(), 0, 1));
      fim = new Date(Date.UTC(hoje.getUTCFullYear(), 11, 31));
      label = `${hoje.getUTCFullYear()}`;
    } else {
      return res.status(400).json({ error: 'periodicidade inválida' });
    }

    const colsCultos = colunasCultos(indicadorKey);
    const { data, error } = await supabase
      .from('cultos')
      .select(colsCultos.join(', '))
      .gte('data', inicio.toISOString().slice(0, 10))
      .lte('data', fim.toISOString().slice(0, 10));
    if (error) throw error;

    const total = (data || []).reduce((s, r) => s + somaColunas(r, colsCultos), 0);

    res.json({
      indicador: indicadorKey,
      periodicidade,
      label,
      inicio: inicio.toISOString().slice(0, 10),
      fim: fim.toISOString().slice(0, 10),
      total,
    });
  } catch (e) {
    console.error('[DASH-SEM] valor-atual', e.message);
    res.status(500).json({ error: 'Erro ao buscar valor atual' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /metas/sugerir · calcula meta sugerida com base em histórico
//   query: indicador, base (mes_anterior | valor_absoluto_mes_anterior | trimestre_anterior | ano_anterior | mesmo_mes_ano_anterior)
//          periodicidade (semanal | mensal · default semanal)
//          culto (uuid opcional)
//
// Retorna: { sugestão, base_label, periodo_referencia, valores_amostra }
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

    // modo absoluto = soma total do indicador no período (não a média por período)
    const modoAbsoluto = base === 'valor_absoluto_mes_anterior';

    if (base === 'mes_anterior' || base === 'valor_absoluto_mes_anterior') {
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

    // Pega dados brutos da tabela cultos no período · janela estendida pra
    // capturar cultos da terça/quarta cuja semana fecha no domingo do período
    const inicioExt = new Date(inicio);
    inicioExt.setUTCDate(inicioExt.getUTCDate() - 7);
    const fimExt = new Date(fim);
    fimExt.setUTCDate(fimExt.getUTCDate() + 7);

    const colsCultos = colunasCultos(indicadorKey);
    let q = supabase
      .from('cultos')
      .select(`data, service_type_id, ${colsCultos.join(', ')}`)
      .gte('data', inicioExt.toISOString().slice(0, 10))
      .lte('data', fimExt.toISOString().slice(0, 10));
    if (cultoId) q = q.eq('service_type_id', cultoId);

    const { data, error } = await q;
    if (error) throw error;

    // Modo absoluto · soma total do indicador no mês anterior (vira a meta direto).
    // Filtro por string de data (inclusivo do mês inteiro · evita o off-by-one de hora UTC).
    if (modoAbsoluto) {
      const inicioStr = inicio.toISOString().slice(0, 10);
      const fimStr = fim.toISOString().slice(0, 10);
      let total = 0;
      let qtd = 0;
      for (const row of (data || [])) {
        if (row.data < inicioStr || row.data > fimStr) continue;
        total += somaColunas(row, colsCultos);
        qtd++;
      }
      if (total === 0) {
        return res.json({
          sugestao: 0,
          base_label: baseLabel,
          periodo_referencia: `${inicioStr} a ${fimStr}`,
          amostra: 0,
          valores_amostra: [],
          modo: 'absoluto',
          aviso: 'Sem dados preenchidos no mês anterior. Verifique os cultos.',
        });
      }
      return res.json({
        sugestao: Math.round(total),
        base_label: baseLabel,
        periodo_referencia: `${inicioStr} a ${fimStr}`,
        amostra: qtd,
        valores_amostra: [],
        modo: 'absoluto',
      });
    }

    // Agrupa por (semana ISO · usando o domingo daquela semana como ancora) ou (mês)
    // Regra do Marcos: semana so conta se o DOMINGO dela cai dentro do período
    // (mês anterior = 4 ou 5 semanas conforme calendário)
    const inicioMs = inicio.getTime();
    const fimMs = fim.getTime();
    const grupos = new Map();
    for (const row of (data || [])) {
      const d = new Date(row.data + 'T12:00:00Z');
      let key;
      if (periodicidade === 'semanal') {
        const sun = sundayOfWeek(d);
        // Filtro: o domingo da semana precisa estar dentro do período alvo
        if (sun.getTime() < inicioMs || sun.getTime() > fimMs) continue;
        key = sun.toISOString().slice(0, 10);
      } else if (periodicidade === 'mensal') {
        // Pra agrupamento mensal mantemos filtro por data direta
        if (d.getTime() < inicioMs || d.getTime() > fimMs) continue;
        key = `${d.getUTCFullYear()}-M${d.getUTCMonth() + 1}`;
      } else {
        if (d.getTime() < inicioMs || d.getTime() > fimMs) continue;
        key = String(d.getUTCFullYear());
      }
      const valor = somaColunas(row, colsCultos);
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

// Indicadores compostos · somam vários canais. Os nomes de coluna diferem por
// fonte: `view` = colunas de vw_dashboard_semanal · `cultos` = colunas da tabela cultos.
const INDICADORES_COMPOSTOS = {
  frequencia_total: { view: ['frequencia', 'frequencia_kids'],   cultos: ['presencial_adulto', 'presencial_kids'] },
  aceitacoes_total: { view: ['aceitacoes', 'aceitacoes_online'], cultos: ['decisoes_presenciais', 'decisoes_online'] },
};

// Colunas a selecionar/somar para um indicador na VIEW vw_dashboard_semanal.
function colunasView(indKey) {
  const c = INDICADORES_COMPOSTOS[indKey];
  if (c) return c.view;
  return [INDICADORES[indKey]?.coluna || indKey];
}

// Colunas a selecionar/somar para um indicador na tabela cultos.
function colunasCultos(indKey) {
  const c = INDICADORES_COMPOSTOS[indKey];
  if (c) return c.cultos;
  return [colunaCrua(indKey)];
}

// Soma o valor de um conjunto de colunas numa linha (composto = vários canais).
function somaColunas(row, cols) {
  return cols.reduce((s, col) => s + (Number(row[col]) || 0), 0);
}

function sundayOfWeek(date) {
  // Retorna o domingo da mesma semana ISO (Mon-Sun) que contem `date`.
  // Mantemos UTC pra evitar ajuste de timezone que poderia trocar o dia.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Domingo, 1=Segunda, ..., 6=Sabado
  // ISO trata segunda como início · domingo como dia 7 (próximo domingo)
  const diasAteDomingo = (7 - dow) % 7;
  d.setUTCDate(d.getUTCDate() + diasAteDomingo);
  return d;
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
  online_ds, online_ddus, voluntários
- vol_service_types: tipos de culto (Domingo 08:30, 10:00, 11:30, 19:00,
  Quarta com Deus, AMI, Bridge)
- mem_membros: cadastro de membros
- mem_contribuicoes: data, membro_id, valor, tipo (dizimo/oferta)
- mem_grupo_membros: ligação membro-grupo (desde, saiu_em)
- mem_voluntarios: voluntários ativos (desde, até)
- batismo_inscricoes: status, data_batismo
- int_visitantes: visitantes
- mem_devocionais: check-ins de devocional
- cultos_decisoes_pessoas: pessoas que decidiram em cada culto

Capacidade do templo: 1050 lugares.

Indicadores já existentes no Dashboard Semanal:
- frequência, frequencia_kids, aceitacoes, aceitacoes_online,
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
