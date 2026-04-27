/**
 * Governança — Relatórios automáticos para reuniões de gestão estratégica.
 * Puxa dados reais dos módulos do sistema e gera checklist + preview.
 *
 * 4 reuniões mensais (quartas): OKR → DRE → KPI → Conselho
 * Regra: todo desvio deve gerar causa, decisão, responsável e próximo passo.
 */
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

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

const TIPOS = [
  { sigla: 'OKR', nome: 'OKR', cor: '#3b82f6', recorrencia: 'Mensal — 1a quarta', descricao: 'Revisar objetivos estrategicos, KRs em risco, desvios e causas' },
  { sigla: 'DRE', nome: 'DRE', cor: '#10b981', recorrencia: 'Mensal — 2a quarta', descricao: 'Saude economica: receita, custos, despesas, planejado x realizado' },
  { sigla: 'KPI', nome: 'KPI', cor: '#f59e0b', recorrencia: 'Mensal — 3a quarta', descricao: 'Performance operacional: 5 pilares, meta x realizado, tendencia' },
  { sigla: 'CC',  nome: 'Conselho Consultivo', cor: '#8b5cf6', recorrencia: 'Mensal — 4a quarta', descricao: 'Sintese OKR+DRE+KPI, riscos, decisoes estruturais' },
  { sigla: 'DE',  nome: 'Diretoria Estatutaria', cor: '#ef4444', recorrencia: 'Quadrimestral', descricao: 'Relatorio de diretoria: RH, patrimonio, financeiro acumulado' },
  { sigla: 'AG',  nome: 'Assembleia Geral', cor: '#06b6d4', recorrencia: 'Semestral', descricao: 'Prestacao de contas completa a igreja' },
];

router.get('/tipos', (req, res) => res.json(TIPOS));

// ══════════════════════════════════════════════
// BUILDERS — cada um retorna { checklist, resumo, dados }
// ══════════════════════════════════════════════

async function buildOKR() {
  const h = hoje();
  const [projRes, tasksRes, risksRes, kpisRes, marcosRes] = await Promise.all([
    supabase.from('projects').select('id, name, status, date_end, responsible, area, budget_planned, budget_spent, priority, description').neq('status', 'concluido').neq('status', 'cancelado').order('name'),
    supabase.from('project_tasks').select('id, project_id, status'),
    supabase.from('project_risks').select('id, project_id, title, probability, impact, score, owner_name, status, mitigation').neq('status', 'mitigado').order('score', { ascending: false }),
    supabase.from('project_kpis').select('id, project_id, name, target_value, current_value, unit'),
    supabase.from('expansion_milestones').select('id, name, status, date_end, responsible, area, phase, budget_planned').neq('status', 'concluido').neq('status', 'cancelado').order('sort_order'),
  ]);

  const proj = projRes.data || [];
  const tasks = tasksRes.data || [];
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

  // Agrupar por area
  const porArea = {};
  projEnriched.forEach(p => {
    const a = p.area || 'Sem area';
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
      { item: 'Todos com responsavel', ok: projEnriched.every(p => p.responsible), valor: projEnriched.filter(p => !p.responsible).length === 0 ? 'OK' : `${projEnriched.filter(p => !p.responsible).length} sem resp.` },
      { item: 'Marcos de expansao atualizados', ok: marcosAtrasados.length === 0, valor: `${marcos.length - marcosAtrasados.length}/${marcos.length} no prazo` },
      { item: 'Sem KRs criticos', ok: krsOffTrack === 0, valor: krsOffTrack === 0 ? 'OK' : `${krsOffTrack} KRs abaixo de 50%` },
    ],
    resumo: {
      total_objetivos: proj.length, no_prazo: proj.length - atrasados.length - emRisco.length,
      atrasados: atrasados.length, em_risco: emRisco.length,
      pct_conclusao_media: pctMedia,
      total_krs: totalKRs, krs_on_track: krsOnTrack, krs_at_risk: krsAtRisk, krs_off_track: krsOffTrack,
      marcos_ativos: marcos.length, marcos_atrasados: marcosAtrasados.length,
    },
    dados: { projetos_por_area: porArea, marcos, alertas, marcosAtrasados },
  };
}

async function buildDRE(mes) {
  const { mesISO, inicioStr, fimStr, mesAnteriorInicio, mesAnteriorFim } = parseMes(mes);
  const h = hoje();

  const [contasRes, transAtualRes, transAntRes, pagarRes, reembRes] = await Promise.all([
    supabase.from('fin_contas').select('id, nome, tipo, saldo, ativa').eq('ativa', true).order('nome'),
    supabase.from('fin_transacoes').select('id, tipo, valor, data_competencia, descricao, fin_categorias(nome, tipo)').gte('data_competencia', inicioStr).lte('data_competencia', fimStr).neq('status', 'cancelado').order('data_competencia', { ascending: false }),
    supabase.from('fin_transacoes').select('tipo, valor, fin_categorias(nome, tipo)').gte('data_competencia', mesAnteriorInicio).lte('data_competencia', mesAnteriorFim).neq('status', 'cancelado'),
    supabase.from('fin_contas_pagar').select('id, descricao, fornecedor, valor, data_vencimento, status').eq('status', 'pendente').order('data_vencimento'),
    supabase.from('fin_reembolsos').select('id, descricao, valor, status').eq('status', 'pendente'),
  ]);

  const contas = contasRes.data || [];
  const transAtual = transAtualRes.data || [];
  const transAnt = transAntRes.data || [];
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
      { item: 'Transacoes do mes lancadas', ok: transAtual.length > 0, valor: `${transAtual.length} transacoes` },
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
    supabase.from('pense_videos').select('views').eq('ativo', true).gte('data_publicacao', inicioStr).lte('data_publicacao', fimStr),
    supabase.rpc('kpi_servir_comunidade', { _since: noventaDias.toISOString() }),
    supabase.from('cultura_mensal').select('*').eq('mes', inicioStr).maybeSingle(),
    supabase.from('kpi_metas').select('*').order('area'),
    supabase.from('membros').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
  ]);

  const pick = (i) => settled[i].status === 'fulfilled' ? settled[i].value : { data: null, error: settled[i].reason, count: null };
  const cultosAtual = pick(0).data || [];
  const cultosAnt = pick(1).data || [];
  const gruposCount = pick(2).count || 0;
  const penseViews = (pick(3).data || []).reduce((s, v) => s + (v.views || 0), 0);
  const volAtivos = pick(4).data != null ? (typeof pick(4).data === 'number' ? pick(4).data : 0) : 0;
  const cm = pick(5).data;
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
    investir_deus: { label: 'Investir em Deus', valor: diasNoMes > 0 ? Math.round(penseViews / diasNoMes) : 0, detalhe: `${penseViews} views PENSE no mes (${diasNoMes > 0 ? Math.round(penseViews / diasNoMes) : 0}/dia)`, cor: '#f59e0b' },
    servir: { label: 'Servir', valor: volAtivos, detalhe: `${volAtivos} voluntarios ativos (90d)`, cor: '#ef4444' },
    generosidade: { label: 'Generosidade', valor: (cm?.qtd_dizimistas || 0) + (cm?.qtd_ofertantes || 0), detalhe: `${cm?.qtd_dizimistas || 0} dizimistas + ${cm?.qtd_ofertantes || 0} ofertantes`, cor: '#8b5cf6' },
  };

  return {
    checklist: [
      { item: 'Cultos do mes registrados', ok: cultosAtual.length > 0, valor: `${cultosAtual.length} cultos` },
      { item: 'Presenca registrada', ok: presMedia > 0, valor: presMedia > 0 ? `Media: ${presMedia}` : 'Sem registros' },
      { item: 'Dados de generosidade', ok: cm != null, valor: cm ? `${cm.qtd_dizimistas || 0} dizimistas` : 'Nao preenchido' },
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

  // Pendencias anteriores (governance_tasks)
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
    supabase.from('fin_transacoes').select('tipo, valor').gte('data_competencia', `${ano}-01-01`).neq('status', 'cancelado'),
  ]);
  const funcs = funcRes.data || [];
  const bens = bensRes.data || [];
  const trans = transRes.data || [];
  const recAno = trans.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
  const despAno = trans.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
  return {
    checklist: [
      { item: 'Quadro de funcionarios atualizado', ok: funcs.length > 0, valor: `${funcs.length} ativos` },
      { item: 'Patrimonio inventariado', ok: bens.length > 0, valor: `${bens.length} bens` },
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
    supabase.from('fin_transacoes').select('tipo, valor').gte('data_competencia', `${ano}-01-01`).neq('status', 'cancelado'),
    supabase.from('membros').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
    supabase.from('cultos').select('id', { count: 'exact', head: true }).gte('data', `${ano}-01-01`),
  ]);
  const proj = projRes.data || [];
  const trans = transRes.data || [];
  const concluidos = proj.filter(p => p.status === 'concluido').length;
  const recAno = trans.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
  const despAno = trans.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
  return {
    checklist: [
      { item: 'Projetos com status final', ok: true, valor: `${concluidos}/${proj.length} concluidos` },
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
    if (!tipo) return res.status(404).json({ error: 'Tipo nao encontrado' });

    const mes = req.query.mes; // opcional: YYYY-MM
    let result;
    if (sigla === 'OKR') result = await buildOKR();
    else if (sigla === 'DRE') result = await buildDRE(mes);
    else if (sigla === 'KPI') result = await buildKPI(mes);
    else if (sigla === 'CC') result = await buildCC(mes);
    else if (sigla === 'DE') result = await buildDE();
    else if (sigla === 'AG') result = await buildAG();
    else return res.status(404).json({ error: 'Builder nao implementado' });

    // Buscar observacoes salvas (se existirem)
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
// SALVAR OBSERVACOES
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
    if (!tipo) return res.status(404).json({ error: 'Tipo nao encontrado' });

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

module.exports = router;
