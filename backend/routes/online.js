const router = require('express').Router();
const crypto = require('crypto');
const { authenticate, authorize, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { syncCanal } = require('../services/youtubeCollector');
const yt = require('../services/youtubeAnalytics');
const collectors = require('../services/onlineCollectors');

const CRON_SECRET = process.env.CRON_SECRET;
const { isAuthorizedCron } = require('../utils/cronAuth');

// ── Cron · definido ANTES de router.use(authenticate) ──
async function autorizaCron(req, res, next) {
  if (!isAuthorizedCron(req)) {
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
// Engajamento de conteúdo do canal · refresca o mês atual + anterior
// todo dia (barato · 2 chamadas Analytics). O backfill do ano inteiro é pelo botão.
router.get('/cron/engajamento-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.engajamentoCollector({ mesesRecentes: 2 })); }
  catch (e) { console.error('[engajamento-collect]', e.message); res.status(500).json({ error: e.message }); }
});

// Blindagem · roda DEPOIS dos demais coletores do dia. Self-heal: tenta um
// catch-up antes de verificar; se ainda faltar metrica (ou o token caiu),
// dispara notificação via gerarNotificacoesOnline.
router.get('/cron/verificar', autorizaCron, async (_req, res) => {
  try {
    let selfHeal = null;
    try { selfHeal = await collectors.catchUpMetricas({ limit: 10 }); }
    catch (e) { selfHeal = { erro: e.message }; }
    const relatorio = await collectors.verificarColetaOnline();
    const { gerarNotificacoesOnline } = require('../services/notificacaoGenerator');
    const notificacoes = await gerarNotificacoesOnline();
    res.json({ ok: true, selfHeal, relatorio, notificacoes });
  } catch (e) {
    console.error('[online/cron/verificar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── OAuth callback eh público (Google redireciona, sem nosso JWT) ──
// State carrega: userId + nonce assinado com CRON_SECRET pra anti-CSRF
function signState(payload) {
  // Falha fechado: sem CRON_SECRET não assina (antes caía no literal 'dev', previsível)
  if (!CRON_SECRET) throw new Error('CRON_SECRET não configurada — OAuth state não pode ser assinado');
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', CRON_SECRET).update(json).digest('hex').slice(0, 16);
  return Buffer.from(json).toString('base64url') + '.' + sig;
}
function verifyState(state) {
  try {
    if (!CRON_SECRET) return null;
    const [b64, sig] = (state || '').split('.');
    if (!b64 || !sig) return null;
    const json = Buffer.from(b64, 'base64url').toString();
    const expected = crypto.createHmac('sha256', CRON_SECRET).update(json).digest('hex').slice(0, 16);
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
  if (error) return res.redirect(`/online?oauth_error=${encodeURIComponent(String(error))}`);
  const payload = verifyState(String(state || ''));
  if (!payload) return res.redirect('/online?oauth_error=state_invalido');
  try {
    const { tokens, channel } = await yt.exchangeCode(String(code), getRedirectUri());
    if (!tokens.refresh_token) {
      return res.redirect('/online?oauth_error=sem_refresh_token');
    }
    await yt.saveTokens({ channel, tokens, userId: payload.userId });
    res.redirect(`/online?oauth_ok=1&canal=${encodeURIComponent(channel.title || '')}`);
  } catch (e) {
    console.error('[oauth/callback]', e.message);
    res.redirect(`/online?oauth_error=${encodeURIComponent(e.message.slice(0, 100))}`);
  }
});

// ── A partir daqui, exige auth ──
router.use(authenticate);

// Inicia fluxo OAuth (admin/diretor)
router.get('/oauth/authorize', authorize('admin', 'diretor'), (req, res) => {
  const state = signState({ userId: req.user?.id || null, ts: Date.now(), nonce: crypto.randomBytes(8).toString('hex') });
  res.json({ url: yt.getAuthUrl(state, getRedirectUri()) });
});

// Diagnóstico · lista canais que a conta OAuth atual gerencia
// Se vier vazio ou não incluir CBRio, autorizacao foi feita na conta errada
router.get('/debug/canais-autorizados', authorize('admin', 'diretor'), async (_req, res) => {
  try {
    const canais = await yt.listAuthorizedChannels();
    res.json({ ok: true, canais, total: canais.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Diagnóstico · chama Analytics pra um vídeo especifico e retorna resposta crua
// Uso: GET /api/online/debug/analytics-test?video_id=XXX&start=2026-05-10&end=2026-05-17
router.get('/debug/analytics-test', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { video_id, start, end } = req.query;
    if (!video_id) return res.status(400).json({ error: 'video_id obrigatorio' });
    const startDate = start || new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const endDate   = end   || new Date().toISOString().slice(0, 10);
    const result = await yt.debugAnalyticsCall(String(video_id), String(startDate), String(endDate));
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/oauth/status', async (_req, res) => {
  // Prioriza row ATIVA (revoked_at null) e mais recente · evita confusao quando
  // ha tokens antigos revogados na mesma tabela (ex: trocou de conta OAuth).
  let { data } = await supabase
    .from('vw_online_oauth_status')
    .select('*')
    .is('revoked_at', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  // Fallback · se não tem ativa, retorna a mais recente (mesmo revogada) pra
  // UI exibir o último estado com last_error.
  if (!data) {
    const r = await supabase
      .from('vw_online_oauth_status')
      .select('*')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    data = r.data;
  }
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
  try {
    // Vincula o vídeo aos cultos pendentes ANTES de coletar (o DS so age em culto
    // já vinculado · sem isso o botao volta 0 quando o vídeo não foi linkado ainda).
    const backfill = await collectors.backfillCultoVideoIds().catch((e) => ({ erro: e.message }));
    const ds = await collectors.dsCollector();
    res.json({ ...ds, backfill });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/ddus', authorize('admin', 'diretor'), async (_req, res) => {
  try {
    const backfill = await collectors.backfillCultoVideoIds().catch((e) => ({ erro: e.message }));
    const ddus = await collectors.ddusCollector();
    res.json({ ...ddus, backfill });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
router.post('/coletar/backfill-range', authorize('admin', 'diretor'), async (req, res) => {
  const { data_inicio, data_fim } = req.body || {};
  if (!data_inicio || !data_fim) return res.status(400).json({ error: 'data_inicio e data_fim obrigatórios' });
  try { res.json(await collectors.backfillRange(data_inicio, data_fim)); } catch (e) { res.status(500).json({ error: e.message }); }
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
// Engajamento de conteúdo · backfill do ano (jan→hoje). ?ano=2026 opcional.
router.post('/coletar/engajamento', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const ano = req.query.ano ? Number(req.query.ano) : undefined;
    res.json(await collectors.engajamentoCollector({ ano }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// GET /api/online/engajamento
// KPIs de engajamento de conteúdo do canal (retenção média, taxa de
// compartilhamento, cliques em séries) · mês mais recente de online_engajamento.
// Estrutura pronta pra receber dados da API/Analytics do YouTube; enquanto não há
// coleta, devolve 0 (não "—").
// ---------------------------------------------------------------------------
router.get('/engajamento', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('online_engajamento')
      .select('mes, retencao_media_pct, taxa_compartilhamento_pct, cliques_series_pct, fonte, observacao, collected_at')
      .order('mes', { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = (data || [])[0] || null;
    const mesLabel = row?.mes
      ? new Date(row.mes + 'T00:00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })
      : null;
    res.json({
      mes: row?.mes ?? null,
      mes_label: mesLabel,
      retencao: Number(row?.retencao_media_pct ?? 0),
      compartilhamento: Number(row?.taxa_compartilhamento_pct ?? 0),
      cliques_series: Number(row?.cliques_series_pct ?? 0),
      fonte: row?.fonte ?? null,
      observacao: row?.observacao ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

    // 2. Vídeos do mês atual
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

    // 3. Séries
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
// GET /api/online/series/:id · detalhe + vídeos da série
// ---------------------------------------------------------------------------
router.get('/series/:id', async (req, res) => {
  try {
    const { data: serie, error } = await supabase
      .from('vw_online_series_kpi')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!serie) return res.status(404).json({ error: 'Série não encontrada' });

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
// tráfego e curva de retencao) · pra UI da página Online.
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

    // Trafico por vídeo
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

    // Curva de retencao por vídeo
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

    // Horarios reais da live (em UTC · frontend converte pra BRT)
    const { data: videoRows } = await supabase
      .from('online_videos')
      .select('video_id, actual_start_time, actual_end_time, titulo')
      .in('video_id', videoIds);
    const videoMeta = {};
    for (const v of (videoRows || [])) videoMeta[v.video_id] = v;

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
      actual_start_time: videoMeta[c.youtube_video_id]?.actual_start_time || null,
      actual_end_time:   videoMeta[c.youtube_video_id]?.actual_end_time   || null,
      video_titulo:      videoMeta[c.youtube_video_id]?.titulo || null,
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

// ════════════════════════════════════════════════════════════════════════════
// ACEITAÇÕES ONLINE · a lista de quem decidiu assistindo, para o time do Online
// ════════════════════════════════════════════════════════════════════════════
// Pedido do Matheus (27/08/2026): "quem vai acompanhar essas pessoas é o time
// do online, então deve ter lá a lista com as aceitações, botão de wpp e
// checkbox de contatado" · e "prefiro que esse QR code de cada culto esteja na
// aba do online, para a equipe do online pegar lá".
//
// ⚠️⚠️ NÃO HÁ CAMPO NOVO DE "CONTATADO". Quem registra o primeiro contato é
// `cui_convertidos.primeiro_contato_em`, que já existe e é de onde saem o SLA
// de 3 dias, os KPIs da jornada e a fila do módulo de Cuidados. Um checkbox
// próprio aqui criaria uma SEGUNDA VERDADE sobre o mesmo fato — o time do
// Online marcaria "contatado" e o painel pastoral continuaria cobrando a mesma
// pessoa. A tela grava pelo endpoint que já existe.

// GET /api/online/aceitacoes?dias=&replay=
// Lista as decisões online nominais (as que vieram do formulário do QR).
router.get('/aceitacoes', async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 90, 1), 365);
    const desde = new Date(Date.now() - 3 * 3600e3 - dias * 86400e3).toISOString().slice(0, 10);

    // `cui_convertidos` é a fila pastoral — é ela que o time vai trabalhar, e é
    // nela que o contato é registrado. `data_culto` aqui É a data em que a
    // jornada começou (para replay, o dia em que a pessoa preencheu).
    const { data, error } = await supabase
      .from('cui_convertidos')
      .select('id, nome, telefone, membro_id, data_culto, culto_id, primeiro_contato_em, primeiro_contato_status, created_at, cultos(data, vol_service_types(name))')
      .eq('area', 'online')
      .is('deleted_at', null)
      .gte('data_culto', desde)
      .order('data_culto', { ascending: false })
      .limit(500);
    if (error) throw error;

    const itens = (data || []).map((c) => {
      const dataCultoOrigem = c.cultos?.data || null;
      // ⚠️ "Veio de vídeo passado" é DERIVADO, não guardado: se a jornada
      // começou num dia diferente do culto de origem, a pessoa assistiu a
      // gravação. Coluna para isso seria coluna que um dia dessincroniza.
      const replay = !!(dataCultoOrigem && c.data_culto && dataCultoOrigem !== c.data_culto);
      return {
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        membro_id: c.membro_id,
        // Quando a pessoa decidiu (e de quando conta o prazo de contato).
        decidiu_em: c.data_culto,
        contatado_em: c.primeiro_contato_em,
        replay,
        culto: dataCultoOrigem
          ? { data: dataCultoOrigem, nome: c.cultos?.vol_service_types?.name || 'Culto' }
          : null,
      };
    });

    const filtrados = req.query.replay === '1' ? itens.filter((i) => i.replay)
      : req.query.replay === '0' ? itens.filter((i) => !i.replay)
      : itens;

    res.json({
      dias,
      itens: filtrados,
      total: itens.length,
      de_replay: itens.filter((i) => i.replay).length,
      sem_contato: itens.filter((i) => !i.contatado_em).length,
    });
  } catch (e) {
    console.error('[online/aceitacoes]', e.message);
    res.status(500).json({ error: 'Erro ao carregar as aceitações online' });
  }
});

// GET /api/online/qr-cultos?inicio=&fim=
// Os QRs do apelo dos cultos do período, para a produção montar o overlay.
//
// ⚠️ Endpoint PRÓPRIO em vez de reusar `/kpis/cultos/links-decisoes`: aquele é
// guardado por `authorizeIntegracao` e entrega o link do VOLUNTÁRIO lançar
// decisão de terceiro. Aqui o público é a equipe do Online e o link é outro —
// o que a própria pessoa usa. Compartilhar o endpoint acabaria entregando o
// link errado a um dos dois times.
router.get('/qr-cultos', async (req, res) => {
  try {
    const { montarLinkDecisao } = require('../utils/decisaoToken');
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const inicio = String(req.query.inicio || '').slice(0, 10);
    const fim = String(req.query.fim || '').slice(0, 10);
    if (!ISO.test(inicio) || !ISO.test(fim)) {
      return res.status(400).json({ error: 'Informe inicio e fim no formato AAAA-MM-DD.' });
    }
    if (fim < inicio) return res.status(400).json({ error: 'O fim não pode ser anterior ao início.' });

    const { data, error } = await supabase
      .from('vw_culto_stats')
      .select('id, data, hora, nome, service_type_name, service_type_has_online')
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: true })
      .order('hora', { ascending: true })
      .limit(100);
    if (error) throw error;

    // ⚠️ Só culto COM transmissão: gerar QR de decisão online para um tipo sem
    // live entregaria à produção um QR que nunca deveria ir ao ar.
    const cultos = (data || [])
      .filter((c) => c.service_type_has_online)
      .map((c) => ({
        id: c.id,
        data: c.data,
        hora: c.hora,
        nome: c.service_type_name || c.nome || 'Culto',
        // `null` sem segredo configurado (fail-closed): a tela declara
        // "indisponível" em vez de a produção pôr no telão um QR que não abre.
        link: montarLinkDecisao(c.id),
      }));

    res.json({ inicio, fim, cultos });
  } catch (e) {
    console.error('[online/qr-cultos]', e.message);
    res.status(500).json({ error: 'Erro ao gerar os QRs dos cultos' });
  }
});

// GET /api/online/link-membresia
// O link do CADASTRO DE MEMBRESIA que o time do Online distribui.
//
// ⚠️⚠️ NÃO é um segundo formulário. É o MESMO `/cadastro-membresia` (Contrato
// de porta: uma pessoa = um cadastro = um funil), com `?origem=online` — e a
// origem não é enfeite: na APROVAÇÃO ela vira
// `mem_membros.frequenta_area = 'online'`, que é a coluna que o painel do
// Online já lê. Um formulário paralelo daria duas fichas divergindo no primeiro
// campo novo, e um funil de identidade a reconstruir do zero.
//
// ⚠️ O CAMINHO vem do catálogo de formulários públicos (`routes/links.js`) e a
// BASE de `utils/linkInscricaoApp` — os dois pontos únicos de mudança. Montar a
// URL na tela é como `/apresentacao-criancas` ficou link morto por meses: URL
// escrita à mão é URL que ninguém valida.
router.get('/link-membresia', async (req, res) => {
  try {
    const { basePublica } = require('../utils/linkInscricaoApp');
    const { OUTROS_FORMULARIOS } = require('./links');

    const porta = (OUTROS_FORMULARIOS || []).find((f) => f.chave === 'cadastro_membresia');
    // Fail-closed: sem a porta no catálogo eu NÃO invento o caminho. Link que
    // não abre entregue a quem está convidando é pior que botão ausente.
    if (!porta?.caminho) {
      return res.status(503).json({
        error: 'O catálogo de formulários públicos não trouxe o cadastro de membresia.',
      });
    }

    res.json({
      link: `${basePublica()}${porta.caminho}?origem=online`,
      nome: porta.nome,
    });
  } catch (e) {
    console.error('[online/link-membresia]', e.message);
    // ⚠️ Erro NUNCA vira link vazio: a tela some com o botão e diz o motivo, em
    // vez de oferecer um endereço que não existe.
    res.status(500).json({ error: 'Erro ao montar o link do cadastro de membresia' });
  }
});


// ════════════════════════════════════════════════════════════════════════════
//  POST /online/comunidade-mensal · { mes: 'YYYY-MM', valor: number|null }
//
//  Grava SÓ `cultura_mensal.investir_comunidade_online` — o total de pessoas
//  na comunidade do Online no WhatsApp naquele mês. Aparece na pétala Investir
//  da mandala, AO LADO do devocional (nunca somado · ver a migration
//  20260902180000).
//
//  ⚠️⚠️ ROTA PRÓPRIA E ESTREITA, DE PROPÓSITO. O `POST /kpis/cultura/mensal`
//  faria o mesmo trabalho, mas ele escreve TAMBÉM `qtd_dizimistas`,
//  `qtd_ofertantes`, `freq_presencial_semanal`, `freq_online_semanal`,
//  `decisoes_total` e `freq_grupos_total`. Abri-lo para o módulo `online`
//  daria à equipe do Online escrita sobre número FINANCEIRO e sobre os
//  overrides que alimentam a mandala inteira — muito além de "deixe a equipe
//  salvar o número da comunidade". Menor privilégio: aqui não existe caminho
//  para tocar outra coluna, nem por engano nem por payload malicioso.
//
//  ⚠️ `authorizeModule('online', 3)` alcança a coordenação do Online pelo BOOST
//  DE ÁREA: a matriz dá nível 1 ao cargo "Coord Onl", mas quem tem a área
//  "Online" em `usuario_areas` recebe `Math.max(nivel, 5)` em leitura e
//  escrita (`AREA_MODULO_BOOST` em middleware/auth.js). Medido em 02/09/2026:
//  renata.martins@cbrio.org tem a área e portanto escrita efetiva 5.
//  ⚠️ Por isso NÃO foi preciso mexer na matriz de permissões — e mexer teria
//  sido pior, porque `online >= 3` na matriz alcança hoje 11 pessoas de
//  Dev/Assist Área/Assist Mini/Supervisor Jornada, nenhuma delas do Online.
// ════════════════════════════════════════════════════════════════════════════
router.post('/comunidade-mensal', authorizeModule('online', 3), async (req, res) => {
  try {
    const { mes, valor } = req.body || {};
    if (!mes || !/^\d{4}-\d{2}/.test(String(mes))) {
      return res.status(400).json({ error: 'Informe o mês no formato AAAA-MM.' });
    }
    // ⚠️ null LIMPA de propósito ("não informado"), e é diferente de 0
    // ("a comunidade está vazia"). Por isso a coluna nasceu sem DEFAULT.
    let n = null;
    if (valor !== null && valor !== undefined && String(valor).trim() !== '') {
      n = Number(valor);
      if (!Number.isInteger(n) || n < 0 || n > 1000000) {
        return res.status(400).json({ error: 'Informe um número inteiro de pessoas.' });
      }
    }
    const { data, error } = await supabase
      .from('cultura_mensal')
      // ⚠️ Só estas chaves. O upsert do PostgREST atualiza apenas as colunas
      // presentes no payload, então nada mais do mês é tocado.
      .upsert({
        mes: `${String(mes).slice(0, 7)}-01`,
        investir_comunidade_online: n,
        updated_at: new Date().toISOString(),
        updated_by: req.user?.id || null,
      }, { onConflict: 'mes' })
      .select('mes, investir_comunidade_online')
      .single();
    if (error) throw error;
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[ONLINE] comunidade-mensal:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar o número da comunidade.' });
  }
});

module.exports = router;
