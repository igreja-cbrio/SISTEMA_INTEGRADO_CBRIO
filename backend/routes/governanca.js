/**
 * Governança — Relatórios automáticos para 6 reuniões recorrentes.
 * Cada tipo puxa dados reais dos módulos do sistema e gera um checklist
 * indicando o que está preenchido e o que falta.
 */
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const hoje = () => new Date().toISOString().split('T')[0];

// ══════════════════════════════════════════════
// TIPOS DE REUNIAO (fixos)
// ══════════════════════════════════════════════

const TIPOS = [
  { sigla: 'OKR', nome: 'OKR', cor: '#3b82f6', recorrencia: 'mensal', semana: 1, descricao: 'Objectives & Key Results' },
  { sigla: 'DRE', nome: 'DRE', cor: '#10b981', recorrencia: 'mensal', semana: 2, descricao: 'Demonstrativo de Resultado' },
  { sigla: 'KPI', nome: 'KPI', cor: '#f59e0b', recorrencia: 'mensal', semana: 3, descricao: 'Indicadores de Performance' },
  { sigla: 'CC',  nome: 'Conselho Consultivo', cor: '#8b5cf6', recorrencia: 'mensal', semana: 4, descricao: 'Conselho Consultivo' },
  { sigla: 'DE',  nome: 'Diretoria Estatutaria', cor: '#ef4444', recorrencia: 'quadrimestral', semana: 1, descricao: 'Diretoria Estatutaria' },
  { sigla: 'AG',  nome: 'Assembleia Geral', cor: '#06b6d4', recorrencia: 'semestral', semana: 1, descricao: 'Assembleia com a Igreja' },
];

// GET /api/governanca/tipos
router.get('/tipos', (req, res) => res.json(TIPOS));

// ══════════════════════════════════════════════
// RELATORIO POR TIPO
// Puxa dados reais dos módulos + checklist automático
// ══════════════════════════════════════════════

router.get('/relatorio/:sigla', async (req, res) => {
  try {
    const sigla = req.params.sigla.toUpperCase();
    const tipo = TIPOS.find(t => t.sigla === sigla);
    if (!tipo) return res.status(404).json({ error: 'Tipo nao encontrado' });

    const h = hoje();
    const mesAtual = h.slice(0, 7); // YYYY-MM
    const result = { tipo, gerado_em: h, checklist: [], dados: {}, resumo: {} };

    if (sigla === 'OKR') {
      const [projRes, marcosRes] = await Promise.all([
        supabase.from('projects').select('id, name, status, date_end, responsible, area, description').neq('status', 'concluido').neq('status', 'cancelado').order('name'),
        supabase.from('expansion_milestones').select('id, name, status, date_end, responsible, area, phase').neq('status', 'concluido').neq('status', 'cancelado').order('sort_order'),
      ]);
      const proj = projRes.data || [];
      const marcos = marcosRes.data || [];
      const projAtrasados = proj.filter(p => p.date_end && p.date_end < h);
      const projSemResp = proj.filter(p => !p.responsible);
      const projSemData = proj.filter(p => !p.date_end);
      const marcosAtrasados = marcos.filter(m => m.date_end && m.date_end < h);

      result.dados = { projetos: proj, marcos, projAtrasados, marcosAtrasados };
      result.resumo = {
        projetos_ativos: proj.length, projetos_atrasados: projAtrasados.length,
        projetos_sem_responsavel: projSemResp.length, projetos_sem_data: projSemData.length,
        marcos_ativos: marcos.length, marcos_atrasados: marcosAtrasados.length,
      };
      result.checklist = [
        { item: 'Projetos com status atualizado', ok: projAtrasados.length === 0, valor: `${proj.length - projAtrasados.length}/${proj.length} no prazo` },
        { item: 'Todos os projetos com responsavel', ok: projSemResp.length === 0, valor: projSemResp.length === 0 ? 'Todos atribuidos' : `${projSemResp.length} sem responsavel` },
        { item: 'Todos os projetos com data de entrega', ok: projSemData.length === 0, valor: projSemData.length === 0 ? 'Todos com data' : `${projSemData.length} sem data` },
        { item: 'Marcos de expansao atualizados', ok: marcosAtrasados.length === 0, valor: `${marcos.length - marcosAtrasados.length}/${marcos.length} no prazo` },
      ];
    }

    if (sigla === 'DRE') {
      const [contasRes, transRes] = await Promise.all([
        supabase.from('fin_contas').select('id, nome, saldo, tipo'),
        supabase.from('fin_transacoes').select('id, tipo, valor, data, descricao, categoria_nome').gte('data', `${mesAtual}-01`).order('data', { ascending: false }),
      ]);
      const contas = contasRes.data || [];
      const trans = transRes.data || [];
      const receitas = trans.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
      const despesas = trans.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
      const saldoTotal = contas.reduce((s, c) => s + Number(c.saldo || 0), 0);

      result.dados = { contas, transacoes: trans };
      result.resumo = { receitas, despesas, resultado: receitas - despesas, saldo_total: saldoTotal, total_transacoes: trans.length };
      result.checklist = [
        { item: 'Transacoes do mes lancadas', ok: trans.length > 0, valor: `${trans.length} transacoes` },
        { item: 'Contas com saldo atualizado', ok: contas.length > 0, valor: `${contas.length} contas cadastradas` },
        { item: 'Resultado do mes calculado', ok: true, valor: `R$ ${(receitas - despesas).toLocaleString('pt-BR')}` },
      ];
    }

    if (sigla === 'KPI') {
      const [cultosRes, membrosRes] = await Promise.all([
        supabase.from('vw_culto_stats').select('*').gte('data', `${mesAtual}-01`).order('data'),
        supabase.from('membros').select('id, status').eq('status', 'ativo'),
      ]);
      const cultos = cultosRes.data || [];
      const membros = membrosRes.data || [];
      const presencaMedia = cultos.length > 0 ? Math.round(cultos.reduce((s, c) => s + (c.presenca_total || 0), 0) / cultos.length) : 0;

      // Voluntarios ativos
      const { data: vols } = await supabase.from('vol_profiles').select('id').eq('status', 'ativo');

      result.dados = { cultos, total_membros: membros.length, total_voluntarios: (vols || []).length };
      result.resumo = {
        cultos_no_mes: cultos.length, presenca_media: presencaMedia,
        membros_ativos: membros.length, voluntarios_ativos: (vols || []).length,
      };
      result.checklist = [
        { item: 'Cultos do mes registrados', ok: cultos.length > 0, valor: `${cultos.length} cultos` },
        { item: 'Presenca registrada', ok: presencaMedia > 0, valor: presencaMedia > 0 ? `Media: ${presencaMedia}` : 'Sem registros' },
        { item: 'Membresia atualizada', ok: membros.length > 0, valor: `${membros.length} membros ativos` },
      ];
    }

    if (sigla === 'CC') {
      // Consolidado: puxa resumo de OKR + DRE + KPI
      const [projRes, contasRes, cultosRes] = await Promise.all([
        supabase.from('projects').select('id, name, status, date_end').neq('status', 'concluido').neq('status', 'cancelado'),
        supabase.from('fin_transacoes').select('tipo, valor').gte('data', `${mesAtual}-01`),
        supabase.from('vw_culto_stats').select('presenca_total').gte('data', `${mesAtual}-01`),
      ]);
      const proj = projRes.data || [];
      const trans = contasRes.data || [];
      const cultos = cultosRes.data || [];
      const projAtrasados = proj.filter(p => p.date_end && p.date_end < h).length;
      const receitas = trans.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
      const despesas = trans.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
      const presencaMedia = cultos.length > 0 ? Math.round(cultos.reduce((s, c) => s + (c.presenca_total || 0), 0) / cultos.length) : 0;

      result.resumo = { projetos_ativos: proj.length, projetos_atrasados: projAtrasados, resultado_financeiro: receitas - despesas, presenca_media: presencaMedia };
      result.checklist = [
        { item: 'OKR: projetos atualizados', ok: projAtrasados === 0, valor: `${projAtrasados} atrasados de ${proj.length}` },
        { item: 'DRE: financeiro fechado', ok: trans.length > 0, valor: `Resultado: R$ ${(receitas - despesas).toLocaleString('pt-BR')}` },
        { item: 'KPI: presenca registrada', ok: presencaMedia > 0, valor: presencaMedia > 0 ? `Media: ${presencaMedia}` : 'Sem dados' },
      ];
    }

    if (sigla === 'DE') {
      // Quadrimestral: RH + patrimonio + financeiro acumulado
      const [funcRes, bensRes, transRes] = await Promise.all([
        supabase.from('rh_funcionarios').select('id, nome, status, cargo').eq('status', 'ativo'),
        supabase.from('patrimonio_bens').select('id, status'),
        supabase.from('fin_transacoes').select('tipo, valor').gte('data', `${new Date().getFullYear()}-01-01`),
      ]);
      const funcs = funcRes.data || [];
      const bens = bensRes.data || [];
      const trans = transRes.data || [];
      const receitaAno = trans.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
      const despesaAno = trans.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);

      result.resumo = { funcionarios_ativos: funcs.length, bens_patrimonio: bens.length, receita_acumulada: receitaAno, despesa_acumulada: despesaAno };
      result.checklist = [
        { item: 'Quadro de funcionarios atualizado', ok: funcs.length > 0, valor: `${funcs.length} ativos` },
        { item: 'Patrimonio inventariado', ok: bens.length > 0, valor: `${bens.length} bens` },
        { item: 'Financeiro acumulado do ano', ok: trans.length > 0, valor: `Resultado: R$ ${(receitaAno - despesaAno).toLocaleString('pt-BR')}` },
      ];
    }

    if (sigla === 'AG') {
      // Semestral: prestacao de contas completa
      const ano = new Date().getFullYear();
      const [projRes, transRes, membrosRes, cultosRes] = await Promise.all([
        supabase.from('projects').select('id, name, status'),
        supabase.from('fin_transacoes').select('tipo, valor').gte('data', `${ano}-01-01`),
        supabase.from('membros').select('id').eq('status', 'ativo'),
        supabase.from('vw_culto_stats').select('presenca_total').gte('data', `${ano}-01-01`),
      ]);
      const proj = projRes.data || [];
      const trans = transRes.data || [];
      const projConcluidos = proj.filter(p => p.status === 'concluido').length;
      const receitaAno = trans.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
      const despesaAno = trans.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);

      result.resumo = {
        projetos_total: proj.length, projetos_concluidos: projConcluidos,
        receita_ano: receitaAno, despesa_ano: despesaAno, resultado_ano: receitaAno - despesaAno,
        membros_ativos: (membrosRes.data || []).length,
        cultos_no_ano: (cultosRes.data || []).length,
      };
      result.checklist = [
        { item: 'Projetos com status final', ok: true, valor: `${projConcluidos}/${proj.length} concluidos` },
        { item: 'Prestacao de contas financeira', ok: trans.length > 0, valor: `R$ ${receitaAno.toLocaleString('pt-BR')} receita | R$ ${despesaAno.toLocaleString('pt-BR')} despesa` },
        { item: 'Dados de membresia atualizados', ok: (membrosRes.data || []).length > 0, valor: `${(membrosRes.data || []).length} membros ativos` },
      ];
    }

    res.json(result);
  } catch (err) { console.error('[GOV RELATORIO]', err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
