const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { getMLConfig, mlFetch, ensureUserId, searchOrders } = require('../services/mercadoLivreService');
const { extrairNotaFiscal, sugerirCategoria } = require('../services/nfScanner');
const { notificar } = require('../services/notificar');

router.use(authenticate, authorizeModule('logistica'));

// Upload do scan de nota fiscal (foto ou PDF)
const NF_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const uploadNf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (NF_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato não suportado. Envie JPG, PNG, WebP ou PDF.'));
  },
});

// ── Cache em memória do dashboard (30s TTL) ───────────────
const DASHBOARD_CACHE_TTL = 30 * 1000;
let dashboardCache = { data: null, timestamp: 0 };

// ── DASHBOARD ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    // Retorna cache se válido e não forçou refresh
    const forceRefresh = req.query.refresh === '1';
    if (!forceRefresh && dashboardCache.data && (Date.now() - dashboardCache.timestamp < DASHBOARD_CACHE_TTL)) {
      return res.json({ ...dashboardCache.data, _cached: true });
    }

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
    const mlDebug = { stage: 'start' };
    try {
      const mlConfig = await getMLConfig();
      mlDebug.hasConfig = !!mlConfig;
      mlDebug.hasToken = !!mlConfig?.access_token;
      mlDebug.hasUserIdSaved = !!mlConfig?.ml_user_id;

      if (mlConfig?.access_token) {
        // Resolver user_id (usa o salvo ou busca via /users/me — mesma lógica de ml.js)
        let userId = mlConfig.ml_user_id;
        if (!userId) {
          mlDebug.stage = 'ensure_user_id';
          try {
            const resolved = await ensureUserId(mlConfig);
            userId = resolved.userId;
            mlDebug.resolvedUserId = userId;
          } catch (e) {
            mlDebug.userIdError = e.message;
          }
        }

        if (userId) {
          mlDebug.stage = 'searching_orders';
          // Reutiliza searchOrders do service (já tem buyer→seller fallback + retry 401)
          const ordersData = await searchOrders(mlConfig, userId, { offset: 0, limit: 50 });
          const orders = ordersData.results || [];
          mlDebug.totalOrders = orders.length;

          // Filtrar pedidos do mês corrente
          const now = new Date();
          const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const ordersMes = orders.filter(o => {
            if (o.status === 'cancelled') return false;
            const created = new Date(o.date_created || o.last_updated);
            return created >= startMonth;
          });

          mlComprasMes = ordersMes.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
          mlDebug.ordersMes = ordersMes.length;
          mlDebug.valor = mlComprasMes;
          mlDebug.stage = 'fetching_shipments';
          console.log('[LOG] ML dashboard:', JSON.stringify(mlDebug));

          // Contar envios em trânsito dos pedidos do mês
          for (const order of ordersMes.slice(0, 20)) {
            if (!order.shipping?.id) continue;
            try {
              const ship = await mlFetch(mlConfig, `/shipments/${order.shipping.id}`);
              if (['shipped', 'handling', 'ready_to_ship'].includes(ship.status)) mlEmTransito++;
            } catch { /* ignora envio específico com erro */ }
          }
          mlDebug.emTransito = mlEmTransito;
          mlDebug.stage = 'done';
        }
      }
    } catch (mlErr) {
      mlDebug.error = mlErr.message;
      console.error('[LOG] ML dashboard erro:', mlErr.message, JSON.stringify(mlDebug));
    }

    const result = {
      fornecedoresAtivos: forn.filter(f => f.ativo).length,
      solicitacoesPendentes: solic.filter(s => s.status === 'pendente').length,
      solicitacoesAprovadas: solic.filter(s => s.status === 'aprovado').length,
      pedidosAguardando: ped.filter(p => p.status === 'aguardando').length,
      pedidosEmTransito: ped.filter(p => p.status === 'em_transito').length + mlEmTransito,
      pedidosRecebidos: ped.filter(p => p.status === 'recebido').length,
      valorTotalPedidos: ped.filter(p => p.status !== 'cancelado').reduce((s, p) => s + Number(p.valor_total), 0),
      mlComprasMes,
      _mlDebug: mlDebug,
      _lastUpdate: new Date().toISOString(),
    };

    dashboardCache = { data: result, timestamp: Date.now() };
    res.json(result);
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
const hoje = () => new Date().toISOString().slice(0, 10);

router.get('/notas', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('log_notas_fiscais')
      .select('*, log_fornecedores(razao_social, nome_fantasia)')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar notas fiscais' }); }
});

// Plano de contas (despesa) + centros de custo pro select da revisão da nota
router.get('/notas/aux/categorias', async (req, res) => {
  try {
    const [planos, centros] = await Promise.all([
      supabase.from('fin_plano_contas').select('id, codigo, nome')
        .eq('tipo', 'despesa').eq('ativo', true).eq('aceita_lancamento', true).order('codigo'),
      supabase.from('fin_centros_custo').select('id, codigo, nome')
        .eq('ativo', true).eq('aceita_lancamento', true).order('codigo'),
    ]);
    if (planos.error) return res.status(400).json({ error: planos.error.message });
    res.json({ planos: planos.data || [], centros: centros.data || [] });
  } catch (e) { res.status(500).json({ error: 'Erro ao listar categorias' }); }
});

// Escanear nota fiscal: upload (foto/PDF) → IA extrai → sugere categoria → cria a nota
router.post('/notas/escanear', uploadNf.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    // 1. Arquivo no Storage (bucket público log-arquivos, mesmo do upload manual)
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[req.file.mimetype] || 'bin';
    const path = `notas-fiscais/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const { error: upErr } = await supabase.storage.from('log-arquivos')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) return res.status(500).json({ error: `Erro ao salvar arquivo: ${upErr.message}` });
    const storagePath = supabase.storage.from('log-arquivos').getPublicUrl(path).data.publicUrl;

    // 2. Extração via IA (falha não derruba o fluxo · usuário completa na revisão)
    let extraido = null;
    let raw = null;
    try {
      ({ extraido, raw } = await extrairNotaFiscal(req.file.buffer, req.file.mimetype));
    } catch (e) {
      console.error('[LOG] NF extração falhou:', e.message);
    }

    // 3. Fornecedor por CNPJ + sugestão de categoria
    let fornecedorId = null;
    if (extraido?.emitente_cnpj) {
      const { data: forn } = await supabase.from('log_fornecedores')
        .select('id').eq('cnpj', extraido.emitente_cnpj).maybeSingle();
      fornecedorId = forn?.id || null;
    }
    let sugestao = null;
    if (extraido?.valor_total) {
      sugestao = await sugerirCategoria({
        cnpj: extraido.emitente_cnpj,
        nome: extraido.emitente_nome,
        valor: extraido.valor_total,
        descricao: extraido.descricao_resumo,
      });
    }

    // 4. Cria a nota já preenchida (write primário · status registrada = aguardando revisão)
    const { data: nota, error } = await supabase.from('log_notas_fiscais')
      .insert({
        numero: extraido?.numero || 'S/N',
        serie: extraido?.serie || null,
        fornecedor_id: fornecedorId,
        valor: extraido?.valor_total || null,
        data_emissao: extraido?.data_emissao || hoje(),
        chave_acesso: extraido?.chave_acesso || null,
        emitente_nome: extraido?.emitente_nome || null,
        emitente_cnpj: extraido?.emitente_cnpj || null,
        descricao: extraido?.descricao_resumo || null,
        forma_pagamento: extraido?.forma_pagamento || null,
        itens: extraido?.itens?.length ? extraido.itens : null,
        extracao_raw: raw,
        sugestao_plano_contas_id: sugestao?.plano_contas_id || null,
        sugestao_centro_custo_id: sugestao?.centro_custo_id || null,
        sugestao_origem: sugestao?.origem || null,
        sugestao_confianca: sugestao?.confianca || null,
        sugestao_explicacao: sugestao?.explicacao || null,
        storage_path: storagePath,
        origem: 'scan',
        status: 'registrada',
        created_by: req.user.userId,
      })
      .select('*, log_fornecedores(razao_social, nome_fantasia)').single();
    if (error) return res.status(400).json({ error: error.message });

    res.json({ nota, extracao_ok: !!extraido, sugestao });
  } catch (e) {
    console.error('[LOG] escanear nota:', e);
    res.status(500).json({ error: 'Erro ao escanear nota fiscal' });
  }
});

router.post('/notas', async (req, res) => {
  try {
    const { numero, serie, fornecedor_id, pedido_id, valor, data_emissao, chave_acesso, emitente_nome, emitente_cnpj, descricao, observacoes, storage_path } = req.body;
    if (!numero) return res.status(400).json({ error: 'Número da nota é obrigatório' });
    const { data, error } = await supabase.from('log_notas_fiscais')
      .insert({ numero, serie: serie || null, fornecedor_id: fornecedor_id || null, pedido_id: pedido_id || null, valor: valor || null, data_emissao: data_emissao || hoje(), chave_acesso: chave_acesso || null, emitente_nome: emitente_nome || null, emitente_cnpj: emitente_cnpj || null, descricao: descricao || null, observacoes: observacoes || null, storage_path: storage_path || null, origem: 'manual', status: 'registrada', created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar nota fiscal' }); }
});

// Edição (revisão dos dados extraídos) · bloqueada depois de lançada
router.put('/notas/:id', async (req, res) => {
  try {
    const { data: atual, error: errAtual } = await supabase.from('log_notas_fiscais')
      .select('id, status').eq('id', req.params.id).single();
    if (errAtual || !atual) return res.status(404).json({ error: 'Nota não encontrada' });
    if (atual.status === 'lancada') return res.status(400).json({ error: 'Nota já lançada no financeiro — não pode ser editada' });

    const permitidos = ['numero', 'serie', 'fornecedor_id', 'pedido_id', 'valor', 'data_emissao',
      'chave_acesso', 'emitente_nome', 'emitente_cnpj', 'descricao', 'observacoes', 'forma_pagamento',
      'itens', 'sugestao_plano_contas_id', 'sugestao_centro_custo_id', 'storage_path'];
    const update = {};
    for (const k of permitidos) if (req.body[k] !== undefined) update[k] = req.body[k] === '' ? null : req.body[k];
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada pra atualizar' });

    const { data, error } = await supabase.from('log_notas_fiscais')
      .update(update).eq('id', req.params.id)
      .select('*, log_fornecedores(razao_social, nome_fantasia)').single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar nota fiscal' }); }
});

// Enviar pro financeiro lançar (notifica a equipe do Yago)
router.post('/notas/:id/enviar-financeiro', async (req, res) => {
  try {
    const { data: nota, error: errNota } = await supabase.from('log_notas_fiscais')
      .select('*').eq('id', req.params.id).single();
    if (errNota || !nota) return res.status(404).json({ error: 'Nota não encontrada' });
    if (!['registrada', 'rejeitada'].includes(nota.status)) {
      return res.status(400).json({ error: `Nota com status "${nota.status}" não pode ser enviada` });
    }
    if (!nota.valor || Number(nota.valor) <= 0) {
      return res.status(400).json({ error: 'Informe o valor da nota antes de enviar pro financeiro' });
    }

    const { data, error } = await supabase.from('log_notas_fiscais')
      .update({
        status: 'enviada_financeiro',
        enviada_financeiro_em: new Date().toISOString(),
        enviada_financeiro_por: req.user.userId,
        rejeitada_motivo: null,
      })
      .eq('id', req.params.id)
      .select('*, log_fornecedores(razao_social, nome_fantasia)').single();
    if (error) return res.status(400).json({ error: error.message });

    // Best-effort · falha na notificação não desfaz o envio
    try {
      const valorFmt = Number(nota.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      await notificar({
        modulo: 'financeiro',
        tipo: 'nf_compra_recebida',
        titulo: 'Nota fiscal de compra pra lançar',
        mensagem: `${nota.emitente_nome || `NF ${nota.numero}`} · ${valorFmt} · enviada pela equipe de compras.`,
        link: '/admin/financeiro',
        severidade: 'info',
        chaveDedup: `nf_enviada_${nota.id}`,
      });
    } catch (e) { console.error('[LOG] notificar NF:', e.message); }

    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao enviar nota pro financeiro' }); }
});

router.delete('/notas/:id', async (req, res) => {
  try {
    const { data: nota } = await supabase.from('log_notas_fiscais')
      .select('id, status').eq('id', req.params.id).maybeSingle();
    if (nota?.status === 'lancada') {
      return res.status(400).json({ error: 'Nota já lançada no financeiro — não pode ser excluída' });
    }
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
