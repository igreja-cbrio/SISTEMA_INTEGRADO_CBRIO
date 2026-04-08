const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate, authorize('admin', 'diretor'));

// ── DASHBOARD ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [fornecedores, solicitacoes, pedidos] = await Promise.all([
      supabase.from('log_fornecedores').select('id, ativo'),
      supabase.from('log_solicitacoes_compra').select('id, status, valor_estimado'),
      supabase.from('log_pedidos').select('id, status, valor_total'),
    ]);

    const forn = fornecedores.data || [];
    const solic = solicitacoes.data || [];
    const ped = pedidos.data || [];

    res.json({
      fornecedoresAtivos: forn.filter(f => f.ativo).length,
      solicitacoesPendentes: solic.filter(s => s.status === 'pendente').length,
      solicitacoesAprovadas: solic.filter(s => s.status === 'aprovado').length,
      pedidosAguardando: ped.filter(p => p.status === 'aguardando').length,
      pedidosEmTransito: ped.filter(p => p.status === 'em_transito').length,
      pedidosRecebidos: ped.filter(p => p.status === 'recebido').length,
      valorTotalPedidos: ped.filter(p => p.status !== 'cancelado').reduce((s, p) => s + Number(p.valor_total), 0),
    });
  } catch (e) {
    console.error('[LOG] Dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard logística' });
  }
});

// ── FORNECEDORES ───────────────────────────────────────────
router.get('/fornecedores', async (req, res) => {
  try {
    const { ativo } = req.query;
    let query = supabase.from('log_fornecedores').select('*').order('razao_social');
    if (ativo !== undefined) query = query.eq('ativo', ativo === 'true');
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar fornecedores' }); }
});

router.post('/fornecedores', async (req, res) => {
  try {
    const { razao_social, nome_fantasia, cnpj, email, telefone, contato, categoria, observacoes } = req.body;
    if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });
    const { data, error } = await supabase.from('log_fornecedores')
      .insert({ razao_social, nome_fantasia: nome_fantasia || null, cnpj: cnpj || null, email: email || null, telefone: telefone || null, contato: contato || null, categoria: categoria || null, observacoes: observacoes || null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar fornecedor' }); }
});

router.put('/fornecedores/:id', async (req, res) => {
  try {
    const { razao_social, nome_fantasia, cnpj, email, telefone, contato, categoria, ativo, observacoes } = req.body;
    const { data, error } = await supabase.from('log_fornecedores')
      .update({ razao_social, nome_fantasia, cnpj, email, telefone, contato, categoria, ativo, observacoes })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar fornecedor' }); }
});

router.delete('/fornecedores/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('log_fornecedores').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover fornecedor' }); }
});

// ── SOLICITAÇÕES DE COMPRA ─────────────────────────────────
router.get('/solicitacoes', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('log_solicitacoes_compra').select('*, profiles!solicitante_id(name)').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar solicitações' }); }
});

router.post('/solicitacoes', async (req, res) => {
  try {
    const { titulo, descricao, justificativa, valor_estimado, urgencia, area } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Título é obrigatório' });
    const { data, error } = await supabase.from('log_solicitacoes_compra')
      .insert({ titulo, descricao: descricao || null, justificativa: justificativa || null, valor_estimado: valor_estimado || null, urgencia: urgencia || 'normal', area: area || null, solicitante_id: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar solicitação' }); }
});

router.patch('/solicitacoes/:id', async (req, res) => {
  try {
    const { status, observacoes } = req.body;
    const update = { status };
    if (observacoes !== undefined) update.observacoes = observacoes;
    if (['aprovado', 'rejeitado'].includes(status)) update.aprovado_por = req.user.userId;
    const { data, error } = await supabase.from('log_solicitacoes_compra')
      .update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar solicitação' }); }
});

// ── PEDIDOS ────────────────────────────────────────────────
router.get('/pedidos', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('log_pedidos').select('*, log_fornecedores(razao_social, nome_fantasia)').order('data_pedido', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar pedidos' }); }
});

router.post('/pedidos', async (req, res) => {
  try {
    const { solicitacao_id, fornecedor_id, descricao, valor_total, data_prevista, codigo_rastreio, transportadora } = req.body;
    if (!fornecedor_id || !descricao || !valor_total) return res.status(400).json({ error: 'Fornecedor, descrição e valor são obrigatórios' });
    const { data, error } = await supabase.from('log_pedidos')
      .insert({ solicitacao_id: solicitacao_id || null, fornecedor_id, descricao, valor_total, data_prevista: data_prevista || null, codigo_rastreio: codigo_rastreio || null, transportadora: transportadora || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar pedido' }); }
});

router.put('/pedidos/:id', async (req, res) => {
  try {
    const { descricao, valor_total, data_prevista, status, codigo_rastreio, transportadora } = req.body;
    const { data, error } = await supabase.from('log_pedidos')
      .update({ descricao, valor_total, data_prevista, status, codigo_rastreio, transportadora })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar pedido' }); }
});

router.delete('/pedidos/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('log_pedidos').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover pedido' }); }
});

// ── RECEBIMENTOS ───────────────────────────────────────────
router.post('/pedidos/:id/recebimento', async (req, res) => {
  try {
    const { observacoes, status } = req.body;
    const { data, error } = await supabase.from('log_recebimentos')
      .insert({ pedido_id: req.params.id, recebido_por: req.user.userId, observacoes: observacoes || null, status: status || 'ok' })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    // Atualizar status do pedido
    await supabase.from('log_pedidos').update({ status: 'recebido' }).eq('id', req.params.id);
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar recebimento' }); }
});

module.exports = router;
