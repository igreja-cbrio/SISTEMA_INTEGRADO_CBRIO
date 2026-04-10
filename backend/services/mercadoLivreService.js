// Mercado Livre service - shared between routes/ml.js and routes/logistica.js
const { supabase } = require('../utils/supabase');

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
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Falha ao renovar token do ML: ${res.status} ${errText}`);
  }
  const tokens = await res.json();
  const { error: dbErr } = await supabase.from('ml_config').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq('id', config.id);
  if (dbErr) console.error('[ML] Erro ao salvar tokens:', dbErr.message);
  config.access_token = tokens.access_token;
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

/**
 * Resolve ml_user_id: usa o valor salvo no banco ou busca via /users/me.
 * Persiste automaticamente quando ausente ou divergente.
 */
async function ensureUserId(config) {
  const user = await mlFetch(config, '/users/me');
  const userId = String(user.id);
  if (!config.ml_user_id || config.ml_user_id !== userId) {
    console.log('[ML] Persistindo ml_user_id:', userId);
    const { error: dbErr } = await supabase.from('ml_config').update({ ml_user_id: userId }).eq('id', config.id);
    if (dbErr) console.error('[ML] Erro ao salvar ml_user_id:', dbErr.message);
    config.ml_user_id = userId;
  }
  return { userId, nickname: user.nickname || user.first_name };
}

/**
 * Busca pedidos tentando buyer primeiro, depois seller.
 * Retorna o payload do ML (com results e paging).
 */
async function searchOrders(config, userId, { offset = 0, limit = 20, status, q } = {}) {
  const buildPath = (role) => {
    let path = `/orders/search?${role}=${userId}&offset=${offset}&limit=${limit}&sort=date_desc`;
    if (status) path += `&order.status=${status}`;
    if (q) path += `&q=${encodeURIComponent(q)}`;
    return path;
  };

  // Try buyer
  let data;
  try {
    data = await mlFetch(config, buildPath('buyer'));
    console.log('[ML] Buyer results:', data.results?.length || 0);
  } catch (e) {
    console.error('[ML] Buyer search failed:', e.message);
    data = { results: [] };
  }

  // Fallback to seller
  if (!data.results || data.results.length === 0) {
    console.log('[ML] Buyer vazio, tentando seller...');
    try {
      data = await mlFetch(config, buildPath('seller'));
      console.log('[ML] Seller results:', data.results?.length || 0);
    } catch (e2) {
      console.error('[ML] Seller search also failed:', e2.message);
      data = { results: [] };
    }
  }

  return data;
}

module.exports = { getMLConfig, refreshToken, mlFetch, ensureUserId, searchOrders };
