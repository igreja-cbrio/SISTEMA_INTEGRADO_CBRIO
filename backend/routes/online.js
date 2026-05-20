const router = require('express').Router();
const crypto = require('crypto');
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { syncCanal } = require('../services/youtubeCollector');
const yt = require('../services/youtubeAnalytics');
const collectors = require('../services/onlineCollectors');

const CRON_SECRET = process.env.CRON_SECRET;

// ── Cron · definido ANTES de router.use(authenticate) ──
async function autorizaCron(req, res, next) {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  if (!isVercelCron && auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

router.get('/cron/sync', autorizaCron, async (_req, res) => {
  try {
    const log = await syncCanal();
    res.json({ ok: true, log });
  } catch (e) {
    console.error('[online/cron/sync]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Coletores autonomos (Analytics API)
router.get('/cron/live-monitor', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.liveMonitor()); }
  catch (e) { console.error('[live-monitor]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/ds-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.dsCollector()); }
  catch (e) { console.error('[ds-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/ddus-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.ddusCollector()); }
  catch (e) { console.error('[ddus-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/subs-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.subsCollector()); }
  catch (e) { console.error('[subs-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/trafego-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.traficoCollector()); }
  catch (e) { console.error('[trafego-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/retencao-curva-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.retencaoCurvaCollector()); }
  catch (e) { console.error('[retencao-curva-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/sub-status-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.subStatusCollector()); }
  catch (e) { console.error('[sub-status-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/backfill-cultos', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.backfillCultoVideoIds()); }
  catch (e) { console.error('[backfill-cultos]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/catch-up', autorizaCron, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    res.json(await collectors.catchUpMetricas({ limit }));
  } catch (e) { console.error('[catch-up]', e.message); res.status(500).json({ error: e.message }); }
});

// ── OAuth callback eh publico (Google redireciona, sem nosso JWT) ──
// State carrega: userId + nonce assinado com CRON_SECRET pra anti-CSRF
function signState(payload) {
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', CRON_SECRET || 'dev').update(json).digest('hex').slice(0, 16);
  return Buffer.from(json).toString('base64url') + '.' + sig;
}
function verifyState(state) {
  try {
    const [b64, sig] = (state || '').split('.');
    if (!b64 || !sig) return null;
    const json = Buffer.from(b64, 'base64url').toString();
    const expected = crypto.createHmac('sha256', CRON_SECRET || 'dev').update(json).digest('hex').slice(0, 16);
    if (expected !== sig) return null;
    const payload = JSON.parse(json);
    if (Date.now() - (payload.ts || 0) > 10 * 60 * 1000) return null;
    return payload;
  } catch { return null; }
}

function getRedirectUri() {
  const base = process.env.FRONTEND_URL || `https://${process.env.VERCEL_URL}` || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/online/oauth/callback`;
}

router.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`/ministerial/online?oauth_error=${encodeURIComponent(String(error))}`);
  const payload = verifyState(String(state || ''));
  if (!payload) return res.redirect('/ministerial/online?oauth_error=state_invalido');
  try {
    const { tokens, channel } = await yt.exchangeCode(String(code), getRedirectUri());
    if (!tokens.refresh_token) {
      return res.redirect('/ministerial/online?oauth_error=sem_refresh_token');
    }
    await yt.saveTokens({ channel, tokens, userId: payload.userId });
    res.redirect(`/ministerial/online?oauth_ok=1&canal=${encodeURIComponent(channel.title || '')}`);
  } catch (e) {
    console.error('[oauth/callback]', e.message);
    res.redirect(`/ministerial/online?oauth_error=${encodeURIComponent(e.message.slice(0, 100))}`);
  }
});

// ── A partir daqui, exige auth ──
router.use(authenticate);

// Inicia fluxo OAuth (admin/diretor)
router.get('/oauth/authorize', authorize('admin', 'diretor'), (req, res) => {
  const state = signState({ userId: req.user?.id || null, ts: Date.now(), nonce: crypto.randomBytes(8).toString('hex') });
  res.json({ url: yt.getAuthUrl(state, getRedirectUri()) });
});

router.get('/oauth/status', async (_req, res) => {
  const { data } = await supabase.from('vw_online_oauth_status').select('*').limit(1).maybeSingle();
  res.json(data || { conectado: false });
});

router.post('/oauth/disconnect', authorize('admin', 'diretor'), async (_req, res) => {
  const { data } = await supabase.from('online_oauth_tokens').select('channel_id').is('revoked_at', null).maybeSingle();
  if (data?.channel_id) await yt.disconnect(data.channel_id);
  res.json({ ok: true });
});

// Execucao manual de coletor (admin/diretor)
router.post('/coletar/live', authorize('admin', 'diretor'), async (_req, res) => {
  try { res.json(await collectors.liveMonitor()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/ds', authorize('admin', 'diretor'), async (_req, res) => {
  try { res.json(await collectors.dsCollector()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/ddus', authorize('admin', 'diretor'), async (_req, res) => {
  try { res.json(await collectors.ddusCollector()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/subs', authorize('admin', 'diretor'), async (_req, res) => {
  try { res.json(await collectors.subsCollector()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/trafego', authorize('admin', 'diretor'), async (_req, res) => {
  try { res.json(await collectors.traficoCollector()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/retencao-curva', authorize('admin', 'diretor'), async (_req, res) => {
  try { res.json(await collectors.retencaoCurvaCollector()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/sub-status', authorize('admin', 'diretor'), async (_req, res) => {
  try { res.json(await collectors.subStatusCollector()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/backfill-cultos', authorize('admin', 'diretor'), async (_req, res) => {
  try { res.json(await collectors.backfillCultoVideoIds()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/catch-up', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    res.json(await collectors.catchUpMetricas({ limit }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// GET /api/online/dashboard
// ---------------------------------------------------------------------------
router.get('/dashboard', async (_req, res) => {
  try {
    // 1. Snapshot mais recente + comparativo de 30d atras
    const { data: snaps } = await supabase
      .from('online_canal_snapshot')
      .select('*')
      .order('data', { ascending: false })
      .limit(60);

    const atual = (snaps || [])[0] || null;
    const ha30 = (snaps || []).find(s => {
      const d = new Date(s.data);
      const limite = new Date();
      limite.setDate(limite.getDate() - 30);
      return d <= limite;
    }) || null;

    const delta = atual && ha30 ? {
      subscriber: atual.subscriber_count - ha30.subscriber_count,
      view: atual.view_count - ha30.view_count,
      video: atual.video_count - ha30.video_count,
    } : null;

    // 2. Videos do mes atual
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

    const { data: topViews } = await supabase
      .from('online_videos')
      .select('id, video_id, titulo, thumbnail_url, view_count, like_count, comment_count, taxa_engajamento, publicado_em, serie:online_series(id, titulo)')
      .gte('publicado_em', inicioMes)
      .order('view_count', { ascending: false })
      .limit(5);

    const { data: topEngajamento } = await supabase
      .from('online_videos')
      .select('id, video_id, titulo, thumbnail_url, view_count, like_count, comment_count, taxa_engajamento, publicado_em, serie:online_series(id, titulo)')
      .gte('publicado_em', inicioMes)
      .not('taxa_engajamento', 'is', null)
      .order('taxa_engajamento', { ascending: false })
      .limit(5);

    const { data: topAllTime } = await supabase
      .from('online_videos')
      .select('id, video_id, titulo, thumbnail_url, view_count, like_count, taxa_engajamento, publicado_em')
      .order('view_count', { ascending: false })
      .limit(5);

    // 3. Series
    const { data: series } = await supabase
      .from('vw_online_series_kpi')
      .select('*')
      .order('total_views', { ascending: false })
      .limit(12);

    // 4. Matriz Online · KPIs ativos com area='online' agrupados por valor
    const { data: kpisOnline } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, valores, area')
      .eq('ativo', true)
      .eq('area', 'online');

    const { data: trajs } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria, ultimo_valor, ultimo_periodo, checkpoint_meta, percentual_meta');
    const trajByKpi = {};
    (trajs || []).forEach(t => { trajByKpi[t.kpi_id] = t; });

    const matrizOnline = {};
    for (const k of kpisOnline || []) {
      for (const v of (Array.isArray(k.valores) ? k.valores : [])) {
        if (!matrizOnline[v]) matrizOnline[v] = [];
        matrizOnline[v].push({
          kpi_id: k.id,
          indicador: k.indicador,
          ...(trajByKpi[k.id] || {}),
        });
      }
    }

    res.json({
      canal: atual,
      delta,
      top_views_mes: topViews || [],
      top_engajamento_mes: topEngajamento || [],
      top_all_time: topAllTime || [],
      series: series || [],
      matriz_online: matrizOnline,
    });
  } catch (e) {
    console.error('[online/dashboard]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/online/series · lista completa com filtro de ordenacao
// ---------------------------------------------------------------------------
router.get('/series', async (req, res) => {
  try {
    const order = req.query.order || 'views';
    let q = supabase.from('vw_online_series_kpi').select('*');
    if (order === 'engajamento') q = q.order('taxa_engajamento_media', { ascending: false, nullsFirst: false });
    else if (order === 'recente') q = q.order('ultimo_video_em', { ascending: false, nullsFirst: false });
    else q = q.order('total_views', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/online/series/:id · detalhe + videos da serie
// ---------------------------------------------------------------------------
router.get('/series/:id', async (req, res) => {
  try {
    const { data: serie, error } = await supabase
      .from('vw_online_series_kpi')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!serie) return res.status(404).json({ error: 'Serie nao encontrada' });

    const { data: videos } = await supabase
      .from('online_videos')
      .select('id, video_id, titulo, thumbnail_url, view_count, like_count, comment_count, taxa_engajamento, duration_seconds, publicado_em, culto_id')
      .eq('serie_id', req.params.id)
      .order('publicado_em', { ascending: false });

    res.json({ serie, videos: videos || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/online/cultos-metricas · cultos com video_id + metricas YT completas
// (watch time, retencao, subs ganhos, inscritos/nao-inscritos, fontes de
// trafego e curva de retencao) · pra UI da pagina Online.
// ---------------------------------------------------------------------------
router.get('/cultos-metricas', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 24, 100);
    const { data: cultos, error } = await supabase
      .from('cultos')
      .select(`
        id, data, youtube_video_id,
        online_pico, online_ds, online_ddus,
        online_watch_minutes_ds, online_watch_minutes_ddus,
        online_retencao_pct_ds, online_retencao_pct_ddus,
        online_subs_ganhos, online_subs_perdidos,
        online_views_inscritos, online_views_nao_inscritos,
        vol_service_types(name, recurrence_time)
      `)
      .not('youtube_video_id', 'is', null)
      .order('data', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const videoIds = (cultos || []).map(c => c.youtube_video_id).filter(Boolean);
    if (!videoIds.length) return res.json([]);

    // Trafico por video
    const { data: traficoRows } = await supabase
      .from('online_video_trafico')
      .select('video_id, fonte, views, watch_minutes')
      .in('video_id', videoIds);
    const traficoByVideo = {};
    for (const r of (traficoRows || [])) {
      if (!traficoByVideo[r.video_id]) traficoByVideo[r.video_id] = [];
      traficoByVideo[r.video_id].push({ fonte: r.fonte, views: r.views, watch_minutes: r.watch_minutes });
    }
    for (const vId of Object.keys(traficoByVideo)) {
      traficoByVideo[vId].sort((a, b) => b.views - a.views);
    }

    // Curva de retencao por video
    const { data: curvaRows } = await supabase
      .from('online_video_retencao_curva')
      .select('video_id, ratio_pct, audience_watch_ratio')
      .in('video_id', videoIds)
      .order('ratio_pct', { ascending: true });
    const curvaByVideo = {};
    for (const r of (curvaRows || [])) {
      if (!curvaByVideo[r.video_id]) curvaByVideo[r.video_id] = [];
      curvaByVideo[r.video_id].push({ ratio_pct: r.ratio_pct, audience_watch_ratio: Number(r.audience_watch_ratio) });
    }

    const result = (cultos || []).map(c => ({
      id: c.id,
      data: c.data,
      youtube_video_id: c.youtube_video_id,
      service_type_name: c.vol_service_types?.name || null,
      recurrence_time: c.vol_service_types?.recurrence_time || null,
      online_pico: c.online_pico,
      online_ds: c.online_ds,
      online_ddus: c.online_ddus,
      online_watch_minutes_ds: c.online_watch_minutes_ds,
      online_watch_minutes_ddus: c.online_watch_minutes_ddus,
      online_retencao_pct_ds: c.online_retencao_pct_ds,
      online_retencao_pct_ddus: c.online_retencao_pct_ddus,
      online_subs_ganhos: c.online_subs_ganhos,
      online_subs_perdidos: c.online_subs_perdidos,
      online_views_inscritos: c.online_views_inscritos,
      online_views_nao_inscritos: c.online_views_nao_inscritos,
      trafico: traficoByVideo[c.youtube_video_id] || [],
      retencao_curva: curvaByVideo[c.youtube_video_id] || [],
    }));

    res.json(result);
  } catch (e) {
    console.error('[online/cultos-metricas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/online/sync · refresh manual (admin/diretor)
// ---------------------------------------------------------------------------
router.post('/sync', authorize('admin', 'diretor'), async (_req, res) => {
  try {
    const log = await syncCanal();
    res.json({ ok: true, log });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
