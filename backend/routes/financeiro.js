const router = require('express').Router();
const { authenticate, authorizeModule, getEffectiveLevel } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { fetchAllRows } = require('../utils/pagination');

const { isAuthorizedCron } = require('../utils/cronAuth');

// ── Cron · alertas (definido ANTES de router.use(authenticate)) ──
router.get('/alertas/cron-gerar', async (req, res) => {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }
  try {
    const { data, error } = await supabase.rpc('gerar_alertas_financeiros');
    if (error) throw error;
    const total = (data || []).reduce((s, r) => s + Number(r.qtd_criados || 0), 0);
    res.json({ ok: true, total_criados: total, por_tipo: data || [] });
  } catch (e) { res.status(500).json({ ok: false, erro: e.message }); }
});

router.use(authenticate, authorizeModule('financeiro'));

// ── DASHBOARD ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    // Escopa as transações ao mês corrente NO BANCO — sem isso o select traz a
    // tabela inteira e o cap de 1000 do PostgREST subconta silenciosamente os
    // totais do mês quando fin_transacoes passa de 1000 linhas (ledger cresce).
    const agora = new Date();
    const mesInicio = `${agora.toISOString().slice(0, 7)}-01`;
    const mesProximo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

    const [contas, transacoes, pagar, reembolsos] = await Promise.all([
      supabase.from('fin_contas').select('id, nome, tipo, saldo, ativa'),
      // fin_transacoes passa de 1000/mês (junho: ~4k) — paginado, senão o cap
      // do PostgREST subcontava receitas/despesas do mês em silêncio.
      fetchAllRows(() => supabase.from('fin_transacoes').select('tipo, valor, status, data_competencia')
        .neq('status', 'cancelado')
        .gte('data_competencia', mesInicio).lt('data_competencia', mesProximo)),
      supabase.from('fin_contas_pagar').select('id, valor, status, data_vencimento'),
      supabase.from('fin_reembolsos').select('id, valor, status'),
    ]);

    const saldoTotal = (contas.data || []).filter(c => c.ativa).reduce((s, c) => s + Number(c.saldo), 0);
    const hoje = new Date().toISOString().slice(0, 10);

    const transMes = transacoes || [];
    const receitasMes = transMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const despesasMes = transMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);

    const pg = pagar.data || [];
    const vencidas = pg.filter(p => p.status === 'pendente' && p.data_vencimento < hoje);
    const pendentes = pg.filter(p => p.status === 'pendente');

    const reemb = reembolsos.data || [];
    const reembPendentes = reemb.filter(r => r.status === 'pendente');

    res.json({
      saldoTotal,
      contasAtivas: (contas.data || []).filter(c => c.ativa).length,
      receitasMes, despesasMes,
      contasPagarPendentes: pendentes.length,
      contasPagarVencidas: vencidas.length,
      valorPagarPendente: pendentes.reduce((s, p) => s + Number(p.valor), 0),
      reembolsosPendentes: reembPendentes.length,
      valorReembolsosPendentes: reembPendentes.reduce((s, r) => s + Number(r.valor), 0),
    });
  } catch (e) {
    console.error('[FIN] Dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard financeiro' });
  }
});

// ── CONTAS ─────────────────────────────────────────────────
router.get('/contas', async (req, res) => {
  try {
    const { data, error } = await supabase.from('fin_contas').select('*').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar contas' }); }
});

router.post('/contas', async (req, res) => {
  try {
    const { nome, banco, agencia, conta, tipo } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase.from('fin_contas')
      .insert({ nome, banco: banco || null, agencia: agencia || null, conta: conta || null, tipo: tipo || 'corrente' })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar conta' }); }
});

router.put('/contas/:id', async (req, res) => {
  try {
    const { nome, banco, agencia, conta, tipo, saldo, ativa } = req.body;
    const { data, error } = await supabase.from('fin_contas')
      .update({ nome, banco, agencia, conta, tipo, saldo, ativa })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar conta' }); }
});

router.delete('/contas/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_contas').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover conta' }); }
});

// ── CATEGORIAS ─────────────────────────────────────────────
router.get('/categorias', async (req, res) => {
  try {
    const { data, error } = await supabase.from('fin_categorias').select('*').order('tipo').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar categorias' }); }
});

router.post('/categorias', async (req, res) => {
  try {
    const { nome, tipo, icone, pai_id } = req.body;
    if (!nome || !tipo) return res.status(400).json({ error: 'Nome e tipo são obrigatórios' });
    const { data, error } = await supabase.from('fin_categorias')
      .insert({ nome, tipo, icone: icone || null, pai_id: pai_id || null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar categoria' }); }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_categorias').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover categoria' }); }
});

// ── TRANSAÇÕES ─────────────────────────────────────────────
router.get('/transacoes', async (req, res) => {
  try {
    const { conta_id, tipo, status, mes, inicio, fim, busca, sem_documento, limit = 1000 } = req.query;
    // Builder reutilizável — fetchAllRows pagina por baixo dos panos até o teto
    // pedido (o `.limit(>1000)` antigo era cortado em 1000 pelo PostgREST, então
    // a lista truncava em silêncio sobre 151k transações).
    const build = () => {
      let query = supabase.from('fin_transacoes')
        .select('*, fin_contas(nome), fin_categorias(nome, tipo)')
        .order('data_competencia', { ascending: false });
      if (conta_id) query = query.eq('conta_id', conta_id);
      if (tipo) query = query.eq('tipo', tipo);
      if (status) query = query.eq('status', status);
      if (mes) {
        const [y, m] = mes.split('-');
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        query = query.gte('data_competencia', `${mes}-01`).lte('data_competencia', `${mes}-${String(lastDay).padStart(2, '0')}`);
      }
      if (inicio) query = query.gte('data_competencia', inicio);
      if (fim) query = query.lte('data_competencia', fim);
      if (busca) query = query.ilike('descricao', `%${busca}%`);
      return query;
    };
    const teto = Math.min(Number(limit) || 1000, 50000);
    let data = await fetchAllRows(build, { max: teto });

    // Conciliação: só as transações SEM comprovante anexado E SEM nota fiscal
    // vinculada (o que falta documentar). anexos_url vazio + id fora do conjunto
    // de transações com NF. Pós-filtro em JS sobre o recorte já paginado.
    if (sem_documento === 'true') {
      const ids = data.map(t => t.id);
      const comNf = new Set();
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: nfs } = await supabase.from('log_notas_fiscais')
          .select('transacao_id').in('transacao_id', chunk).not('transacao_id', 'is', null);
        (nfs || []).forEach(n => comNf.add(n.transacao_id));
      }
      data = data.filter(t => {
        const anexos = Array.isArray(t.anexos_url) ? t.anexos_url : [];
        return anexos.length === 0 && !comNf.has(t.id);
      });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar transações' }); }
});

// Banco de comprovantes · agrega anexos das transações + notas fiscais com
// arquivo (via RPC fn_banco_comprovantes · migration 20260729140000).
router.get('/comprovantes', async (req, res) => {
  try {
    const { inicio, fim, conta_id, q } = req.query;
    const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const { data, error } = await supabase.rpc('fn_banco_comprovantes', {
      p_inicio: inicio || null,
      p_fim: fim || null,
      p_conta: conta_id || null,
      p_q: q || null,
      p_base: base,
    });
    if (error) return res.status(400).json({ error: error.message });
    const itens = Array.isArray(data) ? data : [];
    res.json({ itens, total: itens.length });
  } catch (e) {
    console.error('[FIN] banco de comprovantes:', e);
    res.status(500).json({ error: 'Erro ao listar comprovantes' });
  }
});

router.post('/transacoes', async (req, res) => {
  try {
    const { conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, referencia, observacoes } = req.body;
    if (!conta_id || !tipo || !descricao || !valor || !data_competencia) {
      return res.status(400).json({ error: 'Campos obrigatórios: conta, tipo, descrição, valor, data' });
    }
    const { data, error } = await supabase.from('fin_transacoes')
      .insert({ conta_id, categoria_id: categoria_id || null, tipo, descricao, valor, data_competencia, data_pagamento: data_pagamento || null, referencia: referencia || null, observacoes: observacoes || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar transação' }); }
});

router.put('/transacoes/:id', async (req, res) => {
  try {
    const { conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, referencia, observacoes } = req.body;
    const { data, error } = await supabase.from('fin_transacoes')
      .update({ conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, referencia, observacoes })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar transação' }); }
});

router.delete('/transacoes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_transacoes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover transação' }); }
});

// ── CONTAS A PAGAR ─────────────────────────────────────────
router.get('/contas-pagar', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('fin_contas_pagar').select('*, fin_contas(nome), fin_categorias(nome)').order('data_vencimento');
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar contas a pagar' }); }
});

router.post('/contas-pagar', async (req, res) => {
  try {
    const { descricao, fornecedor, categoria_id, valor, data_vencimento, conta_id } = req.body;
    if (!descricao || !valor || !data_vencimento) return res.status(400).json({ error: 'Descrição, valor e vencimento são obrigatórios' });
    const { data, error } = await supabase.from('fin_contas_pagar')
      .insert({ descricao, fornecedor: fornecedor || null, categoria_id: categoria_id || null, valor, data_vencimento, conta_id: conta_id || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar conta a pagar' }); }
});

router.put('/contas-pagar/:id', async (req, res) => {
  try {
    const { descricao, fornecedor, categoria_id, valor, data_vencimento, data_pagamento, conta_id, status } = req.body;
    const { data, error } = await supabase.from('fin_contas_pagar')
      .update({ descricao, fornecedor, categoria_id, valor, data_vencimento, data_pagamento, conta_id, status })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar conta a pagar' }); }
});

router.delete('/contas-pagar/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_contas_pagar').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover conta a pagar' }); }
});

// ── REEMBOLSOS ─────────────────────────────────────────────
// Reembolsos = solicitações da categoria 'reembolso' (a fonte de verdade · a
// tabela legada fin_reembolsos ficou vazia). Mapeia pro shape que a tela espera
// (descricao/valor/data_despesa/status/observacoes) e traduz o status da
// solicitação pro vocabulário de reembolso. A aprovação continua no módulo
// /solicitacoes (aqui é visão).
const REEMB_STATUS_MAP = {
  aprovado: ['aprovado', 'aguardando_aprovacao_financeira', 'em_cotacao', 'aguardando_merito'],
  rejeitado: ['rejeitado'],
  pago: ['concluido', 'pago'],
  pendente: ['aberto', 'pendente', 'aguardando_aprovacao_origem'],
};
function traduzStatusReembolso(s) {
  if (s === 'rejeitado') return 'rejeitado';
  if (s === 'concluido' || s === 'pago') return 'pago';
  if (s === 'aprovado' || s === 'aguardando_aprovacao_financeira' || s === 'em_cotacao' || s === 'aguardando_merito') return 'aprovado';
  return 'pendente';
}
router.get('/reembolsos', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('solicitacoes')
      .select('id, titulo, descricao, justificativa, valor_estimado, status, created_at, data_necessaria, observacoes, solicitante_id, profiles!solicitante_id(name)')
      .eq('categoria', 'reembolso')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (status && REEMB_STATUS_MAP[status]) query = query.in('status', REEMB_STATUS_MAP[status]);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    const mapeado = (data || []).map((s) => ({
      id: s.id,
      descricao: s.descricao || s.titulo || 'Reembolso',
      valor: s.valor_estimado,
      data_despesa: s.data_necessaria || s.created_at,
      status: traduzStatusReembolso(s.status),
      status_original: s.status,
      observacoes: s.justificativa || s.observacoes || null,
      solicitante_nome: s.profiles?.name || null,
      origem: 'solicitacao',
    }));
    res.json(mapeado);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar reembolsos' }); }
});

router.patch('/reembolsos/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['aprovado', 'rejeitado', 'pago'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    // Aprovar/pagar reembolso e decisao de gasto · exige nivel alto (>=4) ou
    // admin/diretor. Nivel 2 (lancamento de numeros) NAO libera dinheiro.
    if (!['admin', 'diretor'].includes(req.user.role) && getEffectiveLevel(req, 'financeiro') < 4) {
      return res.status(403).json({ error: 'Sem permissão para aprovar/pagar reembolsos' });
    }
    const { data, error } = await supabase.from('fin_reembolsos')
      .update({ status, aprovado_por: req.user.userId })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar reembolso' }); }
});

// ══════════════════════════════════════════════════════════════════════════
// DESPESAS RECORRENTES + PROJECAO DE CAIXA
// ══════════════════════════════════════════════════════════════════════════

router.get('/recorrentes', async (req, res) => {
  try {
    const { ativa, confirmada } = req.query;
    let q = supabase.from('fin_despesas_recorrentes').select('*').order('descricao');
    if (ativa !== undefined) q = q.eq('ativa', ativa === 'true');
    if (confirmada !== undefined) q = q.eq('confirmada', confirmada === 'true');
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/recorrentes', async (req, res) => {
  try {
    const {
      descricao, fornecedor, valor_medio, cadencia_dias, dia_vencimento,
      plano_contas_id, conta_id, classe, pix_chave, observacao,
      gera_n_dias_antes, proxima_estimada,
    } = req.body || {};
    if (!descricao || !valor_medio) {
      return res.status(400).json({ error: 'descrição e valor_medio são obrigatórios' });
    }
    const valor = Number(valor_medio);
    const { data, error } = await supabase.from('fin_despesas_recorrentes').insert({
      descricao,
      fornecedor: fornecedor || null,
      chave_match: (fornecedor || descricao).toLowerCase().trim(),
      tipo_chave: 'manual',
      valor_medio: valor,
      valor_minimo: valor,
      valor_maximo: valor,
      cadencia_dias: cadencia_dias ? Number(cadencia_dias) : 30,
      dia_vencimento: dia_vencimento ? Number(dia_vencimento) : null,
      plano_contas_id: plano_contas_id || null,
      conta_id: conta_id || null,
      classe: classe || 'fixa',
      pix_chave: pix_chave || null,
      observacao: observacao || null,
      gera_n_dias_antes: gera_n_dias_antes ? Number(gera_n_dias_antes) : 7,
      proxima_estimada: proxima_estimada || null,
      ativa: true, confirmada: true, confianca: 1.0,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/recorrentes/:id', async (req, res) => {
  try {
    const patch = { ...req.body };
    delete patch.id; delete patch.created_at;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('fin_despesas_recorrentes').update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/recorrentes/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_despesas_recorrentes').update({ ativa: false }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/recorrentes/gerar-contas-pagar', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('gerar_contas_pagar_recorrentes', {
      p_user_id: req.user.userId,
    });
    if (error) throw error;
    res.json({
      total: (data || []).length,
      criadas: (data || []).filter(r => r.acao === 'criado').length,
      ja_existiam: (data || []).filter(r => r.acao === 'ja_existe').length,
      detalhes: data || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projecao-caixa', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_projecao_caixa_mensal').select('*').order('mes_inicio');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD DE GENEROSIDADE
// ══════════════════════════════════════════════════════════════════════════

router.get('/generosidade/overview', async (req, res) => {
  try {
    const { data: mensal, error } = await supabase
      .from('vw_doacoes_mensal').select('*').order('mes');
    if (error) throw error;

    const arr = mensal || [];
    const mesAtual = arr[arr.length - 1] || {};
    const mesAnterior = arr[arr.length - 2] || {};
    const totalAtual = Number(mesAtual.total || 0);
    const totalAnterior = Number(mesAnterior.total || 0);
    const variacaoPct = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : null;
    const dizimoMedio = mesAtual.qtd_doadores_unicos > 0
      ? Number(mesAtual.dizimo || 0) / Number(mesAtual.qtd_doadores_unicos)
      : 0;

    // % membros doando · doadores únicos com membro_id / total membros ativos
    const { count: membrosAtivos } = await supabase
      .from('mem_membros')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('status', 'membro_ativo');

    const desdeMes = new Date();
    desdeMes.setDate(1);
    const { data: doadoresMes } = await supabase
      .from('vw_doacoes_unificada')
      .select('membro_id', { count: 'exact' })
      .not('membro_id', 'is', null)
      .gte('data', desdeMes.toISOString().slice(0, 10));
    const doadoresUnicos = new Set((doadoresMes || []).map(r => r.membro_id)).size;
    const pctMembrosDoando = membrosAtivos > 0 ? (doadoresUnicos / membrosAtivos) * 100 : 0;

    res.json({
      mensal: arr,
      mes_atual: {
        total: totalAtual,
        dizimo: Number(mesAtual.dizimo || 0),
        oferta: Number(mesAtual.oferta || 0),
        outras: Number(mesAtual.outras || 0),
        qtd_doacoes: Number(mesAtual.qtd_doacoes || 0),
        qtd_doadores_unicos: Number(mesAtual.qtd_doadores_unicos || 0),
      },
      variacao_pct: variacaoPct,
      dizimo_medio: dizimoMedio,
      membros_ativos: membrosAtivos || 0,
      doadores_unicos_mes: doadoresUnicos,
      pct_membros_doando: pctMembrosDoando,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/generosidade/anonimos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_doadores_anonimos_top').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Pararam de doar · regulares (>=3 doações no histórico) sem doar há N dias.
// 'periodo' = 2m | 3m | 6m (default 2m). Espelha a regra da vw_doadores_pararam
// (>=3 doações · inativo 60–365d · mais recentes primeiro), mas agrega via
// fetchAllRows: a view tem LIMIT 100 antes de QUALQUER filtro do cliente — o
// bucket de 6m (>=180d) seria truncado pela janela 60–180d encher o top-100.
// A view segue intacta (os alertas SQL do notificacaoGenerator dependem dela).
const PARARAM_DIAS = { '2m': 60, '3m': 90, '6m': 180 };
router.get('/generosidade/pararam', async (req, res) => {
  try {
    const dias = PARARAM_DIAS[req.query.periodo] || 60;

    const linhas = await fetchAllRows(() =>
      supabase
        .from('vw_doacoes_unificada')
        .select('membro_id, data, valor')
        .not('membro_id', 'is', null),
      { max: 20000 }
    );

    const porMembro = new Map();
    for (const l of linhas) {
      if (!l.membro_id) continue;
      const acc = porMembro.get(l.membro_id) || { membro_id: l.membro_id, qtd: 0, total: 0, ultima: l.data };
      acc.qtd += 1;
      acc.total += Number(l.valor || 0);
      if (l.data > acc.ultima) acc.ultima = l.data;
      porMembro.set(l.membro_id, acc);
    }

    const hoje = new Date();
    const diasDe = (s) => Math.floor((hoje - new Date(s)) / 86400000);
    const candidatos = Array.from(porMembro.values())
      .filter(m => m.qtd >= 3)
      .map(m => ({ ...m, dias_inativo: diasDe(m.ultima) }))
      .filter(m => m.dias_inativo >= dias && m.dias_inativo <= 365)
      .sort((a, b) => a.ultima < b.ultima ? 1 : a.ultima > b.ultima ? -1 : 0)
      .slice(0, 100);

    if (candidatos.length > 0) {
      const { data: membros } = await supabase
        .from('mem_membros')
        .select('id, nome, telefone, email')
        .in('id', candidatos.map(m => m.membro_id))
        .is('deleted_at', null);
      const map = new Map((membros || []).map(mm => [mm.id, mm]));
      res.json(candidatos.map(c => {
        const mm = map.get(c.membro_id) || {};
        return {
          membro_id: c.membro_id,
          nome: mm.nome || null,
          telefone: mm.telefone || null,
          email: mm.email || null,
          doacoes_total: c.qtd,
          valor_total: c.total,
          ultima_doacao: c.ultima,
          dias_inativo: c.dias_inativo,
        };
      }));
    } else {
      res.json([]);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Topo contribuintes · ranking dos membros que mais contribuíram.
// Fonte: vw_doacoes_unificada com membro_id não-nulo (na prática mem_contribuicoes —
// os braços fin_transacoes/fin_pix_detalhe têm membro_id NULL). Empréstimo fica fora
// por construção: a view só agrega fin_transacoes com plano 3.01% (3.02.06 = empréstimo).
// Agregação em JS sobre fetchAllRows (cap 1000 do PostgREST subcontaria o total).
// Período aceito: '12m' (últimos 12 meses) · 'tudo' · '<AAAA-MM>' (mês específico).
function parsePeriodo(periodo) {
  if (typeof periodo === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    const [ano, mes] = periodo.split('-').map(Number);
    const desde = `${periodo}-01`;
    const ate = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10); // 1º dia do mês seguinte
    return { periodo, desde, ate };
  }
  if (periodo === 'tudo') return { periodo: 'tudo', desde: null, ate: null };
  const corte = new Date();
  corte.setFullYear(corte.getFullYear() - 1);
  return { periodo: '12m', desde: corte.toISOString().slice(0, 10), ate: null };
}

router.get('/generosidade/top', async (req, res) => {
  try {
    const { periodo, desde, ate } = parsePeriodo(req.query.periodo);
    const ordem = req.query.ordem === 'asc' ? 'asc' : 'desc';

    const linhas = await fetchAllRows(() => {
      let q = supabase
        .from('vw_doacoes_unificada')
        .select('membro_id, data, valor, tipo');
      if (desde) q = q.gte('data', desde);
      if (ate) q = q.lt('data', ate);
      return q.not('membro_id', 'is', null);
    }, { max: 20000 });

    const porMembro = new Map();
    for (const l of linhas) {
      if (!l.membro_id) continue;
      const acc = porMembro.get(l.membro_id) || {
        membro_id: l.membro_id, qtd_doacoes: 0, total: 0,
        primeira_doacao: l.data, ultima_doacao: l.data, nome: null,
      };
      acc.qtd_doacoes += 1;
      acc.total += Number(l.valor || 0);
      if (l.data < acc.primeira_doacao) acc.primeira_doacao = l.data;
      if (l.data > acc.ultima_doacao) acc.ultima_doacao = l.data;
      porMembro.set(l.membro_id, acc);
    }

    const ordenado = Array.from(porMembro.values())
      .sort((a, b) => ordem === 'asc' ? a.total - b.total : b.total - a.total);
    const top = ordenado.slice(0, 20);

    if (top.length > 0) {
      const { data: membros } = await supabase
        .from('mem_membros')
        .select('id, nome')
        .in('id', top.map(m => m.membro_id))
        .is('deleted_at', null);
      const nomes = new Map((membros || []).map(mm => [mm.id, mm.nome]));
      for (const m of top) m.nome = nomes.get(m.membro_id) || null;
    }

    res.json({ periodo, ordem, top });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Histórico de contribuições de um membro (mesmo período do ranking).
router.get('/generosidade/top/:membroId/historico', async (req, res) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.membroId)) {
      return res.status(400).json({ error: 'membro_id inválido' });
    }
    const { periodo, desde, ate } = parsePeriodo(req.query.periodo);

    const linhas = await fetchAllRows(() => {
      let q = supabase
        .from('vw_doacoes_unificada')
        .select('id, data, valor, tipo, forma_pagamento, campanha, origem, fonte')
        .eq('membro_id', req.params.membroId)
        .order('data', { ascending: false });
      if (desde) q = q.gte('data', desde);
      if (ate) q = q.lt('data', ate);
      return q;
    }, { max: 10000 });

    const total = linhas.reduce((s, l) => s + Number(l.valor || 0), 0);
    res.json({
      periodo,
      membro_id: req.params.membroId,
      total,
      qtd_doacoes: linhas.length,
      primeira_doacao: linhas.length ? linhas[linhas.length - 1].data : null,
      ultima_doacao: linhas.length ? linhas[0].data : null,
      contribuicoes: linhas,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// CONCILIACAO INTELIGENTE · fila + stats + bulk approve + reclassificar
// ══════════════════════════════════════════════════════════════════════════

router.get('/fila-classificacao/stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_classificacao_stats').select('*').single();
    if (error) throw error;
    const total = Number(data?.total_ult30 || 0);
    const auto = Number(data?.classificadas_auto_ult30 || 0);
    res.json({
      ...data,
      pct_automatico: total > 0 ? (auto / total) * 100 : 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/fila-classificacao/items', async (req, res) => {
  try {
    const { confianca_min, origem, limit = 100 } = req.query;
    let q = supabase
      .from('fin_fila_classificacao')
      .select(`
        id, status, sugestao_confianca, sugestao_origem, sugestao_explicacao,
        sugestao_plano_contas_id, sugestao_centro_custo_id, sugestao_membro_id,
        created_at,
        bruto:fin_lancamentos_brutos!fin_fila_classificacao_lancamento_bruto_id_fkey(
          id, data_lancamento, valor, tipo_trn, memo, nome_contraparte, documento_contraparte
        )
      `)
      .eq('status', 'pendente')
      .order('sugestao_confianca', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(Math.min(500, Number(limit)));
    if (confianca_min) q = q.gte('sugestao_confianca', Number(confianca_min));
    if (origem) q = q.eq('sugestao_origem', origem);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Aprova em massa todas as fila pendentes com confiança >= X
router.post('/fila-classificacao/aprovar-massa', async (req, res) => {
  try {
    const { confianca_min = 0.8 } = req.body || {};
    const { data: pendentes, error: e1 } = await supabase
      .from('fin_fila_classificacao')
      .select('id, sugestao_plano_contas_id')
      .eq('status', 'pendente')
      .gte('sugestao_confianca', Number(confianca_min))
      .not('sugestao_plano_contas_id', 'is', null);
    if (e1) throw e1;
    if (!pendentes || pendentes.length === 0) {
      return res.json({ aprovadas: 0, mensagem: 'Nenhuma item elegivel' });
    }
    const ids = pendentes.map(p => p.id);
    const { error: e2 } = await supabase
      .from('fin_fila_classificacao')
      .update({ status: 'aprovado', decidido_em: new Date().toISOString(), decidido_por: req.user.userId })
      .in('id', ids);
    if (e2) throw e2;
    res.json({ aprovadas: ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Decide manualmente (1 item)
router.post('/fila-classificacao/:id/decidir', async (req, res) => {
  try {
    const { plano_contas_id, centro_custo_id, membro_id } = req.body || {};
    if (!plano_contas_id) return res.status(400).json({ error: 'plano_contas_id obrigatorio' });
    const { data, error } = await supabase
      .from('fin_fila_classificacao')
      .update({
        sugestao_plano_contas_id: plano_contas_id,
        sugestao_centro_custo_id: centro_custo_id || null,
        sugestao_membro_id: membro_id || null,
        status: 'aprovado',
        decidido_em: new Date().toISOString(),
        decidido_por: req.user.userId,
      })
      .eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Re-roda classificação em toda fila pendente (após cadastrar regra nova)
router.post('/fila-classificacao/reclassificar', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('reclassificar_fila_pendente');
    if (error) throw error;
    res.json({ reclassificadas: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// ALERTAS FINANCEIROS INTELIGENTES
// ══════════════════════════════════════════════════════════════════════════

// Lista alertas abertos
router.get('/alertas', async (req, res) => {
  try {
    const { atendido } = req.query;
    if (atendido === 'true') {
      const { data, error } = await supabase
        .from('fin_alertas').select('*')
        .not('atendido_em', 'is', null)
        .order('atendido_em', { ascending: false }).limit(100);
      if (error) throw error;
      return res.json(data || []);
    }
    const { data, error } = await supabase
      .from('vw_fin_alertas_abertos').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marca atendido
router.post('/alertas/:id/atender', async (req, res) => {
  try {
    const { comentario } = req.body || {};
    const { data, error } = await supabase
      .from('fin_alertas').update({
        atendido_em: new Date().toISOString(),
        atendido_por: req.user.userId,
        comentario_atendimento: comentario || null,
      }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Roda gerador (admin ou cron)
router.post('/alertas/gerar', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('gerar_alertas_financeiros');
    if (error) throw error;
    const total = (data || []).reduce((s, r) => s + Number(r.qtd_criados || 0), 0);
    res.json({ total_criados: total, por_tipo: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// CALENDÁRIO FINANCEIRO
// ══════════════════════════════════════════════════════════════════════════

router.get('/calendario', async (req, res) => {
  try {
    const { inicio, fim, tipo } = req.query;
    let q = supabase.from('vw_calendario_financeiro').select('*').order('data');
    if (inicio) q = q.gte('data', inicio);
    if (fim) q = q.lte('data', fim);
    if (tipo) q = q.eq('tipo', tipo);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// DRE POR CENTRO DE CUSTO
// ══════════════════════════════════════════════════════════════════════════

// Lista centros de custo cadastrados (pro selector da UI)
router.get('/centros-custo', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_centros_custo')
      .select('id, codigo, nome, campus, area_slug, nivel, aceita_lancamento, ativo')
      .eq('ativo', true)
      .order('codigo');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ranking do mês corrente · receita+despesa por centro
router.get('/dre-centro-custo/atual', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_dre_centro_custo_atual').select('*');
    if (error) throw error;
    // Agrupa por centro · soma receita e despesa em uma linha
    const byId = {};
    (data || []).forEach(r => {
      const k = r.centro_custo_id;
      if (!byId[k]) {
        byId[k] = {
          centro_custo_id: k, codigo: r.codigo, centro_nome: r.centro_nome,
          campus: r.campus, area_slug: r.area_slug,
          receita: 0, despesa: 0, receita_anterior: 0, despesa_anterior: 0,
        };
      }
      const tgt = r.tipo === 'receita' ? 'receita' : 'despesa';
      byId[k][tgt] += Math.abs(Number(r.atual || 0));
      byId[k][`${tgt}_anterior`] += Math.abs(Number(r.anterior || 0));
    });
    const lista = Object.values(byId).map(c => ({
      ...c,
      resultado: c.receita - c.despesa,
      resultado_anterior: c.receita_anterior - c.despesa_anterior,
      total_movimentado: c.receita + c.despesa,
    })).sort((a, b) => b.total_movimentado - a.total_movimentado);
    res.json(lista);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// AUDIT LOG · histórico de mudanças em registros financeiros
// ══════════════════════════════════════════════════════════════════════════

const TABELAS_FIN_AUDITAVEIS = [
  'fin_transacoes', 'fin_contas', 'fin_contas_pagar',
  'fin_closing_mensal', 'fin_despesas_recorrentes',
];

// Histórico de 1 registro especifico
router.get('/audit/:tabela/:row_id', async (req, res) => {
  try {
    const { tabela, row_id } = req.params;
    if (!TABELAS_FIN_AUDITAVEIS.includes(tabela)) {
      return res.status(400).json({ error: 'Tabela não auditavel' });
    }
    const { data, error } = await supabase
      .from('app_audit_log')
      .select('id, action, user_id, user_email, changes, created_at')
      .eq('table_name', tabela)
      .eq('row_id', row_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Audit log financeiro geral · filtros opcionais
router.get('/audit', authorizeModule('financeiro', 3), async (req, res) => {
  try {
    const { tabela, user_email, desde, ate, limit = 100 } = req.query;
    let q = supabase
      .from('app_audit_log')
      .select('id, table_name, row_id, action, user_id, user_email, changes, created_at')
      .in('table_name', TABELAS_FIN_AUDITAVEIS)
      .order('created_at', { ascending: false })
      .limit(Math.min(500, Number(limit)));
    if (tabela && TABELAS_FIN_AUDITAVEIS.includes(tabela)) q = q.eq('table_name', tabela);
    if (user_email) q = q.eq('user_email', user_email.toLowerCase());
    if (desde) q = q.gte('created_at', desde);
    if (ate) q = q.lte('created_at', ate);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// DRE COMPARATIVO TEMPORAL · atual vs anterior vs ano passado
// ══════════════════════════════════════════════════════════════════════════

router.get('/dre-comparativo', async (req, res) => {
  try {
    const [linhas, totais] = await Promise.all([
      supabase.from('vw_dre_comparativo').select('*'),
      supabase.from('vw_dre_comparativo_totais').select('*'),
    ]);
    if (linhas.error) throw linhas.error;
    if (totais.error) throw totais.error;
    res.json({ linhas: linhas.data || [], totais: totais.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// CLOSING MENSAL FINANCEIRO
// ══════════════════════════════════════════════════════════════════════════

router.get('/closing', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_closing_mensal').select('*')
      .order('ano', { ascending: false })
      .order('mes', { ascending: false })
      .limit(36);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/closing/fechar', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const { ano, mes, observacao } = req.body || {};
    if (!ano || !mes) return res.status(400).json({ error: 'ano e mês obrigatórios' });
    // Não fecha mês corrente nem futuro
    const hoje = new Date();
    if (Number(ano) > hoje.getFullYear() ||
        (Number(ano) === hoje.getFullYear() && Number(mes) >= hoje.getMonth() + 1)) {
      return res.status(400).json({ error: 'Não eh possível fechar mês corrente ou futuro' });
    }
    const { data, error } = await supabase.rpc('fechar_mes_financeiro', {
      p_ano: Number(ano), p_mes: Number(mes),
      p_fechado_por: req.user.userId,
      p_observacao: observacao || null,
    });
    if (error) throw error;
    res.json({ id: data, ano, mes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/closing/reabrir', authorizeModule('financeiro', 5), async (req, res) => {
  try {
    const { ano, mes, motivo } = req.body || {};
    if (!ano || !mes) return res.status(400).json({ error: 'ano e mês obrigatórios' });
    if (!motivo || motivo.length < 5) return res.status(400).json({ error: 'motivo obrigatorio (>=5 chars)' });
    const { data, error } = await supabase.rpc('reabrir_mes_financeiro', {
      p_ano: Number(ano), p_mes: Number(mes),
      p_reaberto_por: req.user.userId, p_motivo: motivo,
    });
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Mês não estava fechado' });
    res.json({ reaberto: true, ano, mes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Histórico 12 meses de 1 centro
router.get('/dre-centro-custo/:id/historico', async (req, res) => {
  try {
    const desde = new Date();
    desde.setMonth(desde.getMonth() - 11); desde.setDate(1);
    const { data, error } = await supabase
      .from('vw_dre_centro_custo_mensal')
      .select('mes, tipo, total, qtd_lancamentos')
      .eq('centro_custo_id', req.params.id)
      .gte('mes', desde.toISOString().slice(0, 10))
      .order('mes');
    if (error) throw error;
    // Pivot · 1 linha por mês com receita+despesa
    const byMes = {};
    (data || []).forEach(r => {
      const k = r.mes;
      if (!byMes[k]) byMes[k] = { mes: k, receita: 0, despesa: 0, qtd: 0 };
      const v = Math.abs(Number(r.total || 0));
      byMes[k][r.tipo === 'receita' ? 'receita' : 'despesa'] += v;
      byMes[k].qtd += Number(r.qtd_lancamentos || 0);
    });
    res.json(Object.values(byMes).map(m => ({
      ...m,
      resultado: m.receita - m.despesa,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
