// Cliente HTTP base para Santander Open APIs
// Responsabilidades: mTLS, OAuth token, retries leves, logging de erro
const https = require('https');
const { supabase } = require('../../utils/supabase');

const AMBIENTE = (process.env.SANTANDER_AMBIENTE || 'homologacao').toLowerCase();
const IS_PROD = AMBIENTE === 'producao';

const BASE_URL = IS_PROD
  ? 'https://trust-open.api.santander.com.br'
  : 'https://trust-open-h.api.santander.com.br';

const OAUTH_PATH = '/auth/oauth/v2/token';

// Bank ID para Santander (codigo compe). Pode ser sobrescrito por env.
const BANK_ID = process.env.SANTANDER_BANK_ID || '90400888000142';

// Conta da CBRio (env)
const AGENCIA = process.env.SANTANDER_AGENCIA || '';
const CONTA = process.env.SANTANDER_CONTA || '';
const CNPJ_TITULAR = process.env.SANTANDER_CNPJ_TITULAR || '07023068000135';

// Credenciais OAuth (env)
const CLIENT_ID = process.env.SANTANDER_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SANTANDER_CLIENT_SECRET || '';
const APPLICATION_KEY = process.env.SANTANDER_APPLICATION_KEY || '';

// Cert mTLS (base64 nas envs)
const CERT_B64 = process.env.SANTANDER_CERT_PEM_BASE64 || '';
const KEY_B64 = process.env.SANTANDER_KEY_PEM_BASE64 || '';

let httpsAgentCache = null;

function buildHttpsAgent() {
  if (httpsAgentCache) return httpsAgentCache;
  if (!CERT_B64 || !KEY_B64) {
    throw new Error('Santander mTLS nao configurado: defina SANTANDER_CERT_PEM_BASE64 e SANTANDER_KEY_PEM_BASE64');
  }
  httpsAgentCache = new https.Agent({
    cert: Buffer.from(CERT_B64, 'base64'),
    key: Buffer.from(KEY_B64, 'base64'),
    keepAlive: true,
    maxSockets: 10,
  });
  return httpsAgentCache;
}

// ── Token cache (memory + DB fallback) ─────────────────────────────────────
let tokenMemoryCache = null; // { access_token, expires_at }

async function loadTokenFromDb() {
  if (!supabase) return null;
  const { data } = await supabase
    .from('santander_oauth_tokens')
    .select('*')
    .eq('ambiente', AMBIENTE)
    .single();
  if (!data) return null;
  return data;
}

async function saveTokenToDb(token) {
  if (!supabase) return;
  await supabase
    .from('santander_oauth_tokens')
    .upsert({
      ambiente: AMBIENTE,
      access_token: token.access_token,
      token_type: token.token_type || 'Bearer',
      expires_at: token.expires_at,
      obtained_at: new Date().toISOString(),
    }, { onConflict: 'ambiente' });
}

function tokenIsValid(token) {
  if (!token || !token.access_token || !token.expires_at) return false;
  // Margem de 60s pra evitar usar token expirando
  return new Date(token.expires_at).getTime() > Date.now() + 60000;
}

async function fetchNewToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Santander OAuth nao configurado: defina SANTANDER_CLIENT_ID e SANTANDER_CLIENT_SECRET');
  }

  const agent = buildHttpsAgent();
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
  }).toString();

  const url = `${BASE_URL}${OAUTH_PATH}`;
  const start = Date.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    // @ts-ignore - undici aceita agent via dispatcher; em runtime Node se mantem
    agent,
  });

  const duration = Date.now() - start;
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch (_) { /* corpo nao-JSON */ }

  if (!res.ok) {
    await logCall({
      endpoint: OAUTH_PATH,
      method: 'POST',
      status_code: res.status,
      duration_ms: duration,
      error_message: text?.slice(0, 500),
    });
    throw new Error(`Santander OAuth falhou (${res.status}): ${text?.slice(0, 200)}`);
  }

  // Resposta padrao: { access_token, token_type, expires_in (segundos) }
  const expiresIn = Number(json.expires_in || 900);
  const token = {
    access_token: json.access_token,
    token_type: json.token_type || 'Bearer',
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
  tokenMemoryCache = token;
  await saveTokenToDb(token);
  await logCall({
    endpoint: OAUTH_PATH,
    method: 'POST',
    status_code: 200,
    duration_ms: duration,
  });
  return token;
}

async function getAccessToken() {
  if (tokenIsValid(tokenMemoryCache)) return tokenMemoryCache.access_token;
  const fromDb = await loadTokenFromDb();
  if (tokenIsValid(fromDb)) {
    tokenMemoryCache = fromDb;
    return fromDb.access_token;
  }
  const fresh = await fetchNewToken();
  return fresh.access_token;
}

// ── Generic call ───────────────────────────────────────────────────────────
async function logCall({ endpoint, method, status_code, duration_ms, trace_id, error_message, request_summary, user_id }) {
  if (!supabase) return;
  try {
    await supabase.from('santander_sync_log').insert({
      endpoint, method, status_code, duration_ms, trace_id, error_message, request_summary, user_id,
    });
  } catch (_) { /* nao quebra a request por causa do log */ }
}

async function callApi(path, { method = 'GET', query, body, retries = 1, userId = null } = {}) {
  const agent = buildHttpsAgent();
  const token = await getAccessToken();

  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }

  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Application-Key': APPLICATION_KEY,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const start = Date.now();
  let res;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // @ts-ignore
      agent,
    });
  } catch (err) {
    await logCall({ endpoint: path, method, error_message: err.message, user_id: userId });
    throw err;
  }
  const duration = Date.now() - start;
  const traceId = res.headers.get('x-traceid') || res.headers.get('x-trace-id');

  // 401 = token expirou no servidor antes da margem · tenta 1 refresh
  if (res.status === 401 && retries > 0) {
    tokenMemoryCache = null;
    return callApi(path, { method, query, body, retries: retries - 1, userId });
  }

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text }; }

  await logCall({
    endpoint: path,
    method,
    status_code: res.status,
    duration_ms: duration,
    trace_id: traceId,
    error_message: res.ok ? null : (text || '').slice(0, 500),
    request_summary: query ? { query } : null,
    user_id: userId,
  });

  if (!res.ok) {
    const err = new Error(`Santander API ${method} ${path} -> ${res.status}`);
    err.status = res.status;
    err.traceId = traceId;
    err.body = json;
    throw err;
  }
  return json;
}

// Download binario de URL externa (link assinado da Azure pelo Santander)
async function downloadBinary(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Falha ao baixar arquivo: ${res.status} ${txt.slice(0, 200)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  AMBIENTE,
  BASE_URL,
  BANK_ID,
  AGENCIA,
  CONTA,
  CNPJ_TITULAR,
  APPLICATION_KEY,
  callApi,
  downloadBinary,
  getAccessToken,
  logCall,
  // helpers de diagnostico
  isConfigured: () => Boolean(CLIENT_ID && CLIENT_SECRET && APPLICATION_KEY && CERT_B64 && KEY_B64 && AGENCIA && CONTA),
  missingEnv: () => {
    const miss = [];
    if (!CLIENT_ID) miss.push('SANTANDER_CLIENT_ID');
    if (!CLIENT_SECRET) miss.push('SANTANDER_CLIENT_SECRET');
    if (!APPLICATION_KEY) miss.push('SANTANDER_APPLICATION_KEY');
    if (!CERT_B64) miss.push('SANTANDER_CERT_PEM_BASE64');
    if (!KEY_B64) miss.push('SANTANDER_KEY_PEM_BASE64');
    if (!AGENCIA) miss.push('SANTANDER_AGENCIA');
    if (!CONTA) miss.push('SANTANDER_CONTA');
    return miss;
  },
};
