// Cliente HTTP base para Itau for Developers (BaaS / Open APIs)
// Responsabilidades: mTLS, OAuth client_credentials, refresh de token, logging.
//
// Espelha o padrao consolidado de services/santander/httpClient.js.
//
// IMPORTANTE: o fetch nativo do Node 18+ (undici) NAO aceita https.Agent.
// Precisa usar undici.Agent passado via opcao 'dispatcher'. Sem isso a request
// vai sem certificado cliente e o gateway do Itau rejeita o mTLS.
//
// Particularidades do Itau vs Santander:
//  - O token vale apenas 300s (5 min) · margem de refresh menor.
//  - As chamadas de API exigem o header `x-itau-apikey` (= client_id) alem
//    do Bearer, e um `x-itau-correlationID` por requisicao (rastreio).
//  - As URLs de OAuth e base mudam por ambiente · todas overridable por env
//    pra nao travar quando o Itau liberar homologacao com host proprio.
const { Agent, fetch: undiciFetch } = require('undici');
const crypto = require('crypto');
const { supabase } = require('../../utils/supabase');

const AMBIENTE = (process.env.ITAU_AMBIENTE || 'homologacao').toLowerCase();
const IS_PROD = AMBIENTE === 'producao';

// URLs · default de producao documentado no devportal.itau.com.br.
// Em homologacao o Itau costuma fornecer hosts proprios · setar via env.
const BASE_URL = process.env.ITAU_BASE_URL
  || (IS_PROD ? 'https://api.itau.com.br' : 'https://api.itau.com.br');

const TOKEN_URL = process.env.ITAU_TOKEN_URL
  || (IS_PROD
    ? 'https://sts.itau.com.br/api/oauth/token'
    : 'https://sts.itau.com.br/api/oauth/token');

// Conta da CBRio (env) · usadas pelos services de extrato/pagamento depois
const AGENCIA = process.env.ITAU_AGENCIA || '';
const CONTA = process.env.ITAU_CONTA || '';
const CNPJ_TITULAR = process.env.ITAU_CNPJ_TITULAR || '';

// Credenciais OAuth (env)
const CLIENT_ID = process.env.ITAU_CLIENT_ID || '';
const CLIENT_SECRET = process.env.ITAU_CLIENT_SECRET || '';

// Cert mTLS (PEM em base64 nas envs · mesma estrategia do Santander)
const CERT_B64 = process.env.ITAU_CERT_PEM_BASE64 || '';
const KEY_B64 = process.env.ITAU_KEY_PEM_BASE64 || '';

let httpsAgentCache = null;

function buildHttpsAgent() {
  if (httpsAgentCache) return httpsAgentCache;
  if (!CERT_B64 || !KEY_B64) {
    throw new Error('Itau mTLS nao configurado: defina ITAU_CERT_PEM_BASE64 e ITAU_KEY_PEM_BASE64');
  }
  // undici.Agent · usado via opcao 'dispatcher' do fetch (NAO 'agent')
  httpsAgentCache = new Agent({
    connect: {
      cert: Buffer.from(CERT_B64, 'base64'),
      key: Buffer.from(KEY_B64, 'base64'),
    },
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 300_000,
  });
  return httpsAgentCache;
}

// ── Token cache (memory + DB fallback) ─────────────────────────────────────
let tokenMemoryCache = null; // { access_token, expires_at }

async function loadTokenFromDb() {
  if (!supabase) return null;
  const { data } = await supabase
    .from('itau_oauth_tokens')
    .select('*')
    .eq('ambiente', AMBIENTE)
    .single();
  if (!data) return null;
  return data;
}

async function saveTokenToDb(token) {
  if (!supabase) return;
  await supabase
    .from('itau_oauth_tokens')
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
  // Token Itau vale 300s · margem de 30s pra nao usar token expirando
  return new Date(token.expires_at).getTime() > Date.now() + 30000;
}

async function fetchNewToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Itau OAuth nao configurado: defina ITAU_CLIENT_ID e ITAU_CLIENT_SECRET');
  }

  const agent = buildHttpsAgent();
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }).toString();

  const start = Date.now();
  const res = await undiciFetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body,
    dispatcher: agent,
  });

  const duration = Date.now() - start;
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch (_) { /* corpo nao-JSON */ }

  if (!res.ok) {
    await logCall({
      endpoint: '[oauth/token]',
      method: 'POST',
      status_code: res.status,
      duration_ms: duration,
      error_message: text?.slice(0, 500),
    });
    throw new Error(`Itau OAuth falhou (${res.status}): ${text?.slice(0, 200)}`);
  }

  // Resposta padrao OAuth2: { access_token, token_type, expires_in (segundos) }
  const expiresIn = Number(json.expires_in || 300);
  const token = {
    access_token: json.access_token,
    token_type: json.token_type || 'Bearer',
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
  tokenMemoryCache = token;
  await saveTokenToDb(token);
  await logCall({
    endpoint: '[oauth/token]',
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

// ── Log de chamadas ─────────────────────────────────────────────────────────
async function logCall({ endpoint, method, status_code, duration_ms, trace_id, error_message, request_summary, user_id }) {
  if (!supabase) return;
  try {
    await supabase.from('itau_sync_log').insert({
      endpoint, method, status_code, duration_ms, trace_id, error_message, request_summary, user_id,
    });
  } catch (_) { /* nao quebra a request por causa do log */ }
}

// ── Generic call ─────────────────────────────────────────────────────────────
async function callApi(path, { method = 'GET', query, body, headers: extraHeaders, retries = 1, userId = null } = {}) {
  const agent = buildHttpsAgent();
  const token = await getAccessToken();

  const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }

  const correlationId = crypto.randomUUID();
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    // Itau exige a apikey (client_id) e um correlation id por requisicao
    'x-itau-apikey': CLIENT_ID,
    'x-itau-correlationID': correlationId,
    ...(extraHeaders || {}),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const start = Date.now();
  let res;
  try {
    res = await undiciFetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      dispatcher: agent,
    });
  } catch (err) {
    await logCall({ endpoint: path, method, trace_id: correlationId, error_message: err.message, user_id: userId });
    throw err;
  }
  const duration = Date.now() - start;
  const traceId = res.headers.get('x-itau-correlationid') || correlationId;

  // 401 = token expirou no servidor antes da margem · tenta 1 refresh
  if (res.status === 401 && retries > 0) {
    tokenMemoryCache = null;
    return callApi(path, { method, query, body, headers: extraHeaders, retries: retries - 1, userId });
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
    // Itau retorna erro em formatos variados · cobre OAuth (error_description),
    // RFC7807 (title/detail) e o padrao com array `campos`/`erros`.
    let bodyMsg = '';
    if (json && typeof json === 'object') {
      const errorsArr = Array.isArray(json.erros) ? json.erros
        : Array.isArray(json.errors) ? json.errors
        : Array.isArray(json.campos) ? json.campos
        : [];
      const errorsDetailed = errorsArr.map((e) => {
        const code = e.codigo || e.code || '';
        const field = e.campo || e.field || '';
        const msg = e.mensagem || e.message || e.detail || '';
        return [code, field, msg].filter(Boolean).join(':');
      }).filter(Boolean).join(' | ');

      bodyMsg = errorsDetailed
        || json.detail
        || json.title
        || json.mensagem
        || json.message
        || json.error_description
        || JSON.stringify(json).slice(0, 400);
    }
    const err = new Error(
      `Itau API ${method} ${path} -> ${res.status}${bodyMsg ? ` · ${bodyMsg}` : ''}`
    );
    err.status = res.status;
    err.traceId = traceId;
    err.body = json;
    throw err;
  }
  return json;
}

// Download binario de URL externa (links assinados que o Itau possa retornar)
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
  TOKEN_URL,
  AGENCIA,
  CONTA,
  CNPJ_TITULAR,
  callApi,
  downloadBinary,
  getAccessToken,
  logCall,
  // helpers de diagnostico
  isConfigured: () => Boolean(CLIENT_ID && CLIENT_SECRET && CERT_B64 && KEY_B64),
  missingEnv: () => {
    const miss = [];
    if (!CLIENT_ID) miss.push('ITAU_CLIENT_ID');
    if (!CLIENT_SECRET) miss.push('ITAU_CLIENT_SECRET');
    if (!CERT_B64) miss.push('ITAU_CERT_PEM_BASE64');
    if (!KEY_B64) miss.push('ITAU_KEY_PEM_BASE64');
    return miss;
  },
};
