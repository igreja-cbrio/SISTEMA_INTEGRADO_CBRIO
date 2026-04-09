const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

// ── Cache em memória para shipments ──────────────────────
const CACHE_TTL = 300_000; // 5 minutos em ms
let shipmentsCache = { data: null, timestamp: 0 };

router.use(authenticate, authorize('admin', 'diretor'));

// ── Helpers ───────────────────────────────────────────────
async function getMLConfig() {
  const { data } = await supabase
    .from('ml_config')
    .select('*')
    .limit(1)
    .maybeSingle();
  return data;
}

async function refreshToken(config) {
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token,
    }),
  });
  if (!res.ok) throw new Error('Falha ao renovar token do ML');
  const tokens = await res.json();
  await supabase.from('ml_config').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq('id', config.id);
  return tokens.access_token;
}

async function mlFetch(config, path) {
  let token = config.access_token;
  if (config.token_expires_at && new Date(config.token_expires_at) < new Date()) {
    token = await refreshToken(config);
  }
  let res = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    token = await refreshToken(config);
    res = await fetch(`https://api.mercadolibre.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  const json = await res.json();
  if (!res.ok) {
    console.error(`[ML] API error ${res.status} on ${path}:`, JSON.stringify(json));
    throw new Error(json.message || json.error || `ML API ${res.status}`);
  }
  return json;
}

// ── STATUS ────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const config = await getMLConfig();
    if (!config || !config.access_token) {
      return res.json({ connected: false });
    }
    try {
      const user = await mlFetch(config, '/users/me');
      // Auto-fix ml_user_id if missing
      if (user.id && (!config.ml_user_id || config.ml_user_id !== String(user.id))) {
        console.log('[ML] Atualizando ml_user_id:', user.id);
        await supabase.from('ml_config').update({ ml_user_id: String(user.id) }).eq('id', config.id);
      }
      return res.json({
        connected: true,
        nickname: user.nickname || user.first_name,
        user_id: user.id,
      });
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
        client_id, client_secret, access_token: null, refresh_token: null, token_expires_at: null,
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
      return res.status(400).json({ error: err.message || 'Falha na autorização do ML' });
    }

    const tokens = await tokenRes.json();
    await supabase.from('ml_config').update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      ml_user_id: tokens.user_id?.toString() || null,
    }).eq('id', config.id);

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
      await supabase.from('ml_config').update({
        access_token: null, refresh_token: null, token_expires_at: null, ml_user_id: null,
      }).eq('id', config.id);
    }
    shipmentsCache = { data: null, timestamp: 0 };
    res.json({ success: true });
  } catch (e) {
    console.error('[ML] Disconnect error:', e.message);
    res.status(500).json({ error: 'Erro ao desconectar ML' });
  }
});

// ── ORDERS ────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
  try {
    const config = await getMLConfig();
    if (!config?.access_token) return res.status(400).json({ error: 'ML não conectado' });
    if (!config.ml_user_id) return res.status(400).json({ error: 'ml_user_id não configurado. Reconecte o ML.' });

    const { offset = 0, limit = 20, status, q } = req.query;

    // Try buyer first
    let path = `/orders/search?buyer=${config.ml_user_id}&offset=${offset}&limit=${limit}&sort=date_desc`;
    if (status) path += `&order.status=${status}`;
    if (q) path += `&q=${encodeURIComponent(q)}`;

    console.log('[ML] Orders search path:', path);
    let data;
    try {
      data = await mlFetch(config, path);
    } catch (e) {
      console.error('[ML] Buyer search failed:', e.message);
      data = { results: [] };
    }

    // Fallback: try as seller if buyer returned empty
    if (!data.results || data.results.length === 0) {
      console.log('[ML] Buyer vazio, tentando como seller...');
      let sellerPath = `/orders/search?seller=${config.ml_user_id}&offset=${offset}&limit=${limit}&sort=date_desc`;
      if (status) sellerPath += `&order.status=${status}`;
      if (q) sellerPath += `&q=${encodeURIComponent(q)}`;
      try {
        data = await mlFetch(config, sellerPath);
        console.log('[ML] Seller results:', data.results?.length || 0);
      } catch (e2) {
        console.error('[ML] Seller search also failed:', e2.message);
      }
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

    // Fetch recent orders to extract shipment info
    const ordersData = await mlFetch(config, `/orders/search?buyer=${config.ml_user_id}&offset=0&limit=50&sort=date_desc`);
    const orders = ordersData.results || [];

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

    shipmentsCache = { data: shipments, timestamp: Date.now() };
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
