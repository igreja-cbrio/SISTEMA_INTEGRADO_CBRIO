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

// peakConcurrentViewers (Analytics) so fica disponivel ~2-3 dias DEPOIS da live.
// Antes disso o Google responde 500 ("An internal error has occurred") porque a
// metrica ainda nao processou · nao adianta tentar e nao e erro de verdade.
// O live-monitor ja captura o pico em tempo real durante a transmissao · este
// caminho via Analytics e so um recovery best-effort pra quando o monitor falhou.
const PICO_ANALYTICS_DELAY_DIAS = 3;

// Fallback do formulario de decisao · fora da janela ao vivo, ainda anexa a
// decisao ao ultimo culto online que ja comecou ate este limite (minutos apos
// o inicio). Cobre quem so preenche o form DEPOIS que o culto acaba, sem
// atribuir a dias/cultos errados. 720min = 12h (ex: culto 19h aceita ate 07h).
const FALLBACK_GRACE_MIN = 720;

function fmtData(d) {
  return d.toISOString().slice(0, 10);
}

// dias inteiros decorridos desde a data (YYYY-MM-DD) do culto ate hoje
function diasDesdeData(dataStr) {
  const dt = new Date(dataStr + 'T00:00:00');
  return Math.floor((Date.now() - dt.getTime()) / 86400000);
}

function dataMaisDias(base, dias) {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

// ---------------------------------------------------------------------------
// findCultoAtual · descobre qual slot de culto deveria estar ativo agora
// ---------------------------------------------------------------------------
// opts.fallbackUltimoDoDia · quando true (usado pelo formulario de decisao),
// se nenhuma janela estiver aberta, anexa ao ultimo culto online que ja comecou
// dentro do grace pos-live (FALLBACK_GRACE_MIN) em vez de retornar null. O
// liveMonitor chama SEM o fallback (so age durante a transmissao de verdade).
async function findCultoAtual({ fallbackUltimoDoDia = false } = {}) {
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

  // Anota cada culto online com horario de inicio e minutos decorridos.
  const comHorario = [];
  for (const c of cultos) {
    const st = c.vol_service_types;
    if (!st?.has_online) continue;
    const [h, m] = (st.recurrence_time || '').split(':').map(Number);
    if (isNaN(h)) continue;
    const horario = new Date(c.data + 'T00:00:00');
    horario.setHours(h, m || 0, 0, 0);
    comHorario.push({ culto: c, horario, minutosDoInicio: (now - horario) / 60000 });
  }
  if (!comHorario.length) return null;

  // 1) Janela aberta · entre os cultos cuja janela [-30min, +4h] esta aberta agora,
  //    escolhe o de horario de inicio MAIS RECENTE. Resolve a sobreposicao de
  //    domingo: se o 11:30 ja comecou enquanto a janela do 10:00 ainda esta
  //    tecnicamente aberta, a decisao/coleta vai pro 11:30 (o culto "atual").
  const naJanela = comHorario
    .filter((x) => x.minutosDoInicio >= -JANELA_LIVE_MIN_ANTES && x.minutosDoInicio <= JANELA_LIVE_MIN_DEPOIS)
    .sort((a, b) => b.horario - a.horario);
  if (naJanela.length) return naJanela[0].culto;

  // 2) Fallback opt-in · fora da janela, anexa ao ultimo culto que ja comecou
  //    dentro do grace pos-live (nao descarta decisao de quem preenche atrasado).
  if (fallbackUltimoDoDia) {
    const posLive = comHorario
      .filter((x) => x.minutosDoInicio > JANELA_LIVE_MIN_DEPOIS && x.minutosDoInicio <= FALLBACK_GRACE_MIN)
      .sort((a, b) => b.horario - a.horario);
    if (posLive.length) return posLive[0].culto;
  }

  return null;
}

// ---------------------------------------------------------------------------
// registrarDiagToken · grava observabilidade no token ativo (revoked_at NULL).
// last_check_at = quando o monitor rodou de fato · last_error = motivo do skip
// /erro (ou null em sucesso). Nunca quebra o coletor se a escrita falhar.
// ---------------------------------------------------------------------------
async function registrarDiagToken(patch) {
  try {
    await supabase.from('online_oauth_tokens')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .is('revoked_at', null);
  } catch { /* diagnostico nao pode derrubar a coleta */ }
}

// ---------------------------------------------------------------------------
// liveMonitor · ativado a cada 5 min · so age se ha culto na janela
// ---------------------------------------------------------------------------
async function liveMonitor() {
  const culto = await findCultoAtual();
  if (!culto) return { skipped: true, reason: 'fora_de_janela' };

  const agora = new Date().toISOString();
  try {
    // Se ainda nao tem video_id, descobre via live ativa
    let videoId = culto.youtube_video_id;
    if (!videoId) {
      const broadcast = await yt.findActiveBroadcast(); // throw em erro HTTP real
      if (!broadcast) {
        await registrarDiagToken({ last_check_at: agora, last_error: 'sem_live_ativa' });
        return { skipped: true, reason: 'sem_live_ativa', culto_id: culto.id };
      }
      videoId = broadcast.video_id;
      await supabase.from('cultos')
        .update({ youtube_video_id: videoId })
        .eq('id', culto.id);
    }

    // Pega concurrent viewers
    const viewers = await yt.fetchLiveConcurrentViewers(null, videoId);
    if (viewers === null) {
      await registrarDiagToken({ last_check_at: agora, last_error: 'live_encerrada_ou_sem_dado' });
      return { skipped: true, reason: 'live_encerrada_ou_sem_dado', culto_id: culto.id, video_id: videoId };
    }

    // Detecta gatilhos de decisao no chat ao vivo (CONSULTIVO · nao mexe no KPI)
    await coletarChatDecisoes(culto.id).catch(() => {});

    // Atualiza online_pico se eh maior que o registrado
    const picoAtual = culto.online_pico || 0;
    if (viewers > picoAtual) {
      await supabase.from('cultos')
        .update({ online_pico: viewers })
        .eq('id', culto.id);
      await registrarDiagToken({ last_check_at: agora, last_error: null });
      return { ok: true, culto_id: culto.id, video_id: videoId, viewers, pico_anterior: picoAtual, atualizou: true };
    }
    await registrarDiagToken({ last_check_at: agora, last_error: null });
    return { ok: true, culto_id: culto.id, video_id: videoId, viewers, pico_atual: picoAtual, atualizou: false };
  } catch (e) {
    // Antes esse erro era engolido (.catch(() => null)) e o pico se perdia em
    // silencio. Agora persiste o motivo real pra debug em /online (status OAuth).
    const msg = (e?.message || String(e)).slice(0, 250);
    await registrarDiagToken({ last_check_at: agora, last_error: `live_monitor: ${msg}` });
    return { skipped: true, reason: 'erro', culto_id: culto.id, error: msg };
  }
}

// ---------------------------------------------------------------------------
// coletarChatDecisoes · CONSULTIVO · conta mensagens-gatilho no chat ao vivo
// e acumula em cultos.online_decisoes_chat. Pagina incrementalmente via
// online_chat_page_token (so conta mensagens novas a cada poll). Best-effort:
// nunca quebra o liveMonitor (chamado com .catch). NAO entra no KPI · so dica.
// ---------------------------------------------------------------------------
const CHAT_GATILHOS = /(aceito jesus|eu aceito|aceito a jesus|entrego minha vida|quero aceitar|decido por jesus|recebo jesus|jesus (e|é) o senhor)/i;

async function coletarChatDecisoes(cultoId) {
  const broadcast = await yt.findActiveBroadcast();
  if (!broadcast?.live_chat_id) return { skipped: true, reason: 'sem_live_chat_id' };

  const { data: c } = await supabase
    .from('cultos')
    .select('online_decisoes_chat, online_chat_page_token')
    .eq('id', cultoId)
    .maybeSingle();

  const { mensagens, nextPageToken } = await yt.fetchLiveChatMessages(
    null, broadcast.live_chat_id, c?.online_chat_page_token || undefined
  );

  const novos = (mensagens || []).filter((m) => CHAT_GATILHOS.test(m)).length;
  const total = (c?.online_decisoes_chat || 0) + novos;

  await supabase.from('cultos')
    .update({ online_decisoes_chat: total, online_chat_page_token: nextPageToken })
    .eq('id', cultoId);

  return { ok: true, novos, total };
}

// ---------------------------------------------------------------------------
// dsCollector · D+1 · views acumuladas dentro do dia D do culto
// Idempotente · pega cultos dos ULTIMOS 7 DIAS com online_ds NULL ou 0
// (cobre falhas pontuais do cron, latencia do Analytics, token revogado)
// ---------------------------------------------------------------------------
async function dsCollector() {
  const seteDias = fmtData(dataMaisDias(new Date(), -7));
  const ontem = fmtData(dataMaisDias(new Date(), -1));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_ds, online_pico')
    .gte('data', seteDias).lte('data', ontem)
    .not('youtube_video_id', 'is', null)
    .or('online_ds.is.null,online_ds.eq.0');

  if (!cultos?.length) return { ok: true, processados: 0, coletados: 0, motivo: 'sem_cultos_com_video_vinculado' };

  const resultados = [];
  let coletados = 0;
  for (const c of cultos) {
    // Pico ao vivo · recovery post-live via Analytics peakConcurrentViewers.
    // Roda mesmo se DS ja esta preenchido (idempotente · so age se online_pico vazio).
    // So tenta depois que o Analytics processa (~3 dias) · antes disso o Google
    // 500a e nao e erro real. Falha aqui NAO vai pro last_error (nao pinta o
    // banner de vermelho) · o pico tem o live-monitor como fonte primaria.
    if (!c.online_pico && diasDesdeData(c.data) >= PICO_ANALYTICS_DELAY_DIAS) {
      try {
        const live = await yt.fetchLivePeakConcurrentViewers(null, c.youtube_video_id, c.data, c.data);
        if (live.peak) {
          await supabase.from('cultos').update({ online_pico: live.peak }).eq('id', c.id);
        }
      } catch (e) {
        resultados.push({ culto_id: c.id, pico_error: e.message });
      }
    }

    if (c.online_ds && c.online_ds > 0) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ja_preenchido' });
      continue;
    }
    try {
      // DS = total ACUMULADO de views do video ate o momento da coleta (manha
      // seguinte ao culto). Vem do statistics.viewCount da Data API · quase em
      // tempo real, SEM o atraso de 1-2 dias da Analytics (que deixava o DS de
      // ontem zerado). watch time / retencao seguem da Analytics (best-effort:
      // se ainda nao processou, o numero de views ja foi gravado mesmo assim).
      const stats = await yt.fetchVideoStatistics(null, c.youtube_video_id);
      const update = { online_ds: stats?.viewCount ?? 0 };
      try {
        const a = await yt.fetchVideoViews(null, c.youtube_video_id, c.data, c.data);
        update.online_watch_minutes_ds = Math.round(a.watch_minutes || 0) || null;
        update.online_retencao_pct_ds = a.avg_view_percentage ? Number(a.avg_view_percentage.toFixed(2)) : null;
      } catch (e) {
        resultados.push({ culto_id: c.id, analytics_pendente: e.message.slice(0, 80) });
      }
      await supabase.from('cultos').update(update).eq('id', c.id);
      coletados++;
      resultados.push({ culto_id: c.id, video_id: c.youtube_video_id, online_ds: update.online_ds });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, coletados, resultados };
}

// ---------------------------------------------------------------------------
// backfillRange · roda DS + DDUS pra cultos num range de datas (recovery)
// ---------------------------------------------------------------------------
async function backfillRange(dataInicio, dataFim) {
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_ds, online_ddus, online_pico, online_watch_minutes_ds, online_watch_minutes_ddus')
    .gte('data', dataInicio).lte('data', dataFim)
    .not('youtube_video_id', 'is', null)
    .order('data', { ascending: true });

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_com_video_no_range' };

  const hoje = new Date();
  const resultados = [];
  for (const c of cultos) {
    const dt = new Date(c.data + 'T00:00:00');
    const diasDesde = Math.floor((hoje - dt) / 86400000);
    const itemResult = { culto_id: c.id, data: c.data, video_id: c.youtube_video_id };

    // Pico recovery via Analytics peakConcurrentViewers · so depois do delay de
    // processamento (~3 dias) · falha aqui nao vai pro last_error (ver dsCollector).
    if (!c.online_pico && diasDesde >= PICO_ANALYTICS_DELAY_DIAS) {
      try {
        const live = await yt.fetchLivePeakConcurrentViewers(null, c.youtube_video_id, c.data, c.data);
        if (live?.peak) {
          await supabase.from('cultos').update({ online_pico: live.peak }).eq('id', c.id);
          itemResult.pico = live.peak;
        }
      } catch (e) {
        itemResult.pico_error = e.message.slice(0, 100);
      }
    }

    // DS (views no dia D)
    if (!c.online_ds && diasDesde >= 1) {
      try {
        const stats = await yt.fetchVideoViews(null, c.youtube_video_id, c.data, c.data);
        await supabase.from('cultos').update({
          online_ds: stats.views,
          online_watch_minutes_ds: Math.round(stats.watch_minutes || 0) || null,
          online_retencao_pct_ds: stats.avg_view_percentage ? Number(stats.avg_view_percentage.toFixed(2)) : null,
        }).eq('id', c.id);
        itemResult.ds = stats.views;
      } catch (e) { itemResult.ds_error = e.message.slice(0, 100); }
    }

    // DDUS (views D+1 ate D+7) · so se passou >=7 dias
    if (!c.online_ddus && diasDesde >= 7) {
      try {
        const inicio = fmtData(dataMaisDias(dt, 1));
        const fim    = fmtData(dataMaisDias(dt, 7));
        const stats = await yt.fetchVideoViews(null, c.youtube_video_id, inicio, fim);
        await supabase.from('cultos').update({
          online_ddus: stats.views,
          online_watch_minutes_ddus: Math.round(stats.watch_minutes || 0) || null,
          online_retencao_pct_ddus: stats.avg_view_percentage ? Number(stats.avg_view_percentage.toFixed(2)) : null,
        }).eq('id', c.id);
        itemResult.ddus = stats.views;
      } catch (e) { itemResult.ddus_error = e.message.slice(0, 100); }
    }
    resultados.push(itemResult);
  }
  return { ok: true, processados: cultos.length, resultados };
}

// ---------------------------------------------------------------------------
// ddusCollector · D+7 · views totais on-demand acumuladas (D+1 ate D+7)
// ---------------------------------------------------------------------------
async function ddusCollector() {
  // Idempotente · pega cultos D+7 ate D+30 com online_ddus NULL ou 0
  // (cobre falhas pontuais do cron e latencia do Analytics).
  const trintaDias = fmtData(dataMaisDias(new Date(), -30));
  const seteDias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_ddus, online_ds')
    .gte('data', trintaDias).lte('data', seteDias)
    .not('youtube_video_id', 'is', null)
    .or('online_ddus.is.null,online_ddus.eq.0');

  if (!cultos?.length) return { ok: true, processados: 0, coletados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  let coletados = 0;
  for (const c of cultos) {
    if (c.online_ddus && c.online_ddus > 0) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ja_preenchido' });
      continue;
    }
    // DDUS depende do DS (snapshot da manha seguinte) · ele e o ponto de partida
    // da subtracao. Sem DS nao da pra isolar o on-demand · pula e sinaliza.
    if (c.online_ds == null) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ds_ausente' });
      continue;
    }
    try {
      // DDUS = on-demand acumulado na semana seguinte = total de views AGORA
      // (>= D+7, via statistics.viewCount da Data API) MENOS o DS (manha
      // seguinte). Mesma fonte do DS · sem o atraso de 1-2 dias da Analytics.
      const stats = await yt.fetchVideoStatistics(null, c.youtube_video_id);
      const totalAgora = stats?.viewCount ?? 0;
      const ddus = Math.max(0, totalAgora - (c.online_ds || 0));
      const update = { online_ddus: ddus };
      // watch time / retencao da janela D+1..D+7 seguem da Analytics (best-effort)
      try {
        const inicio = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 1));
        const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
        const a = await yt.fetchVideoViews(null, c.youtube_video_id, inicio, fim);
        update.online_watch_minutes_ddus = Math.round(a.watch_minutes || 0) || null;
        update.online_retencao_pct_ddus = a.avg_view_percentage ? Number(a.avg_view_percentage.toFixed(2)) : null;
      } catch (e) {
        resultados.push({ culto_id: c.id, analytics_pendente: e.message.slice(0, 80) });
      }
      await supabase.from('cultos').update(update).eq('id', c.id);
      coletados++;
      resultados.push({ culto_id: c.id, video_id: c.youtube_video_id, online_ddus: ddus, total_agora: totalAgora, ds: c.online_ds });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, coletados, resultados };
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
      online_pico,
      online_ds, online_ddus,
      online_subs_ganhos, online_views_inscritos
    `)
    .not('youtube_video_id', 'is', null)
    .gte('data', horizonte)
    .order('data', { ascending: false });
  if (error) throw error;
  if (!cultosCandidatos?.length) return { ok: true, processados: 0, remaining: 0, motivo: 'sem_cultos_com_video' };

  // Pre-filtra cultos que ainda precisam de pelo menos 1 metrica
  // (pico, DS, DDUS, subs ou sub_status faltando · trafico/retencao_curva nao
  // sao checados aqui pra simplicidade · o loop interno faz NULL-check
  // antes de chamar API).
  const pendentes = cultosCandidatos.filter(c =>
    !c.online_pico || c.online_pico === 0 ||
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
    pico: 0, ds: 0, ddus: 0, subs: 0, trafico: 0, retencao_curva: 0, sub_status: 0,
    erros: [],
  };

  for (const c of cultos) {
    const inicioD     = c.data;
    const inicioDplus1 = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 1));
    const fimDplus7    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));

    // 2a-pico. Pico ao vivo · recovery post-live via peakConcurrentViewers.
    // So tenta depois que o Analytics processa (~3 dias · antes disso o Google
    // 500a). Idempotente (so age se vazio) e a falha NAO pinta o banner de
    // vermelho · live-monitor e a fonte primaria do pico.
    if ((!c.online_pico || c.online_pico === 0) && diasDesdeData(c.data) >= PICO_ANALYTICS_DELAY_DIAS) {
      try {
        const live = await yt.fetchLivePeakConcurrentViewers(null, c.youtube_video_id, c.data, c.data);
        if (live.peak) {
          await supabase.from('cultos').update({ online_pico: live.peak }).eq('id', c.id);
          out.pico++;
        }
      } catch (e) {
        out.erros.push({ culto: c.id, metrica: 'pico', msg: e.message });
      }
    }

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

// ---------------------------------------------------------------------------
// verificarColetaOnline · BLINDAGEM · confere se os cultos online ja encerrados
// dos ultimos 2 dias receberam as metricas automaticas (video_id, pico, DS) e a
// saude do token OAuth. NAO dispara notificacao (quem decide alertar e o
// notificacaoGenerator) · so retorna um relatorio estruturado dos problemas.
//
// Por que 2 dias: pega "ontem" (alvo principal) + "anteontem" como rede de
// seguranca, caso o verificador tenha falhado uma vez. Cultos do dia atual sao
// ignorados (ainda podem estar no ar / DS so vem em D+1).
// ---------------------------------------------------------------------------
async function verificarColetaOnline() {
  const hojeStr = fmtData(new Date());
  const ontemStr = fmtData(dataMaisDias(new Date(), -1));
  const anteontemStr = fmtData(dataMaisDias(new Date(), -2));

  // 1. Saude do token OAuth (ponto unico de falha de toda a coleta YouTube)
  const { data: tokenRow } = await supabase
    .from('online_oauth_tokens')
    .select('channel_id, refresh_token, revoked_at, last_error, last_check_at, expires_at')
    .is('revoked_at', null)
    .maybeSingle();

  let token;
  if (!tokenRow || !tokenRow.refresh_token) {
    token = { conectado: false, degradado: false, motivo: 'desconectado' };
  } else if (tokenRow.last_error) {
    token = { conectado: true, degradado: true, motivo: 'erro_recente', last_error: tokenRow.last_error };
  } else {
    token = { conectado: true, degradado: false, motivo: 'ok' };
  }

  // 2. Cultos online ja encerrados (anteontem/ontem) e suas metricas
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_pico, online_ds, decisoes_online, online_decisoes_chat, vol_service_types(name, has_online)')
    .in('data', [anteontemStr, ontemStr])
    .lt('data', hojeStr)
    .order('data', { ascending: false });

  const problemas = [];
  const decisoesPendentes = [];
  let verificados = 0;
  for (const c of (cultos || [])) {
    const st = c.vol_service_types;
    if (!st?.has_online) continue;
    verificados++;
    const faltando = [];
    if (!c.youtube_video_id) faltando.push('video_id (live nao detectada)');
    if (!c.online_pico || c.online_pico === 0) faltando.push('pico de audiencia');
    if (!c.online_ds || c.online_ds === 0) faltando.push('views D+1 (DS)');
    if (faltando.length) {
      problemas.push({ id: c.id, nome: st.name || 'Culto', data: c.data, faltando });
    }
    // Decisoes online nunca confirmadas (NULL · nem form nem manual tocaram).
    // Pode ser 0 legitimo · o lembrete so pede confirmacao da Integracao.
    if (c.decisoes_online === null || c.decisoes_online === undefined) {
      decisoesPendentes.push({
        id: c.id, nome: st.name || 'Culto', data: c.data,
        chat_detectou: c.online_decisoes_chat || 0,
      });
    }
  }

  return {
    ok: token.conectado && problemas.length === 0 && decisoesPendentes.length === 0,
    data_referencia: ontemStr,
    token,
    problemas,
    decisoesPendentes,
    verificados,
  };
}

module.exports = {
  liveMonitor, dsCollector, ddusCollector, subsCollector,
  traficoCollector, retencaoCurvaCollector, subStatusCollector,
  backfillCultoVideoIds, catchUpMetricas, backfillRange,
  verificarColetaOnline, findCultoAtual,
};
