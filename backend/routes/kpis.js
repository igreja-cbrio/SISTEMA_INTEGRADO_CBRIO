const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

router.use(authenticate);

// ── Service Types (culto types) ───────────────────────────────────────────────
router.get('/service-types', async (req, res) => {
  const { data, error } = await supabase
    .from('vol_service_types')
    .select('id, name, color, recurrence_day, recurrence_time')
    .eq('is_active', true)
    .order('recurrence_day')
    .order('recurrence_time');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Cultos ────────────────────────────────────────────────────────────────────
router.get('/cultos', async (req, res) => {
  const { limit = 100, offset = 0, service_type_id, data_inicio, data_fim } = req.query;
  let query = supabase
    .from('vw_culto_stats')
    .select('*')
    .order('data', { ascending: false })
    .order('hora', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);
  if (service_type_id) query = query.eq('service_type_id', service_type_id);
  if (data_inicio)     query = query.gte('data', data_inicio);
  if (data_fim)        query = query.lte('data', data_fim);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/cultos', async (req, res) => {
  const {
    service_type_id, nome, data, hora,
    presencial_adulto, presencial_kids,
    decisoes_presenciais, decisoes_online,
    youtube_video_id, online_pico,
  } = req.body;
  if (!data || !hora || !nome) return res.status(400).json({ error: 'data, hora e nome são obrigatórios' });

  const { data: culto, error } = await supabase
    .from('cultos')
    .insert({
      service_type_id, nome, data, hora,
      presencial_adulto: Number(presencial_adulto) || 0,
      presencial_kids:   Number(presencial_kids)   || 0,
      decisoes_presenciais: Number(decisoes_presenciais) || 0,
      decisoes_online:      Number(decisoes_online)      || 0,
      youtube_video_id: youtube_video_id || null,
      online_pico: online_pico ? Number(online_pico) : null,
      inserido_por: req.user.id,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(culto);
});

router.put('/cultos/:id', async (req, res) => {
  const allowed = [
    'presencial_adulto', 'presencial_kids',
    'decisoes_presenciais', 'decisoes_online',
    'youtube_video_id', 'online_pico', 'nome',
    'online_ds', 'online_ddus',
  ];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body)) {
    if (allowed.includes(k)) update[k] = v === '' ? null : v;
  }
  const { data, error } = await supabase
    .from('cultos').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/cultos/:id', authorize('admin', 'diretor'), async (req, res) => {
  const { error } = await supabase.from('cultos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Auto-criação semanal de cultos ────────────────────────────────────────────
// POST /kpis/cultos/auto-create[?weeks=N]
// Cria cultos da semana corrente a partir de vol_service_types (recurrence_day, recurrence_time).
// Idempotente: ON CONFLICT DO NOTHING via índice único (service_type_id, data, hora).
// weeks=N: backfill das últimas N semanas (default 1 = só semana corrente).
router.post('/cultos/auto-create', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isVercelCron && authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const weeks = Math.max(1, Math.min(Number(req.query.weeks) || 1, 12));

  const { data: types, error: typesErr } = await supabase
    .from('vol_service_types')
    .select('id, name, recurrence_day, recurrence_time')
    .eq('is_active', true)
    .not('recurrence_day', 'is', null)
    .not('recurrence_time', 'is', null);
  if (typesErr) return res.status(500).json({ error: typesErr.message });

  // Calcula a data do "weekStart" (domingo) para cada semana no range [hoje - (weeks-1) semanas, hoje]
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const sundayThisWeek = new Date(today);
  sundayThisWeek.setDate(today.getDate() - today.getDay()); // dow=0 → 0 dias

  const weekStarts = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(sundayThisWeek);
    ws.setDate(sundayThisWeek.getDate() - i * 7);
    weekStarts.push(ws);
  }

  const created = [];
  const skipped = [];

  for (const ws of weekStarts) {
    for (const t of types || []) {
      const dayDate = new Date(ws);
      dayDate.setDate(ws.getDate() + Number(t.recurrence_day || 0));
      const dataStr = dayDate.toISOString().split('T')[0];
      const horaStr = String(t.recurrence_time).slice(0, 8);
      const dFmt = dayDate.toLocaleDateString('pt-BR');
      const nome = `${t.name} — ${dFmt}`;

      // Idempotência: verifica antes de inserir (não dependemos do índice único existir)
      const { data: existente } = await supabase
        .from('cultos')
        .select('id')
        .eq('service_type_id', t.id)
        .eq('data', dataStr)
        .eq('hora', horaStr)
        .maybeSingle();

      if (existente) { skipped.push({ tipo: t.name, data: dataStr, hora: horaStr }); continue; }

      const { data: novo, error: insErr } = await supabase
        .from('cultos')
        .insert({
          service_type_id: t.id,
          nome,
          data: dataStr,
          hora: horaStr,
          presencial_adulto: 0,
          presencial_kids: 0,
          decisoes_presenciais: 0,
          decisoes_online: 0,
          inserido_por: req.user?.id || null,
        })
        .select('id, nome, data, hora')
        .single();
      if (insErr) { skipped.push({ tipo: t.name, data: dataStr, hora: horaStr, error: insErr.message }); continue; }
      created.push(novo);
    }
  }

  res.json({ weeks, created: created.length, skipped: skipped.length, items: created, skippedItems: skipped });
});

// ── Batismos ──────────────────────────────────────────────────────────────────
router.get('/batismos', async (req, res) => {
  const { status } = req.query;
  let query = supabase
    .from('batismo_inscricoes')
    .select('*, membro:membro_id(id, nome, foto_url, cpf)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/batismos', async (req, res) => {
  const { cpf, nome, sobrenome, data_nascimento, telefone, email, origem = 'manual', observacoes } = req.body;
  if (!nome || !sobrenome) return res.status(400).json({ error: 'nome e sobrenome são obrigatórios' });

  let membro_id = null;
  const cpfClean = cpf ? cpf.replace(/\D/g, '') : null;

  if (cpfClean && cpfClean.length === 11) {
    // Busca membro existente
    const { data: membro } = await supabase
      .from('mem_membros')
      .select('id')
      .eq('cpf', cpfClean)
      .maybeSingle();

    if (membro) {
      membro_id = membro.id;
    } else {
      // Cria novo membro automaticamente
      const { data: newMembro } = await supabase
        .from('mem_membros')
        .insert({
          nome: `${nome} ${sobrenome}`.trim(),
          cpf: cpfClean,
          data_nascimento: data_nascimento || null,
          telefone: telefone || null,
          email: email || null,
          status: 'visitante',
        })
        .select('id')
        .single();
      if (newMembro) membro_id = newMembro.id;
    }
  }

  const { data: inscricao, error } = await supabase
    .from('batismo_inscricoes')
    .insert({
      membro_id, nome, sobrenome,
      data_nascimento: data_nascimento || null,
      cpf: cpfClean,
      telefone: telefone || null,
      email: email || null,
      origem,
      observacoes: observacoes || null,
      inscrito_por: req.user?.id || null,
    })
    .select('*, membro:membro_id(id, nome, foto_url)')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  notificar({
    modulo: 'membresia',
    tipo: 'novo_batismo',
    titulo: `Nova inscrição de batismo`,
    mensagem: `${nome} ${sobrenome} se inscreveu para batismo${origem === 'totem' ? ' pelo totem' : ''}.`,
    link: '/kpis',
    severidade: 'info',
    chaveDedup: `batismo_${inscricao.id}`,
  }).catch(() => {});

  res.json(inscricao);
});

router.put('/batismos/:id', async (req, res) => {
  const { status, data_batismo, observacoes } = req.body;
  const update = { updated_at: new Date().toISOString() };
  if (status)       update.status = status;
  if (data_batismo) update.data_batismo = data_batismo;
  if (observacoes !== undefined) update.observacoes = observacoes;

  const { data, error } = await supabase
    .from('batismo_inscricoes')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Dashboard (agregado) ──────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const semanas = Number(req.query.semanas) || 12;
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - semanas * 7);
  const dataInicioStr = dataInicio.toISOString().split('T')[0];

  const [
    { data: cultos },
    { count: batPendentes },
    { count: batRealizados },
    { count: totalGrupos },
    { count: volAtivos },
    { data: metas },
  ] = await Promise.all([
    supabase.from('vw_culto_stats').select('*').gte('data', dataInicioStr).order('data', { ascending: true }),
    supabase.from('batismo_inscricoes').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
    supabase.from('batismo_inscricoes').select('*', { count: 'exact', head: true }).eq('status', 'realizado'),
    supabase.from('mem_grupos').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('mem_checkins').select('membro_id', { count: 'exact', head: true })
      .gte('data', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
    supabase.from('kpi_metas').select('*').eq('ativo', true).order('area'),
  ]);

  res.json({
    cultos: cultos || [],
    batismos: { pendentes: batPendentes || 0, realizados: batRealizados || 0 },
    voluntarios_ativos: volAtivos || 0,
    total_grupos: totalGrupos || 0,
    metas: metas || [],
  });
});

// ── Metas ─────────────────────────────────────────────────────────────────────
router.get('/metas', async (req, res) => {
  const { data, error } = await supabase
    .from('kpi_metas').select('*').eq('ativo', true).order('area');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/metas/:id', authorize('admin', 'diretor'), async (req, res) => {
  const { meta_6m, meta_12m, meta_24m, valor_base } = req.body;
  const { data, error } = await supabase
    .from('kpi_metas')
    .update({ meta_6m, meta_12m, meta_24m, valor_base })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── YouTube status (verifica se a API key está configurada e quando rodou a última sync) ──
router.get('/youtube/status', async (req, res) => {
  const apiKeyConfigured = !!process.env.YOUTUBE_API_KEY;
  const { data: ultimo } = await supabase
    .from('cultos')
    .select('ds_coletado_em, ddus_coletado_em')
    .or('ds_coletado_em.not.is.null,ddus_coletado_em.not.is.null')
    .order('ds_coletado_em', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const lastSync = ultimo
    ? (ultimo.ds_coletado_em && ultimo.ddus_coletado_em
        ? (ultimo.ds_coletado_em > ultimo.ddus_coletado_em ? ultimo.ds_coletado_em : ultimo.ddus_coletado_em)
        : (ultimo.ds_coletado_em || ultimo.ddus_coletado_em))
    : null;
  res.json({ apiKeyConfigured, lastSync });
});

// ── YouTube sync (chamado pelo cron Vercel) ───────────────────────────────────
router.post('/youtube/sync', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isVercelCron && authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YOUTUBE_API_KEY não configurada' });

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemStr = ontem.toISOString().split('T')[0];

  const seteDias = new Date();
  seteDias.setDate(seteDias.getDate() - 7);
  const seteDiasStr = seteDias.toISOString().split('T')[0];

  const [{ data: cultosDS }, { data: cultosDDUS }] = await Promise.all([
    supabase.from('cultos').select('id, youtube_video_id').eq('data', ontemStr).not('youtube_video_id', 'is', null).is('online_ds', null),
    supabase.from('cultos').select('id, youtube_video_id, online_ds').eq('data', seteDiasStr).not('youtube_video_id', 'is', null).not('online_ds', 'is', null).is('online_ddus', null),
  ]);

  const fetchStats = async (videoId) => {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`;
    const r = await fetch(url);
    const json = await r.json();
    return json.items?.[0]?.statistics;
  };

  const results = [];

  for (const culto of (cultosDS || [])) {
    try {
      const stats = await fetchStats(culto.youtube_video_id);
      if (stats?.viewCount) {
        await supabase.from('cultos').update({ online_ds: parseInt(stats.viewCount), ds_coletado_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', culto.id);
        results.push({ id: culto.id, tipo: 'DS', views: stats.viewCount });
      }
    } catch (e) {
      results.push({ id: culto.id, tipo: 'DS', error: e.message });
    }
  }

  for (const culto of (cultosDDUS || [])) {
    try {
      const stats = await fetchStats(culto.youtube_video_id);
      if (stats?.viewCount) {
        const ddus = Math.max(0, parseInt(stats.viewCount) - (culto.online_ds || 0));
        await supabase.from('cultos').update({ online_ddus: ddus, ddus_coletado_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', culto.id);
        results.push({ id: culto.id, tipo: 'DDUS', ddus });
      }
    } catch (e) {
      results.push({ id: culto.id, tipo: 'DDUS', error: e.message });
    }
  }

  // Cultos do dia anterior SEM youtube_video_id → notifica para vincular
  const { data: cultosSemVideo } = await supabase
    .from('cultos')
    .select('id, nome, data')
    .eq('data', ontemStr)
    .is('youtube_video_id', null);

  for (const c of (cultosSemVideo || [])) {
    try {
      const fmt = new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR');
      await notificar({
        modulo: 'kpis',
        tipo: 'culto_sem_video',
        titulo: 'Culto sem vídeo do YouTube',
        mensagem: `"${c.nome}" (${fmt}) não tem ID de vídeo vinculado. Sem isso, D+1 não será coletado.`,
        link: '/kpis',
        severidade: 'aviso',
        chaveDedup: `culto_sem_video_sync_${c.id}`,
      });
      results.push({ id: c.id, tipo: 'ALERT', msg: 'sem video_id' });
    } catch (e) {
      results.push({ id: c.id, tipo: 'ALERT', error: e.message });
    }
  }

  res.json({ synced: results.length, results, semVideo: cultosSemVideo?.length || 0 });
});

module.exports = router;
