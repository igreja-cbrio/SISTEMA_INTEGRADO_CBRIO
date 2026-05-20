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
        .update({
          online_ds: stats.views,
          online_watch_minutes_ds: Math.round(stats.watch_minutes || 0) || null,
          online_retencao_pct_ds: stats.avg_view_percentage ? Number(stats.avg_view_percentage.toFixed(2)) : null,
        })
        .eq('id', c.id);
      resultados.push({
        culto_id: c.id,
        video_id: c.youtube_video_id,
        online_ds: stats.views,
        watch_min: stats.watch_minutes,
        retencao_pct: stats.avg_view_percentage,
      });
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
        .update({
          online_ddus: stats.views,
          online_watch_minutes_ddus: Math.round(stats.watch_minutes || 0) || null,
          online_retencao_pct_ddus: stats.avg_view_percentage ? Number(stats.avg_view_percentage.toFixed(2)) : null,
        })
        .eq('id', c.id);
      resultados.push({
        culto_id: c.id,
        video_id: c.youtube_video_id,
        online_ddus: stats.views,
        watch_min: stats.watch_minutes,
        retencao_pct: stats.avg_view_percentage,
        periodo: `${inicio}..${fim}`,
      });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}

// ---------------------------------------------------------------------------
// subsCollector · D+7 · inscritos ganhos/perdidos atribuidos a cada culto
// no periodo D..D+7. Roda apos o ddus pra captar tudo de uma vez.
// ---------------------------------------------------------------------------
async function subsCollector() {
  const setedias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_subs_ganhos')
    .eq('data', setedias)
    .not('youtube_video_id', 'is', null);

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  for (const c of cultos) {
    if (c.online_subs_ganhos !== null && c.online_subs_ganhos !== undefined) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ja_preenchido' });
      continue;
    }
    try {
      const inicio = c.data;
      const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
      const stats = await yt.fetchVideoSubsChange(null, c.youtube_video_id, inicio, fim);
      await supabase.from('cultos')
        .update({
          online_subs_ganhos: stats.gained,
          online_subs_perdidos: stats.lost,
        })
        .eq('id', c.id);
      resultados.push({
        culto_id: c.id,
        video_id: c.youtube_video_id,
        subs_ganhos: stats.gained,
        subs_perdidos: stats.lost,
        periodo: `${inicio}..${fim}`,
      });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}

// ---------------------------------------------------------------------------
// traficoCollector · D+7 · fontes de trafego por video (search/suggested/etc)
// Upsert N rows por video em `online_video_trafico` (1 por fonte).
// ---------------------------------------------------------------------------
async function traficoCollector() {
  const setedias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id')
    .eq('data', setedias)
    .not('youtube_video_id', 'is', null);

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  for (const c of cultos) {
    try {
      const inicio = c.data;
      const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
      const fontes = await yt.fetchVideoTrafficSources(null, c.youtube_video_id, inicio, fim);
      if (!fontes.length) {
        resultados.push({ culto_id: c.id, video_id: c.youtube_video_id, fontes: 0 });
        continue;
      }
      const rows = fontes.map(f => ({
        video_id: c.youtube_video_id,
        fonte: f.fonte,
        views: f.views,
        watch_minutes: f.watch_minutes,
        periodo_inicio: inicio,
        periodo_fim: fim,
        collected_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('online_video_trafico')
        .upsert(rows, { onConflict: 'video_id,fonte' });
      if (error) throw error;
      resultados.push({
        culto_id: c.id,
        video_id: c.youtube_video_id,
        fontes: fontes.length,
        top: fontes.slice(0, 3).map(f => `${f.fonte}:${f.views}`).join(', '),
      });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}

// ---------------------------------------------------------------------------
// retencaoCurvaCollector · D+7 · curva de retencao por video (~100 pts).
// Upsert por (video_id, ratio_pct).
// ---------------------------------------------------------------------------
async function retencaoCurvaCollector() {
  const setedias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id')
    .eq('data', setedias)
    .not('youtube_video_id', 'is', null);

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  for (const c of cultos) {
    try {
      const inicio = c.data;
      const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
      const curva = await yt.fetchVideoRetentionCurve(null, c.youtube_video_id, inicio, fim);
      if (!curva.length) {
        resultados.push({ culto_id: c.id, video_id: c.youtube_video_id, pontos: 0 });
        continue;
      }
      const rows = curva.map(p => ({
        video_id: c.youtube_video_id,
        ratio_pct: p.ratio_pct,
        audience_watch_ratio: p.audience_watch_ratio,
        periodo_inicio: inicio,
        periodo_fim: fim,
        collected_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('online_video_retencao_curva')
        .upsert(rows, { onConflict: 'video_id,ratio_pct' });
      if (error) throw error;
      resultados.push({
        culto_id: c.id,
        video_id: c.youtube_video_id,
        pontos: curva.length,
        primeira: curva[0]?.audience_watch_ratio,
        ultima: curva[curva.length - 1]?.audience_watch_ratio,
      });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}

// ---------------------------------------------------------------------------
// subStatusCollector · D+7 · views por subscribedStatus
// Atualiza cultos.online_views_inscritos + cultos.online_views_nao_inscritos.
// ---------------------------------------------------------------------------
async function subStatusCollector() {
  const setedias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_views_inscritos')
    .eq('data', setedias)
    .not('youtube_video_id', 'is', null);

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  for (const c of cultos) {
    if (c.online_views_inscritos !== null && c.online_views_inscritos !== undefined) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ja_preenchido' });
      continue;
    }
    try {
      const inicio = c.data;
      const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
      const stats = await yt.fetchVideoViewsBySubStatus(null, c.youtube_video_id, inicio, fim);
      await supabase.from('cultos')
        .update({
          online_views_inscritos: stats.subscribed,
          online_views_nao_inscritos: stats.unsubscribed,
        })
        .eq('id', c.id);
      resultados.push({
        culto_id: c.id,
        video_id: c.youtube_video_id,
        inscritos: stats.subscribed,
        nao_inscritos: stats.unsubscribed,
        periodo: `${inicio}..${fim}`,
      });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}

// ---------------------------------------------------------------------------
// backfillCultoVideoIds · auto-link de cultos sem youtube_video_id usando
// `online_videos.actual_start_time` (preenchido pelo syncCanal apos esta
// PR). Match por proximidade temporal: video cuja `actual_start_time` cai
// dentro da janela [horario_culto - 30min, horario_culto + 4h] vira o
// `youtube_video_id` daquele culto.
//
// Idempotente · so toca cultos com youtube_video_id NULL · so olha cultos
// dos ultimos 180 dias pra nao escanear tudo eternamente.
// ---------------------------------------------------------------------------
async function backfillCultoVideoIds() {
  const horizonte = fmtData(dataMaisDias(new Date(), -180));

  // 1. Cultos elegiveis · sem video_id, has_online, ultimos 180d
  const { data: cultos, error: cErr } = await supabase
    .from('cultos')
    .select('id, data, vol_service_types(recurrence_time, has_online)')
    .is('youtube_video_id', null)
    .gte('data', horizonte)
    .order('data', { ascending: false });
  if (cErr) throw cErr;
  if (!cultos?.length) return { ok: true, linkados: 0, motivo: 'sem_cultos_pendentes' };

  // 2. Videos com actualStartTime nos ultimos 180d
  const { data: videos, error: vErr } = await supabase
    .from('online_videos')
    .select('video_id, actual_start_time, titulo')
    .not('actual_start_time', 'is', null)
    .gte('actual_start_time', new Date(Date.now() - 180 * 24 * 3600_000).toISOString())
    .order('actual_start_time', { ascending: false });
  if (vErr) throw vErr;
  if (!videos?.length) return { ok: true, linkados: 0, motivo: 'sem_videos_com_actual_start' };

  // 3. Match por janela temporal · mesma logica do liveMonitor mas pra passado
  const usados = new Set(); // evita linkar mesmo video em 2 cultos
  const resultados = [];

  for (const c of cultos) {
    const st = c.vol_service_types;
    if (!st?.has_online) continue;
    const [h, m] = (st.recurrence_time || '').split(':').map(Number);
    if (isNaN(h)) continue;

    const horario = new Date(c.data + 'T00:00:00');
    horario.setHours(h, m || 0, 0, 0);
    const inicio = new Date(horario.getTime() - JANELA_LIVE_MIN_ANTES * 60_000);
    const fim    = new Date(horario.getTime() + JANELA_LIVE_MIN_DEPOIS * 60_000);

    const match = videos.find(v => {
      if (usados.has(v.video_id)) return false;
      const t = new Date(v.actual_start_time);
      return t >= inicio && t <= fim;
    });

    if (match) {
      usados.add(match.video_id);
      const { error } = await supabase
        .from('cultos')
        .update({ youtube_video_id: match.video_id })
        .eq('id', c.id);
      if (error) {
        resultados.push({ culto_id: c.id, error: error.message });
      } else {
        resultados.push({ culto_id: c.id, data: c.data, video_id: match.video_id, titulo: match.titulo });
      }
    }
  }
  return { ok: true, linkados: resultados.filter(r => !r.error).length, total_cultos: cultos.length, resultados };
}

// ---------------------------------------------------------------------------
// catchUpMetricas · processa cultos com youtube_video_id MAS sem alguma
// metrica preenchida. Itera todas as 6 metricas (ds, ddus, subs, trafico,
// retencao_curva, sub_status) e dispara pra cada culto que esteja faltando
// dado. Util pos-backfill ou quando OAuth ficou offline por um periodo.
//
// Idempotencia: cada coletor abaixo ja tem skip por valor preenchido.
// ---------------------------------------------------------------------------
async function catchUpMetricas({ limit = 5 } = {}) {
  // 1. Pega cultos com video_id nos ultimos 180d que tem PELO MENOS uma
  //    metrica faltando (idempotencia · evita reprocessar quem ja terminou).
  //    Limit pequeno (5 cultos = ate 30 chamadas Analytics ≈ 30s) pra caber
  //    no limite de 60s da funcao serverless Vercel.
  const horizonte = fmtData(dataMaisDias(new Date(), -180));
  const { data: cultosCandidatos, error } = await supabase
    .from('cultos')
    .select(`
      id, data, youtube_video_id,
      online_ds, online_ddus,
      online_subs_ganhos, online_views_inscritos
    `)
    .not('youtube_video_id', 'is', null)
    .gte('data', horizonte)
    .order('data', { ascending: false });
  if (error) throw error;
  if (!cultosCandidatos?.length) return { ok: true, processados: 0, remaining: 0, motivo: 'sem_cultos_com_video' };

  // Pre-filtra cultos que ainda precisam de pelo menos 1 metrica
  // (DS, DDUS, subs ou sub_status faltando · trafico/retencao_curva nao
  // sao checados aqui pra simplicidade · o loop interno faz NULL-check
  // antes de chamar API).
  const pendentes = cultosCandidatos.filter(c =>
    !c.online_ds || c.online_ds === 0 ||
    !c.online_ddus || c.online_ddus === 0 ||
    c.online_subs_ganhos === null || c.online_subs_ganhos === undefined ||
    c.online_views_inscritos === null || c.online_views_inscritos === undefined
  );

  const remaining = Math.max(0, pendentes.length - limit);
  const cultos = pendentes.slice(0, limit);
  if (!cultos.length) return { ok: true, processados: 0, remaining: 0, motivo: 'todos_completos' };

  // 2. Pra cada culto, identifica metricas faltantes e dispara
  const out = {
    ds: 0, ddus: 0, subs: 0, trafico: 0, retencao_curva: 0, sub_status: 0,
    erros: [],
  };

  for (const c of cultos) {
    const inicioD     = c.data;
    const inicioDplus1 = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 1));
    const fimDplus7    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));

    // 2a. DS · views dia D
    if (!c.online_ds || c.online_ds === 0) {
      try {
        const stats = await yt.fetchVideoViews(null, c.youtube_video_id, c.data, c.data);
        await supabase.from('cultos').update({
          online_ds: stats.views,
          online_watch_minutes_ds: Math.round(stats.watch_minutes || 0) || null,
          online_retencao_pct_ds: stats.avg_view_percentage ? Number(stats.avg_view_percentage.toFixed(2)) : null,
        }).eq('id', c.id);
        out.ds++;
      } catch (e) { out.erros.push({ culto: c.id, metrica: 'ds', msg: e.message }); }
    }

    // 2b. DDUS · views D+1..D+7
    if (!c.online_ddus || c.online_ddus === 0) {
      try {
        const stats = await yt.fetchVideoViews(null, c.youtube_video_id, inicioDplus1, fimDplus7);
        await supabase.from('cultos').update({
          online_ddus: stats.views,
          online_watch_minutes_ddus: Math.round(stats.watch_minutes || 0) || null,
          online_retencao_pct_ddus: stats.avg_view_percentage ? Number(stats.avg_view_percentage.toFixed(2)) : null,
        }).eq('id', c.id);
        out.ddus++;
      } catch (e) { out.erros.push({ culto: c.id, metrica: 'ddus', msg: e.message }); }
    }

    // 2c. Subs ganhos/perdidos · janela D..D+7
    if (c.online_subs_ganhos === null || c.online_subs_ganhos === undefined) {
      try {
        const stats = await yt.fetchVideoSubsChange(null, c.youtube_video_id, inicioD, fimDplus7);
        await supabase.from('cultos').update({
          online_subs_ganhos: stats.gained,
          online_subs_perdidos: stats.lost,
        }).eq('id', c.id);
        out.subs++;
      } catch (e) { out.erros.push({ culto: c.id, metrica: 'subs', msg: e.message }); }
    }

    // 2d. Trafico (verifica via tabela separada)
    try {
      const { count } = await supabase
        .from('online_video_trafico')
        .select('video_id', { count: 'exact', head: true })
        .eq('video_id', c.youtube_video_id);
      if (!count || count === 0) {
        const fontes = await yt.fetchVideoTrafficSources(null, c.youtube_video_id, inicioD, fimDplus7);
        if (fontes.length) {
          const rows = fontes.map(f => ({
            video_id: c.youtube_video_id,
            fonte: f.fonte,
            views: f.views,
            watch_minutes: f.watch_minutes,
            periodo_inicio: inicioD,
            periodo_fim: fimDplus7,
            collected_at: new Date().toISOString(),
          }));
          await supabase.from('online_video_trafico').upsert(rows, { onConflict: 'video_id,fonte' });
          out.trafico++;
        }
      }
    } catch (e) { out.erros.push({ culto: c.id, metrica: 'trafico', msg: e.message }); }

    // 2e. Retencao curva
    try {
      const { count } = await supabase
        .from('online_video_retencao_curva')
        .select('video_id', { count: 'exact', head: true })
        .eq('video_id', c.youtube_video_id);
      if (!count || count === 0) {
        const curva = await yt.fetchVideoRetentionCurve(null, c.youtube_video_id, inicioD, fimDplus7);
        if (curva.length) {
          const rows = curva.map(p => ({
            video_id: c.youtube_video_id,
            ratio_pct: p.ratio_pct,
            audience_watch_ratio: p.audience_watch_ratio,
            periodo_inicio: inicioD,
            periodo_fim: fimDplus7,
            collected_at: new Date().toISOString(),
          }));
          await supabase.from('online_video_retencao_curva').upsert(rows, { onConflict: 'video_id,ratio_pct' });
          out.retencao_curva++;
        }
      }
    } catch (e) { out.erros.push({ culto: c.id, metrica: 'retencao_curva', msg: e.message }); }

    // 2f. Sub status
    if (c.online_views_inscritos === null || c.online_views_inscritos === undefined) {
      try {
        const stats = await yt.fetchVideoViewsBySubStatus(null, c.youtube_video_id, inicioD, fimDplus7);
        await supabase.from('cultos').update({
          online_views_inscritos: stats.subscribed,
          online_views_nao_inscritos: stats.unsubscribed,
        }).eq('id', c.id);
        out.sub_status++;
      } catch (e) { out.erros.push({ culto: c.id, metrica: 'sub_status', msg: e.message }); }
    }
  }

  return { ok: true, processados: cultos.length, remaining, ...out };
}

module.exports = {
  liveMonitor, dsCollector, ddusCollector, subsCollector,
  traficoCollector, retencaoCurvaCollector, subStatusCollector,
  backfillCultoVideoIds, catchUpMetricas,
};
