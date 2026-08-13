/**
 * Governança — Relatórios automáticos para reuniões de gestão estratégica.
 * Puxa dados reais dos módulos do sistema e gera checklist + preview.
 *
 * 4 reuniões mensais (quartas): OKR → DRE → KPI → Conselho
 * Regra: todo desvio deve gerar causa, decisão, responsável e próximo passo.
 */
const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { supabase } = require('../utils/supabase');
const { fetchAllRows } = require('../utils/pagination');
const govDocs = require('../services/sharepointGovernanca');
const govIA = require('../services/governancaIA');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: govDocs.MAX_BYTES } });

// ⚠️ PADRÃO POR PREFIXO, copiado do `routes/totemKids.js` (que já resolvia isto
// desde antes). Prefiro ele a uma lista de caminhos por um motivo prático: lista
// exige manutenção, e "alguém acrescentou rota de cron e esqueceu de liberar" é
// EXATAMENTE o bug que este conserto está tirando. `/cron/*` é convenção do
// repo, então a regra se mantém sozinha.
//
// ⚠️ Fail-closed de verdade: só pula com segredo VÁLIDO (`isAuthorizedCron`).
// Chamada manual de admin (JWT, sem segredo) segue pelo `authenticate` normal.
router.use((req, res, next) => (
  req.path.startsWith('/cron/') && isAuthorizedCron(req)
    ? next()
    : authenticate(req, res, next)
));

// ── Helpers ──
const hoje = () => new Date().toISOString().split('T')[0];
function parseMes(input) {
  let y, m;
  if (input && /^\d{4}-\d{2}/.test(input)) { [y, m] = input.split('-').map(Number); }
  else { const n = new Date(); y = n.getFullYear(); m = n.getMonth() + 1; }
  const mesISO = `${y}-${String(m).padStart(2, '0')}`;
  const inicioStr = `${mesISO}-01`;
  const fimStr = new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0];
  const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const semanasNoMes = Math.max(1, Math.ceil(diasNoMes / 7));
  // Mês anterior
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const mesAnteriorInicio = `${py}-${String(pm).padStart(2, '0')}-01`;
  const mesAnteriorFim = new Date(Date.UTC(py, pm, 0)).toISOString().split('T')[0];
  return { mesISO, inicioStr, fimStr, diasNoMes, semanasNoMes, mesAnteriorInicio, mesAnteriorFim };
}

// Nésima quarta-feira (weekday=3) do mês · clampa pra última quarta se faltar.
function nthWednesday(year, month, n) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=dom..6=sab
  let day = 1 + ((3 - firstDow + 7) % 7) + (Math.max(1, n) - 1) * 7;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  while (day > lastDay) day -= 7;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().split('T')[0];
}

const TIPOS = [
  { sigla: 'OKR', nome: 'OKR', cor: '#3b82f6', recorrencia: 'Mensal — 1ª quarta', descricao: 'Revisar objetivos estratégicos, KRs em risco, desvios e causas' },
  { sigla: 'DRE', nome: 'DRE', cor: '#10b981', recorrencia: 'Mensal — 2ª quarta', descricao: 'Saúde econômica: receita, custos, despesas, planejado x realizado' },
  { sigla: 'KPI', nome: 'KPI', cor: '#f59e0b', recorrencia: 'Mensal — 3ª quarta', descricao: 'Performance operacional: 5 pilares, meta x realizado, tendência' },
  { sigla: 'CC',  nome: 'Conselho Consultivo', cor: '#8b5cf6', recorrencia: 'Mensal — 4ª quarta', descricao: 'Síntese OKR+DRE+KPI, riscos, decisões estruturais' },
  { sigla: 'DE',  nome: 'Diretoria Estatutária', cor: '#ef4444', recorrencia: 'Quadrimestral', descricao: 'Relatório de diretoria: RH, patrimônio, financeiro acumulado' },
  { sigla: 'AG',  nome: 'Assembleia Geral', cor: '#06b6d4', recorrencia: 'Semestral', descricao: 'Prestação de contas completa à igreja' },
];

router.get('/tipos', (req, res) => res.json(TIPOS));

// ══════════════════════════════════════════════
// BUILDERS — cada um retorna { checklist, resumo, dados }
// ══════════════════════════════════════════════

async function buildOKR() {
  const h = hoje();
  const [projRes, tasksRes, risksRes, kpisRes, marcosRes] = await Promise.all([
    supabase.from('projects').select('id, name, status, date_end, responsible, area, budget_planned, budget_spent, priority, description, ourico_passa, gera_unidade, colabora_expansao, macro_eixo, publico_alvo, complexidade, impacto').neq('status', 'concluido').neq('status', 'cancelado').order('name'),
    fetchAllRows(() => supabase.from('project_tasks').select('id, project_id, status')),  // 2.7k linhas → paginado
    supabase.from('project_risks').select('id, project_id, title, probability, impact, score, owner_name, status, mitigation').neq('status', 'mitigado').order('score', { ascending: false }),
    supabase.from('project_kpis').select('id, project_id, name, target_value, current_value, unit'),
    supabase.from('expansion_milestones').select('id, name, status, date_end, responsible, area, phase, budget_planned').neq('status', 'concluido').neq('status', 'cancelado').order('sort_order'),
  ]);

  const proj = projRes.data || [];
  const tasks = tasksRes || [];  // fetchAllRows → array direto
  const risks = risksRes.data || [];
  const allKpis = kpisRes.data || [];
  const marcos = marcosRes.data || [];

  // Classificar KR: on_track (>=80%), at_risk (50-79%), off_track (<50%)
  function krStatus(kr) {
    if (!kr.target_value || kr.target_value === 0) return 'sem_meta';
    const pct = Math.round((Number(kr.current_value || 0) / Number(kr.target_value)) * 100);
    if (pct >= 80) return 'on_track';
    if (pct >= 50) return 'at_risk';
    return 'off_track';
  }

  // Enriquecer projetos com KRs (Key Results = project_kpis)
  const projEnriched = proj.map(p => {
    const pTasks = tasks.filter(t => t.project_id === p.id);
    const done = pTasks.filter(t => t.status === 'concluida' || t.status === 'concluido').length;
    const pRisks = risks.filter(r => r.project_id === p.id);
    const pKRs = allKpis.filter(k => k.project_id === p.id).map(kr => ({
      ...kr,
      pct: kr.target_value > 0 ? Math.round((Number(kr.current_value || 0) / Number(kr.target_value)) * 100) : 0,
      status: krStatus(kr),
    }));
    const budgetPct = p.budget_planned > 0 ? Math.round((Number(p.budget_spent || 0) / Number(p.budget_planned)) * 100) : 0;
    const atrasado = p.date_end && p.date_end < h;
    const krsAtRisk = pKRs.filter(k => k.status === 'at_risk' || k.status === 'off_track');
    return {
      ...p, total_tasks: pTasks.length, tasks_done: done,
      pct_completion: pTasks.length > 0 ? Math.round((done / pTasks.length) * 100) : 0,
      budget_pct: budgetPct, risks: pRisks, key_results: pKRs,
      krs_total: pKRs.length, krs_on_track: pKRs.filter(k => k.status === 'on_track').length,
      krs_at_risk: krsAtRisk.length,
      at_risk: atrasado || krsAtRisk.length > 0 || pRisks.some(r => r.score >= 12) || budgetPct > 90,
      atrasado,
    };
  });

  // Agrupar por área
  const porArea = {};
  projEnriched.forEach(p => {
    const a = p.area || 'Sem área';
    if (!porArea[a]) porArea[a] = [];
    porArea[a].push(p);
  });

  // Totais de KRs
  const totalKRs = allKpis.length;
  const krsOnTrack = allKpis.filter(k => krStatus(k) === 'on_track').length;
  const krsAtRisk = allKpis.filter(k => krStatus(k) === 'at_risk').length;
  const krsOffTrack = allKpis.filter(k => krStatus(k) === 'off_track').length;

  // Alertas
  const alertas = [
    ...projEnriched.filter(p => p.atrasado).map(p => ({ tipo: 'atrasado', item: p.name, responsavel: p.responsible, data: p.date_end })),
    ...projEnriched.filter(p => !p.responsible).map(p => ({ tipo: 'sem_responsavel', item: p.name })),
    ...allKpis.filter(k => krStatus(k) === 'off_track').map(k => {
      const pj = proj.find(p => p.id === k.project_id);
      return { tipo: 'kr_off_track', item: `${k.name}: ${k.current_value || 0}/${k.target_value} ${k.unit || ''}`, responsavel: pj?.responsible, projeto: pj?.name };
    }),
    ...risks.filter(r => r.score >= 12).slice(0, 5).map(r => ({ tipo: 'risco_alto', item: r.title, score: r.score, responsavel: r.owner_name })),
  ];

  const atrasados = projEnriched.filter(p => p.atrasado);
  const emRisco = projEnriched.filter(p => p.at_risk && !p.atrasado);
  const marcosAtrasados = marcos.filter(m => m.date_end && m.date_end < h);
  const pctMedia = projEnriched.length > 0 ? Math.round(projEnriched.reduce((s, p) => s + p.pct_completion, 0) / projEnriched.length) : 0;

  return {
    checklist: [
      { item: 'Key Results cadastrados', ok: totalKRs > 0, valor: totalKRs > 0 ? `${totalKRs} KRs em ${projEnriched.filter(p => p.krs_total > 0).length} objetivos` : 'Nenhum KR cadastrado' },
      { item: 'KRs com valor atual preenchido', ok: allKpis.every(k => k.current_value != null), valor: `${allKpis.filter(k => k.current_value != null).length}/${totalKRs} atualizados` },
      { item: 'Projetos no prazo', ok: atrasados.length === 0, valor: `${proj.length - atrasados.length}/${proj.length}` },
      { item: 'Todos com responsável', ok: projEnriched.every(p => p.responsible), valor: projEnriched.filter(p => !p.responsible).length === 0 ? 'OK' : `${projEnriched.filter(p => !p.responsible).length} sem resp.` },
      { item: 'Marcos de expansão atualizados', ok: marcosAtrasados.length === 0, valor: `${marcos.length - marcosAtrasados.length}/${marcos.length} no prazo` },
      { item: 'Sem KRs críticos', ok: krsOffTrack === 0, valor: krsOffTrack === 0 ? 'OK' : `${krsOffTrack} KRs abaixo de 50%` },
    ],
    resumo: {
      total_objetivos: proj.length, no_prazo: proj.length - atrasados.length - emRisco.length,
      atrasados: atrasados.length, em_risco: emRisco.length,
      pct_conclusao_media: pctMedia,
      total_krs: totalKRs, krs_on_track: krsOnTrack, krs_at_risk: krsAtRisk, krs_off_track: krsOffTrack,
      marcos_ativos: marcos.length, marcos_atrasados: marcosAtrasados.length,
    },
    ourico: {
      passam: proj.filter(p => p.ourico_passa).length,
      geram_unidade: proj.filter(p => p.gera_unidade).length,
      colaboram_expansao: proj.filter(p => p.colabora_expansao).length,
      total: proj.length,
    },
    dados: { projetos_por_area: porArea, marcos, alertas, marcosAtrasados },
  };
}

async function buildDRE(mes) {
  const { mesISO, inicioStr, fimStr, mesAnteriorInicio, mesAnteriorFim } = parseMes(mes);
  const h = hoje();

  const [contasRes, transAtualRes, transAntRes, pagarRes, reembRes] = await Promise.all([
    supabase.from('fin_contas').select('id, nome, tipo, saldo, ativa').eq('ativa', true).order('nome'),
    // fin_transacoes do mês passa de 1000 (junho ~4k) — paginado nos 2 (mês e mês anterior)
    fetchAllRows(() => supabase.from('fin_transacoes').select('id, tipo, valor, data_competencia, descricao, fin_categorias(nome, tipo)').gte('data_competencia', inicioStr).lte('data_competencia', fimStr).neq('status', 'cancelado').order('data_competencia', { ascending: false })),
    fetchAllRows(() => supabase.from('fin_transacoes').select('tipo, valor, fin_categorias(nome, tipo)').gte('data_competencia', mesAnteriorInicio).lte('data_competencia', mesAnteriorFim).neq('status', 'cancelado')),
    supabase.from('fin_contas_pagar').select('id, descricao, fornecedor, valor, data_vencimento, status').eq('status', 'pendente').order('data_vencimento'),
    supabase.from('fin_reembolsos').select('id, descricao, valor, status').eq('status', 'pendente'),
  ]);

  const contas = contasRes.data || [];
  const transAtual = transAtualRes || [];  // fetchAllRows → array direto
  const transAnt = transAntRes || [];
  const pagar = pagarRes.data || [];
  const reemb = reembRes.data || [];

  const agg = (trans) => {
    const rec = trans.filter(t => t.tipo === 'receita');
    const desp = trans.filter(t => t.tipo === 'despesa');
    const totalRec = rec.reduce((s, t) => s + Number(t.valor), 0);
    const totalDesp = desp.reduce((s, t) => s + Number(t.valor), 0);
    // Agrupar por categoria
    const porCat = (list) => {
      const map = {};
      list.forEach(t => { const cat = t.fin_categorias?.nome || 'Sem categoria'; map[cat] = (map[cat] || 0) + Number(t.valor); });
      const total = list.reduce((s, t) => s + Number(t.valor), 0);
      return Object.entries(map).map(([cat, val]) => ({ categoria: cat, valor: val, pct: total > 0 ? Math.round((val / total) * 100) : 0 })).sort((a, b) => b.valor - a.valor);
    };
    return { totalRec, totalDesp, resultado: totalRec - totalDesp, recPorCat: porCat(rec), despPorCat: porCat(desp) };
  };

  const atual = agg(transAtual);
  const anterior = agg(transAnt);
  const saldoTotal = contas.reduce((s, c) => s + Number(c.saldo || 0), 0);
  const varRec = anterior.totalRec > 0 ? Math.round(((atual.totalRec - anterior.totalRec) / anterior.totalRec) * 100) : null;
  const varDesp = anterior.totalDesp > 0 ? Math.round(((atual.totalDesp - anterior.totalDesp) / anterior.totalDesp) * 100) : null;
  const pagarVencidas = pagar.filter(p => p.data_vencimento && p.data_vencimento < h);

  return {
    checklist: [
      { item: 'Transações do mês lançadas', ok: transAtual.length > 0, valor: `${transAtual.length} transações` },
      { item: 'Contas com saldo atualizado', ok: contas.length > 0, valor: `${contas.length} contas ativas` },
      { item: 'Sem contas a pagar vencidas', ok: pagarVencidas.length === 0, valor: pagarVencidas.length === 0 ? 'OK' : `${pagarVencidas.length} vencidas` },
      { item: 'Reembolsos processados', ok: reemb.length === 0, valor: reemb.length === 0 ? 'OK' : `${reemb.length} pendentes` },
    ],
    resumo: {
      receitas: atual.totalRec, despesas: atual.totalDesp, resultado: atual.resultado,
      saldo_total: saldoTotal, variacao_receita_pct: varRec, variacao_despesa_pct: varDesp,
      resultado_anterior: anterior.resultado,
    },
    dados: {
      receitas_por_categoria: atual.recPorCat, despesas_por_categoria: atual.despPorCat,
      mes_anterior: { receitas: anterior.totalRec, despesas: anterior.totalDesp, resultado: anterior.resultado },
      contas_pagar: pagar.map(p => ({ ...p, vencida: p.data_vencimento && p.data_vencimento < h })),
      total_pagar: pagar.reduce((s, p) => s + Number(p.valor), 0),
      reembolsos: reemb, total_reembolsos: reemb.reduce((s, r) => s + Number(r.valor), 0),
      saldo_por_conta: contas.map(c => ({ nome: c.nome, tipo: c.tipo, saldo: Number(c.saldo) })),
    },
  };
}

async function buildKPI(mes) {
  const { mesISO, inicioStr, fimStr, diasNoMes, semanasNoMes, mesAnteriorInicio, mesAnteriorFim } = parseMes(mes);
  const noventaDias = new Date(); noventaDias.setDate(noventaDias.getDate() - 90);

  const settled = await Promise.allSettled([
    supabase.from('cultos').select('presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online, online_ds').gte('data', inicioStr).lte('data', fimStr),
    supabase.from('cultos').select('presencial_adulto, presencial_kids, online_ds').gte('data', mesAnteriorInicio).lte('data', mesAnteriorFim),
    supabase.from('mem_grupo_membros').select('id', { count: 'exact', head: true }).is('saiu_em', null),
    // Investir em Deus = devocional do app (mem_devocionais · decisão Matheus 2026-06-20, era PENSE)
    supabase.from('mem_devocionais').select('membro_id').eq('concluida', true).is('deleted_at', null).gte('data_devocional', inicioStr).lte('data_devocional', fimStr),
    supabase.rpc('kpi_servir_comunidade', { _since: noventaDias.toISOString() }),
    // Generosidade = balanço vivo (fin_transacoes → vw_doacoes_mensal · dízimo+
    // oferta por código de plano de contas), alimentado toda semana. Substitui o
    // cultura_mensal (snapshot manual · parou em abr/2026 → falso "não preenchido").
    supabase.from('vw_doacoes_mensal').select('*').eq('mes', inicioStr).maybeSingle(),
    supabase.from('kpi_metas').select('*').order('area'),
    supabase.from('mem_membros').select('id', { count: 'exact', head: true }).eq('status', 'membro_ativo').is('deleted_at', null),
  ]);

  const pick = (i) => settled[i].status === 'fulfilled' ? settled[i].value : { data: null, error: settled[i].reason, count: null };
  const cultosAtual = pick(0).data || [];
  const cultosAnt = pick(1).data || [];
  const gruposCount = pick(2).count || 0;
  const devoRows = pick(3).data || [];
  const devoCheckins = devoRows.length;
  const devoPessoas = new Set(devoRows.map(d => d.membro_id).filter(Boolean)).size;
  const volAtivos = pick(4).data != null ? (typeof pick(4).data === 'number' ? pick(4).data : 0) : 0;
  const cm = pick(5).data;
  const genTotal = Number(cm?.total || 0);
  const genDizimo = Number(cm?.dizimo || 0);
  const genOferta = Number(cm?.oferta || 0);
  const genDoacoes = Number(cm?.qtd_doacoes || 0);
  const genDoadores = Number(cm?.qtd_doadores_unicos || 0);
  const genPreenchido = genTotal > 0 || genDoacoes > 0;
  const brl = (n) => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
  const metas = pick(6).data || [];
  const membrosAtivos = pick(7).count || 0;

  const presAtual = cultosAtual.reduce((s, c) => s + (c.presencial_adulto || 0) + (c.presencial_kids || 0), 0);
  const onlineAtual = cultosAtual.reduce((s, c) => s + (c.online_ds || 0), 0);
  const decisoesTotal = cultosAtual.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
  const presAnt = cultosAnt.reduce((s, c) => s + (c.presencial_adulto || 0) + (c.presencial_kids || 0), 0);

  const presMedia = semanasNoMes > 0 ? Math.round(presAtual / semanasNoMes) : 0;
  const presMediaAnt = cultosAnt.length > 0 ? Math.round(presAnt / Math.max(1, Math.ceil(cultosAnt.length))) : 0;
  const trendPct = presMediaAnt > 0 ? Math.round(((presMedia - presMediaAnt) / presMediaAnt) * 100) : 0;
  const trend = trendPct > 2 ? 'up' : trendPct < -2 ? 'down' : 'stable';

  const mandala = {
    seguir_jesus: { label: 'Seguir Jesus', valor: presMedia, detalhe: `${presMedia} presencial + ${Math.round(onlineAtual / semanasNoMes)} online / semana`, cor: '#3b82f6' },
    conectar_pessoas: { label: 'Conectar Pessoas', valor: gruposCount, detalhe: `${gruposCount} membros ativos em grupos`, cor: '#10b981' },
    investir_deus: { label: 'Investir em Deus', valor: devoPessoas, detalhe: `${devoPessoas} pessoas no devocional (${devoCheckins} check-ins no mês)`, cor: '#f59e0b' },
    servir: { label: 'Servir', valor: volAtivos, detalhe: `${volAtivos} voluntarios ativos (90d)`, cor: '#ef4444' },
    generosidade: { label: 'Generosidade', valor: genDoadores > 0 ? genDoadores : genDoacoes, detalhe: genPreenchido ? `${brl(genTotal)} · ${brl(genDizimo)} dízimo + ${brl(genOferta)} oferta (${genDoacoes} doações${genDoadores > 0 ? ` · ${genDoadores} doadores` : ''})` : 'Sem doações no mês', cor: '#8b5cf6' },
  };

  return {
    checklist: [
      { item: 'Cultos do mês registrados', ok: cultosAtual.length > 0, valor: `${cultosAtual.length} cultos` },
      { item: 'Presença registrada', ok: presMedia > 0, valor: presMedia > 0 ? `Média: ${presMedia}` : 'Sem registros' },
      { item: 'Dados de generosidade', ok: genPreenchido, valor: genPreenchido ? `${brl(genTotal)} · ${genDoacoes} doações` : 'Não preenchido' },
      { item: 'Membresia atualizada', ok: membrosAtivos > 0, valor: `${membrosAtivos} membros ativos` },
    ],
    resumo: {
      cultos_no_mes: cultosAtual.length, presenca_media: presMedia, decisoes: decisoesTotal,
      membros_ativos: membrosAtivos, voluntarios_ativos: volAtivos,
      trend, trend_pct: trendPct,
    },
    dados: { mandala, metas, culto_trend: { presMedia, presMediaAnt, trendPct, trend } },
  };
}

async function buildCC(mes) {
  // Chama OKR + DRE + KPI em paralelo (resumos condensados)
  const [okr, dre, kpi] = await Promise.all([buildOKR(), buildDRE(mes), buildKPI(mes)]);

  // Top 5 riscos
  const { data: topRiscos } = await supabase.from('project_risks')
    .select('id, title, probability, impact, score, owner_name, status, mitigation, project_id, projects(name)')
    .neq('status', 'mitigado').order('score', { ascending: false }).limit(5);

  // Pendências anteriores (governance_tasks)
  let pendencias = [];
  try {
    const { data } = await supabase.from('governance_tasks').select('id, titulo, responsavel, prazo, status').in('status', ['pendente', 'em_andamento']).order('prazo');
    pendencias = data || [];
  } catch {} // tabela pode não ter dados

  return {
    checklist: [
      { item: 'OKR: dados atualizados', ok: okr.checklist.filter(c => c.ok).length === okr.checklist.length, valor: `${okr.checklist.filter(c => c.ok).length}/${okr.checklist.length} ok` },
      { item: 'DRE: financeiro fechado', ok: dre.checklist.filter(c => c.ok).length === dre.checklist.length, valor: `${dre.checklist.filter(c => c.ok).length}/${dre.checklist.length} ok` },
      { item: 'KPI: indicadores registrados', ok: kpi.checklist.filter(c => c.ok).length === kpi.checklist.length, valor: `${kpi.checklist.filter(c => c.ok).length}/${kpi.checklist.length} ok` },
      { item: 'Riscos identificados e tratados', ok: (topRiscos || []).length === 0, valor: `${(topRiscos || []).length} riscos ativos` },
    ],
    resumo: { okr: okr.resumo, dre: dre.resumo, kpi: kpi.resumo },
    dados: {
      top_riscos: (topRiscos || []).map(r => ({ ...r, projeto_nome: r.projects?.name, projects: undefined })),
      pendencias_anteriores: pendencias,
      okr_alertas: (okr.dados.alertas || []).slice(0, 5),
    },
  };
}

async function buildDE() {
  const ano = new Date().getFullYear();
  const [funcRes, bensRes, transRes] = await Promise.all([
    supabase.from('rh_funcionarios').select('id, nome, status, cargo, area').eq('status', 'ativo'),
    supabase.from('patrimonio_bens').select('id, nome, status, categoria_id'),
    fetchAllRows(() => supabase.from('fin_transacoes').select('tipo, valor').gte('data_competencia', `${ano}-01-01`).neq('status', 'cancelado')),  // ano ~21k → paginado
  ]);
  const funcs = funcRes.data || [];
  const bens = bensRes.data || [];
  const trans = transRes || [];  // fetchAllRows → array direto
  const recAno = trans.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
  const despAno = trans.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
  return {
    checklist: [
      { item: 'Quadro de funcionários atualizado', ok: funcs.length > 0, valor: `${funcs.length} ativos` },
      { item: 'Patrimônio inventariado', ok: bens.length > 0, valor: `${bens.length} bens` },
      { item: 'Financeiro acumulado do ano', ok: trans.length > 0, valor: `Resultado: R$ ${(recAno - despAno).toLocaleString('pt-BR')}` },
    ],
    resumo: { funcionarios: funcs.length, bens: bens.length, receita_ano: recAno, despesa_ano: despAno, resultado_ano: recAno - despAno },
    dados: { funcionarios: funcs, bens_count: bens.length },
  };
}

async function buildAG() {
  const ano = new Date().getFullYear();
  const [projRes, transRes, membrosRes, cultosRes] = await Promise.all([
    supabase.from('projects').select('id, name, status'),
    fetchAllRows(() => supabase.from('fin_transacoes').select('tipo, valor').gte('data_competencia', `${ano}-01-01`).neq('status', 'cancelado')),  // ano ~21k → paginado
    supabase.from('mem_membros').select('id', { count: 'exact', head: true }).eq('status', 'membro_ativo').is('deleted_at', null),
    supabase.from('cultos').select('id', { count: 'exact', head: true }).gte('data', `${ano}-01-01`),
  ]);
  const proj = projRes.data || [];
  const trans = transRes || [];  // fetchAllRows → array direto
  const concluidos = proj.filter(p => p.status === 'concluido').length;
  const recAno = trans.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
  const despAno = trans.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
  return {
    checklist: [
      { item: 'Projetos com status final', ok: true, valor: `${concluidos}/${proj.length} concluídos` },
      { item: 'Financeiro anual fechado', ok: trans.length > 0, valor: `R$ ${recAno.toLocaleString('pt-BR')} rec | R$ ${despAno.toLocaleString('pt-BR')} desp` },
      { item: 'Membresia atualizada', ok: (membrosRes.count || 0) > 0, valor: `${membrosRes.count || 0} membros ativos` },
    ],
    resumo: { projetos_total: proj.length, concluidos, receita_ano: recAno, despesa_ano: despAno, resultado: recAno - despAno, membros: membrosRes.count || 0, cultos_ano: cultosRes.count || 0 },
    dados: {},
  };
}

// ══════════════════════════════════════════════
// ENDPOINT PRINCIPAL
// ══════════════════════════════════════════════

router.get('/relatorio/:sigla', async (req, res) => {
  try {
    const sigla = req.params.sigla.toUpperCase();
    const tipo = TIPOS.find(t => t.sigla === sigla);
    if (!tipo) return res.status(404).json({ error: 'Tipo não encontrado' });

    const mes = req.query.mes; // opcional: YYYY-MM
    let result;
    if (sigla === 'OKR') result = await buildOKR();
    else if (sigla === 'DRE') result = await buildDRE(mes);
    else if (sigla === 'KPI') result = await buildKPI(mes);
    else if (sigla === 'CC') result = await buildCC(mes);
    else if (sigla === 'DE') result = await buildDE();
    else if (sigla === 'AG') result = await buildAG();
    else return res.status(404).json({ error: 'Builder não implementado' });

    // Buscar observações salvas (se existirem)
    let observacoes = '';
    try {
      const h = hoje();
      const mesAtual = h.slice(0, 7);
      const { data: meetings } = await supabase.from('governance_meetings')
        .select('observacoes, governance_meeting_types!inner(sigla)')
        .eq('governance_meeting_types.sigla', sigla)
        .gte('date', `${mesAtual}-01`).lte('date', `${mesAtual}-31`).limit(1);
      if (meetings?.length) observacoes = meetings[0].observacoes || '';
    } catch {}

    res.json({ tipo, gerado_em: hoje(), observacoes, ...result });
  } catch (err) { console.error('[GOV]', err); res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// SALVAR OBSERVAÇÕES
// ══════════════════════════════════════════════

router.post('/relatorio/:sigla/observacoes', async (req, res) => {
  try {
    const sigla = req.params.sigla.toUpperCase();
    const { observacoes } = req.body;
    const h = hoje();
    const mesAtual = h.slice(0, 7);
    const [y, m] = mesAtual.split('-').map(Number);

    // Find or create cycle
    let { data: cycle } = await supabase.from('governance_cycles').select('id').eq('year', y).eq('month', m).maybeSingle();
    if (!cycle) {
      const { data: c } = await supabase.from('governance_cycles').insert({ year: y, month: m, created_by: req.user.userId }).select().single();
      cycle = c;
    }

    // Find type
    const { data: tipo } = await supabase.from('governance_meeting_types').select('id').eq('sigla', sigla).maybeSingle();
    if (!tipo) return res.status(404).json({ error: 'Tipo não encontrado' });

    // Find or create meeting
    let { data: meeting } = await supabase.from('governance_meetings').select('id').eq('cycle_id', cycle.id).eq('type_id', tipo.id).maybeSingle();
    if (!meeting) {
      const { data: m2 } = await supabase.from('governance_meetings').insert({ cycle_id: cycle.id, type_id: tipo.id, date: h, created_by: req.user.userId }).select().single();
      meeting = m2;
    }

    // Update
    await supabase.from('governance_meetings').update({ observacoes, updated_at: new Date().toISOString() }).eq('id', meeting.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// CRON: LEMBRETE PRE-REUNIAO (segunda antes da 1a quarta)
// ══════════════════════════════════════════════

router.get('/cron/lembrete', async (req, res) => {
  // Verificar CRON_SECRET · NUNCA via query string (vaza em logs/Referer) e
  // sempre fail-closed/timing-safe (helper). Admin/diretor tambem pode disparar.
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const h = hoje();
    const dayOfWeek = new Date().getDay(); // 0=dom, 1=seg

    // Só roda na segunda-feira
    if (dayOfWeek !== 1) return res.json({ skipped: true, reason: 'Não é segunda-feira' });

    // Verificar se a próxima quarta é a 1a quarta do mês
    const nextWed = new Date();
    nextWed.setDate(nextWed.getDate() + 2); // segunda + 2 = quarta
    if (nextWed.getDate() > 7) return res.json({ skipped: true, reason: 'Não é a 1ª quarta do mês' });

    // Gerar checklist
    const okr = await buildOKR();
    const krsNaoPreenchidos = (okr.checklist.find(c => c.item.includes('valor atual')) || {});
    const projSemResp = (okr.checklist.find(c => c.item.includes('responsável')) || {});

    const mensagem = [
      `Reunião OKR em 2 dias (${nextWed.toLocaleDateString('pt-BR')}).`,
      `Checklist de preparo:`,
      ...okr.checklist.map(c => `${c.ok ? '  ✓' : '  ✗'} ${c.item}: ${c.valor}`),
    ].join('\n');

    // Notificar via sistema
    const { notificar } = require('../services/notificar');
    await notificar({
      modulo: 'governanca',
      tipo: 'lembrete_okr',
      titulo: `Reunião OKR em 2 dias`,
      mensagem,
      link: '/governanca',
      severidade: okr.checklist.every(c => c.ok) ? 'info' : 'warning',
      chaveDedup: `gov_okr_${h}`,
    });

    res.json({ success: true, checklist: okr.checklist });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════
// CRUD do ciclo de reuniões de diretoria (F1)
//   Gated pelo módulo 'governanca': ler >=1 · editar/criar/excluir >=3.
//   Quem opera = super-admin (Marcos) + override; diretoria entra leitura.
// ════════════════════════════════════════════════════════════════════

const rd = authorizeModule('governanca', 1); // leitura
const wr = authorizeModule('governanca', 3); // escrita

// Dados vivos do sistema por tipo de reunião (reusa os relatórios automáticos)
// pra alimentar a IA (memória e pauta).
async function dadosVivosPorSigla(sigla, mes) {
  try {
    switch ((sigla || '').toUpperCase()) {
      case 'OKR': return await buildOKR();
      case 'DRE': return await buildDRE(mes);
      case 'KPI': return await buildKPI(mes);
      case 'CC':  return await buildCC(mes);
      case 'DE':  return await buildDE();
      case 'AG':  return await buildAG();
      default: return null;
    }
  } catch (e) { console.warn('[GOV] dadosVivos', sigla, e.message); return null; }
}

// ── Tipos de reunião (editáveis · escopo híbrido) ──────────────────────
router.get('/types', rd, async (req, res) => {
  try {
    const { data, error } = await supabase.from('governance_meeting_types')
      .select('*').order('sort_order', { ascending: true }).order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/types', wr, async (req, res) => {
  try {
    const { nome, sigla, semana, recorrencia, cor, descricao, sort_order } = req.body || {};
    if (!nome || !sigla || !semana) return res.status(400).json({ error: 'nome, sigla e semana são obrigatórios' });
    const { data, error } = await supabase.from('governance_meeting_types').insert({
      nome, sigla, semana: Number(semana),
      recorrencia: recorrencia || 'mensal',
      cor: cor || '#00B39D', descricao: descricao || null,
      sort_order: sort_order != null ? Number(sort_order) : 0,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/types/:id', wr, async (req, res) => {
  try {
    const allow = ['nome', 'sigla', 'semana', 'recorrencia', 'cor', 'descricao', 'ativo', 'sort_order'];
    const patch = {};
    for (const k of allow) if (k in (req.body || {})) patch[k] = req.body[k];
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });
    const { data, error } = await supabase.from('governance_meeting_types')
      .update(patch).eq('id', req.params.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tipo não encontrado' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Ciclos mensais ─────────────────────────────────────────────────────
router.get('/cycles', rd, async (req, res) => {
  try {
    let q = supabase.from('governance_cycles').select('*')
      .order('year', { ascending: false }).order('month', { ascending: false });
    if (req.query.year) q = q.eq('year', Number(req.query.year));
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/cycles/:id', rd, async (req, res) => {
  try {
    const { data: cycle, error } = await supabase.from('governance_cycles')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!cycle) return res.status(404).json({ error: 'Ciclo não encontrado' });
    const { data: meetings } = await supabase.from('governance_meetings')
      .select('*, governance_meeting_types(sigla, nome, cor, recorrencia)')
      .eq('cycle_id', cycle.id).is('deleted_at', null)
      .order('date', { ascending: true });
    res.json({ ...cycle, meetings: meetings || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cria (ou retorna) o ciclo do mês. No primeiro INSERT, materializa as
// reuniões mensais (1 por tipo ativo · data = N-ésima quarta) + as tarefas
// dos templates de cada tipo.
async function criarCicloDoMes(y, m, userId) {
  let { data: cycle } = await supabase.from('governance_cycles')
    .select('*').eq('year', y).eq('month', m).maybeSingle();

  let reunioesCriadas = 0;
  let criado = false;
  if (!cycle) {
    const ins = await supabase.from('governance_cycles')
      .insert({ year: y, month: m, created_by: userId }).select('*').single();
    if (ins.error) throw ins.error;
    cycle = ins.data;
    criado = true;

    const { data: tipos } = await supabase.from('governance_meeting_types')
      .select('*').eq('ativo', true).eq('recorrencia', 'mensal').order('sort_order');
    for (const t of (tipos || [])) {
      const date = nthWednesday(y, m, t.semana || 1);
      const mtg = await supabase.from('governance_meetings')
        .insert({ cycle_id: cycle.id, type_id: t.id, date, created_by: userId })
        .select('id').single();
      if (mtg.error || !mtg.data) continue;
      reunioesCriadas++;
      const { data: tmpls } = await supabase.from('governance_task_templates')
        .select('*').eq('type_id', t.id).eq('ativo', true).order('sort_order');
      if (tmpls?.length) {
        await supabase.from('governance_tasks').insert(tmpls.map(tp => ({
          meeting_id: mtg.data.id,
          titulo: tp.titulo, descricao: tp.descricao,
          responsavel: tp.responsavel_padrao || null,
          prazo: addDays(date, tp.prazo_offset_dias || 0),
          prioridade: tp.prioridade || 'normal',
          origem: 'template', sort_order: tp.sort_order || 0,
          created_by: userId,
        })));
      }
    }
  }
  return { cycle, reunioesCriadas, criado };
}

router.post('/cycles', wr, async (req, res) => {
  try {
    const y = Number(req.body?.year), m = Number(req.body?.month);
    if (!y || !m || m < 1 || m > 12) return res.status(400).json({ error: 'year e month (1-12) obrigatórios' });
    const { cycle, reunioesCriadas } = await criarCicloDoMes(y, m, req.user.userId);
    res.status(201).json({ ...cycle, reunioes_criadas: reunioesCriadas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Gera o ano inteiro (loop dos meses · idempotente · pula o que já existe).
// from_month/to_month permitem gerar só "de agora em diante".
router.post('/cycles/generate-year', wr, async (req, res) => {
  try {
    const y = Number(req.body?.year);
    if (!y) return res.status(400).json({ error: 'year obrigatório' });
    const fromM = Math.max(1, Math.min(12, Number(req.body?.from_month) || 1));
    const toM = Math.max(fromM, Math.min(12, Number(req.body?.to_month) || 12));
    let ciclosCriados = 0, reunioesCriadas = 0;
    for (let m = fromM; m <= toM; m++) {
      const r = await criarCicloDoMes(y, m, req.user.userId);
      if (r.criado) ciclosCriados++;
      reunioesCriadas += r.reunioesCriadas;
    }
    res.status(201).json({ year: y, ciclos_criados: ciclosCriados, reunioes_criadas: reunioesCriadas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reuniões ───────────────────────────────────────────────────────────
// Lista por período (calendário), por ciclo e/ou por tipo (sigla · página do ritual).
router.get('/meetings', rd, async (req, res) => {
  try {
    let q = supabase.from('governance_meetings')
      .select('*, governance_meeting_types(sigla, nome, cor, recorrencia)')
      .is('deleted_at', null);
    if (req.query.cycle_id) q = q.eq('cycle_id', req.query.cycle_id);
    if (req.query.sigla) {
      const { data: t } = await supabase.from('governance_meeting_types')
        .select('id').eq('sigla', String(req.query.sigla).toUpperCase()).maybeSingle();
      if (!t) return res.json([]);
      q = q.eq('type_id', t.id);
    }
    if (req.query.from) q = q.gte('date', req.query.from);
    if (req.query.to) q = q.lte('date', req.query.to);
    const { data, error } = await q.order('date', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/meetings/:id', rd, async (req, res) => {
  try {
    const { data: meeting, error } = await supabase.from('governance_meetings')
      .select('*, governance_meeting_types(sigla, nome, cor, recorrencia), governance_cycles(year, month)')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!meeting) return res.status(404).json({ error: 'Reunião não encontrada' });
    const [tasksR, docsR] = await Promise.all([
      supabase.from('governance_tasks').select('*').eq('meeting_id', meeting.id)
        .order('sort_order', { ascending: true }).order('created_at'),
      supabase.from('governance_meeting_docs').select('*').eq('meeting_id', meeting.id)
        .is('deleted_at', null).order('created_at', { ascending: false }),
    ]);
    res.json({ ...meeting, tasks: tasksR.data || [], docs: docsR.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cria reunião (avulsa ou dentro de um ciclo). Sem cycle_id, atrela ao ciclo
// do mês da data (find-or-create) — governance_meetings.cycle_id é NOT NULL.
router.post('/meetings', wr, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.type_id) return res.status(400).json({ error: 'type_id é obrigatório' });
    let cycleId = b.cycle_id;
    if (!cycleId) {
      const baseDate = b.date || hoje();
      const [yy, mm] = baseDate.split('-').map(Number);
      let { data: cyc } = await supabase.from('governance_cycles')
        .select('id').eq('year', yy).eq('month', mm).maybeSingle();
      if (!cyc) {
        const ins = await supabase.from('governance_cycles')
          .insert({ year: yy, month: mm, created_by: req.user.userId }).select('id').single();
        if (ins.error) throw ins.error;
        cyc = ins.data;
      }
      cycleId = cyc.id;
    }
    const { data, error } = await supabase.from('governance_meetings').insert({
      cycle_id: cycleId,
      type_id: b.type_id,
      date: b.date || null,
      status: b.status || 'agendada',
      pauta: b.pauta || null,
      participantes: b.participantes || null,
      local: b.local || null,
      observacoes: b.observacoes || null,
      created_by: req.user.userId,
    }).select('*, governance_meeting_types(sigla, nome, cor)').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/meetings/:id', wr, async (req, res) => {
  try {
    // `snapshot` = retrato dos indicadores do ritual na data da reunião (jsonb ·
    // congela o que a diretoria viu; alimenta o gráfico de evolução da página
    // do ritual). Exige a migration 20260706120000 (colunas snapshot/snapshot_em).
    // `temas` = curadoria do Conselho Consultivo ({selecionados:[siglas], extra:texto} ·
    // quais relatórios das outras reuniões vão ao conselho). Migration 20260707120000.
    const allow = ['date', 'status', 'pauta', 'ata', 'deliberacoes', 'participantes',
      'quorum_presente', 'local', 'observacoes', 'type_id', 'snapshot', 'temas'];
    const patch = {};
    for (const k of allow) if (k in (req.body || {})) patch[k] = req.body[k];
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });
    if ('snapshot' in patch) patch.snapshot_em = patch.snapshot == null ? null : new Date().toISOString();
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('governance_meetings')
      .update(patch).eq('id', req.params.id).is('deleted_at', null)
      .select('*, governance_meeting_types(sigla, nome, cor)').maybeSingle();
    if (error) {
      if ('snapshot' in patch && /snapshot/i.test(error.message || '')) {
        return res.status(400).json({ error: 'Retrato indisponível: aplique a migration 20260706120000_governanca_meeting_snapshot no Supabase.' });
      }
      if ('temas' in patch && /temas/i.test(error.message || '')) {
        return res.status(400).json({ error: 'Curadoria indisponível: aplique a migration 20260707120000_governanca_temas_deliberacoes no Supabase.' });
      }
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Reunião não encontrada' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/meetings/:id', wr, async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'governance_meetings', p_row_id: req.params.id, p_deleted_by: req.user.userId,
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Tarefas/demandas da reunião ────────────────────────────────────────
router.post('/meetings/:id/tasks', wr, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.titulo) return res.status(400).json({ error: 'titulo é obrigatório' });
    const { data, error } = await supabase.from('governance_tasks').insert({
      meeting_id: req.params.id,
      titulo: b.titulo, descricao: b.descricao || null,
      responsavel: b.responsavel || null, prazo: b.prazo || null,
      status: b.status || 'pendente', prioridade: b.prioridade || 'normal',
      origem: b.origem || 'manual', created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Aplica os templates de tarefa do tipo da reunião (sem duplicar por título).
router.post('/meetings/:id/apply-templates', wr, async (req, res) => {
  try {
    const { data: meeting } = await supabase.from('governance_meetings')
      .select('id, type_id, date').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!meeting) return res.status(404).json({ error: 'Reunião não encontrada' });
    const { data: tmpls } = await supabase.from('governance_task_templates')
      .select('*').eq('type_id', meeting.type_id).eq('ativo', true).order('sort_order');
    const { data: existentes } = await supabase.from('governance_tasks')
      .select('titulo').eq('meeting_id', meeting.id);
    const jaTem = new Set((existentes || []).map(t => t.titulo));
    const novas = (tmpls || []).filter(tp => !jaTem.has(tp.titulo)).map(tp => ({
      meeting_id: meeting.id, titulo: tp.titulo, descricao: tp.descricao,
      responsavel: tp.responsavel_padrao || null,
      prazo: meeting.date ? addDays(meeting.date, tp.prazo_offset_dias || 0) : null,
      prioridade: tp.prioridade || 'normal', origem: 'template',
      sort_order: tp.sort_order || 0, created_by: req.user.userId,
    }));
    if (novas.length) {
      const { error } = await supabase.from('governance_tasks').insert(novas);
      if (error) throw error;
    }
    res.json({ criadas: novas.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/tasks/:id', wr, async (req, res) => {
  try {
    const allow = ['titulo', 'descricao', 'responsavel', 'prazo', 'status', 'prioridade', 'sort_order'];
    const patch = {};
    for (const k of allow) if (k in (req.body || {})) patch[k] = req.body[k];
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });
    const { data, error } = await supabase.from('governance_tasks')
      .update(patch).eq('id', req.params.id).select('*').maybeSingle();
    if (error) {
      // status='nao_executada' (deliberações) exige o CHECK ampliado pela migration.
      if (patch.status === 'nao_executada' && /status_check/i.test(error.message || '')) {
        return res.status(400).json({ error: 'Status indisponível: aplique a migration 20260707120000_governanca_temas_deliberacoes no Supabase.' });
      }
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Tarefa não encontrada' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/tasks/:id', wr, async (req, res) => {
  try {
    const { error } = await supabase.from('governance_tasks').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Documentos da reunião (SharePoint) ─────────────────────────────────
router.get('/meetings/:id/docs', rd, async (req, res) => {
  try { res.json(await govDocs.listarDocs(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/meetings/:id/docs', wr, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo (campo "arquivo") é obrigatório' });
    const row = await govDocs.uploadDoc({
      meetingId: req.params.id,
      userId: req.user.userId,
      userNome: req.user.name || null,
      file: req.file,
      tipo: req.body?.tipo,
    });
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Devolve a URL temporária do Graph em JSON (o front abre/baixa) — evita
// depender do header de auth viajar num <a href>.
router.get('/docs/:id/download', rd, async (req, res) => {
  try { res.json(await govDocs.getDownloadUrl(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/docs/:id', wr, async (req, res) => {
  try {
    await govDocs.removerDoc(req.params.id, req.user.userId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// Reunião de KPI — os objetivos gerais como indicadores de processo
// ════════════════════════════════════════════════════════════════════
// Desenho do Marcos (2026-07-06): a 3ª reunião do mês avalia os ~30 objetivos
// gerais do sistema OKR real, tratados como indicadores de processo POR VALOR
// da Jornada que desaguam nas áreas (~171 KPIs táticos). A régua é
// `objetivo_geral_id IS NOT NULL` (táticos operacionais fora da cascata não
// entram). Estado atual vem da vw_kpi_trajetoria_atual (meta normalizada por
// periodicidade — NÃO reimplementar essa conta); a série mensal usa o
// histórico real (kpi_valores_calculados + kpi_registros) contra a meta
// normalizada ATUAL (aproximação honesta · anotada na resposta).

async function fetchPaged(table, cols, applyFilter) {
  const out = []; let from = 0; const page = 1000;
  while (true) {
    let q = supabase.from(table).select(cols).range(from, from + page - 1);
    if (applyFilter) q = applyFilter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < page) break;
    from += page;
  }
  return out;
}

// 'YYYY-MM' | 'YYYY-Wnn' | 'YYYY-Qn' | 'YYYY-Sn' | 'YYYY' → 'YYYY-MM' (bucket mensal).
function periodoParaMes(p) {
  const s = String(p || '');
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})$/))) return `${m[1]}-${m[2]}`;
  if ((m = s.match(/^(\d{4})-W(\d{2})$/))) {
    // Quinta-feira da semana ISO define o mês (regra ISO-8601).
    const ano = Number(m[1]), sem = Number(m[2]);
    const jan4 = new Date(Date.UTC(ano, 0, 4));
    const seg1 = new Date(jan4); seg1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
    const qui = new Date(seg1); qui.setUTCDate(seg1.getUTCDate() + (sem - 1) * 7 + 3);
    return qui.toISOString().slice(0, 7);
  }
  if ((m = s.match(/^(\d{4})-Q([1-4])$/))) return `${m[1]}-${String(Number(m[2]) * 3).padStart(2, '0')}`;
  if ((m = s.match(/^(\d{4})-S([12])$/))) return `${m[1]}-${m[2] === '1' ? '06' : '12'}`;
  if ((m = s.match(/^(\d{4})$/))) return `${m[1]}-12`;
  return null;
}

router.get('/kpi-objetivos', rd, async (req, res) => {
  try {
    // Até 60 meses: o comparativo de 5 anos da reunião de KPI agrega por ano.
    const meses = Math.max(3, Math.min(60, Number(req.query.meses) || 12));
    // Modo ANO: filtra a série (jan–dez) E os valores/gauge para o desempenho
    // daquele ano (média do % vs meta no ano), em vez do estado atual.
    const ano = /^\d{4}$/.test(String(req.query.ano || '')) ? String(req.query.ano) : null;

    const [objRes, taticos] = await Promise.all([
      supabase.from('kpi_objetivos_gerais')
        .select('id, nome, descricao, indicador_geral, valores, ordem')
        .eq('ativo', true).order('ordem'),
      fetchPaged('vw_kpi_trajetoria_atual',
        'kpi_id, indicador, area, periodicidade, valores, objetivo_geral_id, meta_periodo, ultimo_periodo, ultimo_valor, status_trajetoria, percentual_meta',
        (q) => q.not('objetivo_geral_id', 'is', null)),
    ]);
    if (objRes.error) throw objRes.error;
    const objetivos = objRes.data || [];

    const porObjetivo = {};
    for (const t of taticos) (porObjetivo[t.objetivo_geral_id] ||= []).push(t);

    const avg = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

    // ── Série mensal (histórico real · % vs meta normalizada atual) ──
    const metaPorKpi = {}, objPorKpi = {};
    for (const t of taticos) {
      objPorKpi[t.kpi_id] = t.objetivo_geral_id;
      if (t.meta_periodo != null && Number(t.meta_periodo) > 0) metaPorKpi[t.kpi_id] = Number(t.meta_periodo);
    }
    const idsComMeta = Object.keys(metaPorKpi);
    // Janela: no modo ANO é jan–dez do ano; senão os últimos N meses até hoje.
    const mesInicioStr = ano ? `${ano}-01` : (() => {
      const d = new Date(); d.setUTCMonth(d.getUTCMonth() - (meses - 1));
      return d.toISOString().slice(0, 7);
    })();
    const mesFimStr = ano ? `${ano}-12` : null;

    // valores por kpi × mês (média quando há várias semanas no mês)
    const buckets = {}; // `${kpi}|${mes}` -> number[]
    const addBucket = (kpi, periodo, valor) => {
      if (valor == null || metaPorKpi[kpi] == null) return;
      const mes = periodoParaMes(periodo);
      if (!mes || mes < mesInicioStr) return;
      if (mesFimStr && mes > mesFimStr) return;
      (buckets[`${kpi}|${mes}`] ||= []).push(Number(valor));
    };
    if (idsComMeta.length) {
      // Corte por ano é seguro pra todos os formatos de período ('YYYY-MM',
      // 'YYYY-Wnn', 'YYYY-Qn'…): comparação lexicográfica com o prefixo do ano.
      // No modo ANO limita [ano, ano+1); senão a partir do ano de início.
      const gteCorte = ano ? ano : mesInicioStr.slice(0, 4);
      const ltCorte = ano ? String(Number(ano) + 1) : null;
      const aplicarCorte = (q) => { let x = q.gte('periodo_referencia', gteCorte); return ltCorte ? x.lt('periodo_referencia', ltCorte) : x; };
      const [calc, regs] = await Promise.all([
        fetchPaged('kpi_valores_calculados', 'kpi_id, periodo_referencia, valor_calculado',
          (q) => aplicarCorte(q.in('kpi_id', idsComMeta).gt('valor_calculado', 0))),
        fetchPaged('kpi_registros', 'indicador_id, periodo_referencia, valor_realizado',
          (q) => aplicarCorte(q.in('indicador_id', idsComMeta).gt('valor_realizado', 0))),
      ]);
      // Calculados têm precedência (mesma regra da view) · registros cobrem os manuais.
      const temCalc = new Set(calc.map(c => c.kpi_id));
      for (const c of calc) addBucket(c.kpi_id, c.periodo_referencia, c.valor_calculado);
      for (const r of regs) if (!temCalc.has(r.indicador_id)) addBucket(r.indicador_id, r.periodo_referencia, r.valor_realizado);
    }
    // % do kpi no mês → média por objetivo no mês. Também guarda o % do kpi no
    // ANO (média dos meses) pra alimentar gauge/áreas no modo ano.
    const serieObj = {}; // objetivoId -> { mes -> number[] }
    const kpiPctsAno = {}; // kpi -> number[] (% mensais no ano)
    for (const [chave, vals] of Object.entries(buckets)) {
      const [kpi, mes] = chave.split('|');
      const media = vals.reduce((a, b) => a + b, 0) / vals.length;
      const pct = Math.round((media / metaPorKpi[kpi]) * 1000) / 10;
      const obj = objPorKpi[kpi];
      ((serieObj[obj] ||= {})[mes] ||= []).push(pct);
      (kpiPctsAno[kpi] ||= []).push(pct);
    }
    const kpiAnoPct = {}; // kpi -> % médio no ano
    for (const [kpi, ps] of Object.entries(kpiPctsAno)) kpiAnoPct[kpi] = avg(ps);

    const resposta = objetivos.map(o => {
      const ts = porObjetivo[o.id] || [];
      // No modo ANO, "medido" = tem dado no ano; % = desempenho no ano. Senão, estado atual.
      const medidos = ano ? ts.filter(t => kpiAnoPct[t.kpi_id] != null) : ts.filter(t => t.ultimo_valor != null);
      const pcts = ano
        ? ts.map(t => kpiAnoPct[t.kpi_id]).filter(v => v != null)
        : ts.map(t => t.percentual_meta).filter(v => v != null).map(Number);
      const porArea = {};
      for (const t of ts) {
        const a = t.area || 'sem_area';
        (porArea[a] ||= { pcts: [], medidos: 0, total: 0 });
        porArea[a].total++;
        const pctAno = kpiAnoPct[t.kpi_id];
        if (ano) {
          if (pctAno != null) { porArea[a].medidos++; porArea[a].pcts.push(pctAno); }
        } else {
          if (t.ultimo_valor != null) porArea[a].medidos++;
          if (t.percentual_meta != null) porArea[a].pcts.push(Number(t.percentual_meta));
        }
      }
      const areas = {};
      for (const [a, v] of Object.entries(porArea)) areas[a] = { pct: avg(v.pcts), medidos: v.medidos, total: v.total };
      const serie = Object.entries(serieObj[o.id] || {})
        .map(([mes, pcts2]) => ({ mes, pct: avg(pcts2) }))
        .sort((x, y) => (x.mes < y.mes ? -1 : 1));
      return {
        id: o.id, nome: o.nome, descricao: o.descricao, indicador_geral: o.indicador_geral,
        valores: o.valores || [], ordem: o.ordem,
        total_taticos: ts.length, medidos: medidos.length,
        pct_medio: avg(pcts),
        areas, serie,
        taticos: ts.map(t => ({
          kpi_id: t.kpi_id, indicador: t.indicador, area: t.area, periodicidade: t.periodicidade,
          ultimo_periodo: t.ultimo_periodo, ultimo_valor: t.ultimo_valor,
          meta_periodo: t.meta_periodo, percentual_meta: t.percentual_meta,
          status: t.status_trajetoria,
        })),
      };
    });

    res.json({
      geradoEm: new Date().toISOString(),
      meses,
      nota_serie: 'Série mensal calculada do histórico real contra a meta normalizada ATUAL de cada KPI (aproximação: metas passadas podem ter sido diferentes).',
      objetivos: resposta,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// Deliberações estruturadas (extração do Plaud · review-before-apply)
// ════════════════════════════════════════════════════════════════════

// Deliberações (governance_tasks · origem='deliberacao') das reuniões de um
// tipo no período — alimenta a página do ritual e a checagem do conselho.
router.get('/deliberacoes', rd, async (req, res) => {
  try {
    let typeId = req.query.type_id;
    if (req.query.sigla) {
      const { data: t } = await supabase.from('governance_meeting_types')
        .select('id').eq('sigla', String(req.query.sigla).toUpperCase()).maybeSingle();
      if (!t) return res.json([]);
      typeId = t.id;
    }
    let q = supabase.from('governance_meetings')
      .select('id, date').is('deleted_at', null).order('date', { ascending: false });
    if (typeId) q = q.eq('type_id', typeId);
    if (req.query.from) q = q.gte('date', req.query.from);
    if (req.query.to) q = q.lte('date', req.query.to);
    const { data: meetings, error } = await q;
    if (error) throw error;
    const ids = (meetings || []).map(m => m.id);
    if (!ids.length) return res.json([]);
    const dataPorMtg = Object.fromEntries((meetings || []).map(m => [m.id, m.date]));
    const { data: tasks, error: e2 } = await supabase.from('governance_tasks')
      .select('id, meeting_id, titulo, responsavel, prazo, status, created_at')
      .in('meeting_id', ids).eq('origem', 'deliberacao').order('created_at');
    if (e2) throw e2;
    res.json((tasks || []).map(t => ({ ...t, meeting_date: dataPorMtg[t.meeting_id] || null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Extrai deliberações da transcrição (Plaud) com IA · NÃO grava nada — devolve
// propostas pra revisão humana (quem confirma cria via POST /meetings/:id/tasks
// com origem='deliberacao').
router.post('/meetings/:id/extrair-deliberacoes', wr, async (req, res) => {
  try {
    const r = await govIA.extrairDeliberacoes({ meetingId: req.params.id });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// Análise por tema (Fase B) + IA: memória acumulada + pauta (Fase C)
// ════════════════════════════════════════════════════════════════════

// Timeline de todas as reuniões de um tipo no ano + pendências em aberto.
router.get('/analise', rd, async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    let typeId = req.query.type_id, tipo = null;
    if (req.query.sigla) {
      const { data } = await supabase.from('governance_meeting_types')
        .select('id, sigla, nome, cor').eq('sigla', String(req.query.sigla).toUpperCase()).maybeSingle();
      tipo = data; typeId = data?.id;
    } else if (typeId) {
      const { data } = await supabase.from('governance_meeting_types')
        .select('id, sigla, nome, cor').eq('id', typeId).maybeSingle();
      tipo = data;
    }
    if (!typeId) return res.status(400).json({ error: 'sigla ou type_id obrigatório' });

    const { data: meetings } = await supabase.from('governance_meetings')
      .select('id, date, status, pauta, ata, deliberacoes')
      .eq('type_id', typeId).is('deleted_at', null)
      .gte('date', `${ano}-01-01`).lte('date', `${ano}-12-31`).order('date');
    const ids = (meetings || []).map(m => m.id);

    const tasksByMtg = {}, docsByMtg = {};
    if (ids.length) {
      const { data: tasks } = await supabase.from('governance_tasks')
        .select('id, meeting_id, titulo, responsavel, prazo, status, prioridade').in('meeting_id', ids);
      for (const t of (tasks || [])) (tasksByMtg[t.meeting_id] ||= []).push(t);
      const { data: docs } = await supabase.from('governance_meeting_docs')
        .select('id, meeting_id, tipo, nome_arquivo, gerado_por_ia').in('meeting_id', ids).is('deleted_at', null);
      for (const d of (docs || [])) (docsByMtg[d.meeting_id] ||= []).push(d);
    }

    const lista = (meetings || []).map(m => ({ ...m, tasks: tasksByMtg[m.id] || [], docs: docsByMtg[m.id] || [] }));
    const pendencias = Object.values(tasksByMtg).flat().filter(t => t.status === 'pendente' || t.status === 'em_andamento');
    res.json({ tipo: tipo || { id: typeId }, ano, meetings: lista, pendencias_abertas: pendencias });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Memória acumulada do tema (lê o markdown vivo).
router.get('/memoria', rd, async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    let typeId = req.query.type_id;
    if (req.query.sigla) {
      const { data } = await supabase.from('governance_meeting_types').select('id').eq('sigla', String(req.query.sigla).toUpperCase()).maybeSingle();
      typeId = data?.id;
    }
    if (!typeId) return res.status(400).json({ error: 'sigla ou type_id obrigatório' });
    const { data } = await supabase.from('governance_memoria')
      .select('*').eq('type_id', typeId).eq('ano', ano).is('deleted_at', null).maybeSingle();
    res.json(data || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Gera/atualiza a memória do tema com IA (Plaud + atas + dados vivos).
router.post('/memoria/gerar', wr, async (req, res) => {
  try {
    const ano = Number(req.body?.ano) || new Date().getFullYear();
    let typeId = req.body?.type_id, sigla = req.body?.sigla;
    if (sigla && !typeId) {
      const { data } = await supabase.from('governance_meeting_types').select('id, sigla').eq('sigla', String(sigla).toUpperCase()).maybeSingle();
      typeId = data?.id; sigla = data?.sigla;
    } else if (typeId && !sigla) {
      const { data } = await supabase.from('governance_meeting_types').select('sigla').eq('id', typeId).maybeSingle();
      sigla = data?.sigla;
    }
    if (!typeId) return res.status(400).json({ error: 'sigla ou type_id obrigatório' });
    const mes = `${ano}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const dadosVivos = await dadosVivosPorSigla(sigla, mes);
    const row = await govIA.gerarMemoria({ typeId, ano, userId: req.user.userId, dadosVivos });
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/memoria/:id', wr, async (req, res) => {
  try {
    if (typeof req.body?.conteudo_md !== 'string') return res.status(400).json({ error: 'conteudo_md obrigatório' });
    const { data, error } = await supabase.from('governance_memoria')
      .update({ conteudo_md: req.body.conteudo_md, atualizado_em: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Memória não encontrada' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Gera a pauta da reunião com IA (resumo + pendências + indicadores).
router.post('/meetings/:id/gerar-pauta', wr, async (req, res) => {
  try {
    const { data: m } = await supabase.from('governance_meetings')
      .select('date, governance_meeting_types(sigla)').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!m) return res.status(404).json({ error: 'Reunião não encontrada' });
    const sigla = m.governance_meeting_types?.sigla;
    const mes = m.date ? String(m.date).slice(0, 7) : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const dadosVivos = await dadosVivosPorSigla(sigla, mes);
    const row = await govIA.gerarPauta({ meetingId: req.params.id, userId: req.user.userId, dadosVivos });
    res.status(201).json(row);
  } catch (e) { console.error('[governanca] gerar-pauta:', e.message); res.status(500).json({ error: e.message }); }
});

// Edita o texto in-app de um documento gerado (pauta_ia · refinamento humano).
router.patch('/docs/:id', wr, async (req, res) => {
  try {
    if (typeof req.body?.conteudo_md !== 'string') return res.status(400).json({ error: 'conteudo_md obrigatório' });
    const { data, error } = await supabase.from('governance_meeting_docs')
      .update({ conteudo_md: req.body.conteudo_md }).eq('id', req.params.id).is('deleted_at', null).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
