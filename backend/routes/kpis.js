const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticate, authorize, getEffectiveLevel } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { coletarTodos } = require('../services/kpiAutoCollector');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { reconciliarCpfTardio, propagarCpfConvertido } = require('../services/cpfReconciliar');
const painelCache = require('../services/painelCache');
const { isAuthorizedCron } = require('../utils/cronAuth');

// Upload em memória da selfie de referência do check-in de batismo (quiosque).
const uploadFotoRef = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Formato inválido (use JPG, PNG ou WebP)'));
  },
});

router.use(authenticate);

// Helper: permite escrita em cultos/decisoes/batismos pra admin/diretor OU
// quem tem 'integração' em kpi_areas (Lorena, líder de Integração).
// Auditoria de pre-liberacao identificou que essas rotas estavam so com
// authenticate · qualquer usuário logado escrevia. Agora restringido.
function authorizeIntegracao(req, res, next) {
  const u = req.user || {};
  if (['admin', 'diretor'].includes(u.role)) return next();
  const areas = (u.kpi_areas || []).map(a => String(a).toLowerCase());
  if (areas.includes('integracao')) return next();
  // Honra a matriz granular (cargo × módulo): nível >=2 em integracao = lançar
  // dado bruto. Ex.: supervisor-jornada (Marcelo) tem nível 3 pela matriz sem
  // estar em kpi_areas — sem isto, o guard legado o bloqueava (403).
  if ((getEffectiveLevel(req, 'integracao') || 0) >= 2) return next();
  return res.status(403).json({
    error: 'Sem permissão · necessário ser admin, diretor ou líder de Integração',
  });
}

// Helper: escrita em BATISMO · aceita quem tem Integração (admin/diretor, área
// integracao, ou nível >=2 na matriz de integracao) OU o módulo dedicado
// `batismo` >=2 (cargo responsavel-batismo · acesso isolado a batismo).
// Guard SEPARADO de propósito: quem só tem `batismo` NÃO pode escrever em
// cultos/decisões (que seguem em authorizeIntegracao). Fail-closed.
function authorizeBatismo(req, res, next) {
  const u = req.user || {};
  if (['admin', 'diretor'].includes(u.role)) return next();
  const areas = (u.kpi_areas || []).map(a => String(a).toLowerCase());
  if (areas.includes('integracao')) return next();
  if ((getEffectiveLevel(req, 'integracao') || 0) >= 2) return next();
  if ((getEffectiveLevel(req, 'batismo') || 0) >= 2) return next();
  // Conta de quiosque do lounge: o check-in de batismo (etiqueta QR + selfie)
  // é operado no próprio Totem Membro.
  if ((getEffectiveLevel(req, 'totem-membro') || 0) >= 2) return next();
  return res.status(403).json({
    error: 'Sem permissão · necessário acesso a Batismo ou Integração',
  });
}

// Helper: valida número >= 0 (rejeita negativos antes do INSERT/UPDATE)
function nonNeg(v, fallback = 0) {
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

// Helper: data de hoje em America/Sao_Paulo (YYYY-MM-DD · en-CA = ISO).
function hojeSP() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
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
    youtube_video_id, online_pico, observacoes,
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
      observacoes: observacoes ? String(observacoes).trim() : null,
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
    'voluntarios_escalados', 'voluntarios_checkin',
    'observacoes',
    // Flags de lançamento (boolean) · marcam seção preenchida incl. 0 explícito.
    'frequencia_lancada', 'decisoes_lancadas',
  ];
  const camposNumericos = [
    'presencial_adulto', 'presencial_kids',
    'decisoes_presenciais', 'decisoes_online', 'decisoes_kids',
    'online_pico', 'online_ds', 'online_ddus',
    'voluntarios_escalados', 'voluntarios_checkin',
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

  // KPIs auto-cultos/batismos são recalculados via trigger SQL (migration
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

// Conta automática de voluntários escalados/checkin · usada no modal pra
// mostrar valor sugerido. Quando user salva nas colunas manuais, sobrescreve.
router.get('/cultos/:id/voluntarios', async (req, res) => {
  const { data, error } = await supabase
    .from('vw_culto_voluntarios')
    .select('escalados_manual, checkin_manual, escalados_auto, checkin_auto, escalados, checkin')
    .eq('culto_id', req.params.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || { escalados_auto: 0, checkin_auto: 0, escalados_manual: null, checkin_manual: null });
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

// Decisões históricas que foram importadas (planilha, etc) e NÃO tem
// culto vinculado. Vem de mem_trilha_valores etapa='conversao' filtrando
// por observacoes/origem. Alimenta a aba Pessoas em /integracao/decisoes
// pra incluir esse histórico junto com as decisões registradas em cultos.
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

// Decisões com cadastro incompleto (sem CPF ou sem data_nascimento)
// Marcos: "futuramente quando tivermos esse convertido já alinhado na
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
  const escaped = q.replace(/[%_,()]/g, '\\$&');

  // 1) Membros cadastrados
  let memQuery = supabase
    .from('mem_membros')
    .select('id, nome, email, telefone, cpf, data_nascimento, status')
    .is('deleted_at', null)
    .limit(10);

  // 2) Pessoas da lista do WiFi (portal · podem ainda não ser membros)
  let wifiQuery = supabase
    .from('wifi_visitantes')
    .select('nome, email, telefone, cpf, cpf_norm, tel_norm, membro_id, data_acesso')
    .is('deleted_at', null)
    .order('data_acesso', { ascending: false, nullsFirst: false })
    .limit(30);

  if (isCpf) {
    memQuery = memQuery.ilike('cpf', `${cpfLimpo}%`);
    wifiQuery = wifiQuery.ilike('cpf_norm', `${cpfLimpo}%`);
  } else {
    memQuery = memQuery.or(`nome.ilike.%${escaped}%,email.ilike.%${escaped}%,telefone.ilike.%${escaped}%`);
    wifiQuery = wifiQuery.or(`nome.ilike.%${escaped}%,email.ilike.%${escaped}%,telefone.ilike.%${escaped}%`);
  }

  const [memRes, wifiRes] = await Promise.all([memQuery, wifiQuery]);

  if (memRes.error) {
    console.error('[kpis/decisoes-pessoas buscar-membro]', memRes.error.message);
    return res.status(500).json({ error: memRes.error.message });
  }
  if (wifiRes.error) {
    // WiFi é complementar · não derruba a busca de membros
    console.error('[kpis/decisoes-pessoas buscar-membro wifi]', wifiRes.error.message);
  }

  const out = (memRes.data || []).map(m => ({ ...m, membro_id: m.id, origem: 'membro' }));
  const idsMembro = new Set(out.map(m => m.id));
  const vistosWifi = new Set();

  for (const w of (wifiRes.data || [])) {
    // se já está vinculada a um membro que veio na busca de membros, evita duplicar
    if (w.membro_id && idsMembro.has(w.membro_id)) continue;
    const chave = w.cpf_norm || w.tel_norm || (w.nome || '').toLowerCase().trim();
    if (!chave || vistosWifi.has(chave)) continue;
    vistosWifi.add(chave);
    out.push({
      id: w.membro_id || `wifi:${chave}`,
      membro_id: w.membro_id || null,
      nome: w.nome,
      email: w.email,
      telefone: w.telefone,
      cpf: w.cpf_norm || (w.cpf || '').replace(/\D/g, '') || null,
      data_nascimento: null,
      status: w.membro_id ? null : 'visitante',
      origem: 'wifi',
    });
    if (out.length >= 25) break;
  }

  res.json(out);
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
  // - presencial/online: telefone da pessoa eh obrigatório (11 digitos)
  // - kids: nome da criança + dados do responsável (telefone responsável
  //   obrigatório · CPF responsável opcional)
  let telLimpo = telefone ? String(telefone).replace(/\D/g, '') : '';
  let cpfLimpo = cpf ? String(cpf).replace(/\D/g, '') : null;
  let respTelLimpo = responsavel_telefone ? String(responsavel_telefone).replace(/\D/g, '') : '';
  let respCpfLimpo = responsavel_cpf ? String(responsavel_cpf).replace(/\D/g, '') : null;

  if (tipo === 'kids') {
    if (!responsavel_nome || String(responsavel_nome).trim().length < 2) {
      return res.status(400).json({ error: 'Nome do responsável obrigatório (min 2 chars) pra decisão Kids' });
    }
    if (respTelLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone do responsável deve ter 11 digitos pra decisão Kids' });
    }
    if (respCpfLimpo && respCpfLimpo.length !== 11) {
      return res.status(400).json({ error: 'CPF do responsável deve ter 11 digitos (ou deixe vazio)' });
    }
    // Criança não precisa de telefone próprio
    telLimpo = telLimpo || '';
    if (telLimpo && telLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone da criança (se preenchido) deve ter 11 digitos' });
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

  // Se não veio membro_id explicito, trigger BEFORE INSERT resolve/cria
  // (trigger pula tipo='kids' · não cria mem_membros pra criança por LGPD)
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

  // Avisa o time de Cuidados (Marcelo + Wesley) pra entrar em contato com quem
  // tomou a decisão. Fire-and-forget · não bloqueia a resposta. Kids fica fora
  // (criança não entra na jornada/NSM). Dedup por decisão (não duplica em edição).
  if (tipo !== 'kids') {
    (async () => {
      try {
        const { data: equipe } = await supabase.from('profiles')
          .select('id').in('email', ['marcelo.soares@cbrio.org', 'wesley.ramos@cbrio.org']);
        const ids = (equipe || []).map(p => p.id).filter(Boolean);
        if (!ids.length) return;
        const nomePessoa = String(nome).trim();
        await notificar({
          modulo: 'cuidados',
          tipo: 'nova_aceitacao',
          titulo: `🙌 Nova decisão: ${nomePessoa}`,
          mensagem: `${nomePessoa} tomou uma decisão${telLimpo ? ` · ${telLimpo}` : ''}${tipo === 'online' ? ' (online)' : ''}. Entre em contato pra acompanhar nos próximos passos.`,
          link: '/ministerial/cuidados?tab=convertidos',
          severidade: 'info',
          chaveDedup: `nova_aceitacao_${data.id}`,
          targetIds: ids,
        });
      } catch (e) {
        console.error('[kpis/decisoes-pessoas] notif cuidados:', e.message);
      }
    })();
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

  // Reconciliação de CPF tardio ("censo posterior" · auditoria CPF 2026-07-16):
  // o trigger resolve_membro é BEFORE INSERT — editar a decisão preenchendo o
  // CPF depois NÃO atualizava o membro-stub criado sem CPF. Agora o CPF que
  // chega pela edição é consolidado no membro vinculado (ou vira pendência de
  // identidade se conflitar) e espelhado no convertido. Fire-and-forget.
  if (update.cpf && data?.membro_id && data.tipo_decisao !== 'kids') {
    (async () => {
      try {
        await reconciliarCpfTardio({
          membroId: data.membro_id, cpf: update.cpf,
          origem: 'decisao_edicao', origemId: data.id,
        });
        await propagarCpfConvertido({ membroId: data.membro_id });
      } catch (e) {
        console.error('[kpis/decisoes-pessoas PUT] reconciliar cpf:', e.message);
      }
    })();
  }
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
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) {
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

  const inscricoes = data || [];

  // Enriquece com a data de conversão (etapa 'conversao' da jornada do membro,
  // em mem_trilha_valores.data_conclusao — mesma fonte do "Seguir a Jesus") e o
  // tempo em dias até o batismo. Busca em lote pelos membros vinculados.
  const membroIds = [...new Set(inscricoes.map(b => b.membro_id).filter(Boolean))];
  const conversaoPorMembro = {};
  if (membroIds.length) {
    const { data: trilhas } = await supabase
      .from('mem_trilha_valores')
      .select('membro_id, data_conclusao')
      .eq('etapa', 'conversao')
      .eq('concluida', true)
      .in('membro_id', membroIds);
    (trilhas || []).forEach(t => {
      if (!t.data_conclusao) return;
      // Conserva a conversão mais antiga por membro (defensivo contra duplicatas)
      const atual = conversaoPorMembro[t.membro_id];
      if (!atual || t.data_conclusao < atual) conversaoPorMembro[t.membro_id] = t.data_conclusao;
    });
  }

  const DIA_MS = 86400000;
  const enriched = inscricoes.map(b => {
    // NÃO vaza o token de acesso (codigo_acesso) nem o código de conferência:
    // esta rota é só `authenticate` (não gated a integração) e o codigo_acesso é
    // credencial das fotos. Quem precisa vê via fluxos gated (check-in / recuperação).
    const { codigo_acesso, codigo_conferencia, ...b2 } = b;
    b = b2;
    const data_conversao = b.membro_id ? (conversaoPorMembro[b.membro_id] || null) : null;
    let dias_conversao_batismo = null;
    if (data_conversao && b.data_batismo) {
      dias_conversao_batismo = Math.round(
        (new Date(`${b.data_batismo}T12:00:00`).getTime()
          - new Date(`${data_conversao}T12:00:00`).getTime()) / DIA_MS,
      );
    }
    return { ...b, data_conversao, dias_conversao_batismo };
  });

  res.json(enriched);
});

// ── Cobertura de batismo dos convertidos ────────────────────────────────────
// Trilho UNIVERSAL: todo convertido deve ser chamado pro batismo. A Integracao
// acompanha aqui quem ja foi batizado, quem esta inscrito e quem ainda falta —
// independente do acompanhamento pastoral (Cuidados). Cruza cui_convertidos com
// batismo_inscricoes por membro_id, CPF ou nome. Paginado (cap de 1000 do PostgREST).
router.get('/batismos/cobertura-convertidos', async (req, res) => {
  try {
    const onlyDigits = (v) => String(v || '').replace(/\D/g, '');
    const fetchAll = async (table, columns) => {
      const out = []; let from = 0; const page = 1000;
      while (true) {
        const { data, error } = await supabase.from(table).select(columns)
          .is('deleted_at', null).range(from, from + page - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) break;
        from += page;
      }
      return out;
    };

    const [convertidos, inscricoes] = await Promise.all([
      fetchAll('cui_convertidos', 'id, nome, telefone, cpf, membro_id, data_culto'),
      fetchAll('batismo_inscricoes', 'status, membro_id, cpf, nome, data_batismo'),
    ]);

    // Indices de batismo · realizado tem prioridade sobre inscrito
    const byMembro = new Map(), byCpf = new Map(), byNome = new Map();
    const put = (map, key, realizado) => {
      if (!key) return;
      const cur = map.get(key);
      const rank = realizado ? 2 : 1;
      if (!cur || rank > cur.rank) map.set(key, { realizado });
    };
    for (const b of inscricoes) {
      const realizado = b.status === 'realizado';
      put(byMembro, b.membro_id, realizado);
      put(byCpf, onlyDigits(b.cpf).length === 11 ? onlyDigits(b.cpf) : null, realizado);
      put(byNome, String(b.nome || '').trim().toLowerCase() || null, realizado);
    }
    const matchOf = (c) => {
      const cands = [
        c.membro_id ? byMembro.get(c.membro_id) : null,
        onlyDigits(c.cpf).length === 11 ? byCpf.get(onlyDigits(c.cpf)) : null,
        byNome.get(String(c.nome || '').trim().toLowerCase()),
      ].filter(Boolean);
      if (!cands.length) return null;
      return { realizado: cands.some(m => m.realizado) };
    };

    let batizados = 0, inscritos = 0, naoInscritos = 0;
    const pendentes = [];
    for (const c of convertidos) {
      const m = matchOf(c);
      if (m && m.realizado) { batizados++; continue; }
      if (m) inscritos++; else naoInscritos++;
      pendentes.push({
        id: c.id, nome: c.nome, telefone: c.telefone, membro_id: c.membro_id,
        data_culto: c.data_culto, status_batismo: m ? 'inscrito' : 'nao_inscrito',
      });
    }
    pendentes.sort((a, b) => String(b.data_culto || '').localeCompare(String(a.data_culto || '')));

    res.json({
      total: convertidos.length,
      batizados, inscritos, nao_inscritos: naoInscritos,
      pct_batizados: convertidos.length ? Math.round((batizados / convertidos.length) * 100) : 0,
      pendentes,
    });
  } catch (e) {
    console.error('[kpis/batismos/cobertura-convertidos]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Horários de batismo (abrir/fechar + limite) ──────────────────────────────
// Próximo 4º domingo (mesma lógica de publicBatismo) · base da contagem de vagas.
function _proximo4Domingo() {
  const q = (y, m) => { const p = new Date(y, m, 1); const off = (7 - p.getDay()) % 7; return new Date(y, m, 1 + off + 21); };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  let y = hoje.getFullYear(), m = hoje.getMonth();
  let d = q(y, m);
  if (d < hoje) { m += 1; if (m > 11) { y += 1; m = 0; } d = q(y, m); }
  return d.toISOString().slice(0, 10);
}

// GET /api/kpis/batismos/horarios — todos os horários (incl. fechados) + ocupação
router.get('/batismos/horarios', authorizeBatismo, async (_req, res) => {
  try {
    const dataBatismo = _proximo4Domingo();
    const { data: horarios, error } = await supabase
      .from('batismo_horarios').select('*').is('deleted_at', null).order('ordem');
    if (error) throw error;
    const { data: insc } = await supabase
      .from('batismo_inscricoes').select('horario_culto')
      .eq('data_batismo', dataBatismo).is('deleted_at', null)
      .not('status', 'in', '(cancelado,rejeitado)');
    const ocup = {};
    (insc || []).forEach(i => { if (i.horario_culto) ocup[i.horario_culto] = (ocup[i.horario_culto] || 0) + 1; });
    res.json({
      data_batismo: dataBatismo,
      horarios: (horarios || []).map(h => ({ ...h, inscritos: ocup[h.horario] || 0 })),
    });
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao listar horários' }); }
});

// POST /api/kpis/batismos/horarios — adiciona um horário
router.post('/batismos/horarios', authorizeBatismo, async (req, res) => {
  try {
    const horario = String(req.body?.horario || '').trim().slice(0, 40);
    if (!horario) return res.status(400).json({ error: 'horário é obrigatório' });
    const label = String(req.body?.label || horario).trim().slice(0, 120);
    const limite = req.body?.limite != null && req.body.limite !== '' ? parseInt(req.body.limite, 10) : null;
    const aberto = req.body?.aberto !== false;
    const ordem = Number.isFinite(+req.body?.ordem) ? +req.body.ordem : 99;
    const { data, error } = await supabase.from('batismo_horarios')
      .insert({ horario, label, limite: Number.isFinite(limite) ? limite : null, aberto, ordem })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao criar horário' }); }
});

// PATCH /api/kpis/batismos/horarios/:id — abrir/fechar, limite, label
router.patch('/batismos/horarios/:id', authorizeBatismo, async (req, res) => {
  try {
    const upd = { updated_at: new Date().toISOString() };
    if (typeof req.body?.aberto === 'boolean') upd.aberto = req.body.aberto;
    if (req.body?.label != null) upd.label = String(req.body.label).trim().slice(0, 120);
    if ('limite' in (req.body || {})) {
      const l = req.body.limite;
      upd.limite = (l === null || l === '' ) ? null : (Number.isFinite(+l) ? Math.max(0, parseInt(l, 10)) : null);
    }
    if (Number.isFinite(+req.body?.ordem)) upd.ordem = +req.body.ordem;
    const { data, error } = await supabase.from('batismo_horarios')
      .update(upd).eq('id', req.params.id).is('deleted_at', null).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao atualizar horário' }); }
});

// DELETE /api/kpis/batismos/horarios/:id — remove (soft)
router.delete('/batismos/horarios/:id', authorizeBatismo, async (req, res) => {
  try {
    const { error } = await supabase.from('batismo_horarios')
      .update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao remover horário' }); }
});

// Config do batismo · link do grupo de WhatsApp (Lorena atualiza a cada mês)
router.get('/batismos/config', authorizeBatismo, async (_req, res) => {
  try {
    const { data } = await supabase.from('batismo_config').select('grupo_url, updated_at').eq('id', 1).maybeSingle();
    res.json(data || { grupo_url: null });
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao carregar config' }); }
});

router.patch('/batismos/config', authorizeBatismo, async (req, res) => {
  try {
    const grupo_url = req.body?.grupo_url ? String(req.body.grupo_url).trim().slice(0, 500) : null;
    if (grupo_url && !/^https:\/\/chat\.whatsapp\.com\//.test(grupo_url)) {
      return res.status(400).json({ error: 'O link precisa ser de um grupo do WhatsApp (chat.whatsapp.com).' });
    }
    const { data, error } = await supabase.from('batismo_config')
      .update({ grupo_url, updated_by: req.user?.id || null, updated_at: new Date().toISOString() })
      .eq('id', 1).select('grupo_url, updated_at').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao salvar o link do grupo' }); }
});

router.post('/batismos', authorizeBatismo, async (req, res) => {
  const {
    cpf, nome, sobrenome, data_nascimento, telefone, email,
    origem = 'manual', observacoes, area_kpi,
    tamanho_camisa, eh_crianca, possui_deficiencia, deficiencia_descricao, endereco,
  } = req.body;
  if (!nome || !sobrenome) return res.status(400).json({ error: 'nome e sobrenome são obrigatórios' });
  const AREAS_OK = ['kids', 'sede', 'bridge', 'ami', 'online'];
  const areaKpiValida = AREAS_OK.includes(area_kpi) ? area_kpi : 'sede';

  const cpfClean = cpf ? cpf.replace(/\D/g, '') : null;

  // Guarda na origem (membroMatch · 2026-06-19): resolve-ou-cria UM membro
  // deduplicado em vez do match-só-por-CPF (que deixava órfão quem inscrevia sem
  // CPF e não pegava match por e-mail/telefone+nome). Consistente com a intake
  // pública e com Next/grupos/Kids. NUNCA liga por telefone/e-mail sozinho.
  let membro_id = null;
  try {
    const r = await acharOuCriarGuardado({
      cpf: cpfClean, email: email || null, telefone: telefone || null,
      nome: `${nome} ${sobrenome}`.trim(),
      dataNascimento: data_nascimento || null,
      status: 'visitante',
    });
    membro_id = r.membro_id;
  } catch (e) {
    console.error('[kpis/batismos] acharOuCriarGuardado:', e.message);
    // fail-open: segue sem vínculo (Entradas liga depois)
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
      tamanho_camisa: tamanho_camisa ? String(tamanho_camisa).trim().toUpperCase() : null,
      eh_crianca: !!eh_crianca,
      possui_deficiencia: !!possui_deficiencia,
      deficiencia_descricao: possui_deficiencia && deficiencia_descricao
        ? String(deficiencia_descricao).trim() : null,
      endereco: endereco ? String(endereco).trim() : null,
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

  // Exposição mínima: o token de acesso só sai pelo fluxo de check-in (impressão).
  const { codigo_acesso: _ca, codigo_conferencia: _cc, ...inscricaoPub } = inscricao;
  res.json(inscricaoPub);
});

router.put('/batismos/:id', authorizeBatismo, async (req, res) => {
  const {
    status, data_batismo, observacoes, area_kpi,
    tamanho_camisa, eh_crianca, possui_deficiencia, deficiencia_descricao, endereco,
  } = req.body;
  const update = { updated_at: new Date().toISOString() };
  if (status)       update.status = status;
  if (data_batismo) update.data_batismo = data_batismo;
  if (observacoes !== undefined) update.observacoes = observacoes;
  if (area_kpi && ['kids', 'sede', 'bridge', 'ami', 'online'].includes(area_kpi)) {
    update.area_kpi = area_kpi;
  }
  if (tamanho_camisa !== undefined) {
    update.tamanho_camisa = tamanho_camisa ? String(tamanho_camisa).trim().toUpperCase() : null;
  }
  if (eh_crianca !== undefined) update.eh_crianca = !!eh_crianca;
  if (possui_deficiencia !== undefined) update.possui_deficiencia = !!possui_deficiencia;
  if (deficiencia_descricao !== undefined) {
    update.deficiencia_descricao = deficiencia_descricao ? String(deficiencia_descricao).trim() : null;
  }
  if (endereco !== undefined) update.endereco = endereco ? String(endereco).trim() : null;

  const { data, error } = await supabase
    .from('batismo_inscricoes')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  // Exposição mínima: não devolve o token de acesso na edição da inscrição.
  const { codigo_acesso: _ca, codigo_conferencia: _cc, ...dataPub } = data || {};
  res.json(dataPub);
});

// ── Check-in de batismo · Quiosque (Fase 1) ──────────────────────────────────
// Fluxo assistido no Totem Membro: lista os batizandos do dia → a pessoa se acha
// → captura CPF (dedup na origem) + selfie + consentimento → imprime etiqueta
// com QR (token forte) + código curto. Spec: docs/quiosque-lounge-identidade.md.

// Lista os batizandos de uma data (default = hoje, São Paulo) para o check-in.
// Não expõe CPF cru — só nome + flags.
router.get('/batismos/checkin/do-dia', authorizeBatismo, async (req, res) => {
  const data = req.query.data || hojeSP();
  const { data: rows, error } = await supabase
    .from('batismo_inscricoes')
    .select('id, nome, sobrenome, checkin_em, foto_referencia_url')
    .eq('data_batismo', data)
    .in('status', ['pendente', 'confirmado'])
    .is('deleted_at', null)
    .order('nome', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data,
    batizandos: (rows || []).map(r => ({
      id: r.id,
      nome: r.nome,
      sobrenome: r.sobrenome,
      ja_checkin: !!r.checkin_em,
      tem_foto: !!r.foto_referencia_url,
    })),
  });
});

// Registra o check-in: dedup por CPF (acharOuCriarGuardado · opcional), grava
// presença + consentimento, devolve os códigos para imprimir a etiqueta.
// Idempotente: pode ser rodado de novo (reimpressão) — o token não muda.
router.post('/batismos/:id/checkin', authorizeBatismo, async (req, res) => {
  const { cpf, consentiu } = req.body || {};
  const cpfClean = cpf ? String(cpf).replace(/\D/g, '') : null;

  const { data: insc, error: e0 } = await supabase
    .from('batismo_inscricoes')
    .select('id, nome, sobrenome, telefone, email, data_nascimento, cpf, membro_id, codigo_acesso, codigo_conferencia, consentimento_em, deleted_at')
    .eq('id', req.params.id)
    .single();
  if (e0 || !insc || insc.deleted_at) return res.status(404).json({ error: 'Inscrição não encontrada' });

  // Guarda na origem: liga/cria membro deduplicado a partir do CPF (opcional ·
  // "preço da foto"). Mesmo padrão de POST /batismos e da intake pública. Só
  // quando a inscrição ainda NÃO tem vínculo — não sobrescreve link existente
  // (evita relink por erro de digitação) nem cria stub órfão pra quem já é membro.
  let membro_id = insc.membro_id;
  if (cpfClean && cpfClean.length === 11 && !insc.membro_id) {
    try {
      const r = await acharOuCriarGuardado({
        cpf: cpfClean,
        email: insc.email || null,
        telefone: insc.telefone || null,
        nome: `${insc.nome} ${insc.sobrenome || ''}`.trim(),
        dataNascimento: insc.data_nascimento || null,
        status: 'visitante',
      });
      membro_id = r.membro_id || membro_id;
    } catch (e) {
      console.error('[kpis/batismos/checkin] acharOuCriarGuardado:', e.message);
      // fail-open: segue sem vínculo (Entradas liga depois)
    }
  } else if (cpfClean && cpfClean.length === 11 && insc.membro_id) {
    // Reconciliação de CPF tardio: a inscrição JÁ estava ligada a um membro
    // (tipicamente um stub criado sem CPF na conversão) e o CPF chegou agora,
    // na presença física. Antes o CPF ficava só na inscrição — o membro seguia
    // sem CPF e a identidade global nunca consolidava. Conflito não sobrescreve
    // nada: vira pendência de identidade (fila humana).
    try {
      await reconciliarCpfTardio({
        membroId: insc.membro_id, cpf: cpfClean,
        origem: 'batismo_checkin', origemId: insc.id,
      });
      await propagarCpfConvertido({ membroId: insc.membro_id });
    } catch (e) {
      console.error('[kpis/batismos/checkin] reconciliar cpf:', e.message);
    }
  }

  const nowIso = new Date().toISOString();
  const update = {
    checkin_em: nowIso,
    checkin_por: req.user?.id || null,
    updated_at: nowIso,
  };
  if (membro_id && membro_id !== insc.membro_id) update.membro_id = membro_id;
  if (cpfClean && cpfClean.length === 11 && !insc.cpf) update.cpf = cpfClean;
  if (consentiu && !insc.consentimento_em) update.consentimento_em = nowIso;

  const { data: row, error } = await supabase
    .from('batismo_inscricoes')
    .update(update)
    .eq('id', req.params.id)
    .select('id, nome, sobrenome, codigo_acesso, codigo_conferencia')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    id: row.id,
    nome: `${row.nome} ${row.sobrenome || ''}`.trim(),
    codigo_acesso: row.codigo_acesso,
    codigo_conferencia: row.codigo_conferencia,
  });
});

// Upload da selfie de referência (opcional · consentida) → bucket privado.
router.post('/batismos/:id/foto-referencia', authorizeBatismo, uploadFotoRef.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo (campo "foto") obrigatório' });

  const { data: insc, error: e0 } = await supabase
    .from('batismo_inscricoes')
    .select('id, deleted_at')
    .eq('id', req.params.id)
    .single();
  if (e0 || !insc || insc.deleted_at) return res.status(404).json({ error: 'Inscrição não encontrada' });

  const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `referencia/${req.params.id}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('batismos-biometria')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (upErr) return res.status(500).json({ error: upErr.message });

  const nowIso = new Date().toISOString();
  const { error: e1 } = await supabase
    .from('batismo_inscricoes')
    .update({ foto_referencia_url: path, consentimento_em: nowIso, updated_at: nowIso })
    .eq('id', req.params.id);
  if (e1) return res.status(500).json({ error: e1.message });

  res.json({ ok: true, foto_referencia_url: path });
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
    supabase.from('batismo_inscricoes').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'pendente'),
    supabase.from('batismo_inscricoes').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'realizado'),
    supabase.from('mem_grupos').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('ativo', true),
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
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) {
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

  // Backfill-friendly: pega TODOS os cultos com vídeo pendente até a data limite,
  // não so a data exata. Se o cron falhou em algum dia, na próxima execucao ele
  // ainda recupera o dado (best-effort com viewCount atual). O cron diario
  // limita o backlog a poucos itens.
  //
  // D+1 (online_ds): cultos com data <= ontem, com vídeo, sem online_ds
  // D+7 (online_ddus): cultos com data <= 7 dias atras, com vídeo, com online_ds, sem online_ddus
  const [{ data: cultosDSRaw }, { data: cultosDDUSRaw }] = await Promise.all([
    supabase.from('cultos').select('id, data, youtube_video_id, service_type_id').is('deleted_at', null).lte('data', ontemStr).not('youtube_video_id', 'is', null).is('online_ds', null).order('data', { ascending: false }).limit(50),
    supabase.from('cultos').select('id, data, youtube_video_id, online_ds, service_type_id').is('deleted_at', null).lte('data', seteDiasStr).not('youtube_video_id', 'is', null).not('online_ds', 'is', null).is('online_ddus', null).order('data', { ascending: false }).limit(50),
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
  // Semanas "completas" · domingo (D) E quarta (D+3) ambos dentro do mês.
  // Regra do negócio: so contam semanas com ambos os dias de culto (dom+qua).
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
        .select('data, presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online, online_ds')
        .gte('data', inicioStr).lte('data', fimInclusivoStr),
      // Conectar = PESSOAS distintas em grupos ativos (saiu_em IS NULL), NÃO o nº
      // de vínculos: quem está em 2+ grupos conta 1x. Pagina pra escapar do cap de
      // 1000 do PostgREST (há >1000 vínculos). Tabela pode não existir — tolerante.
      (async () => {
        try {
          const ids = new Set();
          const page = 1000;
          for (let from = 0; ; from += page) {
            const { data, error } = await supabase
              .from('mem_grupo_membros')
              .select('membro_id')
              .is('deleted_at', null)
              .is('saiu_em', null)
              .range(from, from + page - 1);
            if (error) return { count: null, error };
            (data || []).forEach(r => { if (r.membro_id) ids.add(r.membro_id); });
            if (!data || data.length < page) break;
          }
          return { count: ids.size, error: null };
        } catch (error) {
          return { count: null, error };
        }
      })(),
      // Investir Tempo com Deus = DEVOCIONAL feito no app (mem_devocionais ·
      // decisão Matheus 2026-06-20). Antes era views/dia dos vídeos PENSE.
      supabase.from('mem_devocionais')
        .select('membro_id')
        .eq('concluida', true)
        .is('deleted_at', null)
        .gte('data_devocional', inicioStr)
        .lte('data_devocional', fimInclusivoStr),
      // RPC: count(distinct volunteer_id) direto no banco — evita trafegar milhares de linhas
      supabase.rpc('kpi_servir_comunidade', { _since: noventaDiasStr }),
      supabase.from('cultura_mensal').select('*').eq('mes', inicioStr).maybeSingle(),
      // Generosidade · fallback do fin_transacoes via RPC (escapa do cap de 1000 do PostgREST)
      supabase.rpc('fin_generosidade_mes', { p_mes: inicioStr }),
    ]);

    const pick = (i) => (settled[i].status === 'fulfilled' ? settled[i].value : { data: null, error: settled[i].reason });
    const cultosRes = pick(0);
    const grupoMembrosRes = pick(1);
    const devocionalRes = pick(2);
    const servirRes = pick(3);
    const culturaMensalRes = pick(4);
    const finGenRes = pick(5);

    const cultos = cultosRes.data || [];
    const presencialTotal = cultos.reduce((s, c) => s + (c.presencial_adulto || 0) + (c.presencial_kids || 0), 0);
    const onlineDsTotal   = cultos.reduce((s, c) => s + (c.online_ds || 0), 0);

    // Semanas do mês = nº de semanas ISO (seg→dom) DISTINTAS que de fato tiveram
    // culto no mês. Consistente com o numerador (que soma TODOS os cultos do
    // mês): junho/26 → 4 (não 3). Antes o pareamento dom→quarta-seguinte
    // descartava a última semana e dividia o total de 4 semanas por 3, inflando
    // a média. Cai no cálculo do parseMes se não houver culto no mês.
    const chaveSemana = (iso) => {
      const d = new Date(`${iso}T00:00:00Z`);
      const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
      d.setUTCDate(d.getUTCDate() - dow);
      return d.toISOString().slice(0, 10);
    };
    const semanasComCulto = new Set(cultos.map((c) => c.data && chaveSemana(c.data)).filter(Boolean)).size;
    const divisorSemanas = semanasComCulto || semanasNoMes;
    const decisoesTotal   = cultos.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);

    const conectarPessoas = grupoMembrosRes.error ? null : (grupoMembrosRes.count || 0);

    // Investir = devocional do app · investir_deus = pessoas distintas que
    // fizeram devocional no mês; total = nº de check-ins concluídos no mês.
    const devCheckins = (devocionalRes.data || []).length;
    const investirDeus = devocionalRes.error ? null : new Set((devocionalRes.data || []).map(d => d.membro_id).filter(Boolean)).size;

    // Voluntários ativos via RPC kpi_servir_comunidade(_since)
    const servirComunidade = servirRes.error ? null : (typeof servirRes.data === 'number' ? servirRes.data : (servirRes.data ?? null));

    const cm = culturaMensalRes.data;

    // Fallback de generosidade · RPC fin_generosidade_mes retorna agregado JSONB
    // (escapa do cap de 1000 do PostgREST quando fin_transacoes > 1000 linhas no mês)
    const finGen = finGenRes.error || !finGenRes.data ? null : finGenRes.data;
    const finDizimistas = finGen ? Number(finGen.dizimistas || 0) : null;
    const finOfertantes = finGen ? Number(finGen.ofertantes || 0) : null;
    const finValorDizimo = finGen ? Number(finGen.valor_dizimo || 0) : 0;
    const finValorOferta = finGen ? Number(finGen.valor_oferta || 0) : 0;
    const finDoadoresUnicos = finGen ? Number(finGen.doadores_unicos || 0) : null;

    const generosidade = {
      // Prioriza valor manual (cultura_mensal) · fallback pra fin_transacoes
      dizimistas: cm?.qtd_dizimistas ?? finDizimistas ?? null,
      ofertantes: cm?.qtd_ofertantes ?? finOfertantes ?? null,
      doadores_unicos: finDoadoresUnicos,
      valor_dizimo: finValorDizimo,
      valor_oferta: finValorOferta,
      valor_total: finValorDizimo + finValorOferta,
      fonte: cm?.qtd_dizimistas != null || cm?.qtd_ofertantes != null ? 'manual' : 'fin_transacoes',
    };

    // Valores manuais de cultura_mensal tem prioridade sobre o agregado de
    // cultos · permite lancar mês consolidado sem cultos individuais.
    const presencialSemanal = cm?.freq_presencial_semanal != null
      ? cm.freq_presencial_semanal
      : Math.round(presencialTotal / divisorSemanas);
    const onlineSemanal = cm?.freq_online_semanal != null
      ? cm.freq_online_semanal
      : Math.round(onlineDsTotal / divisorSemanas);
    const decisoesMes = cm?.decisoes_total != null ? cm.decisoes_total : decisoesTotal;
    const conectarMes = cm?.freq_grupos_total != null ? cm.freq_grupos_total : conectarPessoas;

    res.json({
      mes: mesISO,
      semanas_no_mes: divisorSemanas,
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
      investir_deus_total: devCheckins,
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

// POST /kpis/cultura/mensal — upsert (mês, qtd_dizimistas, qtd_ofertantes, observações)
router.post('/cultura/mensal', authorize('admin', 'diretor'), async (req, res) => {
  const {
    mes, qtd_dizimistas, qtd_ofertantes, observacoes,
    freq_presencial_semanal, freq_online_semanal, decisoes_total, freq_grupos_total,
  } = req.body || {};
  if (!mes || !/^\d{4}-\d{2}/.test(mes)) {
    return res.status(400).json({ error: 'Campo "mês" obrigatório no formato YYYY-MM' });
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
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) {
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
