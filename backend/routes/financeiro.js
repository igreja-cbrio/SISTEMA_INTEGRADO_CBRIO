const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate, authorize('admin', 'diretor'));

// ── DASHBOARD ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [contas, transacoes, pagar, reembolsos] = await Promise.all([
      supabase.from('fin_contas').select('id, nome, tipo, saldo, ativa'),
      supabase.from('fin_transacoes').select('tipo, valor, status, data_competencia').neq('status', 'cancelado'),
      supabase.from('fin_contas_pagar').select('id, valor, status, data_vencimento'),
      supabase.from('fin_reembolsos').select('id, valor, status'),
    ]);

    const saldoTotal = (contas.data || []).filter(c => c.ativa).reduce((s, c) => s + Number(c.saldo), 0);
    const hoje = new Date().toISOString().slice(0, 10);

    const trans = transacoes.data || [];
    const mesAtual = new Date().toISOString().slice(0, 7);
    const transMes = trans.filter(t => t.data_competencia?.startsWith(mesAtual));
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
    const { conta_id, tipo, status, mes } = req.query;
    let query = supabase.from('fin_transacoes').select('*, fin_contas(nome), fin_categorias(nome, tipo)').order('data_competencia', { ascending: false });
    if (conta_id) query = query.eq('conta_id', conta_id);
    if (tipo) query = query.eq('tipo', tipo);
    if (status) query = query.eq('status', status);
    if (mes) {
      const [y, m] = mes.split('-');
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      query = query.gte('data_competencia', `${mes}-01`).lte('data_competencia', `${mes}-${String(lastDay).padStart(2, '0')}`);
    }
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar transações' }); }
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
router.get('/reembolsos', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('fin_reembolsos').select('*, profiles!solicitante_id(name)').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar reembolsos' }); }
});

router.post('/reembolsos', async (req, res) => {
  try {
    const { descricao, valor, data_despesa, categoria_id, observacoes } = req.body;
    if (!descricao || !valor || !data_despesa) return res.status(400).json({ error: 'Descrição, valor e data são obrigatórios' });
    const { data, error } = await supabase.from('fin_reembolsos')
      .insert({ solicitante_id: req.user.userId, descricao, valor, data_despesa, categoria_id: categoria_id || null, observacoes: observacoes || null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar reembolso' }); }
});

router.patch('/reembolsos/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['aprovado', 'rejeitado', 'pago'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    const { data, error } = await supabase.from('fin_reembolsos')
      .update({ status, aprovado_por: req.user.userId })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar reembolso' }); }
});

module.exports = router;
