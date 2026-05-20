// ============================================================================
// YouTube Analytics + Data API helper
//
// Usa OAuth 2.0 (refresh_token persistido em online_oauth_tokens) pra acessar:
//   - YouTube Data API v3        · live concurrent viewers
//   - YouTube Analytics API v2   · views, watchTime por periodo
//
// Funcoes principais:
//   - getAuthUrl(state, redirectUri) -> URL de autorizacao
//   - exchangeCode(code, redirectUri) -> { tokens, channel }
//   - getValidAccessToken(channelId) -> access_token (refresh se preciso)
//   - fetchLiveConcurrentViewers(channelId, videoId) -> number | null
//   - findActiveBroadcast(channelId) -> { video_id, started_at, title }
//   - fetchVideoAnalytics(channelId, videoId, startDate, endDate) -> stats
//
// ENV necessarios:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
// ============================================================================

const { supabase } = require('../utils/supabase');

const OAUTH_BASE = 'https://accounts.google.com/o/oauth2';
const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DATA_API   = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS  = 'https://youtubeanalytics.googleapis.com/v2';

// Canal CBRio fixo · usado quando a conta OAuth NAO possui canal proprio mas
// tem permissao de Manager via YT Studio Permissions. Override via env
// YOUTUBE_CHANNEL_ID se um dia precisar.
const CBRIO_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCfjMVzaYlCS_VE3JuEJj2vQ';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

function getCreds() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET nao configurados');
  return { id, secret };
}

// ---------------------------------------------------------------------------
// AUTH FLOW
// ---------------------------------------------------------------------------

function getAuthUrl(state, redirectUri) {
  const { id } = getCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',     // recebe refresh_token
    prompt: 'consent',          // forca novo refresh_token mesmo em reautorizacao
    state,
  });
  return `${OAUTH_BASE}/v2/auth?${params}`;
}

async function exchangeCode(code, redirectUri) {
  const { id, secret } = getCreds();
  const body = new URLSearchParams({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OAuth exchange falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  // data: { access_token, refresh_token, expires_in, scope, token_type }

  // Tenta descobrir o canal OWNED pela conta autorizada (mine=true).
  // Se a conta nao possui canal proprio (ex: conta pessoal que so eh
  // Manager do canal CBRio via YT Studio Permissions), usamos o canal
  // CBRio fixo · Analytics API aceita `channel==<ID>` desde que o token
  // tenha permissao no canal.
  let channel = { id: CBRIO_CHANNEL_ID, title: 'CBRio (via permissoes)' };
  try {
    const ch = await fetch(`${DATA_API}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (ch.ok) {
      const chData = await ch.json();
      const item = (chData.items || [])[0];
      if (item) {
        // Se a conta autorizada owna O CANAL CBRIO, usa direto. Se owna
        // OUTRO canal (ex: pessoal), fallback pro CBRio fixo · evita
        // gravar token apontando pra canal errado.
        if (item.id === CBRIO_CHANNEL_ID) {
          channel = { id: item.id, title: item.snippet?.title || null };
        }
      }
    }
  } catch { /* silencioso · fica no fallback CBRIO_CHANNEL_ID */ }

  return { tokens: data, channel };
}

async function refreshAccessToken(refreshToken) {
  const { id, secret } = getCreds();
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Refresh token falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json(); // { access_token, expires_in, scope, token_type }
}

async function revoke(token) {
  const res = await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' });
  return res.ok;
}

// ---------------------------------------------------------------------------
// TOKEN STORAGE
// ---------------------------------------------------------------------------

async function saveTokens({ channel, tokens, userId }) {
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  const { error } = await supabase.from('online_oauth_tokens').upsert({
    channel_id: channel.id,
    channel_title: channel.title,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    scope: tokens.scope,
    connected_by: userId || null,
    connected_at: new Date().toISOString(),
    refreshed_at: new Date().toISOString(),
    revoked_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'channel_id' });
  if (error) throw error;
}

async function getValidAccessToken(channelId) {
  let q = supabase.from('online_oauth_tokens').select('*').is('revoked_at', null);
  if (channelId) q = q.eq('channel_id', channelId);
  else q = q.order('connected_at', { ascending: false }).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Sem canal conectado · conecte em /ministerial/online');

  const isExpired = !data.expires_at || new Date(data.expires_at) <= new Date(Date.now() + 60_000);
  if (!isExpired) return { token: data.access_token, channel_id: data.channel_id };

  // Refresh
  try {
    const refreshed = await refreshAccessToken(data.refresh_token);
    const expiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
    await supabase.from('online_oauth_tokens').update({
      access_token: refreshed.access_token,
      expires_at: expiresAt,
      refreshed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('channel_id', data.channel_id);
    return { token: refreshed.access_token, channel_id: data.channel_id };
  } catch (e) {
    // refresh_token revogado pelo dono ou invalidado
    await supabase.from('online_oauth_tokens').update({
      revoked_at: new Date().toISOString(),
      last_error: e.message,
      updated_at: new Date().toISOString(),
    }).eq('channel_id', data.channel_id);
    throw new Error('Token revogado · reconecte canal em /ministerial/online');
  }
}

async function disconnect(channelId) {
  const { data } = await supabase.from('online_oauth_tokens')
    .select('refresh_token').eq('channel_id', channelId).maybeSingle();
  if (data?.refresh_token) await revoke(data.refresh_token).catch(() => {});
  await supabase.from('online_oauth_tokens').update({
    revoked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('channel_id', channelId);
}

// ---------------------------------------------------------------------------
// QUERIES
// ---------------------------------------------------------------------------

// Acha live ATIVA do canal (eventType=live)
async function findActiveBroadcast(channelId) {
  const { token } = await getValidAccessToken(channelId);
  const url = `${DATA_API}/liveBroadcasts?part=id,snippet,status&broadcastStatus=active&broadcastType=all`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) return null;
  return {
    broadcast_id: item.id,
    video_id: item.id, // o ID do broadcast eh o video_id
    title: item.snippet?.title,
    started_at: item.snippet?.actualStartTime || item.snippet?.scheduledStartTime,
  };
}

// concurrentViewers via Data API videos.list (liveStreamingDetails)
async function fetchLiveConcurrentViewers(channelId, videoId) {
  const { token } = await getValidAccessToken(channelId);
  const url = `${DATA_API}/videos?part=liveStreamingDetails&id=${videoId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) return null;
  const viewers = item.liveStreamingDetails?.concurrentViewers;
  return viewers ? parseInt(viewers, 10) : null;
}

// Analytics: views por video em uma janela de data
// startDate/endDate em formato YYYY-MM-DD (timezone do canal aplicado pelo YT)
async function fetchVideoViews(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
    filters: `video==${videoId}`,
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics views falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  // data.rows = [[views, watchMinutes, avgDuration, avgViewPct]]
  const row = (data.rows || [])[0];
  if (!row) return { views: 0, watch_minutes: 0, avg_duration_seconds: 0, avg_view_percentage: 0 };
  return {
    views: row[0] || 0,
    watch_minutes: row[1] || 0,
    avg_duration_seconds: row[2] || 0,
    avg_view_percentage: row[3] || 0,
  };
}

// Analytics: subscribers gained/lost atribuidos a um video em uma janela.
// startDate/endDate em formato YYYY-MM-DD.
async function fetchVideoSubsChange(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'subscribersGained,subscribersLost',
    filters: `video==${videoId}`,
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics subs falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const row = (data.rows || [])[0];
  if (!row) return { gained: 0, lost: 0 };
  return { gained: row[0] || 0, lost: row[1] || 0 };
}

// Analytics: views/watchMinutes por fonte de trafego em uma janela.
// Retorna [{ fonte, views, watch_minutes }] · uma linha por insightTrafficSourceType.
async function fetchVideoTrafficSources(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched',
    dimensions: 'insightTrafficSourceType',
    filters: `video==${videoId}`,
    maxResults: '25',
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics trafego falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  // data.rows = [[fonte, views, watchMinutes], ...]
  return (data.rows || []).map(row => ({
    fonte: row[0] || 'UNKNOWN',
    views: row[1] || 0,
    watch_minutes: Math.round(row[2] || 0),
  }));
}

// Analytics: curva de retencao segundo-a-segundo.
// dimension `elapsedVideoTimeRatio` retorna ~100 linhas (0.00..1.00 em 0.01).
// metric `audienceWatchRatio` = % dos viewers ainda assistindo no ponto.
// Retorna [{ ratio_pct (0..100), audience_watch_ratio (0..1+) }, ...].
async function fetchVideoRetentionCurve(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'audienceWatchRatio',
    dimensions: 'elapsedVideoTimeRatio',
    filters: `video==${videoId}`,
    maxResults: '101',
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics retencao curva falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  // data.rows = [[ratio (0..1), audience_watch_ratio], ...]
  return (data.rows || []).map(row => ({
    ratio_pct: Math.round((row[0] || 0) * 100),
    audience_watch_ratio: Number((row[1] || 0).toFixed(4)),
  }));
}

// Analytics: views separadas por inscrito vs nao-inscrito.
// dimension `subscribedStatus` retorna 2 rows: SUBSCRIBED e UNSUBSCRIBED.
// Retorna { subscribed, unsubscribed }.
async function fetchVideoViewsBySubStatus(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'views',
    dimensions: 'subscribedStatus',
    filters: `video==${videoId}`,
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics subStatus falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  // data.rows = [['SUBSCRIBED', n], ['UNSUBSCRIBED', n]] (ordem nao garantida)
  const out = { subscribed: 0, unsubscribed: 0 };
  for (const row of (data.rows || [])) {
    if (row[0] === 'SUBSCRIBED') out.subscribed = row[1] || 0;
    else if (row[0] === 'UNSUBSCRIBED') out.unsubscribed = row[1] || 0;
  }
  return out;
}

// Lista canais que a conta OAuth atual gerencia. Util pra diagnosticar se
// o token autorizou a conta CERTA · `mine=true` retorna so canais que o
// usuario do token possui/gerencia. Se vier vazio ou canal errado, o
// problema dos zeros e' OAuth na conta errada.
async function listAuthorizedChannels() {
  const { token } = await getValidAccessToken();
  const url = `${DATA_API}/channels?part=id,snippet,statistics&mine=true&maxResults=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Channels mine falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.items || []).map(c => ({
    id: c.id,
    title: c.snippet?.title,
    subscriber_count: parseInt(c.statistics?.subscriberCount || '0', 10),
    video_count: parseInt(c.statistics?.videoCount || '0', 10),
  }));
}

// Faz UMA chamada Analytics e retorna a resposta CRUA · diagnostico.
// Se rows for null/[] e ok=true · 99% e' OAuth na conta errada.
async function debugAnalyticsCall(videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken();
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained',
    filters: `video==${videoId}`,
  });
  const url = `${ANALYTICS}/reports?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return {
    request: {
      channel_id_oauth: channel_id,
      url: url.replace(token, 'TOKEN_REDACTED'),
      startDate,
      endDate,
      filter: `video==${videoId}`,
    },
    response: {
      status: res.status,
      ok: res.ok,
      body,
    },
    interpretacao: !res.ok
      ? `ERRO HTTP ${res.status} · ${body?.error?.message || 'sem detalhe'}`
      : !body.rows || body.rows.length === 0
      ? 'ROWS VAZIO · conta OAuth provavelmente nao gerencia o canal dono deste video, OU video nao existe nessa data range'
      : 'OK · veio dado',
  };
}

module.exports = {
  SCOPES,
  getAuthUrl,
  exchangeCode,
  saveTokens,
  getValidAccessToken,
  disconnect,
  findActiveBroadcast,
  fetchLiveConcurrentViewers,
  fetchVideoViews,
  fetchVideoSubsChange,
  fetchVideoTrafficSources,
  fetchVideoRetentionCurve,
  fetchVideoViewsBySubStatus,
  listAuthorizedChannels,
  debugAnalyticsCall,
};
