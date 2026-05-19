const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { coletarTodos } = require('../services/kpiAutoCollector');
const painelCache = require('../services/painelCache');

router.use(authenticate);

// Helper: permite escrita em cultos/decisoes/batismos pra admin/diretor OU
// quem tem 'integracao' em kpi_areas (Alda Lorena, lider de Integracao).
// Auditoria de pre-liberacao identificou que essas rotas estavam so com
// authenticate · qualquer usuario logado escrevia. Agora restringido.
function authorizeIntegracao(req, res, next) {
  const u = req.user || {};
  if (['admin', 'diretor'].includes(u.role)) return next();
  const areas = (u.kpi_areas || []).map(a => String(a).toLowerCase());
  if (areas.includes('integracao')) return next();
  return res.status(403).json({
    error: 'Sem permissao · necessario ser admin, diretor ou lider de Integracao',
  });
}

// Helper: valida numero >= 0 (rejeita negativos antes do INSERT/UPDATE)
function nonNeg(v, fallback = 0) {
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

// ── Service Types (culto types) ───────────────────────────────────────────────
router.get('/service-types', async (req, res) => {
  const { data, error } = await supabase
    .from('vol_service_types')
    .select('id, name, color, recurrence_day, recurrence_time, has_online_stream')
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

router.post('/cultos', authorizeIntegracao, async (req, res) => {
  const {
    service_type_id, nome, data, hora,
    presencial_adulto, presencial_kids,
    decisoes_presenciais, decisoes_online, decisoes_kids,
    youtube_video_id, online_pico,
  } = req.body;
  if (!data || !hora || !nome) return res.status(400).json({ error: 'data, hora e nome são obrigatórios' });

  const { data: culto, error } = await supabase
    .from('cultos')
    .insert({
      service_type_id, nome, data, hora,
      presencial_adulto:    nonNeg(presencial_adulto),
      presencial_kids:      nonNeg(presencial_kids),
      decisoes_presenciais: nonNeg(decisoes_presenciais),
      decisoes_online:      nonNeg(decisoes_online),
      decisoes_kids:        nonNeg(decisoes_kids),
      youtube_video_id: youtube_video_id || null,
      online_pico: online_pico ? nonNeg(online_pico, null) : null,
      inserido_por: req.user.id,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(culto);
});

router.put('/cultos/:id', authorizeIntegracao, async (req, res) => {
  const allowed = [
    'presencial_adulto', 'presencial_kids',
    'decisoes_presenciais', 'decisoes_online', 'decisoes_kids',
    'youtube_video_id', 'online_pico', 'nome',
    'online_ds', 'online_ddus',
  ];
  const camposNumericos = [
    'presencial_adulto', 'presencial_kids',
    'decisoes_presenciais', 'decisoes_online', 'decisoes_kids',
    'online_pico', 'online_ds', 'online_ddus',
  ];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body)) {
    if (!allowed.includes(k)) continue;
    if (v === '' || v === null || v === undefined) { update[k] = null; continue; }
    if (camposNumericos.includes(k)) {
      const n = Number(v);
      if (Number.isNaN(n) || n < 0) {
        return res.status(400).json({ error: `Campo ${k} deve ser número >= 0 (recebido: ${v})` });
      }
      update[k] = n;
    } else {
      update[k] = v;
    }
  }
  const { data, error } = await supabase
    .from('cultos').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // KPIs auto-cultos/batismos sao recalculados via trigger SQL (migration
  // 20260514210000_kpis_trigger_realtime.sql · trg_kpi_recalcular_culto).
  // Aqui so limpa o cache do /painel pra forcar releitura do dado novo.
  painelCache.bust('');

  res.json(data);
});

router.delete('/cultos/:id', authorize('admin', 'diretor'), async (req, res) => {
  const { error } = await supabase.from('cultos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Decisões com dados das pessoas (cultos_decisoes_pessoas) ──────────────────
// 1 row por pessoa que decidiu no culto · vincula opcionalmente a mem_membros.

router.get('/cultos/:id/decisoes-pessoas', async (req, res) => {
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas')
    .select('id, culto_id, membro_id, nome, telefone, email, idade, data_nascimento, cpf, tipo_decisao, observacoes, status_followup, registrado_em, registrado_por, responsavel_nome, responsavel_telefone, responsavel_cpf')
    .eq('culto_id', req.params.id)
    .order('registrado_em', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Decisoes historicas que foram importadas (planilha, etc) e NAO tem
// culto vinculado. Vem de mem_trilha_valores etapa='conversao' filtrando
// por observacoes/origem. Alimenta a aba Pessoas em /integracao/decisoes
// pra incluir esse historico junto com as decisoes registradas em cultos.
router.get('/decisoes-pessoas/historico-importado', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    const desdeDias = Number(req.query.dias) || 365;
    const desde = new Date();
    desde.setDate(desde.getDate() - desdeDias);

    // Trilha de conversao importada · join com mem_membros pra dados
    const { data: trilhas, error } = await supabase
      .from('mem_trilha_valores')
      .select('membro_id, data_conclusao, observacoes, mem_membros(id, nome, telefone, cpf, data_nascimento, status, observacoes)')
      .eq('etapa', 'conversao')
      .eq('concluida', true)
      .ilike('observacoes', '%importacao%')
      .gte('data_conclusao', desde.toISOString().slice(0, 10))
      .order('data_conclusao', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const items = (trilhas || [])
      .filter(t => t.mem_membros)
      .map(t => ({
        id: t.membro_id,
        membro_id: t.membro_id,
        nome: t.mem_membros.nome,
        telefone: t.mem_membros.telefone,
        cpf: t.mem_membros.cpf,
        data_nascimento: t.mem_membros.data_nascimento,
        data_conversao: t.data_conclusao,
        status_membro: t.mem_membros.status,
        origem: 'importacao_planilha',
        observacoes_membro: t.mem_membros.observacoes,
      }));

    res.json({ total: items.length, items });
  } catch (e) {
    console.error('[kpis/decisoes-pessoas/historico-importado]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Decisoes com cadastro incompleto (sem CPF ou sem data_nascimento)
// Marcos: "futuramente quando tivermos esse convertido ja alinhado na
// jornada vamos conseguir buscar melhor esses dados em um censo posterior"
router.get('/decisoes-pessoas/incompletos', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas')
    .select(`
      id, culto_id, membro_id, nome, telefone, email, idade, data_nascimento, cpf,
      tipo_decisao, status_followup, registrado_em,
      culto:culto_id(id, data, service_type_id, service_type_name)
    `)
    .or('cpf.is.null,data_nascimento.is.null')
    .order('registrado_em', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[kpis/decisoes-pessoas/incompletos]', error.message);
    return res.status(500).json({ error: error.message });
  }
  const items = (data || []).map(p => ({
    ...p,
    falta_cpf:   !p.cpf,
    falta_nasc:  !p.data_nascimento,
  }));
  res.json({
    total: items.length,
    items,
  });
});

// Busca de membro/visitante por nome, CPF, email, telefone
// Usada pelo autocomplete no modal antes de cadastrar manual
router.get('/decisoes-pessoas/buscar-membro', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  const cpfLimpo = q.replace(/\D/g, '');
  const isCpf = cpfLimpo.length >= 5 && /^\d+$/.test(cpfLimpo);

  let query = supabase
    .from('mem_membros')
    .select('id, nome, email, telefone, cpf, data_nascimento, status')
    .limit(10);

  if (isCpf) {
    query = query.ilike('cpf', `${cpfLimpo}%`);
  } else {
    const escaped = q.replace(/[%_,()]/g, '\\$&');
    query = query.or(`nome.ilike.%${escaped}%,email.ilike.%${escaped}%,telefone.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[kpis/decisoes-pessoas buscar-membro]', error.message);
    return res.status(500).json({ error: error.message });
  }
  res.json(data || []);
});

router.post('/cultos/:id/decisoes-pessoas', authorizeIntegracao, async (req, res) => {
  const {
    nome, telefone, email, idade, data_nascimento, cpf,
    tipo_decisao, observacoes, membro_id,
    responsavel_nome, responsavel_telefone, responsavel_cpf,
  } = req.body || {};

  if (!nome || String(nome).trim().length < 2) {
    return res.status(400).json({ error: 'Nome obrigatorio (min 2 chars)' });
  }

  const tipo = ['presencial', 'online', 'kids'].includes(tipo_decisao) ? tipo_decisao : 'presencial';

  // Validacoes diferentes conforme tipo:
  // - presencial/online: telefone da pessoa eh obrigatorio (11 digitos)
  // - kids: nome da crianca + dados do responsavel (telefone responsavel
  //   obrigatorio · CPF responsavel opcional)
  let telLimpo = telefone ? String(telefone).replace(/\D/g, '') : '';
  let cpfLimpo = cpf ? String(cpf).replace(/\D/g, '') : null;
  let respTelLimpo = responsavel_telefone ? String(responsavel_telefone).replace(/\D/g, '') : '';
  let respCpfLimpo = responsavel_cpf ? String(responsavel_cpf).replace(/\D/g, '') : null;

  if (tipo === 'kids') {
    if (!responsavel_nome || String(responsavel_nome).trim().length < 2) {
      return res.status(400).json({ error: 'Nome do responsavel obrigatorio (min 2 chars) pra decisao Kids' });
    }
    if (respTelLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone do responsavel deve ter 11 digitos pra decisao Kids' });
    }
    if (respCpfLimpo && respCpfLimpo.length !== 11) {
      return res.status(400).json({ error: 'CPF do responsavel deve ter 11 digitos (ou deixe vazio)' });
    }
    // Crianca nao precisa de telefone proprio
    telLimpo = telLimpo || '';
    if (telLimpo && telLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone da crianca (se preenchido) deve ter 11 digitos' });
    }
  } else {
    // presencial / online
    if (telLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone deve ter 11 digitos (DDD + 9 + numero)' });
    }
    if (cpfLimpo && cpfLimpo.length !== 11) {
      return res.status(400).json({ error: 'CPF deve ter 11 digitos' });
    }
  }

  // Se nao veio membro_id explicito, trigger BEFORE INSERT resolve/cria
  // (trigger pula tipo='kids' · nao cria mem_membros pra crianca por LGPD)
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas')
    .insert({
      culto_id: req.params.id,
      membro_id: tipo === 'kids' ? null : (membro_id || null),
      nome: String(nome).trim(),
      telefone: telLimpo || null,
      email: email ? String(email).trim().toLowerCase() : null,
      idade: idade ? Number(idade) : null,
      data_nascimento: data_nascimento || null,
      cpf: cpfLimpo,
      tipo_decisao: tipo,
      observacoes: observacoes || null,
      responsavel_nome:     tipo === 'kids' ? String(responsavel_nome).trim() : null,
      responsavel_telefone: tipo === 'kids' ? respTelLimpo : null,
      responsavel_cpf:      tipo === 'kids' ? respCpfLimpo : null,
      registrado_por: req.user?.id || null,
    })
    .select()
    .single();
  if (error) {
    console.error('[kpis/decisoes-pessoas POST]', error.message);
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

router.put('/decisoes-pessoas/:id', authorizeIntegracao, async (req, res) => {
  const allowed = [
    'nome', 'telefone', 'email', 'idade', 'data_nascimento', 'cpf',
    'tipo_decisao', 'observacoes', 'status_followup', 'observacoes_followup',
    'responsavel_nome', 'responsavel_telefone', 'responsavel_cpf',
  ];
  const update = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    if ((k === 'cpf' || k === 'responsavel_cpf') && v) update[k] = String(v).replace(/\D/g, '');
    else if ((k === 'telefone' || k === 'responsavel_telefone') && v) update[k] = String(v).replace(/\D/g, '');
    else if (k === 'email' && v) update[k] = String(v).trim().toLowerCase();
    else if (k === 'idade') update[k] = v ? Number(v) : null;
    else if (k === 'data_nascimento') update[k] = v || null;
    else update[k] = v === '' ? null : v;
  }
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas').update(update)
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/decisoes-pessoas/:id', authorizeIntegracao, async (req, res) => {
  const { error } = await supabase.from('cultos_decisoes_pessoas').delete().eq('id', req.params.id);
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
    .eq('has_online_stream', true)
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

router.post('/batismos', authorizeIntegracao, async (req, res) => {
  const { cpf, nome, sobrenome, data_nascimento, telefone, email, origem = 'manual', observacoes, area_kpi } = req.body;
  if (!nome || !sobrenome) return res.status(400).json({ error: 'nome e sobrenome são obrigatórios' });
  const AREAS_OK = ['kids', 'sede', 'bridge', 'ami', 'online'];
  const areaKpiValida = AREAS_OK.includes(area_kpi) ? area_kpi : 'sede';

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
      area_kpi: areaKpiValida,
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

router.put('/batismos/:id', authorizeIntegracao, async (req, res) => {
  const { status, data_batismo, observacoes, area_kpi } = req.body;
  const update = { updated_at: new Date().toISOString() };
  if (status)       update.status = status;
  if (data_batismo) update.data_batismo = data_batismo;
  if (observacoes !== undefined) update.observacoes = observacoes;
  if (area_kpi && ['kids', 'sede', 'bridge', 'ami', 'online'].includes(area_kpi)) {
    update.area_kpi = area_kpi;
  }

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

  // Tipos de culto que têm transmissão online (filtro p/ ignorar Bridge etc.)
  const { data: onlineTypes } = await supabase
    .from('vol_service_types')
    .select('id')
    .eq('has_online_stream', true);
  const onlineTypeIds = new Set((onlineTypes || []).map(t => t.id));
  const isOnline = (c) => !c.service_type_id || onlineTypeIds.has(c.service_type_id);

  // Backfill-friendly: pega TODOS os cultos com video pendente ate a data limite,
  // nao so a data exata. Se o cron falhou em algum dia, na proxima execucao ele
  // ainda recupera o dado (best-effort com viewCount atual). O cron diario
  // limita o backlog a poucos itens.
  //
  // D+1 (online_ds): cultos com data <= ontem, com video, sem online_ds
  // D+7 (online_ddus): cultos com data <= 7 dias atras, com video, com online_ds, sem online_ddus
  const [{ data: cultosDSRaw }, { data: cultosDDUSRaw }] = await Promise.all([
    supabase.from('cultos').select('id, data, youtube_video_id, service_type_id').lte('data', ontemStr).not('youtube_video_id', 'is', null).is('online_ds', null).order('data', { ascending: false }).limit(50),
    supabase.from('cultos').select('id, data, youtube_video_id, online_ds, service_type_id').lte('data', seteDiasStr).not('youtube_video_id', 'is', null).not('online_ds', 'is', null).is('online_ddus', null).order('data', { ascending: false }).limit(50),
  ]);
  const cultosDS = (cultosDSRaw || []).filter(isOnline);
  const cultosDDUS = (cultosDDUSRaw || []).filter(isOnline);

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
  // (apenas para tipos que têm transmissão online — ignora Bridge etc.)
  const { data: cultosSemVideoRaw } = await supabase
    .from('cultos')
    .select('id, nome, data, service_type_id')
    .eq('data', ontemStr)
    .is('youtube_video_id', null);
  const cultosSemVideo = (cultosSemVideoRaw || []).filter(isOnline);

  for (const c of cultosSemVideo) {
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

  res.json({ synced: results.length, results, semVideo: cultosSemVideo.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// MANDALA CULTURA — 5 valores CBRio + Decisões (centro)
// ═══════════════════════════════════════════════════════════════════════════

function parseMes(input) {
  // Aceita 'YYYY-MM' ou 'YYYY-MM-DD'. Default: mês corrente.
  let y, m;
  if (input && /^\d{4}-\d{2}/.test(input)) {
    const [yy, mm] = input.split('-');
    y = Number(yy); m = Number(mm);
  } else {
    const now = new Date();
    y = now.getFullYear(); m = now.getMonth() + 1;
  }
  const inicio = new Date(Date.UTC(y, m - 1, 1));
  const fimExclusivo = new Date(Date.UTC(y, m, 1));
  const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Semanas "completas" · domingo (D) E quarta (D+3) ambos dentro do mes.
  // Regra do negocio: so contam semanas com ambos os dias de culto (dom+qua).
  // Ex.: abr/26 → 4 semanas (dom 5/12/19/26 + qua 8/15/22/29 todos em abril)
  //      jun/26 → 3 semanas (dom 28/jun + qua 1/jul cai fora)
  let semanasNoMes = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCDay() === 0) {
      const qua = new Date(date.getTime() + 3 * 86400000);
      if (qua.getUTCMonth() === m - 1) semanasNoMes++;
    }
  }
  semanasNoMes = Math.max(1, semanasNoMes);
  const mesISO = `${y}-${String(m).padStart(2, '0')}`;
  const inicioStr = inicio.toISOString().split('T')[0];
  const fimExclusivoStr = fimExclusivo.toISOString().split('T')[0];
  const fimInclusivoStr = new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0];
  return { y, m, mesISO, inicioStr, fimExclusivoStr, fimInclusivoStr, diasNoMes, semanasNoMes };
}

// GET /kpis/cultura?mes=YYYY-MM
router.get('/cultura', async (req, res) => {
  try {
    const { mesISO, inicioStr, fimInclusivoStr, diasNoMes, semanasNoMes } = parseMes(req.query.mes);

    // Hoje - 90d para Servir
    const noventaDias = new Date();
    noventaDias.setDate(noventaDias.getDate() - 90);
    const noventaDiasStr = noventaDias.toISOString();

    const settled = await Promise.allSettled([
      supabase.from('cultos')
        .select('presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online, online_ds')
        .gte('data', inicioStr).lte('data', fimInclusivoStr),
      // mem_grupo_membros (saiu_em IS NULL = ativo). Tabela pode não existir — tolerante.
      supabase.from('mem_grupo_membros').select('id', { count: 'exact', head: true }).is('saiu_em', null),
      supabase.from('pense_videos')
        .select('views')
        .eq('ativo', true)
        .gte('data_publicacao', inicioStr)
        .lte('data_publicacao', fimInclusivoStr),
      // RPC: count(distinct volunteer_id) direto no banco — evita trafegar milhares de linhas
      supabase.rpc('kpi_servir_comunidade', { _since: noventaDiasStr }),
      supabase.from('cultura_mensal').select('*').eq('mes', inicioStr).maybeSingle(),
    ]);

    const pick = (i) => (settled[i].status === 'fulfilled' ? settled[i].value : { data: null, error: settled[i].reason });
    const cultosRes = pick(0);
    const grupoMembrosRes = pick(1);
    const penseRes = pick(2);
    const servirRes = pick(3);
    const culturaMensalRes = pick(4);

    const cultos = cultosRes.data || [];
    const presencialTotal = cultos.reduce((s, c) => s + (c.presencial_adulto || 0) + (c.presencial_kids || 0), 0);
    const onlineDsTotal   = cultos.reduce((s, c) => s + (c.online_ds || 0), 0);
    const decisoesTotal   = cultos.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);

    const conectarPessoas = grupoMembrosRes.error ? null : (grupoMembrosRes.count || 0);

    const penseTotalViews = (penseRes.data || []).reduce((s, v) => s + (v.views || 0), 0);
    const investirDeus = penseRes.error ? null : Math.round(penseTotalViews / diasNoMes);

    // Voluntários ativos via RPC kpi_servir_comunidade(_since)
    const servirComunidade = servirRes.error ? null : (typeof servirRes.data === 'number' ? servirRes.data : (servirRes.data ?? null));

    const cm = culturaMensalRes.data;
    const generosidade = {
      dizimistas: cm?.qtd_dizimistas ?? null,
      ofertantes: cm?.qtd_ofertantes ?? null,
    };

    // Valores manuais de cultura_mensal tem prioridade sobre o agregado de
    // cultos · permite lancar mes consolidado sem cultos individuais.
    const presencialSemanal = cm?.freq_presencial_semanal != null
      ? cm.freq_presencial_semanal
      : Math.round(presencialTotal / semanasNoMes);
    const onlineSemanal = cm?.freq_online_semanal != null
      ? cm.freq_online_semanal
      : Math.round(onlineDsTotal / semanasNoMes);
    const decisoesMes = cm?.decisoes_total != null ? cm.decisoes_total : decisoesTotal;
    const conectarMes = cm?.freq_grupos_total != null ? cm.freq_grupos_total : conectarPessoas;

    res.json({
      mes: mesISO,
      semanas_no_mes: semanasNoMes,
      dias_no_mes: diasNoMes,
      seguir_jesus: {
        presencial: presencialSemanal,
        online: onlineSemanal,
        presencial_total: presencialTotal,
        online_total: onlineDsTotal,
        fonte: cm?.freq_presencial_semanal != null ? 'manual' : 'auto',
      },
      conectar_pessoas: conectarMes,
      investir_deus: investirDeus,
      investir_deus_total: penseTotalViews,
      servir_comunidade: servirComunidade,
      generosidade,
      decisoes: decisoesMes,
    });
  } catch (e) {
    console.error('[kpis/cultura] erro:', e);
    res.status(500).json({
      error: e?.message || 'Erro ao calcular cultura',
      stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined,
    });
  }
});

// POST /kpis/cultura/mensal — upsert (mes, qtd_dizimistas, qtd_ofertantes, observacoes)
router.post('/cultura/mensal', authorize('admin', 'diretor'), async (req, res) => {
  const {
    mes, qtd_dizimistas, qtd_ofertantes, observacoes,
    freq_presencial_semanal, freq_online_semanal, decisoes_total, freq_grupos_total,
  } = req.body || {};
  if (!mes || !/^\d{4}-\d{2}/.test(mes)) {
    return res.status(400).json({ error: 'Campo "mes" obrigatório no formato YYYY-MM' });
  }
  // Sempre dia 01
  const mesDate = `${mes.slice(0, 7)}-01`;
  const intOrNull = (v) => v == null || v === '' ? null : Number(v);
  const payload = {
    mes: mesDate,
    qtd_dizimistas: Number(qtd_dizimistas) || 0,
    qtd_ofertantes: Number(qtd_ofertantes) || 0,
    freq_presencial_semanal: intOrNull(freq_presencial_semanal),
    freq_online_semanal:     intOrNull(freq_online_semanal),
    decisoes_total:          intOrNull(decisoes_total),
    freq_grupos_total:       intOrNull(freq_grupos_total),
    observacoes: observacoes || null,
    updated_at: new Date().toISOString(),
    updated_by: req.user?.id || null,
  };
  const { data, error } = await supabase
    .from('cultura_mensal')
    .upsert(payload, { onConflict: 'mes' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/cultura/mensal', async (req, res) => {
  const { data, error } = await supabase
    .from('cultura_mensal').select('*').order('mes', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// PENSE — CRUD vídeos
router.get('/cultura/pense', async (req, res) => {
  const { data, error } = await supabase
    .from('pense_videos').select('*').order('data_publicacao', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/cultura/pense', authorize('admin', 'diretor'), async (req, res) => {
  const { video_id, titulo, data_publicacao, views, ativo } = req.body || {};
  if (!video_id || !data_publicacao) {
    return res.status(400).json({ error: 'video_id e data_publicacao são obrigatórios' });
  }
  const { data, error } = await supabase
    .from('pense_videos')
    .upsert({
      video_id,
      titulo: titulo || null,
      data_publicacao,
      views: Number(views) || 0,
      ativo: ativo !== false,
      created_by: req.user?.id || null,
    }, { onConflict: 'video_id' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/cultura/pense/:id', authorize('admin', 'diretor'), async (req, res) => {
  const { error } = await supabase.from('pense_videos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /kpis/cultura/pense/sync — atualiza views via YouTube API
router.post('/cultura/pense/sync', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isVercelCron && authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YOUTUBE_API_KEY não configurada' });

  const { data: videos, error } = await supabase
    .from('pense_videos').select('id, video_id').eq('ativo', true);
  if (error) return res.status(500).json({ error: error.message });

  // YouTube API aceita até 50 IDs por request
  const ids = (videos || []).map(v => v.video_id);
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  const results = [];
  for (const chunk of chunks) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${chunk.join(',')}&key=${apiKey}`;
      const r = await fetch(url);
      const json = await r.json();
      for (const item of (json.items || [])) {
        const views = parseInt(item.statistics?.viewCount || '0', 10);
        await supabase.from('pense_videos')
          .update({ views, views_atualizado_em: new Date().toISOString() })
          .eq('video_id', item.id);
        results.push({ video_id: item.id, views });
      }
    } catch (e) {
      results.push({ error: e.message });
    }
  }
  res.json({ synced: results.length, results });
});

module.exports = router;
