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

    // ── Buscar dados do Mercado Livre (contagem de envios em trânsito + total de compras no mês) ──
    let mlEmTransito = 0;
    let mlComprasMes = 0;
    try {
      const { data: mlConfig } = await supabase.from('ml_config').select('*').limit(1).maybeSingle();
      if (mlConfig?.access_token && mlConfig?.ml_user_id) {
        // Verificar expiração do token
        let token = mlConfig.access_token;
        if (mlConfig.token_expires_at && new Date(mlConfig.token_expires_at) < new Date()) {
          const refreshRes = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grant_type: 'refresh_token',
              client_id: mlConfig.client_id,
              client_secret: mlConfig.client_secret,
              refresh_token: mlConfig.refresh_token,
            }),
          });
          if (refreshRes.ok) {
            const tokens = await refreshRes.json();
            token = tokens.access_token;
            await supabase.from('ml_config').update({
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            }).eq('id', mlConfig.id);
          }
        }

        // Buscar pedidos do mês atual (como buyer)
        const now = new Date();
        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const ordersRes = await fetch(
          `https://api.mercadolibre.com/orders/search?buyer=${mlConfig.ml_user_id}&order.date_created.from=${startMonth}&limit=50&sort=date_desc`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (ordersRes.ok) {
          const ordersData = await ordersRes.json();
          const orders = ordersData.results || [];
          mlComprasMes = orders
            .filter(o => o.status !== 'cancelled')
            .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

          // Contar envios em trânsito
          for (const order of orders.slice(0, 20)) {
            if (!order.shipping?.id) continue;
            try {
              const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (shipRes.ok) {
                const ship = await shipRes.json();
                if (['shipped', 'handling', 'ready_to_ship'].includes(ship.status)) mlEmTransito++;
              }
            } catch { /* ignora envio específico com erro */ }
          }
        }
      }
    } catch (mlErr) {
      console.warn('[LOG] ML dashboard fetch falhou:', mlErr.message);
    }

    res.json({
      fornecedoresAtivos: forn.filter(f => f.ativo).length,
      solicitacoesPendentes: solic.filter(s => s.status === 'pendente').length,
      solicitacoesAprovadas: solic.filter(s => s.status === 'aprovado').length,
      pedidosAguardando: ped.filter(p => p.status === 'aguardando').length,
      pedidosEmTransito: ped.filter(p => p.status === 'em_transito').length + mlEmTransito,
      pedidosRecebidos: ped.filter(p => p.status === 'recebido').length,
      valorTotalPedidos: ped.filter(p => p.status !== 'cancelado').reduce((s, p) => s + Number(p.valor_total), 0),
      mlComprasMes,
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
    await supabase.from('log_pedidos').update({ status: 'recebido' }).eq('id', req.params.id);
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar recebimento' }); }
});

// ── NOTAS FISCAIS ─────────────────────────────────────────
router.get('/notas', async (req, res) => {
  try {
    const { data, error } = await supabase.from('log_notas_fiscais')
      .select('*, log_fornecedores(razao_social, nome_fantasia)')
      .order('data_emissao', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar notas fiscais' }); }
});

router.post('/notas', async (req, res) => {
  try {
    const { numero, serie, fornecedor_id, pedido_id, valor, data_emissao, chave_acesso, tipo, observacoes } = req.body;
    if (!numero) return res.status(400).json({ error: 'Número da nota é obrigatório' });
    const { data, error } = await supabase.from('log_notas_fiscais')
      .insert({ numero, serie: serie || null, fornecedor_id: fornecedor_id || null, pedido_id: pedido_id || null, valor: valor || null, data_emissao: data_emissao || new Date().toISOString(), chave_acesso: chave_acesso || null, tipo: tipo || 'entrada', observacoes: observacoes || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar nota fiscal' }); }
});

router.delete('/notas/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('log_notas_fiscais').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover nota fiscal' }); }
});

// ── ITENS DE PEDIDO ───────────────────────────────────────
router.get('/pedidos/:id/itens', async (req, res) => {
  try {
    const { data, error } = await supabase.from('log_pedido_itens')
      .select('*')
      .eq('pedido_id', req.params.id)
      .order('created_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar itens do pedido' }); }
});

router.post('/pedidos/:id/itens', async (req, res) => {
  try {
    const { descricao, quantidade, unidade, valor_unitario } = req.body;
    if (!descricao || !quantidade) return res.status(400).json({ error: 'Descrição e quantidade são obrigatórios' });
    const { data, error } = await supabase.from('log_pedido_itens')
      .insert({ pedido_id: req.params.id, descricao, quantidade, unidade: unidade || 'un', valor_unitario: valor_unitario || 0 })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao adicionar item ao pedido' }); }
});

router.delete('/itens/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('log_pedido_itens').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover item' }); }
});

// ── MOVIMENTAÇÕES ─────────────────────────────────────────
router.get('/movimentacoes', async (req, res) => {
  try {
    const { tipo } = req.query;
    let query = supabase.from('log_movimentacoes')
      .select('*, profiles!responsavel_id(name)')
      .order('data_movimentacao', { ascending: false });
    if (tipo) query = query.eq('tipo', tipo);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar movimentações' }); }
});

router.post('/movimentacoes', async (req, res) => {
  try {
    const { codigo_item, descricao, tipo, quantidade, origem, destino, observacoes } = req.body;
    if (!descricao || !tipo || !quantidade) return res.status(400).json({ error: 'Descrição, tipo e quantidade são obrigatórios' });
    const { data, error } = await supabase.from('log_movimentacoes')
      .insert({ codigo_item: codigo_item || null, descricao, tipo, quantidade, origem: origem || null, destino: destino || null, observacoes: observacoes || null, responsavel_id: req.user.userId, data_movimentacao: new Date().toISOString() })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar movimentação' }); }
});

router.get('/movimentacoes/historico/:codigo', async (req, res) => {
  try {
    const { data, error } = await supabase.from('log_movimentacoes')
      .select('*')
      .eq('codigo_item', req.params.codigo)
      .order('data_movimentacao', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar histórico' }); }
});

module.exports = router;
