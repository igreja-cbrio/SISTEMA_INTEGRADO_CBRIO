const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { getMLConfig, mlFetch, ensureUserId, searchOrders } = require('../services/mercadoLivreService');
const { separarNovos } = require('../utils/mlNotaFiscal');

// ── Cache em memória para shipments e orders ──────────────
const CACHE_TTL = 300_000; // 5 minutos em ms
let shipmentsCache = { data: null, timestamp: 0 };
const ordersCache = new Map(); // key: `${offset}-${limit}-${status||''}-${q||''}`, value: { data, timestamp }

router.use(authenticate, authorize('admin', 'diretor'));

// ── STATUS ────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const config = await getMLConfig();
    if (!config || !config.access_token) {
      return res.json({ connected: false });
    }
    try {
      const { userId, nickname } = await ensureUserId(config);
      return res.json({ connected: true, nickname, user_id: userId });
    } catch {
      return res.json({ connected: false, error: 'Token inválido' });
    }
  } catch (e) {
    console.error('[ML] Status error:', e.message);
    res.json({ connected: false });
  }
});

// ── CONFIG (save credentials + return auth URL) ───────────
router.post('/config', async (req, res) => {
  try {
    const { client_id, client_secret } = req.body;
    if (!client_id || !client_secret) {
      return res.status(400).json({ error: 'Client ID e Client Secret são obrigatórios' });
    }

    const existing = await getMLConfig();
    const redirect_uri = `${process.env.FRONTEND_URL || 'https://crmcbrio.vercel.app'}/admin/logistica?ml_callback=1`;

    if (existing) {
      await supabase.from('ml_config').update({
        client_id, client_secret, access_token: null, refresh_token: null, token_expires: null,
      }).eq('id', existing.id);
    } else {
      await supabase.from('ml_config').insert({ client_id, client_secret });
    }

    const auth_url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}`;
    res.json({ auth_url });
  } catch (e) {
    console.error('[ML] Config error:', e.message);
    res.status(500).json({ error: 'Erro ao configurar ML' });
  }
});

// ── AUTH CALLBACK (exchange code for token) ───────────────
router.post('/auth-callback', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código de autorização não fornecido' });

    const config = await getMLConfig();
    if (!config) return res.status(400).json({ error: 'Configuração ML não encontrada' });

    const redirect_uri = `${process.env.FRONTEND_URL || 'https://crmcbrio.vercel.app'}/admin/logistica?ml_callback=1`;

    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: config.client_id,
        client_secret: config.client_secret,
        code,
        redirect_uri,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      console.error('[ML] Auth callback token error:', JSON.stringify(err));
      return res.status(400).json({ error: err.message || 'Falha na autorização do ML' });
    }

    const tokens = await tokenRes.json();
    // ⚠️⚠️ A GRAVAÇÃO DECIDE A RESPOSTA — nunca `success: true` com o token
    // perdido. Até 19/08/2026 este bloco escrevia nas colunas `token_expires_at`
    // e `ml_user_id`, que NÃO EXISTEM em `ml_config` (as reais são
    // `token_expires` e `user_id`): o PostgREST recusava o UPDATE inteiro (42703),
    // o erro ia pro console e a rota respondia sucesso. Resultado: reconectar o
    // Mercado Livre pela tela dizia "conectado" e não gravava nada — a conexão
    // ficou morta de 08/04 a 19/08 sem ninguém conseguir consertar clicando.
    // ⚠️ E o refresh token do ML é de USO ÚNICO: cada tentativa queimava o token
    // guardado sem salvar o novo, então o estrago era cumulativo.
    const { error: dbErr } = await supabase.from('ml_config').update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      user_id: tokens.user_id?.toString() || null,
      connected: true,
    }).eq('id', config.id);

    if (dbErr) {
      console.error('[ML] Erro ao salvar auth tokens:', dbErr.message);
      return res.status(500).json({
        error: `Autorizamos no Mercado Livre, mas não foi possível salvar o token: ${dbErr.message}. Reconecte — o código de autorização já foi consumido.`,
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[ML] Auth callback error:', e.message);
    res.status(500).json({ error: 'Erro no callback de autorização' });
  }
});

// ── DISCONNECT ────────────────────────────────────────────
router.post('/disconnect', async (req, res) => {
  try {
    const config = await getMLConfig();
    if (config) {
      // Mesma lei do callback: se não limpou, não desconectou — dizer "success"
      // deixaria o token vivo com a tela afirmando que saiu.
      const { error: dbErr } = await supabase.from('ml_config').update({
        access_token: null, refresh_token: null, token_expires: null,
        user_id: null, connected: false,
      }).eq('id', config.id);
      if (dbErr) {
        console.error('[ML] Erro ao desconectar:', dbErr.message);
        return res.status(500).json({ error: `Não foi possível desconectar: ${dbErr.message}` });
      }
    }
    shipmentsCache = { data: null, timestamp: 0 };
    ordersCache.clear();
    res.json({ success: true });
  } catch (e) {
    console.error('[ML] Disconnect error:', e.message);
    res.status(500).json({ error: 'Erro ao desconectar ML' });
  }
});

// ── SYNC NOTAS · importa os PEDIDOS do ML como linhas de log_notas_fiscais ──
//
// ⚠️⚠️ Esta rota NUNCA EXISTIU no backend (conferido com `git log -S` em
// 19/08/2026): o botão "Importar do Mercado Livre" chamava `POST /ml/sync-notas`
// desde sempre e recebia 404 ("Endpoint de API não encontrado"). As 50 linhas de
// 02/04/2026 entraram por outro caminho.
//
// ⚠️ O que se importa é PEDIDO, não documento fiscal — ver a lei em
// utils/mlNotaFiscal.js. A NF-e com chave e XML vem do Arquivei.
router.post('/sync-notas', async (req, res) => {
  try {
    const config = await getMLConfig();
    if (!config?.access_token) {
      return res.status(400).json({ error: 'Mercado Livre não está conectado. Conecte na aba Compras ML.' });
    }

    const { userId } = await ensureUserId(config);

    // Pagina até o teto pra não travar a função serverless num acervo grande.
    const PAGINA = 50;
    const TETO = 300;
    const pedidos = [];
    for (let offset = 0; offset < TETO; offset += PAGINA) {
      const data = await searchOrders(config, userId, { offset, limit: PAGINA });
      const lote = data?.results || [];
      pedidos.push(...lote);
      if (lote.length < PAGINA) break;
    }

    if (!pedidos.length) {
      return res.json({ imported: 0, repetidos: 0, ignorados: 0, lidos: 0,
        aviso: 'O Mercado Livre não devolveu nenhum pedido para esta conta.' });
    }

    // ⚠️ Idempotência é obrigação daqui: a tabela não tem UNIQUE em ml_order_id.
    const ids = pedidos.map((o) => String(o?.id)).filter(Boolean);
    const existentes = new Set();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('log_notas_fiscais')
        .select('ml_order_id').in('ml_order_id', ids.slice(i, i + 200));
      // ⚠️ Falha de LEITURA não pode virar "não existe" — reimportaria tudo.
      if (error) throw new Error(`Não foi possível conferir o que já está importado: ${error.message}`);
      for (const r of data || []) if (r.ml_order_id) existentes.add(String(r.ml_order_id));
    }

    const { novas, repetidos, ignorados } = separarNovos(pedidos, existentes, {
      createdBy: req.user?.userId || null,
    });

    let imported = 0;
    for (let i = 0; i < novas.length; i += 100) {
      const bloco = novas.slice(i, i + 100);
      const { error } = await supabase.from('log_notas_fiscais').insert(bloco);
      if (error) throw error;
      imported += bloco.length; // grava o efeito DURANTE (lei de 04/08)
    }

    res.json({ imported, repetidos, ignorados, lidos: pedidos.length,
      truncado: pedidos.length >= TETO });
  } catch (e) {
    console.error('[ML] sync-notas:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao importar do Mercado Livre' });
  }
});

// ── ORDERS ────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
  try {
    const config = await getMLConfig();
    if (!config?.access_token) return res.status(400).json({ error: 'ML não conectado' });

    const { offset = 0, limit = 20, status, q, refresh } = req.query;
    const cacheKey = `${offset}-${limit}-${status || ''}-${q || ''}`;

    // Retorna cache se válido e não forçou refresh
    if (refresh !== '1') {
      const cached = ordersCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return res.json({ ...cached.data, _cached: true });
      }
    }

    // Resolve user_id automatically
    let userId = config.user_id;
    if (!userId) {
      try {
        const resolved = await ensureUserId(config);
        userId = resolved.userId;
      } catch (e) {
        console.error('[ML] Não foi possível resolver user_id:', e.message);
        return res.status(400).json({ error: 'Não foi possível identificar o usuário do ML. Reconecte.' });
      }
    }

    const data = await searchOrders(config, userId, { offset: Number(offset), limit: Number(limit), status, q });
    console.log('[ML] Orders response: results=%d, total=%d', data.results?.length || 0, data.paging?.total || 0);

    // Cache apenas respostas válidas
    if (data.results) {
      ordersCache.set(cacheKey, { data, timestamp: Date.now() });
    }
    res.json(data);
  } catch (e) {
    console.error('[ML] Orders error:', e.message);
    res.status(500).json({ error: 'Erro ao buscar pedidos ML' });
  }
});

// ── ORDER DETAIL ──────────────────────────────────────────
router.get('/orders/:id', async (req, res) => {
  try {
    const config = await getMLConfig();
    if (!config?.access_token) return res.status(400).json({ error: 'ML não conectado' });
    const data = await mlFetch(config, `/orders/${req.params.id}`);
    res.json(data);
  } catch (e) {
    console.error('[ML] Order detail error:', e.message);
    res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
});

// ── SHIPMENTS LIST (from recent orders) ───────────────────
router.get('/shipments', async (req, res) => {
  try {
    const config = await getMLConfig();
    if (!config?.access_token) return res.status(400).json({ error: 'ML não conectado' });

    // Retorna cache se válido e não forçou refresh
    const forceRefresh = req.query.refresh === '1';
    if (!forceRefresh && shipmentsCache.data && (Date.now() - shipmentsCache.timestamp < CACHE_TTL)) {
      return res.json(shipmentsCache.data);
    }

    // Resolve user_id automatically
    let userId = config.user_id;
    if (!userId) {
      try {
        const resolved = await ensureUserId(config);
        userId = resolved.userId;
      } catch (e) {
        console.error('[ML] Não foi possível resolver o user_id do ML para shipments:', e.message);
        return res.status(400).json({ error: 'Não foi possível identificar o usuário do ML.' });
      }
    }

    // Fetch recent orders
    const ordersData = await searchOrders(config, userId, { offset: 0, limit: 50 });
    const orders = ordersData.results || [];
    console.log('[ML] Shipments: processing %d orders', orders.length);

    const shipments = [];
    for (const order of orders) {
      if (!order.shipping?.id) continue;
      try {
        const ship = await mlFetch(config, `/shipments/${order.shipping.id}`);
        shipments.push({
          id: ship.id,
          order_id: order.id,
          status: ship.status,
          substatus: ship.substatus,
          tracking_number: ship.tracking_number,
          tracking_method: ship.tracking_method,
          date_created: ship.date_created,
          last_updated: ship.last_updated,
          receiver_address: ship.receiver_address,
          total_amount: order.total_amount,
          order_items: order.order_items,
        });
      } catch (e) {
        console.error(`[ML] Shipment ${order.shipping.id} error:`, e.message);
      }
    }

    // Only cache valid responses
    if (shipments.length > 0 || orders.length === 0) {
      shipmentsCache = { data: shipments, timestamp: Date.now() };
    }
    res.json(shipments);
  } catch (e) {
    console.error('[ML] Shipments list error:', e.message);
    res.status(500).json({ error: 'Erro ao buscar envios' });
  }
});

// ── SHIPMENT DETAIL ───────────────────────────────────────
router.get('/shipments/:id', async (req, res) => {
  try {
    const config = await getMLConfig();
    if (!config?.access_token) return res.status(400).json({ error: 'ML não conectado' });
    const data = await mlFetch(config, `/shipments/${req.params.id}`);
    res.json(data);
  } catch (e) {
    console.error('[ML] Shipment error:', e.message);
    res.status(500).json({ error: 'Erro ao buscar envio' });
  }
});

module.exports = router;
