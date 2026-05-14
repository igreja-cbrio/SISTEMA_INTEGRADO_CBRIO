// ============================================================================
// Coletores autonomos do modulo Online
//
// liveMonitor   · detecta live ativa, linka video_id no culto em curso,
//                 atualiza cultos.online_pico se concurrentViewers > atual.
// dsCollector   · D+1 · pra cultos de ontem com video_id, grava cultos.online_ds
// ddusCollector · D+7 · pra cultos de 7d atras com video_id, grava cultos.online_ddus
// ============================================================================

const { supabase } = require('../utils/supabase');
const yt = require('./youtubeAnalytics');

const JANELA_LIVE_MIN_ANTES = 30;  // monitora 30 min antes do horario marcado
const JANELA_LIVE_MIN_DEPOIS = 240; // ate 4h depois (cultos longos)

function fmtData(d) {
  return d.toISOString().slice(0, 10);
}

function dataMaisDias(base, dias) {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

// ---------------------------------------------------------------------------
// findCultoAtual · descobre qual slot de culto deveria estar ativo agora
// ---------------------------------------------------------------------------
async function findCultoAtual() {
  const now = new Date();
  const hojeStr = fmtData(now);
  // Pega cultos de hoje e ontem (caso o de ontem ainda esteja no ar tarde da noite)
  const ontemStr = fmtData(dataMaisDias(now, -1));

  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, service_type_id, vol_service_types(name, recurrence_time, has_online), online_pico, youtube_video_id')
    .in('data', [hojeStr, ontemStr])
    .order('data', { ascending: false });

  if (!cultos?.length) return null;

  for (const c of cultos) {
    const st = c.vol_service_types;
    if (!st?.has_online) continue;
    const [h, m] = (st.recurrence_time || '').split(':').map(Number);
    if (isNaN(h)) continue;
    const horario = new Date(c.data + 'T00:00:00');
    horario.setHours(h, m || 0, 0, 0);
    const minutosDoInicio = (now - horario) / 60000;
    if (minutosDoInicio >= -JANELA_LIVE_MIN_ANTES && minutosDoInicio <= JANELA_LIVE_MIN_DEPOIS) {
      return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// liveMonitor · ativado a cada 5 min · so age se ha culto na janela
// ---------------------------------------------------------------------------
async function liveMonitor() {
  const culto = await findCultoAtual();
  if (!culto) return { skipped: true, reason: 'fora_de_janela' };

  // Se ainda nao tem video_id, descobre via live ativa
  let videoId = culto.youtube_video_id;
  if (!videoId) {
    const broadcast = await yt.findActiveBroadcast().catch(() => null);
    if (!broadcast) return { skipped: true, reason: 'sem_live_ativa', culto_id: culto.id };
    videoId = broadcast.video_id;
    await supabase.from('cultos')
      .update({ youtube_video_id: videoId })
      .eq('id', culto.id);
  }

  // Pega concurrent viewers
  const viewers = await yt.fetchLiveConcurrentViewers(null, videoId).catch(() => null);
  if (viewers === null) {
    return { skipped: true, reason: 'live_encerrada_ou_sem_dado', culto_id: culto.id, video_id: videoId };
  }

  // Atualiza online_pico se eh maior que o registrado
  const picoAtual = culto.online_pico || 0;
  if (viewers > picoAtual) {
    await supabase.from('cultos')
      .update({ online_pico: viewers })
      .eq('id', culto.id);
    return { ok: true, culto_id: culto.id, video_id: videoId, viewers, pico_anterior: picoAtual, atualizou: true };
  }
  return { ok: true, culto_id: culto.id, video_id: videoId, viewers, pico_atual: picoAtual, atualizou: false };
}

// ---------------------------------------------------------------------------
// dsCollector · D+1 · views acumuladas dentro do dia D do culto
// ---------------------------------------------------------------------------
async function dsCollector() {
  const ontem = fmtData(dataMaisDias(new Date(), -1));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_ds')
    .eq('data', ontem)
    .not('youtube_video_id', 'is', null);

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_ontem_com_video' };

  const resultados = [];
  for (const c of cultos) {
    if (c.online_ds && c.online_ds > 0) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ja_preenchido' });
      continue;
    }
    try {
      // DS = views NO dia D (do culto, nao do D+1) ate fim daquele dia
      const stats = await yt.fetchVideoViews(null, c.youtube_video_id, c.data, c.data);
      await supabase.from('cultos')
        .update({ online_ds: stats.views })
        .eq('id', c.id);
      resultados.push({ culto_id: c.id, video_id: c.youtube_video_id, online_ds: stats.views, watch_min: stats.watch_minutes });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}

// ---------------------------------------------------------------------------
// ddusCollector · D+7 · views totais on-demand acumuladas (D+1 ate D+7)
// ---------------------------------------------------------------------------
async function ddusCollector() {
  const setedias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_ddus, online_ds')
    .eq('data', setedias)
    .not('youtube_video_id', 'is', null);

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  for (const c of cultos) {
    if (c.online_ddus && c.online_ddus > 0) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ja_preenchido' });
      continue;
    }
    try {
      // DDUS = views D+1 ate D+7 (on-demand, exclui dia da live)
      const inicio = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 1));
      const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
      const stats = await yt.fetchVideoViews(null, c.youtube_video_id, inicio, fim);
      await supabase.from('cultos')
        .update({ online_ddus: stats.views })
        .eq('id', c.id);
      resultados.push({ culto_id: c.id, video_id: c.youtube_video_id, online_ddus: stats.views, periodo: `${inicio}..${fim}` });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}

module.exports = { liveMonitor, dsCollector, ddusCollector };
