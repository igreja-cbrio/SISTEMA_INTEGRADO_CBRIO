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
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const Anthropic = require('@anthropic-ai/sdk');

router.use(authenticate);

const CAPACIDADE_TEMPLO = 1050;
// O Bridge acontece em outro espaço da igreja, com capacidade de 100 lugares.
// A taxa de ocupação dele usa essa base (não a do templo).
const CAPACIDADE_BRIDGE = 100;
const ehBridge = (nome) => /bridge/i.test(nome || '');
const capacidadeCulto = (nome) => (ehBridge(nome) ? CAPACIDADE_BRIDGE : CAPACIDADE_TEMPLO);

const INDICADORES = {
  frequencia:        { coluna: 'frequencia',        rotulo: 'Frequência',        usa_ocupacao: true },
  frequencia_kids:   { coluna: 'frequencia_kids',   rotulo: 'Frequência Kids',   usa_ocupacao: false },
  aceitacoes:        { coluna: 'aceitacoes',        rotulo: 'Aceitações',        usa_ocupacao: false },
  aceitacoes_online: { coluna: 'aceitacoes_online', rotulo: 'Aceitações Online', usa_ocupacao: false },
  // Compostos · somam vários canais (ver INDICADORES_COMPOSTOS). coluna = pseudo-coluna.
  frequencia_total:  { coluna: 'frequencia_total',  rotulo: 'Frequência Total (Templo + Kids)',   usa_ocupacao: false },
  aceitacoes_total:  { coluna: 'aceitacoes_total',  rotulo: 'Aceitações (Presencial + Online)',   usa_ocupacao: false },
  aceitacoes_total_kids: { coluna: 'aceitacoes_total_kids', rotulo: 'Aceitações (Presencial + Online + Kids)', usa_ocupacao: false },
  ao_vivo:           { coluna: 'ao_vivo',           rotulo: 'Ao vivo',           usa_ocupacao: false },
  online_ds:         { coluna: 'online_ds',         rotulo: 'Online DS',         usa_ocupacao: false },
  online_ddus:       { coluna: 'online_ddus',       rotulo: 'Online DDUS',       usa_ocupacao: false },
  voluntariado:      { coluna: 'voluntariado',      rotulo: 'Voluntariado',      usa_ocupacao: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de data ISO (week) · extraídos pra backend/utils/isoWeek.js
// (mesmo código · reusados na coleta em routes/integracao.js)
// ─────────────────────────────────────────────────────────────────────────────
const { isoWeekRange, isoWeekOf, fmtDateBr, semanasDoMes } = require('../utils/isoWeek');

const {
  hojeBrt, corteDoAno, ultimaSemanaIsoCompleta, resolverPeriodo,
  MES_NOMES_LONGO, MES_NOMES_CURTO,
} = require('../utils/periodoYtd');

// Lê TODAS as linhas de uma query, respeitando o cap de 1000 do PostgREST (que é
// server-side e trunca em SILÊNCIO). Recebe uma FÁBRICA de query, não a query:
// reusar o mesmo builder entre páginas depende de detalhe interno do supabase-js.
async function selectPaginado(montarQuery, ordenarPor) {
  const PAGINA = 1000;
  const tudo = [];
  for (let offset = 0; ; offset += PAGINA) {
    let q = montarQuery();
    if (ordenarPor) q = q.order(ordenarPor);
    const { data, error } = await q.range(offset, offset + PAGINA - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    tudo.push(...data);
    if (data.length < PAGINA) break;
  }
  return tudo;
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
    const fonte = fonteView(indicadorKey);
    let q = supabase
      .from(fonte)
      .select(`service_type_id, service_type_name, service_type_color, recurrence_day, recurrence_time,
               ${colunasView(indicadorKey).join(', ')}, total_presencial, total_cultos`)
      .eq('ano_iso', ano)
      .eq('semana_iso', semana);
    if (cultoId) q = q.eq('service_type_id', cultoId);
    const { data: semanaData, error } = await q;
    if (error) throw error;

    // Média do ANO selecionado · semanas 1..(semana atual) por service_type.
    // Antes era janela móvel de 52 semanas (cruzava o ano anterior). Pedido do
    // Matheus (2026-07-08): a média deve ser do ANO que se está vendo — na
    // semana 27, usa as 27 semanas do ano; a cada semana que passa, entra mais
    // uma. Inclui a semana atual (assim a média sempre tem ≥1 ponto e o número
    // de semanas bate com a semana ISO).
    let qHist = supabase
      .from(fonte)
      .select(`service_type_id, ${colunasView(indicadorKey).join(', ')}, ano_iso, semana_iso`)
      .eq('ano_iso', ano)
      .lte('semana_iso', semana);
    if (cultoId) qHist = qHist.eq('service_type_id', cultoId);
    const { data: histDataRaw, error: errHist } = await qHist;
    if (errHist) throw errHist;
    const histData = histDataRaw || [];

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
          ? Math.round((valor_absoluto / capacidadeCulto(r.service_type_name)) * 1000) / 10
          : null,
      };
    });

    // Indicadores de Kids não se aplicam a cultos sem ministério infantil
    // (AMI, Bridge · has_kids=false). Remove pra não poluir o gráfico com zeros.
    let itemsVisiveis = items;
    let excluirKids = new Set();
    if (indicadorKey.includes('kids')) {
      const { data: semKids } = await supabase
        .from('vol_service_types')
        .select('id')
        .eq('has_kids', false);
      excluirKids = new Set((semKids || []).map(s => s.id));
      itemsVisiveis = items.filter(it => !excluirKids.has(it.service_type_id));
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

    // Média Histórica = média (nas semanas do ano COM dado) do TOTAL semanal,
    // isto é, a SOMA dos valores dos blocos/cultos visíveis em cada semana.
    // É a MESMA base do "total" exibido. Antes era a média das médias por bloco
    // dividida pelo nº de blocos → no modo "Todos" o resultado ficava MENOR que
    // a média de um único turno (impossível: a média de um turno não pode ser
    // maior que a de todos). Respeita o filtro de culto (histData já vem
    // filtrado por service_type_id) e a exclusão de cultos sem Kids.
    const totaisPorSemana = new Map();
    for (const r of histData) {
      if (excluirKids.has(r.service_type_id)) continue;
      const v = somaColunas(r, colunasView(indicadorKey));
      totaisPorSemana.set(r.semana_iso, (totaisPorSemana.get(r.semana_iso) || 0) + v);
    }
    const totaisSemana = [...totaisPorSemana.values()];
    const mediaGeral = totaisSemana.length
      ? Math.round(totaisSemana.reduce((s, v) => s + v, 0) / totaisSemana.length)
      : 0;
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

    // Voluntariado: as barras mostram CHECK-INS por bloco (view = count(*)), então
    // o "total" superconta quem serve em >1 bloco. Cards dedicados trazem as
    // pessoas ÚNICAS da semana (dedup) + o total de check-ins (via RPC).
    let volResumo = {};
    if (indicadorKey === 'voluntariado') {
      try {
        const { data: vr } = await supabase.rpc('fn_dashboard_voluntariado_resumo', { p_ano_iso: ano, p_semana_iso: semana });
        const row = Array.isArray(vr) ? vr[0] : vr;
        if (row) volResumo = { pessoas_unicas: Number(row.pessoas_unicas) || 0, checkins_total: Number(row.checkins_total) || 0, sem_identificacao: Number(row.sem_identificacao) || 0 };
      } catch (e) { console.error('[DASH-SEM] vol resumo', e.message); }
    }

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
        // Nº de semanas do ano usadas na média (pro rótulo "média de N semanas").
        media_semanas_base: new Set((histData || []).map(r => r.semana_iso)).size,
        ...volResumo,
      },
      meta: meta ? { id: meta.id, meta_valor: Number(meta.meta_valor), rotulo: meta.rotulo } : null,
    });
  } catch (e) {
    console.error('[DASH-SEM] semanal', e.message, e);
    res.status(500).json({ error: 'Erro ao montar dashboard semanal' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Observações da semana · explicam blocos zerados/atípicos
// (ex.: "Não houve culto · jogo do Brasil"). Nota geral (service_type_id null)
// ou presa a um bloco/culto.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/notas', async (req, res) => {
  try {
    const ano = parseInt(req.query.ano, 10);
    const semana = parseInt(req.query.semana, 10);
    if (!ano || !semana) return res.status(400).json({ error: 'ano e semana são obrigatórios' });
    const { data, error } = await supabase
      .from('dash_semana_notas')
      .select('*')
      .eq('ano_iso', ano)
      .eq('semana_iso', semana)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[DASH-SEM] notas list', e.message);
    res.status(500).json({ error: 'Erro ao listar as observações' });
  }
});

router.post('/notas', async (req, res) => {
  try {
    const { ano, semana, service_type_id, service_type_name, nota } = req.body || {};
    if (!ano || !semana || !nota?.trim()) {
      return res.status(400).json({ error: 'ano, semana e nota são obrigatórios' });
    }
    const { data, error } = await supabase
      .from('dash_semana_notas')
      .insert({
        ano_iso: parseInt(ano, 10),
        semana_iso: parseInt(semana, 10),
        service_type_id: service_type_id || null,
        service_type_name: service_type_name || null,
        nota: String(nota).trim().slice(0, 500),
        criado_por: req.user.userId,
        criado_por_nome: req.user.name || req.user.email,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[DASH-SEM] notas create', e.message);
    res.status(500).json({ error: 'Erro ao salvar a observação' });
  }
});

router.delete('/notas/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('dash_semana_notas').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[DASH-SEM] notas delete', e.message);
    res.status(500).json({ error: 'Erro ao excluir a observação' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ranking · melhor e pior semana de um ano (top/bottom 1)
//   query: ano, indicador (default frequência), culto (uuid opcional)
// ─────────────────────────────────────────────────────────────────────────────
// GET /voluntariado-pessoas · quem são as "pessoas únicas" do card do
// Voluntariado (mesma régua da fn_dashboard_voluntariado_resumo).
//   query: ano, semana (ISO) → [{ nome, checkins, blocos }]
// ─────────────────────────────────────────────────────────────────────────────
router.get('/voluntariado-pessoas', async (req, res) => {
  try {
    const ano = parseInt(req.query.ano, 10);
    const semana = parseInt(req.query.semana, 10);
    if (!ano || !semana) return res.status(400).json({ error: 'ano e semana são obrigatórios' });
    const { data, error } = await supabase.rpc('fn_dashboard_voluntariado_pessoas', {
      p_ano_iso: ano, p_semana_iso: semana,
    });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[DASH-SEM] vol pessoas', e.message);
    res.status(500).json({ error: 'Erro ao listar as pessoas da semana' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /voluntariado-composicao · o que compõe cada BLOCO do gráfico (as barras
// consolidam por turno · ex.: "Domingo Manhã" junta os cultos das 08:30/10:00/
// 11:30 + o CBKIDS da manhã). Clicar na barra abre a quantidade de pessoas por
// culto real.  query: ano, semana → [{ bloco, culto, pessoas, sem_identificacao }]
// ─────────────────────────────────────────────────────────────────────────────
router.get('/voluntariado-composicao', async (req, res) => {
  try {
    const ano = parseInt(req.query.ano, 10);
    const semana = parseInt(req.query.semana, 10);
    if (!ano || !semana) return res.status(400).json({ error: 'ano e semana são obrigatórios' });
    const { data, error } = await supabase.rpc('fn_dashboard_voluntariado_composicao', {
      p_ano_iso: ano, p_semana_iso: semana,
    });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[DASH-SEM] vol composicao', e.message);
    res.status(500).json({ error: 'Erro ao detalhar a composição do bloco' });
  }
});

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
// ─────────────────────────────────────────────────────────────────────────────
// GET /serie · série semanal BRUTA do ano (total do indicador por semana ISO)
//   query: ano, indicador, culto (uuid | 'todos')
// Criado pro app CBRio Staff (detalhe histórico por culto + médias no cliente).
// Mesma mecânica do /ranking, mas devolve a série inteira em vez de top/bottom.
// Resposta: { ano, indicador, rotulo, serie: [{ semana, total, inicio, fim }] }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/serie', async (req, res) => {
  try {
    const ano = parseInt(req.query.ano, 10);
    const indicadorKey = req.query.indicador || 'frequencia';
    const cultoId = req.query.culto && req.query.culto !== 'todos' ? req.query.culto : null;
    if (!ano) return res.status(400).json({ error: 'ano é obrigatório' });
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });

    let q = supabase
      .from(fonteView(indicadorKey))
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

    const serie = [...porSemana.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([semana, total]) => {
        const { inicio, fim } = isoWeekRange(ano, semana);
        return { semana, total, inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
      });

    res.json({ ano, indicador: indicadorKey, rotulo: indDef.rotulo, serie });
  } catch (e) {
    console.error('[DASH-SEM] serie', e.message);
    res.status(500).json({ error: 'Erro ao montar série semanal' });
  }
});

router.get('/ranking', async (req, res) => {
  try {
    const ano = parseInt(req.query.ano, 10);
    const indicadorKey = req.query.indicador || 'frequencia';
    const cultoId = req.query.culto && req.query.culto !== 'todos' ? req.query.culto : null;
    if (!ano) return res.status(400).json({ error: 'ano é obrigatório' });
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });

    let q = supabase
      .from(fonteView(indicadorKey))
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
// GET /media-mes · média SEMANAL do indicador no mês calendário
//   query: ano, mes (calendário · default hoje), indicador, culto (opcional)
//
// Consumido pelo app CBRio Staff: a comparação do Painel do app é "frequência
// absoluta da semana selecionada × média semanal do MÊS selecionado" (pedido
// da gestão · 2026-07-10). NÃO muda o /semanal — a "média do ano" de lá segue
// sendo a régua do dashboard web (pedido do Matheus · 2026-07-08).
//
// "Semanas do mês" = semanas ISO cujo DOMINGO cai no mês (regra do Marcos no
// /metas/sugerir). A média considera só semanas com total > 0 (semanas futuras
// do mês corrente não zeram a média).
// ─────────────────────────────────────────────────────────────────────────────
const MESES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

router.get('/media-mes', async (req, res) => {
  try {
    const hoje = new Date();
    const ano = parseInt(req.query.ano, 10) || hoje.getUTCFullYear();
    const mes = parseInt(req.query.mes, 10) || (hoje.getUTCMonth() + 1);
    const indicadorKey = req.query.indicador || 'frequencia';
    const cultoId = req.query.culto && req.query.culto !== 'todos' ? req.query.culto : null;
    if (mes < 1 || mes > 12) return res.status(400).json({ error: 'mês inválido' });
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });

    // Pares {ano_iso, semana} do mês · nas bordas o ano_iso pode diferir do
    // ano calendário (S52/53 terminando em janeiro · S1 começando em dezembro).
    const pares = semanasDoMes(ano, mes);
    const cols = colunasView(indicadorKey);

    let q = supabase
      .from(fonteView(indicadorKey))
      .select(`service_type_id, ano_iso, semana_iso, ${cols.join(', ')}`)
      .in('ano_iso', [...new Set(pares.map(p => p.ano_iso))])
      .in('semana_iso', [...new Set(pares.map(p => p.semana))]);
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

    const chave = (a, s) => `${a}-${s}`;
    const validas = new Set(pares.map(p => chave(p.ano_iso, p.semana)));
    const porSemana = new Map();
    for (const r of (data || [])) {
      const k = chave(r.ano_iso, r.semana_iso);
      if (!validas.has(k)) continue; // .in() cruzado pode trazer combinação fora do mês
      if (excluir.has(r.service_type_id)) continue;
      porSemana.set(k, (porSemana.get(k) || 0) + somaColunas(r, cols));
    }

    const semanas = pares.map(p => {
      const { inicio, fim } = isoWeekRange(p.ano_iso, p.semana);
      return {
        ano_iso: p.ano_iso,
        semana: p.semana,
        total: porSemana.get(chave(p.ano_iso, p.semana)) || 0,
        inicio: inicio.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
      };
    });
    const comDado = semanas.filter(s => s.total > 0);
    const totalMes = comDado.reduce((s, x) => s + x.total, 0);

    res.json({
      ano,
      mes,
      mes_nome: MESES_NOME[mes - 1],
      indicador: indicadorKey,
      rotulo: indDef.rotulo,
      semanas,
      media_semanal: comDado.length ? Math.round(totalMes / comDado.length) : 0,
      total_mes: totalMes,
      semanas_base: comDado.length,
    });
  } catch (e) {
    console.error('[DASH-SEM] media-mes', e.message);
    res.status(500).json({ error: 'Erro ao calcular média semanal do mês' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /culto/:serviceTypeId/historico · série semanal de UM culto no ano
//   query: ano (ISO · default ano ISO de hoje), indicador
//
// Consumido pela tela de detalhe do culto no app CBRio Staff: série do ano +
// melhor/pior semana + média semanal. Lê a mesma vw_dashboard_semanal (1 linha
// por service_type × semana); só semanas com total > 0 entram.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/culto/:serviceTypeId/historico', async (req, res) => {
  try {
    const { serviceTypeId } = req.params;
    const ano = parseInt(req.query.ano, 10) || isoWeekOf(new Date()).ano;
    const indicadorKey = req.query.indicador || 'frequencia';
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });

    const { data: st, error: errSt } = await supabase
      .from('vol_service_types')
      .select('id, name, color, recurrence_day, recurrence_time, has_kids')
      .eq('id', serviceTypeId)
      .maybeSingle();
    if (errSt) throw errSt;
    if (!st) return res.status(404).json({ error: 'Culto não encontrado' });

    const capacidade = capacidadeCulto(st.name);
    const base = {
      ano,
      indicador: indicadorKey,
      rotulo: indDef.rotulo,
      culto: {
        id: st.id,
        nome: st.name,
        cor: st.color,
        recurrence_day: st.recurrence_day,
        recurrence_time: st.recurrence_time,
        capacidade,
      },
    };

    if (indicadorKey.includes('kids') && !st.has_kids) {
      return res.json({
        ...base, serie: [], melhor: null, pior: null, media_semanal: 0, amostra: 0,
        aviso: 'Este culto não tem ministério infantil',
      });
    }

    const cols = colunasView(indicadorKey);
    const { data, error } = await supabase
      .from(fonteView(indicadorKey))
      .select(`semana_iso, ${cols.join(', ')}`)
      .eq('service_type_id', serviceTypeId)
      .eq('ano_iso', ano);
    if (error) throw error;

    const porSemana = new Map();
    for (const r of (data || [])) {
      porSemana.set(r.semana_iso, (porSemana.get(r.semana_iso) || 0) + somaColunas(r, cols));
    }

    const serie = [...porSemana.entries()]
      .filter(([, total]) => total > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([semana, total]) => {
        const { inicio, fim } = isoWeekRange(ano, semana);
        const item = {
          semana,
          total,
          inicio: inicio.toISOString().slice(0, 10),
          fim: fim.toISOString().slice(0, 10),
          label: `Sem ${semana} · ${fmtDateBr(inicio)} a ${fmtDateBr(fim)}`,
        };
        if (indDef.usa_ocupacao) {
          item.taxa_ocupacao = Math.round((total / capacidade) * 1000) / 10;
        }
        return item;
      });

    if (!serie.length) {
      return res.json({ ...base, serie: [], melhor: null, pior: null, media_semanal: 0, amostra: 0 });
    }

    const resumir = (s) => ({ semana: s.semana, total: s.total, label: s.label, inicio: s.inicio, fim: s.fim });
    const melhor = resumir(serie.reduce((a, b) => (b.total > a.total ? b : a)));
    const pior = resumir(serie.reduce((a, b) => (b.total < a.total ? b : a)));
    const media = Math.round(serie.reduce((s, x) => s + x.total, 0) / serie.length);

    res.json({ ...base, serie, melhor, pior, media_semanal: media, amostra: serie.length });
  } catch (e) {
    console.error('[DASH-SEM] culto historico', e.message);
    res.status(500).json({ error: 'Erro ao montar histórico do culto' });
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
      .from(fonteView(indicadorKey))
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
      .from(fonteView(indicadorKey))
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

    const mesesUsados = meses || [1,2,3,4,5,6,7,8,9,10,11,12];
    const series = mesesUsados.map(m => {
      const row = { mes: m, mes_nome: MES_NOMES_LONGO[m - 1] };
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
// GET /ytd?anos=&indicador=&culto= · acumulado do ano ATÉ HOJE comparado com o
// MESMO PERÍODO dos anos anteriores.
//
// ⚠️ O corte é por DIA (dia/mês de hoje em BRT), NÃO por mês fechado nem por ano
// inteiro. Motivo medido em produção: os cultos do ano corrente já nascem
// pré-agendados até dezembro com frequência 0 (2026 tem 347 linhas em `cultos`,
// só ~199 até agosto). Somar "o ano" sem corte compararia 7 meses de 2026 com 12
// de 2025 E inflaria o denominador de cultos — os dois erros na mesma direção.
//
// ⚠️ O nº de cultos no mesmo período MUDA de ano pra ano (154 em 2023 → 199 em
// 2026, porque a igreja abriu horários novos). Por isso o total absoluto vem
// sempre acompanhado da MÉDIA POR CULTO: é ela que compara igreja com igreja, e
// não "mais cultos" com "mais gente".
//
// Voluntariado é a exceção do corte: vem de vw_dashboard_voluntariado (check-ins
// reais), que agrega por semana ISO e NÃO tem coluna de data — o corte dele é a
// última semana ISO COMPLETA, igual em todos os anos (YoY segue justo).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ytd', async (req, res) => {
  try {
    const indicadorKey = req.query.indicador || 'frequencia';
    const indDef = INDICADORES[indicadorKey];
    if (!indDef) return res.status(400).json({ error: 'indicador inválido' });
    const cultoId = req.query.culto && req.query.culto !== 'todos' ? req.query.culto : null;

    const hoje = hojeBrt();
    const anos = (req.query.anos
      ? String(req.query.anos).split(',').map(Number).filter(Number.isInteger)
      : [hoje.ano - 2, hoje.ano - 1, hoje.ano]);
    const anosOrd = [...new Set(anos)].sort((a, b) => a - b);
    if (!anosOrd.length) return res.status(400).json({ error: 'anos é obrigatório' });

    // Período vem dos meses marcados no filtro da aba (lista vazia/ausente = ano
    // todo). resolverPeriodo decide se o recorte é parcial (até hoje) ou fechado.
    const periodo = resolverPeriodo({
      meses: req.query.meses ? String(req.query.meses).split(',').map(Number) : [],
      anos: anosOrd,
      hoje,
    });
    const mesesNoPeriodo = new Set(periodo.meses);

    const avisos = [];

    // Kids · exclui cultos sem kids (mesma régua de /yoy e /media-mes)
    let excluir = new Set();
    if (indicadorKey.includes('kids')) {
      const { data: semKids } = await supabase
        .from('vol_service_types')
        .select('id')
        .eq('has_kids', false);
      excluir = new Set((semKids || []).map(s => s.id));
    }

    const porAno = new Map(); // ano -> { total, comDado, noPeriodo, porMes: Map }
    let corte;

    if (indicadorKey === 'voluntariado') {
      // A semana ISO só entra como corte quando o período é PARCIAL. Período
      // fechado já termina no fim de um mês passado — cortar por semana ali
      // recortaria o mês pela metade sem motivo.
      const semanaCorte = periodo.parcial ? ultimaSemanaIsoCompleta(hoje) : null;
      corte = {
        tipo: semanaCorte ? 'semana' : 'mes',
        semana: semanaCorte,
        rotulo: periodo.rotulo,
        parcial: periodo.parcial,
      };
      if (semanaCorte) {
        avisos.push(`O corte do Voluntariado é a última semana ISO completa (semana ${semanaCorte}): a view de check-ins agrega por semana e não tem coluna de data.`);
      }
      if (cultoId) {
        avisos.push('O filtro de culto não vale para Voluntariado: os check-ins são agregados por bloco (Domingo manhã/noite, Quarta, AMI, Bridge), que não são os mesmos tipos de culto do seletor.');
      }
      const cols = colunasView(indicadorKey);
      await Promise.all(anosOrd.map(async (ano) => {
        const linhas = await selectPaginado(() => {
          let q = supabase
            .from(fonteView(indicadorKey))
            .select(`mes, service_type_id, total_cultos, ${cols.join(', ')}`)
            .eq('ano_iso', ano);
          if (semanaCorte) q = q.lte('semana_iso', semanaCorte);
          return q;
        }, 'mes');
        const acc = { total: 0, comDado: 0, noPeriodo: 0, porMes: new Map() };
        for (const r of linhas) {
          if (excluir.has(r.service_type_id)) continue;
          if (!mesesNoPeriodo.has(r.mes)) continue;
          const v = somaColunas(r, cols);
          const cultos = Number(r.total_cultos) || 0;
          acc.noPeriodo += cultos;
          acc.total += v;
          if (v > 0) acc.comDado += cultos;
          acc.porMes.set(r.mes, (acc.porMes.get(r.mes) || 0) + v);
        }
        porAno.set(ano, acc);
      }));
      avisos.push('Voluntariado conta presenças de voluntário (pessoas distintas por semana e bloco), não voluntários únicos no ano — a mesma pessoa servindo em duas semanas conta duas vezes.');
    } else {
      corte = {
        tipo: 'dia',
        dia: periodo.dia,
        mes: periodo.fimMes,
        rotulo: periodo.rotulo,
        parcial: periodo.parcial,
      };
      const cols = colunasCultos(indicadorKey);
      await Promise.all(anosOrd.map(async (ano) => {
        const linhas = await selectPaginado(() => {
          let q = supabase.from('cultos')
            .select(`data, service_type_id, ${cols.join(', ')}`)
            .gte('data', `${ano}-${String(periodo.inicioMes).padStart(2, '0')}-01`)
            .lte('data', corteDoAno(ano, periodo.fimMes, periodo.dia));
          if (cultoId) q = q.eq('service_type_id', cultoId);
          return q;
        }, 'data');
        const acc = { total: 0, comDado: 0, noPeriodo: 0, porMes: new Map() };
        for (const r of linhas) {
          if (excluir.has(r.service_type_id)) continue;
          const mesLinha = Number(String(r.data).slice(5, 7));
          // Seleção não-contígua (ex.: só mar, mai, jul) — a janela de datas pega
          // o intervalo inteiro, então o mês tem que ser conferido linha a linha.
          if (!mesesNoPeriodo.has(mesLinha)) continue;
          acc.noPeriodo += 1;
          const v = somaColunas(r, cols);
          if (v > 0) { acc.comDado += 1; acc.total += v; }
          acc.porMes.set(mesLinha, (acc.porMes.get(mesLinha) || 0) + v);
        }
        porAno.set(ano, acc);
      }));
    }

    // Δ% sempre contra o ano anterior COM DADO na lista (ordem cronológica) — o
    // usuário pode marcar 2024+2026 sem 2025, e comparar contra "nada" mentiria.
    const resultados = anosOrd.map((ano, idx) => {
      const acc = porAno.get(ano) || { total: 0, comDado: 0, noPeriodo: 0 };
      const temDado = acc.total > 0;
      let deltaPct = null, baseAno = null, deltaMediaPct = null;
      const media = acc.comDado ? acc.total / acc.comDado : null;
      for (let j = idx - 1; j >= 0; j--) {
        const prev = porAno.get(anosOrd[j]);
        if (!temDado || !prev || prev.total <= 0) continue;
        deltaPct = ((acc.total - prev.total) / prev.total) * 100;
        const mediaPrev = prev.comDado ? prev.total / prev.comDado : null;
        if (media != null && mediaPrev) deltaMediaPct = ((media - mediaPrev) / mediaPrev) * 100;
        baseAno = anosOrd[j];
        break;
      }
      return {
        ano,
        total: acc.total,
        cultos_com_dado: acc.comDado,
        cultos_no_periodo: acc.noPeriodo,
        media_por_culto: media != null ? Math.round(media * 10) / 10 : null,
        delta_pct: deltaPct,
        delta_media_pct: deltaMediaPct,
        base_ano: baseAno,
        tem_dado: temDado,
      };
    });

    // Ano sem dado é COMUM e não é defeito: os check-ins de voluntário só começam
    // na semana 16 de 2026 e o Online DS só existe a partir de 2024. Dizer isso na
    // resposta evita que a tela pareça quebrada.
    const anosComDado = resultados.filter(r => r.tem_dado).map(r => r.ano);
    if (!anosComDado.length) {
      avisos.push('Nenhum dos anos selecionados tem dado deste indicador no período.');
    } else if (anosComDado.length === 1) {
      avisos.push(`Só ${anosComDado[0]} tem dado deste indicador no período — não há histórico para comparar.`);
    } else if (anosComDado.length < anosOrd.length) {
      avisos.push(`Sem dado deste indicador no período em ${anosOrd.filter(a => !anosComDado.includes(a)).join(', ')}.`);
    }

    // Curva acumulada mês a mês · mesma janela em todos os anos (o último mês é
    // parcial de propósito — é ele que representa "até hoje").
    const running = new Map(anosOrd.map(a => [a, 0]));
    const acumulado = [];
    for (const m of periodo.meses) {
      const row = { mes: m, mes_nome: MES_NOMES_CURTO[m - 1] };
      for (const a of anosOrd) {
        const acc = porAno.get(a);
        running.set(a, (running.get(a) || 0) + (acc?.porMes.get(m) || 0));
        // Ano sem NENHUM dado no período vira null · linha não nasce rastejando no zero
        row[String(a)] = acc && acc.total > 0 ? running.get(a) : null;
      }
      acumulado.push(row);
    }

    // Batismos realizados no mesmo período · não depende do filtro de culto
    // (batismo não acontece "num tipo de culto"). Conta pela data da cerimônia.
    // ⚠️ A janela é contígua (gte/lte). Com seleção de meses não-contígua o número
    // incluiria mês fora do recorte, então nesse caso o bloco não é calculado —
    // devolver um total "quase certo" é pior que não devolver.
    const batismos = periodo.contiguo
      ? await Promise.all(anosOrd.map(async (ano) => {
          const { count, error } = await supabase
            .from('batismo_inscricoes')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'realizado')
            .gte('data_batismo', `${ano}-${String(periodo.inicioMes).padStart(2, '0')}-01`)
            .lte('data_batismo', corteDoAno(ano, periodo.fimMes, periodo.dia));
          if (error) throw error;
          return { ano, total: count || 0 };
        }))
      : [];
    if (!periodo.contiguo) {
      avisos.push('Os meses escolhidos não são seguidos, então o bloco de batismos fica de fora: a contagem dele é por intervalo de datas e incluiria mês fora do recorte.');
    }

    res.json({
      indicador: indicadorKey,
      rotulo: indDef.rotulo,
      corte,
      periodo: {
        meses: periodo.meses,
        inicio_mes: periodo.inicioMes,
        fim_mes: periodo.fimMes,
        dia_fim: periodo.dia,
        parcial: periodo.parcial,
        contiguo: periodo.contiguo,
        rotulo: periodo.rotulo,
      },
      anos: anosOrd,
      resultados,
      acumulado,
      batismos,
      avisos,
    });
  } catch (e) {
    console.error('[DASH-SEM] ytd', e.message, e);
    res.status(500).json({ error: 'Erro ao montar o acumulado do ano' });
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

    // Voluntariado vem dos check-ins (por bloco) · view vw_dashboard_voluntariado.
    // Os períodos do valor-atual são alinhados a semana ISO / mês / ano, que a
    // view já agrega — filtra direto por esses campos.
    if (indicadorKey === 'voluntariado') {
      let vq = supabase.from('vw_dashboard_voluntariado').select('voluntariado');
      if (periodicidade === 'semanal') {
        const w = isoWeekOf(fim);
        vq = vq.eq('ano_iso', w.ano).eq('semana_iso', w.semana);
      } else if (periodicidade === 'mensal') {
        vq = vq.eq('ano_calendario', inicio.getUTCFullYear()).eq('mes', inicio.getUTCMonth() + 1);
      } else {
        vq = vq.eq('ano_calendario', inicio.getUTCFullYear());
      }
      const { data: vdata, error: verr } = await vq;
      if (verr) throw verr;
      const totalVol = (vdata || []).reduce((s, r) => s + (Number(r.voluntariado) || 0), 0);
      return res.json({
        indicador: indicadorKey, periodicidade, label,
        inicio: inicio.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
        total: totalVol,
      });
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

    const periodoRef = `${inicio.toISOString().slice(0, 10)} a ${fim.toISOString().slice(0, 10)}`;

    // Voluntariado vem dos check-ins (por bloco) · vw_dashboard_voluntariado.
    // Os períodos das bases são alinhados a mês, então filtramos por (ano, mês).
    if (indicadorKey === 'voluntariado') {
      const mesesSet = new Set();
      const cur = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
      while (cur <= fim) {
        mesesSet.add(`${cur.getUTCFullYear()}-${cur.getUTCMonth() + 1}`);
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
      const anosPeriodo = [...new Set([...mesesSet].map(k => Number(k.split('-')[0])))];
      const { data: vrows, error: verr } = await supabase
        .from('vw_dashboard_voluntariado')
        .select('ano_iso, semana_iso, ano_calendario, mes, voluntariado')
        .in('ano_calendario', anosPeriodo);
      if (verr) throw verr;
      const noPeriodo = (vrows || []).filter(r => mesesSet.has(`${r.ano_calendario}-${r.mes}`));

      if (modoAbsoluto) {
        const total = noPeriodo.reduce((s, r) => s + (Number(r.voluntariado) || 0), 0);
        return res.json({
          sugestao: Math.round(total), base_label: baseLabel, periodo_referencia: periodoRef,
          amostra: noPeriodo.length, valores_amostra: [], modo: 'absoluto',
          ...(total === 0 ? { aviso: 'Sem check-ins de voluntariado no período.' } : {}),
        });
      }
      // média por período (semana ISO ou mês), somando os blocos dentro de cada um
      const grupos = new Map();
      for (const r of noPeriodo) {
        const key = periodicidade === 'mensal' ? `${r.ano_calendario}-${r.mes}` : `${r.ano_iso}-${r.semana_iso}`;
        grupos.set(key, (grupos.get(key) || 0) + (Number(r.voluntariado) || 0));
      }
      const valores = [...grupos.values()].filter(v => v > 0);
      if (!valores.length) {
        return res.json({ sugestao: 0, base_label: baseLabel, periodo_referencia: periodoRef, amostra: 0, valores_amostra: [], aviso: 'Sem check-ins de voluntariado no período.' });
      }
      const media = valores.reduce((s, v) => s + v, 0) / valores.length;
      return res.json({
        sugestao: Math.round(media), base_label: baseLabel, periodo_referencia: periodoRef,
        amostra: valores.length, valores_amostra: valores.slice(0, 8), media_exata: Math.round(media * 100) / 100,
      });
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
  aceitacoes_total_kids: { view: ['aceitacoes', 'aceitacoes_online', 'aceitacoes_kids'], cultos: ['decisoes_presenciais', 'decisoes_online', 'decisoes_kids'] },
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

// Fonte do indicador nas queries por (service_type × período). Voluntariado vem
// dos check-ins (vol_check_ins · por bloco), não da coluna manual cultos.voluntarios
// — view vw_dashboard_voluntariado tem a MESMA forma da vw_dashboard_semanal.
function fonteView(indicadorKey) {
  return indicadorKey === 'voluntariado' ? 'vw_dashboard_voluntariado' : 'vw_dashboard_semanal';
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
ESQUEMA REAL (use SOMENTE estas tabelas/colunas — NÃO invente nomes):

Cultos e frequência:
- cultos (1 linha por culto): data, service_type_id, presencial_adulto,
  presencial_kids, decisoes_presenciais, decisoes_online, decisoes_kids,
  online_pico, online_ds (assistiram no domingo), online_ddus (durante a semana).
  Frequência total de um culto = presencial_adulto + presencial_kids.
- vol_service_types: id, name, recurrence_day (0=Dom..6=Sáb), recurrence_time.
  Tipos: Domingo 08:30/10:00/11:30/19:00, Quarta com Deus, AMI (sáb), Bridge (sáb).
- cultos_decisoes_pessoas: pessoa (nome/cpf/telefone), culto_id, tipo_decisao,
  membro_id, fonte — 1 linha por pessoa que decidiu.

Pessoas / jornada:
- mem_membros: id, nome, cpf, status, data_nascimento, frequenta_area (ami/bridge),
  familia_id, deleted_at. (filtrar deleted_at IS NULL)
- int_visitantes: visitantes; batismo_inscricoes: status(pendente/confirmado/
  realizado/cancelado), data_batismo, membro_id, area_kpi (sede/ami/bridge/online).
- cui_convertidos: convertidos (jornada) · area, primeiro_contato_em.
- next_matriculas / next_encontros / next_presencas: trilha Next (turmas de 2 encontros).

Conectar / Servir / Investir / Generosidade:
- mem_grupo_membros: membro_id, grupo_id, funcao, entrou/desde, saiu_em (ativo = saiu_em IS NULL). Pessoas em grupos = DISTINCT membro_id com saiu_em IS NULL.
- mem_grupos: id, nome, lider_id, dia_semana, temporada.
- mem_voluntarios: membro_id, ministerio, desde, ate (ativo = ate IS NULL). Servir "ativo" real usa check-ins: vol_check_ins (volunteer_id, data) nos últimos 90 dias.
- mem_devocionais: membro_id, data_devocional, concluida (check-in de devocional).
- mem_contribuicoes: membro_id, data, valor, tipo (dizimo/oferta), area.
  ⚠️ Empréstimo NÃO é receita ordinária (excluir de "receita").
- fin_transacoes / views vw_fin_semana_resumo, vw_fin_semana_cultos, vw_doacoes_mensal (dízimo/oferta por mês, doadores únicos).

Views úteis já prontas: vw_dashboard_semanal (frequência/decisões por culto),
vw_batismo_historico_anual (ano, area_kpi, total_batismos), vw_culto_historico_anual.

Regras de negócio (importante):
- Semana da IGREJA no financeiro = QUARTA→TERÇA (fn fin_semana_qua_ter). Frequência de culto = SEG→DOM. NÃO misturar.
- Capacidade do templo: 1050 lugares (use pra % de ocupação).
- Contagem de PESSOAS deve ser DISTINCT (uma pessoa não conta 2x); "ativo" em grupos/voluntários é por saiu_em/ate/janela de 90 dias.

Indicadores já existentes no Dashboard Semanal (evite duplicar):
frequência, frequencia_kids, aceitacoes, aceitacoes_online, ao_vivo,
online_ds, online_ddus, voluntariado.
    `.trim();

    const system = `Você é um analista de dados sênior especializado em métricas ministeriais da igreja CBRio.
Dado um objetivo de medição em linguagem natural, retorne um JSON puro com a estrutura do indicador.

${dadosDisponiveis}

Diretrizes:
- Baseie a fórmula NAS TABELAS/COLUNAS REAIS acima; não invente colunas. Se algo não existir no esquema, diga isso em "alertas".
- Escolha o "tipo_grafico" que melhor comunica a métrica: evolução no tempo→linha; comparação entre categorias→barra; % de uma meta/ocupação→gauge; composição→pizza; múltiplas dimensões→radar.
- Faça a "formula" específica e calculável (colunas reais, período, DISTINCT quando for pessoas). "exemplo_consulta" deve ser um SQL plausível sobre o esquema.
- "nome" curto e ESPECÍFICO (que diferencie de indicadores parecidos).

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
      model: 'claude-opus-4-8', // Opus 4.8 · sugestão de indicador (decisão Matheus 2026-07-29)
      max_tokens: 1500,
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

// POST /ia/refinar-indicador/:id — edita um indicador já criado usando IA.
// Pega a sugestão atual + uma instrução do usuário e devolve o JSON atualizado,
// gravando na MESMA linha (mantém id e status ativo/rascunho).
router.post('/ia/refinar-indicador/:id', async (req, res) => {
  try {
    const instrucao = (req.body?.instrucao || '').trim();
    if (!instrucao) return res.status(400).json({ error: 'instrucao é obrigatória' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada' });
    }
    const { data: atual, error: errGet } = await supabase
      .from('dashboard_indicadores_custom')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (errGet) throw errGet;
    if (!atual) return res.status(404).json({ error: 'Indicador não encontrado' });

    const client = new Anthropic();
    const dadosDisponiveis = `
Tabelas principais do CBRio com dados de cultos:
- cultos: data, service_type_id, presencial_adulto, presencial_kids,
  decisoes_presenciais, decisoes_online, decisoes_kids, online_pico,
  online_ds, online_ddus, voluntários
- vol_service_types: tipos de culto (Domingo 08:30, 10:00, 11:30, 19:00,
  Quarta com Deus, AMI, Bridge)
- mem_membros, mem_contribuicoes (data, membro_id, valor, tipo), mem_grupo_membros,
  mem_voluntarios, batismo_inscricoes, int_visitantes, mem_devocionais,
  cultos_decisoes_pessoas
Capacidade do templo: 1050 lugares.`.trim();

    const system = `Você é um analista de dados da igreja CBRio. Vou te dar um indicador já existente (em JSON) e uma instrução de ajuste do usuário. Aplique a mudança pedida e retorne o JSON COMPLETO atualizado (mesmo formato), sem texto extra. Se o usuário pedir um TIPO DE GRÁFICO específico, atualize o campo "tipo_grafico" de fato (barra de progresso/medidor→"gauge", barras→"barra", linha→"linha", área→"area", pizza→"pizza", radar→"radar").

${dadosDisponiveis}

Formato do JSON (retorne todos os campos, atualizando o que a instrução pedir):
{
  "nome": "Nome curto (max 60 chars)",
  "descricao": "1-2 frases",
  "formula": "Fórmula em pseudo-SQL ou descrição matemática",
  "tipo_grafico": "barra | linha | area | pizza | gauge | radar",
  "eixo_x": "...", "eixo_y": "...",
  "periodicidade_sugerida": "semanal | mensal | trimestral | anual",
  "metricas_relacionadas": [...], "tabelas_envolvidas": [...],
  "exemplo_consulta": "...", "alertas": [...]
}`;

    const userMsg = `Indicador atual (JSON):\n${JSON.stringify(atual.sugestao_ia || {}, null, 2)}\n\nInstrução de ajuste do usuário:\n${instrucao}`;
    const response = await client.messages.create({
      model: 'claude-opus-4-8', // Opus 4.8 · edição de indicador (decisão Matheus 2026-07-29)
      max_tokens: 1500, system,
      messages: [{ role: 'user', content: userMsg }],
    });
    const raw = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let sugestao;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      sugestao = JSON.parse(match ? match[0] : raw);
    } catch {
      return res.status(500).json({ error: 'IA não retornou JSON válido', raw });
    }

    const { data: salvo, error: errSave } = await supabase
      .from('dashboard_indicadores_custom')
      .update({
        nome: sugestao.nome || atual.nome,
        descricao: sugestao.descricao ?? atual.descricao,
        sugestao_ia: sugestao,
        // guarda o histórico de instruções na pergunta
        pergunta_usuario: `${atual.pergunta_usuario || ''}\n[ajuste] ${instrucao}`.trim(),
      })
      .eq('id', req.params.id).select().single();
    if (errSave) throw errSave;

    res.json({ ok: true, sugestao, registro: salvo });
  } catch (e) {
    console.error('[DASH-SEM] ia refinar', e.message);
    res.status(500).json({ error: e.message || 'Erro ao refinar indicador' });
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

// GET /next-presenca-mensal?meses=12 · quantas pessoas estiveram PRESENTES no
// NEXT por mês (aba simples do Dashboard Semanal). Presença = inscrição do NEXT
// com check-in feito (next_inscricoes.check_in_at) — mesma régua do módulo /next.
// Agrupa pelo mês do EVENTO (next_eventos.data · "no NEXT de tal mês"); se o
// evento não tiver data, cai no mês do próprio check-in. Paginado (cap 1000).
router.get('/next-presenca-mensal', async (req, res) => {
  try {
    const meses = Math.min(Math.max(parseInt(req.query.meses, 10) || 12, 1), 36);
    // Janela: início do mês, `meses` meses atrás.
    const hoje = new Date();
    const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - (meses - 1), 1));

    // Puxa os check-ins do NEXT (volume pequeno) paginando pra fugir do cap de 1000.
    let linhas = [];
    let offset = 0;
    const page = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('next_inscricoes')
        .select('id, check_in_at, evento:next_eventos(data)')
        .not('check_in_at', 'is', null)
        .range(offset, offset + page - 1);
      if (error) throw error;
      if (!data || !data.length) break;
      linhas = linhas.concat(data);
      if (data.length < page) break;
      offset += page;
    }

    // Agrupa por mês (AAAA-MM) do evento; fallback pro mês do check-in.
    const porMes = {};
    for (const l of linhas) {
      const ref = l.evento?.data || l.check_in_at;
      if (!ref) continue;
      const ym = String(ref).slice(0, 7); // AAAA-MM
      if (ym < inicio.toISOString().slice(0, 7)) continue; // fora da janela
      porMes[ym] = (porMes[ym] || 0) + 1;
    }

    // Ajuste MANUAL por mês (lista de presença · quando o check-in não foi
    // usado). Quando existe manual pro mês, ELE SUBSTITUI a contagem automática.
    const manual = {};
    try {
      const { data: mrows } = await supabase.from('next_presenca_mensal').select('ano_mes, total');
      for (const m of mrows || []) manual[m.ano_mes] = m.total;
    } catch { /* tabela pode não existir ainda · cai só no automático */ }

    // Monta a série contínua dos últimos `meses` (mês sem NEXT aparece como 0).
    const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const serie = [];
    for (let i = 0; i < meses; i++) {
      const d = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + i, 1));
      const ym = d.toISOString().slice(0, 7);
      const auto = porMes[ym] || 0;
      const temManual = Object.prototype.hasOwnProperty.call(manual, ym);
      serie.push({
        mes: ym,
        label: `${MESES_PT[d.getUTCMonth()]}/${d.getUTCFullYear()}`,
        presentes: temManual ? manual[ym] : auto,
        auto,
        manual: temManual ? manual[ym] : null,
        fonte: temManual ? 'manual' : 'checkin',
      });
    }
    const total = serie.reduce((s, m) => s + m.presentes, 0);
    res.json({ serie, total });
  } catch (e) {
    console.error('[DASH-SEM] next-presenca-mensal', e.message);
    res.status(500).json({ error: 'Erro ao carregar presença do NEXT' });
  }
});

// PUT /next-presenca-mensal · define/atualiza o total MANUAL de um mês (lista de
// presença). Passar total=null limpa o manual (volta pro automático do check-in).
// Só admin/diretor. Body: { ano_mes:'AAAA-MM', total, observacao? }.
router.put('/next-presenca-mensal', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { ano_mes, total, observacao } = req.body || {};
    if (!/^\d{4}-\d{2}$/.test(String(ano_mes || ''))) {
      return res.status(400).json({ error: 'ano_mes inválido (use AAAA-MM)' });
    }
    // Limpar o manual → remove a linha (volta pro automático).
    if (total === null || total === '' || total === undefined) {
      await supabase.from('next_presenca_mensal').delete().eq('ano_mes', ano_mes);
      return res.json({ ok: true, ano_mes, total: null });
    }
    const n = Number(total);
    if (!Number.isInteger(n) || n < 0) {
      return res.status(400).json({ error: 'total deve ser um número inteiro >= 0' });
    }
    const { error } = await supabase.from('next_presenca_mensal').upsert({
      ano_mes,
      total: n,
      observacao: observacao ? String(observacao).slice(0, 300) : null,
      updated_by: req.user?.userId ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ano_mes' });
    if (error) throw error;
    res.json({ ok: true, ano_mes, total: n });
  } catch (e) {
    console.error('[DASH-SEM] next-presenca-mensal PUT', e.message);
    res.status(500).json({ error: 'Erro ao salvar a presença do NEXT' });
  }
});

module.exports = router;
