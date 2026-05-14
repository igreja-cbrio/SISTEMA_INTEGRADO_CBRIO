// ============================================================================
// YouTube Collector · sincroniza canal CBRio (inscritos, playlists, videos)
// para tabelas online_canal_snapshot, online_series, online_videos.
//
// Quota da API YouTube v3:
//   channels.list      = 1 unidade
//   playlists.list     = 1 unidade × paginas
//   playlistItems.list = 1 unidade × paginas
//   videos.list        = 1 unidade × chunks (50 ids cada)
//
// Execucao tipica de canal com 500 videos e 20 series: ~40 unidades/dia.
// Free tier = 10000 unidades/dia.
// ============================================================================

const { supabase } = require('../utils/supabase');

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function getEnv() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY nao configurada');
  if (!channelId) throw new Error('YOUTUBE_CHANNEL_ID nao configurada');
  return { apiKey, channelId };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Converte duration ISO 8601 (PT1H23M45S) -> segundos
function parseDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
}

// ---------------------------------------------------------------------------
// channels.list · stats do canal
// ---------------------------------------------------------------------------
async function fetchChannel(apiKey, channelId) {
  const url = `${YT_BASE}/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`;
  const data = await fetchJson(url);
  const item = (data.items || [])[0];
  if (!item) throw new Error(`Canal ${channelId} nao encontrado`);
  const snip = item.snippet || {};
  const stats = item.statistics || {};
  return {
    channel_id: item.id,
    channel_title: snip.title,
    channel_thumbnail: snip.thumbnails?.high?.url || snip.thumbnails?.default?.url || null,
    subscriber_count: parseInt(stats.subscriberCount, 10) || 0,
    view_count: parseInt(stats.viewCount, 10) || 0,
    video_count: parseInt(stats.videoCount, 10) || 0,
  };
}

// ---------------------------------------------------------------------------
// playlists.list · todas as playlists do canal (paginado)
// ---------------------------------------------------------------------------
async function fetchPlaylists(apiKey, channelId) {
  const all = [];
  let pageToken = '';
  do {
    const url = `${YT_BASE}/playlists?part=snippet,contentDetails&channelId=${channelId}&maxResults=50&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const data = await fetchJson(url);
    for (const p of data.items || []) {
      const snip = p.snippet || {};
      all.push({
        playlist_id: p.id,
        titulo: snip.title || '(sem titulo)',
        descricao: snip.description || null,
        thumbnail_url: snip.thumbnails?.high?.url || snip.thumbnails?.medium?.url || null,
        total_videos: p.contentDetails?.itemCount || 0,
        publicada_em: snip.publishedAt || null,
      });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
}

// ---------------------------------------------------------------------------
// playlistItems.list · todos os videos de uma playlist
// ---------------------------------------------------------------------------
async function fetchPlaylistItems(apiKey, playlistId) {
  const ids = [];
  let pageToken = '';
  do {
    const url = `${YT_BASE}/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=50&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const data = await fetchJson(url);
    for (const it of data.items || []) {
      const vid = it.contentDetails?.videoId;
      if (vid) ids.push(vid);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return ids;
}

// ---------------------------------------------------------------------------
// videos.list · pega snippet+statistics+contentDetails em chunks de 50
// ---------------------------------------------------------------------------
async function fetchVideos(apiKey, videoIds) {
  const result = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = `${YT_BASE}/videos?part=snippet,statistics,contentDetails&id=${chunk.join(',')}&key=${apiKey}`;
    const data = await fetchJson(url);
    for (const v of data.items || []) {
      const snip = v.snippet || {};
      const stats = v.statistics || {};
      const cd = v.contentDetails || {};
      const views = parseInt(stats.viewCount, 10) || 0;
      const likes = parseInt(stats.likeCount, 10) || 0;
      const seconds = parseDuration(cd.duration);
      result.push({
        video_id: v.id,
        titulo: snip.title,
        descricao: snip.description || null,
        thumbnail_url: snip.thumbnails?.maxres?.url || snip.thumbnails?.high?.url || null,
        duration_iso: cd.duration || null,
        duration_seconds: seconds,
        publicado_em: snip.publishedAt,
        view_count: views,
        like_count: likes,
        comment_count: parseInt(stats.commentCount, 10) || 0,
        taxa_engajamento: views > 0 ? Math.round((likes / views) * 10000) / 100 : null,
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// syncCanal · orquestra tudo, upsert nas tabelas
// ---------------------------------------------------------------------------
async function syncCanal() {
  const { apiKey, channelId } = getEnv();
  const inicio = Date.now();
  const log = { etapas: {}, erros: [] };

  // 1. Stats do canal -> snapshot do dia
  const canal = await fetchChannel(apiKey, channelId);
  log.etapas.canal = canal;
  const hoje = new Date().toISOString().slice(0, 10);
  const { error: snapErr } = await supabase.from('online_canal_snapshot').upsert({
    data: hoje,
    ...canal,
    collected_at: new Date().toISOString(),
  }, { onConflict: 'data' });
  if (snapErr) log.erros.push({ etapa: 'snapshot', msg: snapErr.message });

  // 2. Playlists -> series
  const playlists = await fetchPlaylists(apiKey, channelId);
  log.etapas.playlists_qtd = playlists.length;
  const seriesByPlaylistId = new Map();
  for (const p of playlists) {
    const { data, error } = await supabase.from('online_series').upsert({
      ...p,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'playlist_id' }).select('id, playlist_id').single();
    if (error) {
      log.erros.push({ etapa: 'series', playlist_id: p.playlist_id, msg: error.message });
    } else if (data) {
      seriesByPlaylistId.set(data.playlist_id, data.id);
    }
  }

  // 3. Pra cada playlist, pega video ids e mapeia video -> serie
  const videoToSerie = new Map(); // video_id -> serie_id (uuid)
  for (const p of playlists) {
    const serieId = seriesByPlaylistId.get(p.playlist_id);
    if (!serieId) continue;
    const ids = await fetchPlaylistItems(apiKey, p.playlist_id);
    for (const vid of ids) {
      if (!videoToSerie.has(vid)) videoToSerie.set(vid, serieId);
    }
  }
  log.etapas.videos_em_playlists = videoToSerie.size;

  // 4. Pega stats dos videos
  const videoIds = Array.from(videoToSerie.keys());
  const videos = videoIds.length > 0 ? await fetchVideos(apiKey, videoIds) : [];
  log.etapas.videos_processados = videos.length;

  // 5. Upsert videos com serie_id e tenta linkar culto_id por youtube_video_id
  if (videos.length > 0) {
    // Mapeia youtube_video_id -> culto_id (uma query so)
    const { data: cultosLinks } = await supabase
      .from('cultos')
      .select('id, youtube_video_id')
      .in('youtube_video_id', videos.map(v => v.video_id));
    const cultoByVideo = new Map();
    for (const c of cultosLinks || []) {
      if (c.youtube_video_id) cultoByVideo.set(c.youtube_video_id, c.id);
    }

    const upserts = videos.map(v => ({
      ...v,
      serie_id: videoToSerie.get(v.video_id) || null,
      culto_id: cultoByVideo.get(v.video_id) || null,
      updated_at: new Date().toISOString(),
    }));

    // Upsert em chunks de 200 pra nao estourar payload
    for (let i = 0; i < upserts.length; i += 200) {
      const chunk = upserts.slice(i, i + 200);
      const { error } = await supabase.from('online_videos').upsert(chunk, { onConflict: 'video_id' });
      if (error) log.erros.push({ etapa: 'videos', chunk: i, msg: error.message });
    }
  }

  log.duracao_ms = Date.now() - inicio;
  return log;
}

module.exports = { syncCanal };
