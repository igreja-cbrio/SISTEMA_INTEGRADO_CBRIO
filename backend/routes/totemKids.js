// ============================================================================
// /api/totem-kids · backend do Totem Kids (módulo Ministerial > Totem Kids)
// ============================================================================
// Operação: voluntário opera o totem (modo manned · único tipo no MVP).
// Substitui o Planning Center Check-Ins para o ministério infantil.
//
// Permissões:
//   - admin/diretor (role) passam direto (backward compat)
//   - coordenador-kids (nível >= 3 no módulo 'kids') tem acesso total
//   - boost via área KIDS (auth.js) eleva pra nível 5 automático
//   - "líder Kids do dia" e qualquer staff que tenha check-in ativo no
//     voluntariado em culto com has_kids=true · validado dinamicamente
//     em `checkLiderKidsDoDia` quando necessário (override).
//
// Decisões em docs/checkin-kids-plano.md (2026-05-21).
// ============================================================================

const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { safeEqual, isAuthorizedCron } = require('../utils/cronAuth');
const { notificar } = require('../services/notificar');
const wpp = require('../services/whatsappService');
const { enviarTexto: enviarTextoWpp, enviarTemplate: enviarTemplateWpp } = require('../services/whatsappSend');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { syncCriancasPCO } = require('../services/planningCenterKids');

// authenticate aplicado condicionalmente abaixo · rotas /display/* e
// /chamadas com estacao_token bypassam pra display sem login

const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Formato invalido · use .xlsx, .xls ou .csv'), ok);
  },
});

// Antes do router.use(authenticate) acima · bypass pra rotas publicas
// (display da TV sem login · estacao_token no body/query autentica)
router.use((req, res, next) => {
  // Bypass authenticate pra:
  //   - GET /display/* (TV consulta com ?token=X)
  //   - POST /chamadas se vier estacao_token no body (self-service)
  //   - POST /estacoes/parear (qualquer autenticado · já era público via authorizeModule)
  const isDisplay = req.path.startsWith('/display/');
  const isChamadaComToken = req.path === '/chamadas' && req.method === 'POST' && req.body?.estacao_token;
  const isParear = req.path === '/estacoes/parear' && req.method === 'POST';
  // Agente local de pagers (recepcao) · autentica por bearer token (PAGER_BRIDGE_TOKEN),
  // não por JWT de usuário · handlers validam internamente via bridgeAutorizado()
  const isPagerBridge = req.path.startsWith('/pager/bridge/');
  // Cron da Vercel/GitHub manda CRON_SECRET (não JWT) · só pula authenticate
  // quando o secret é VÁLIDO (fail-closed via isAuthorizedCron). Chamada manual
  // de admin (com JWT, sem secret) segue pelo authenticate normalmente.
  const isCron = req.path.startsWith('/cron/') && isAuthorizedCron(req);
  if (isDisplay || isChamadaComToken || isParear || isPagerBridge || isCron) {
    // Pula authenticate · handlers validam token internamente
    return next();
  }
  return authenticate(req, res, next);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

// Resolve a foto exibível da criança. Foto enviada pelo APP fica em bucket
// privado (foto_storage_path) e SÓ aparece com consentimento (ECA/LGPD) →
// signed URL temporária. Foto legada (foto_url) segue como antes.
async function fotoVisivelCrianca(c) {
  if (!c) return null;
  if (c.foto_storage_path) {
    if (!c.foto_consentimento_em) return null;
    const { data } = await supabase.storage.from('kids-documentos').createSignedUrl(c.foto_storage_path, 60 * 30);
    return data?.signedUrl || null;
  }
  return c.foto_url || null;
}

function calcIdadeMeses(dataNascimento) {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
  if (hoje.getDate() < nasc.getDate()) meses -= 1;
  return Math.max(0, meses);
}

function formatIdade(meses) {
  if (meses == null) return '';
  if (meses < 24) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}

function normalizarTelefone(t) {
  if (!t) return null;
  const digits = String(t).replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function normalizarCpf(c) {
  if (!c) return null;
  const digits = String(c).replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

// Sala sugerida pra idade em meses
async function sugerirSala(idadeMeses) {
  if (idadeMeses == null) return null;
  const { data } = await supabase
    .from('kids_salas')
    .select('id, nome, capacidade, faixa_etaria_min_meses, faixa_etaria_max_meses, cor')
    .eq('ativo', true)
    .lte('faixa_etaria_min_meses', idadeMeses)
    .gte('faixa_etaria_max_meses', idadeMeses)
    .order('ordem')
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Verifica se o usuário e "líder Kids do dia": voluntário com check-in ativo
// no voluntariado em algum culto com has_kids=true.
async function isLiderKidsDoDia(authUserId) {
  if (!authUserId) return false;
  const hoje = new Date().toISOString().slice(0, 10);

  // 1. profile.email → vol_profile
  const { data: profile } = await supabase
    .from('profiles').select('email').eq('id', authUserId).maybeSingle();
  if (!profile?.email) return false;

  const { data: volProfile } = await supabase
    .from('vol_profiles').select('id').eq('email', profile.email).maybeSingle();
  if (!volProfile) return false;

  // 2. Tem check-in ativo hoje em culto com has_kids?
  const { data: checkins } = await supabase
    .from('vol_check_ins')
    .select('id, service_id, vol_services(scheduled_at, service_type_name)')
    .eq('volunteer_id', volProfile.id)
    .gte('checked_in_at', `${hoje}T00:00:00`)
    .lte('checked_in_at', `${hoje}T23:59:59`);

  if (!checkins?.length) return false;

  // Pelo menos um service do tipo "tem kids" via vol_service_types
  const { data: serviceTypes } = await supabase
    .from('vol_service_types').select('name, has_kids').eq('has_kids', true);
  const typesComKids = new Set((serviceTypes || []).map(s => s.name));

  return checkins.some(c => typesComKids.has(c.vol_services?.service_type_name));
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSÕES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/totem-kids/sessoes/atual · retorna a sessão aberta agora (se houver)
router.get('/sessoes/atual', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_sessoes')
      .select(`
        id, culto_id, status, abrir_em, fechar_em, encerrada_at,
        culto:cultos(id, data, nome, service_type_id, presencial_kids, decisoes_kids,
                     service_type:vol_service_types(id, name, color, has_kids))
      `)
      .eq('status', 'aberta')
      .order('abrir_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json(data || null);
  } catch (e) {
    console.error('[totemKids/sessoes/atual]', e.message);
    res.status(500).json({ error: 'Erro ao buscar sessão atual' });
  }
});

// GET /api/totem-kids/sessoes · lista sessões (admin)
router.get('/sessoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const status = req.query.status; // opcional · filtra por status
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    let q = supabase
      .from('kids_sessoes')
      .select(`
        id, culto_id, status, abrir_em, fechar_em, encerrada_at,
        culto:cultos(id, data, nome, presencial_kids, decisoes_kids,
                     service_type:vol_service_types(id, name, color))
      `)
      .order('abrir_em', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids/sessoes]', e.message);
    res.status(500).json({ error: 'Erro ao listar sessões' });
  }
});

// POST /api/totem-kids/sessoes · cria sessão pra um culto
router.post('/sessoes', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { culto_id, abrir_em, fechar_em } = req.body;
    if (!culto_id) return res.status(400).json({ error: 'culto_id obrigatorio' });

    const { data, error } = await supabase
      .from('kids_sessoes')
      .insert({
        culto_id,
        abrir_em: abrir_em || new Date().toISOString(),
        fechar_em: fechar_em || null,
        status: 'aberta',
      })
      .select('id, culto_id, status, abrir_em, fechar_em')
      .single();
    if (error) {
      // duplicidade culto_id
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe sessão pra esse culto' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[totemKids/sessoes POST]', e.message);
    res.status(500).json({ error: 'Erro ao criar sessão' });
  }
});

// POST /api/totem-kids/sessoes/:id/abrir · status → aberta
router.post('/sessoes/:id/abrir', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_sessoes')
      .update({ status: 'aberta' })
      .eq('id', req.params.id)
      .select('id, status')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao abrir sessão' });
  }
});

// POST /api/totem-kids/sessoes/:id/encerrar · status → encerrada (consolida cultos.presencial_kids)
router.post('/sessoes/:id/encerrar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_sessoes')
      .update({
        status: 'encerrada',
        encerrada_at: new Date().toISOString(),
        encerrada_por: req.user.userId,
      })
      .eq('id', req.params.id)
      .select('id, status, encerrada_at')
      .single();
    if (error) throw error;
    // Resumo do Kids pros líderes (WhatsApp + in-app/e-mail) · best-effort
    enviarResumoKids(req.params.id).catch(() => {});
    res.json(data);
  } catch (e) {
    console.error('[totemKids/sessoes/encerrar]', e.message);
    res.status(500).json({ error: 'Erro ao encerrar sessão' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CRIANÇAS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/totem-kids/criancas/buscar?q=... · fuzzy search (trigram)
router.get('/criancas/buscar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    // Busca por nome (trigram) OU por nome do responsável OU telefone
    const { data: criancas } = await supabase
      .from('kids_criancas')
      .select(`
        id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas,
        tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual,
        visitante, familia_id,
        familia:mem_familias(id, nome),
        responsaveis:kids_responsaveis(
          membro_id, parentesco, autorizado_buscar,
          membro:mem_membros(id, nome, telefone, cpf, foto_url)
        )
      `)
      .ilike('nome', `%${q}%`)
      .eq('ativo', true)
      .order('nome')
      .limit(20);

    // Também busca por telefone do responsável (se q parece telefone)
    const digits = q.replace(/\D/g, '');
    let extras = [];
    if (digits.length >= 4) {
      const { data: membrosPorTel } = await supabase
        .from('mem_membros')
        .select('id')
        .like('telefone', `%${digits}%`)
        .limit(10);
      if (membrosPorTel?.length) {
        const membroIds = membrosPorTel.map(m => m.id);
        const { data: responsaveis } = await supabase
          .from('kids_responsaveis')
          .select('crianca_id')
          .in('membro_id', membroIds);
        const criancaIds = [...new Set((responsaveis || []).map(r => r.crianca_id))];
        if (criancaIds.length) {
          const { data: extras2 } = await supabase
            .from('kids_criancas')
            .select(`
              id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas,
              visitante, familia_id,
              familia:mem_familias(id, nome),
              responsaveis:kids_responsaveis(
                membro_id, parentesco, autorizado_buscar,
                membro:mem_membros(id, nome, telefone, cpf, foto_url)
              )
            `)
            .in('id', criancaIds)
            .eq('ativo', true);
          extras = extras2 || [];
        }
      }
    }

    // Une por id
    const map = new Map();
    [...(criancas || []), ...extras].forEach(c => map.set(c.id, c));
    const lista = await Promise.all([...map.values()].map(async c => ({
      ...c,
      foto_url: await fotoVisivelCrianca(c),
      idade_meses: calcIdadeMeses(c.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    })));

    res.json(lista);
  } catch (e) {
    console.error('[totemKids/criancas/buscar]', e.message);
    res.status(500).json({ error: 'Erro na busca' });
  }
});

// GET /criancas/duplicados · grupos de crianças provavelmente duplicadas (mesmo
// nome normalizado). Declarado ANTES de /criancas/:id (senão casaria como :id).
router.get('/criancas/duplicados', authorizeModule('kids', 1), async (req, res) => {
  try {
    let from = 0; const page = 1000; let all = [];
    while (true) {
      const { data, error } = await supabase.from('kids_criancas')
        .select('id, nome, data_nascimento, ativo, foto_url, familia:mem_familias(nome), responsaveis:kids_responsaveis(membro:mem_membros(nome))')
        .is('deleted_at', null).range(from, from + page - 1);
      if (error) throw error;
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < page) break;
      from += page;
    }
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    const grupos = {};
    all.forEach((c) => { const k = norm(c.nome); if (k.length < 3) return; (grupos[k] = grupos[k] || []).push(c); });
    const dups = Object.values(grupos).filter((g) => g.length > 1).map((g) => g.map((c) => ({
      id: c.id, nome: c.nome, data_nascimento: c.data_nascimento, ativo: c.ativo, foto_url: c.foto_url,
      familia: c.familia?.nome || null,
      responsaveis: (c.responsaveis || []).map((r) => r.membro?.nome).filter(Boolean),
    })));
    // mesmo nascimento no grupo = mais provável → primeiro
    dups.sort((a, b) => {
      const mesma = (g) => { const ds = g.map((x) => x.data_nascimento).filter(Boolean); return ds.length > 1 && new Set(ds).size === 1; };
      return (mesma(b) ? 1 : 0) - (mesma(a) ? 1 : 0);
    });
    res.json(dups);
  } catch (e) { console.error('[totemKids] duplicados:', e.message); res.status(500).json({ error: 'Erro ao detectar duplicados' }); }
});

// POST /criancas/merge { keep_id, merge_ids } · funde duplicadas na mantida
router.post('/criancas/merge', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { keep_id, merge_ids } = req.body || {};
    if (!keep_id || !Array.isArray(merge_ids) || !merge_ids.length) return res.status(400).json({ error: 'keep_id e merge_ids obrigatórios' });
    if (merge_ids.includes(keep_id)) return res.status(400).json({ error: 'A criança mantida não pode estar na lista de fundidas' });
    const { error } = await supabase.rpc('merge_kids_criancas', { p_keep: keep_id, p_merge: merge_ids });
    if (error) throw error;
    res.json({ ok: true, fundidas: merge_ids.length });
  } catch (e) { console.error('[totemKids] merge criancas:', e.message); res.status(500).json({ error: e.message || 'Erro ao fundir' }); }
});

// GET /api/totem-kids/criancas/:id · detalhe completo
router.get('/criancas/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_criancas')
      .select(`
        *, familia:mem_familias(id, nome),
        responsaveis:kids_responsaveis(
          id, membro_id, parentesco, autorizado_buscar, contato_emergencia, observacao,
          membro:mem_membros(id, nome, telefone, cpf, foto_url, email)
        )
      `)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Criança não encontrada' });

    res.json({
      ...data,
      foto_url: await fotoVisivelCrianca(data),
      idade_meses: calcIdadeMeses(data.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(data.data_nascimento)),
      sala_sugerida: await sugerirSala(calcIdadeMeses(data.data_nascimento)),
    });
  } catch (e) {
    console.error('[totemKids/criancas/:id]', e.message);
    res.status(500).json({ error: 'Erro ao buscar criança' });
  }
});

// POST /api/totem-kids/criancas · cria criança + responsável (first visit)
// Body:
//   { criança: { nome, data_nascimento, sexo, observacoes_medicas, ... },
//     responsável: { nome, telefone, cpf, parentesco, email? } }
router.post('/criancas', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { crianca, responsavel, amigo_de_crianca_id } = req.body || {};
    if (!crianca?.nome) return res.status(400).json({ error: 'crianca.nome obrigatorio' });

    const txt = (cond, v) => (cond && v ? String(v).trim().slice(0, 500) : null);
    const bool = (v) => (v === true ? true : (v === false ? false : null));
    // Base da criança (+ saúde) compartilhada entre os fluxos. Sempre visitante=true.
    const camposCrianca = {
      nome: crianca.nome,
      data_nascimento: crianca.data_nascimento || null,
      sexo: crianca.sexo || null,
      observacoes_medicas: crianca.observacoes_medicas || null,
      necessidades_especiais: crianca.necessidades_especiais || null,
      serie: crianca.serie || null,
      foto_url: crianca.foto_url || null,
      foto_consentimento_em: crianca.foto_url ? new Date().toISOString() : null,
      tem_alergia: bool(crianca.tem_alergia),
      alergia_qual: txt(crianca.tem_alergia === true, crianca.alergia_qual),
      tem_espectro: bool(crianca.tem_espectro),
      espectro_qual: txt(crianca.tem_espectro === true, crianca.espectro_qual),
      tem_limitacao_fisica: bool(crianca.tem_limitacao_fisica),
      limitacao_fisica_qual: txt(crianca.tem_limitacao_fisica === true, crianca.limitacao_fisica_qual),
      visitante: true,
      created_by: req.user.userId,
    };

    // ── Fluxo "amigo de X": herda família + responsáveis de uma criança cadastrada ──
    if (amigo_de_crianca_id) {
      const { data: amigo } = await supabase.from('kids_criancas')
        .select('id, nome, familia_id').eq('id', amigo_de_crianca_id).is('deleted_at', null).maybeSingle();
      if (!amigo) return res.status(404).json({ error: 'Criança de referência não encontrada' });
      const { data: criancaCriada, error: errC } = await supabase.from('kids_criancas')
        .insert({ ...camposCrianca, familia_id: amigo.familia_id || null,
          observacoes_internas: `Visitante · amigo(a) de ${amigo.nome}` })
        .select('*, familia:mem_familias(id, nome)').single();
      if (errC) throw errC;
      const { data: resps } = await supabase.from('kids_responsaveis')
        .select('membro_id, parentesco, autorizado_buscar, contato_emergencia').eq('crianca_id', amigo.id);
      const aut = (resps || []).filter((r) => r.autorizado_buscar);
      if (aut.length) {
        await supabase.from('kids_responsaveis').insert(aut.map((r) => ({
          crianca_id: criancaCriada.id, membro_id: r.membro_id,
          parentesco: r.parentesco || 'responsavel', autorizado_buscar: true,
          contato_emergencia: r.contato_emergencia || false,
        })));
      }
      return res.status(201).json({ crianca: criancaCriada, amigo_de: { id: amigo.id, nome: amigo.nome }, familia_id: amigo.familia_id });
    }

    // ── Fluxo normal: exige responsável (nome + telefone) ──
    if (!responsavel?.nome || !responsavel?.telefone) {
      return res.status(400).json({ error: 'responsavel.nome e responsavel.telefone obrigatórios' });
    }
    const tel = normalizarTelefone(responsavel.telefone);
    const cpf = normalizarCpf(responsavel.cpf);
    const r = await acharOuCriarGuardado({
      cpf, email: responsavel.email || null, telefone: tel, nome: responsavel.nome, status: 'visitante',
    });
    const { data: membro } = await supabase.from('mem_membros')
      .select('id, nome, familia_id').eq('id', r.membro_id).single();
    let familiaId = membro.familia_id;
    if (!familiaId) {
      const { data: f, error: fe } = await supabase.from('mem_familias')
        .insert({ nome: `Familia ${membro.nome.split(' ')[0]}` }).select('id').single();
      if (fe) throw fe;
      familiaId = f.id;
      await supabase.from('mem_membros').update({ familia_id: familiaId, parentesco: 'responsavel' }).eq('id', membro.id);
    }
    const { data: criancaCriada, error: errCrianca } = await supabase.from('kids_criancas')
      .insert({ ...camposCrianca, familia_id: familiaId })
      .select('*, familia:mem_familias(id, nome)').single();
    if (errCrianca) throw errCrianca;
    await supabase.from('kids_responsaveis').insert({
      crianca_id: criancaCriada.id, membro_id: membro.id,
      parentesco: responsavel.parentesco || 'outro', autorizado_buscar: true,
    });
    res.status(201).json({
      crianca: criancaCriada,
      responsavel: { id: membro.id, nome: membro.nome, telefone: tel, cpf },
      familia_id: familiaId,
    });
  } catch (e) {
    console.error('[totemKids/criancas POST]', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar criança' });
  }
});

// PATCH /api/totem-kids/criancas/:id · editar
router.patch('/criancas/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const allowed = ['nome', 'data_nascimento', 'sexo', 'familia_id', 'observacoes_medicas',
                     'necessidades_especiais', 'foto_url', 'visitante', 'ativo', 'observacoes_internas',
                     'serie', 'data_conversao', 'data_batismo',
                     'tem_espectro', 'espectro_qual', 'tem_alergia', 'alergia_qual',
                     'tem_limitacao_fisica', 'limitacao_fisica_qual'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    if (req.body.foto_url && !req.body.foto_consentimento_em) {
      update.foto_consentimento_em = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('kids_criancas')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao editar criança' });
  }
});

// PATCH /api/totem-kids/membro/:id · corrige nome/telefone do responsável
// (mem_membros) direto do totem Kids — pra consertar nome errado no check-in.
router.patch('/membro/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const allowed = ['nome', 'telefone'];
    const update = {};
    for (const k of allowed) {
      if (k in req.body && String(req.body[k] ?? '').trim()) update[k] = String(req.body[k]).trim();
    }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nada pra atualizar' });
    const { data, error } = await supabase
      .from('mem_membros')
      .update(update)
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .select('id, nome, telefone')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao editar responsável' });
  }
});

// ── Senha de edição da ficha da criança (totem) ──────────────────────────────
// Criada por líder do Kids (Mari/Milena · kids>=4). Editar a ficha no totem exige
// verificar essa senha (qualquer operador kids>=1).
router.get('/edit-senha/status', authorizeModule('kids', 1), async (_req, res) => {
  try {
    const { data } = await supabase.from('kids_totem_config').select('edit_senha_hash').eq('id', true).maybeSingle();
    res.json({ definida: !!data?.edit_senha_hash });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/edit-senha', authorizeModule('kids', 4), async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const senha = String(req.body?.senha || '');
    if (senha.length < 4) return res.status(400).json({ error: 'A senha precisa ter ao menos 4 caracteres' });
    const hash = bcrypt.hashSync(senha, 10);
    const { error } = await supabase.from('kids_totem_config')
      .update({ edit_senha_hash: hash, edit_senha_por: req.user?.userId || null, edit_senha_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', true);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar a senha' }); }
});

router.post('/edit-senha/verificar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const senha = String(req.body?.senha || '');
    const { data } = await supabase.from('kids_totem_config').select('edit_senha_hash').eq('id', true).maybeSingle();
    if (!data?.edit_senha_hash) return res.json({ ok: false, naoDefinida: true });
    res.json({ ok: bcrypt.compareSync(senha, data.edit_senha_hash) });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/totem-kids/criancas · listagem completa (admin)
router.get('/criancas', authorizeModule('kids', 1), async (req, res) => {
  try {
    const ativo = req.query.ativo !== 'false';
    // Paginado · a base de crianças (import XLSX + sync PCO) passa de 1000, e o
    // PostgREST capa em 1000 por página. Loop até trazer todas (antes capava em 500).
    const pageSize = 1000;
    let from = 0;
    let data = [];
    while (true) {
      const { data: page, error } = await supabase
        .from('kids_criancas')
        .select(`
          id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas,
          necessidades_especiais, serie, consent_marketing, data_conversao, data_batismo, visitante, ativo, inativado_em, familia_id,
          familia:mem_familias(id, nome),
          responsaveis:kids_responsaveis(membro:mem_membros(id, nome, telefone))
        `)
        .eq('ativo', ativo)
        .order('nome')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!page || page.length === 0) break;
      data = data.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    res.json(await Promise.all(data.map(async c => ({
      ...c,
      foto_url: await fotoVisivelCrianca(c),
      idade_meses: calcIdadeMeses(c.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    }))));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar crianças' });
  }
});

// ── Atendimentos por criança (histórico de contatos/cuidados da equipe) ──────
// GET /criancas/:id/atendimentos
router.get('/criancas/:id/atendimentos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_atendimentos')
      .select('*')
      .eq('crianca_id', req.params.id)
      .is('deleted_at', null)
      .order('data', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar atendimentos' }); }
});

// POST /criancas/:id/atendimentos  { tipo, descricao, data }
router.post('/criancas/:id/atendimentos', authorizeModule('kids', 2), async (req, res) => {
  try {
    const descricao = String(req.body?.descricao || '').trim();
    if (!descricao) return res.status(400).json({ error: 'Descreva o atendimento' });
    const tiposOk = ['contato', 'ausencia', 'saude', 'observacao', 'outro'];
    const tipo = tiposOk.includes(req.body?.tipo) ? req.body.tipo : 'contato';
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.data || '') ? req.body.data : new Date().toISOString().slice(0, 10);
    const { data: criado, error } = await supabase
      .from('kids_atendimentos')
      .insert({
        crianca_id: req.params.id, tipo, descricao: descricao.slice(0, 2000), data,
        registrado_por: req.user?.userId || null,
        registrado_por_nome: req.user?.name || req.user?.email || null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(criado);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar atendimento' }); }
});

// DELETE /atendimentos/:id (soft)
router.delete('/atendimentos/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('kids_atendimentos')
      .update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover atendimento' }); }
});

// PATCH /criancas/:id/inativar  { motivo }  ·  reativar com { ativo: true }
router.patch('/criancas/:id/inativar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const reativar = req.body?.ativo === true;
    const upd = reativar
      ? { ativo: true, inativado_em: null, motivo_inativacao: null }
      : { ativo: false, inativado_em: new Date().toISOString(), motivo_inativacao: String(req.body?.motivo || 'Desativado manualmente').slice(0, 300) };
    const { data, error } = await supabase.from('kids_criancas')
      .update(upd).eq('id', req.params.id).select('id, ativo').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar status' }); }
});

// ── Equipe do Kids por posição (usa os times/posições do voluntariado · PCO) ──
// As posições já existem no voluntariado (vol_teams "Kids"/"Apoio Kids"/"Vocal
// Kids" → vol_positions: Baby, Little 3-4, Recepção, Coordenação...). Os
// responsáveis do Kids alocam voluntários nessas posições gravando em
// vol_team_members — 1 fonte de verdade, integrada com o voluntariado.
async function kidsTeamsList() {
  const { data } = await supabase.from('vol_teams')
    .select('id, name, color, sort_order').ilike('name', '%kid%').eq('is_active', true);
  return data || [];
}
const limparTime = (n) => String(n || '').replace(/^[-\s]+/, '');

// GET /kids-equipe · times do Kids + posições + voluntários alocados
router.get('/kids-equipe', authorizeModule('kids', 1), async (req, res) => {
  try {
    const teams = await kidsTeamsList();
    if (!teams.length) return res.json([]);
    const teamIds = teams.map((t) => t.id);
    const [{ data: positions }, { data: membros }] = await Promise.all([
      supabase.from('vol_positions').select('id, team_id, name, sort_order').in('team_id', teamIds).eq('is_active', true),
      supabase.from('vol_team_members').select('id, team_id, position_id, volunteer_profile_id, volunteer_name').in('team_id', teamIds).eq('is_active', true),
    ]);
    const porPos = {}, semPos = {};
    (membros || []).forEach((m) => {
      if (m.position_id) (porPos[m.position_id] = porPos[m.position_id] || []).push(m);
      else (semPos[m.team_id] = semPos[m.team_id] || []).push(m);
    });
    const out = teams
      .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || a.name.localeCompare(b.name))
      .map((t) => ({
        team_id: t.id, team_nome: limparTime(t.name), cor: t.color,
        posicoes: (positions || []).filter((p) => p.team_id === t.id)
          .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
          .map((p) => ({ position_id: p.id, nome: p.name, membros: porPos[p.id] || [] })),
        sem_posicao: semPos[t.id] || [],
      }));
    res.json(out);
  } catch (e) { console.error('[totemKids] kids-equipe:', e.message); res.status(500).json({ error: 'Erro ao carregar equipe' }); }
});

// GET /kids-equipe/buscar?q= · busca voluntários (vol_profiles)
router.get('/kids-equipe/buscar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const { data } = await supabase.from('vol_profiles')
      .select('id, full_name, phone, email, avatar_url, membresia_id')
      .ilike('full_name', `%${q.replace(/[%_,]/g, '')}%`).limit(12);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro na busca' }); }
});

// POST /kids-equipe/membro · aloca voluntário numa posição (ou no time)
router.post('/kids-equipe/membro', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { team_id, position_id, vol_profile_id, nome } = req.body || {};
    if (!team_id || !vol_profile_id || !nome) return res.status(400).json({ error: 'Dados incompletos' });
    let dup = supabase.from('vol_team_members').select('id').eq('team_id', team_id).eq('volunteer_profile_id', vol_profile_id).eq('is_active', true);
    dup = position_id ? dup.eq('position_id', position_id) : dup.is('position_id', null);
    const { data: existe } = await dup.maybeSingle();
    if (existe) return res.status(409).json({ error: 'Voluntário já está nessa posição' });
    const { data, error } = await supabase.from('vol_team_members').insert({
      team_id, position_id: position_id || null, volunteer_profile_id: vol_profile_id,
      volunteer_name: String(nome).trim(), is_active: true,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { console.error('[totemKids] kids-equipe add:', e.message); res.status(500).json({ error: 'Erro ao alocar' }); }
});

// DELETE /kids-equipe/membro/:id · remove (desativa o vínculo)
router.delete('/kids-equipe/membro/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_team_members').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover' }); }
});

// GET /kids-equipe/membro/:volProfileId/ficha · ficha do voluntário
router.get('/kids-equipe/membro/:volProfileId/ficha', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: p } = await supabase.from('vol_profiles')
      .select('id, full_name, email, phone, cpf, avatar_url, membresia_id, profile_complete').eq('id', req.params.volProfileId).maybeSingle();
    if (!p) return res.status(404).json({ error: 'Voluntário não encontrado' });
    let antecedentes = null;
    if (p.membresia_id) {
      const { data: bc } = await supabase.from('vol_background_checks')
        .select('status, resultado, consulta_em, revisado_em, area').eq('membro_id', p.membresia_id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1);
      antecedentes = (bc || [])[0] || null;
    }
    const teams = await kidsTeamsList();
    const teamIds = teams.map((t) => t.id);
    let posicoes = [];
    if (teamIds.length) {
      const { data: tm } = await supabase.from('vol_team_members')
        .select('team_id, position_id').eq('volunteer_profile_id', p.id).eq('is_active', true).in('team_id', teamIds);
      const posIds = (tm || []).map((m) => m.position_id).filter(Boolean);
      const { data: posRows } = posIds.length
        ? await supabase.from('vol_positions').select('id, name').in('id', posIds)
        : { data: [] };
      const posMap = Object.fromEntries((posRows || []).map((r) => [r.id, r.name]));
      const teamMap = Object.fromEntries(teams.map((t) => [t.id, limparTime(t.name)]));
      posicoes = (tm || []).map((m) => ({ time: teamMap[m.team_id], posicao: m.position_id ? posMap[m.position_id] : null }));
    }
    res.json({ perfil: p, antecedentes, posicoes });
  } catch (e) { console.error('[totemKids] ficha equipe:', e.message); res.status(500).json({ error: 'Erro na ficha' }); }
});

// ── Estoque por sala (qtd esperada vs atual · liga ao Patrimônio com tag Kids) ─
// ── Sala ↔ Patrimônio · localizações Kids, sincronização e reflexo dos bens ──
// Localizações do módulo Patrimônio "do Kids" (CBKIDS, salas, recepção, copa...).
// Exclui os nós-reflexo "Kids" / "Kids · <sala>" criados pelo fluxo inverso.
async function localizacoesKidsPatrimonio() {
  const ors = ['nome.ilike.*kid*', 'nome.ilike.*infantil*', 'nome.ilike.*maternal*', 'nome.ilike.*berç*', 'nome.ilike.*baby*', 'nome.ilike.*little*', 'nome.ilike.*elevate*'].join(',');
  const { data } = await supabase.from('pat_localizacoes').select('id, nome').or(ors).order('nome');
  return (data || []).filter((l) => l.nome && !/^kids(\s·|$)/i.test(String(l.nome).trim()));
}

// GET /salas/localizacoes-kids · localizações Kids do patrimônio + se já têm sala
router.get('/salas/localizacoes-kids', authorizeModule('kids', 1), async (req, res) => {
  try {
    const locs = await localizacoesKidsPatrimonio();
    const { data: salas } = await supabase.from('kids_salas').select('pat_localizacao_id');
    const linkadas = new Set((salas || []).map((s) => s.pat_localizacao_id).filter(Boolean));
    res.json(locs.map((l) => ({ ...l, tem_sala: linkadas.has(l.id) })));
  } catch (e) { console.error('[totemKids] loc-kids:', e.message); res.status(500).json({ error: 'Erro ao listar localizações' }); }
});

// POST /salas/sincronizar-patrimonio · cria salas das localizações Kids sem sala
router.post('/salas/sincronizar-patrimonio', authorizeModule('kids', 3), async (req, res) => {
  try {
    const locs = await localizacoesKidsPatrimonio();
    const { data: salas } = await supabase.from('kids_salas').select('pat_localizacao_id, ordem');
    const linkadas = new Set((salas || []).map((s) => s.pat_localizacao_id).filter(Boolean));
    let ordem = Math.max(0, ...(salas || []).map((s) => s.ordem || 0));
    const novas = locs.filter((l) => !linkadas.has(l.id));
    if (!novas.length) return res.json({ criadas: 0, ja_linkadas: linkadas.size, total_loc: locs.length });
    const rows = novas.map((l) => ({ nome: l.nome, pat_localizacao_id: l.id, cor: '#00B39D', ordem: ++ordem }));
    const { error } = await supabase.from('kids_salas').insert(rows);
    if (error) throw error;
    res.json({ criadas: rows.length, ja_linkadas: linkadas.size, total_loc: locs.length });
  } catch (e) { console.error('[totemKids] sync salas:', e.message); res.status(500).json({ error: 'Erro ao sincronizar' }); }
});

// PATCH /salas/:id/localizacao · liga/desliga uma localização do patrimônio
router.patch('/salas/:id/localizacao', authorizeModule('kids', 3), async (req, res) => {
  try {
    const locId = req.body?.localizacao_id || null;
    const { data, error } = await supabase.from('kids_salas')
      .update({ pat_localizacao_id: locId }).eq('id', req.params.id).select('id, pat_localizacao_id').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[totemKids] link sala loc:', e.message); res.status(500).json({ error: 'Erro ao vincular localização' }); }
});

// GET /estoque · salas + itens + bens do patrimônio (sala vinculada) + resumo
router.get('/estoque', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: salas } = await supabase.from('kids_salas')
      .select('id, nome, cor, ordem, pat_localizacao_id').eq('ativo', true).order('ordem', { ascending: true });
    const { data: itens } = await supabase.from('kids_estoque')
      .select('id, sala_id, nome, categoria, unidade, qtd_esperada, qtd_atual, pat_bem_id, observacao')
      .is('deleted_at', null).order('categoria', { ascending: true });
    const porSala = {};
    (itens || []).forEach((i) => { (porSala[i.sala_id] = porSala[i.sala_id] || []).push(i); });
    // reflete os bens do Patrimônio das localizações vinculadas
    const locIds = [...new Set((salas || []).map((s) => s.pat_localizacao_id).filter(Boolean))];
    const patPorLoc = {};
    if (locIds.length) {
      const { data: bens } = await supabase.from('pat_bens')
        .select('id, nome, status, numero_serie, marca, modelo, localizacao_id, pat_categorias(nome)')
        .in('localizacao_id', locIds).order('nome');
      (bens || []).forEach((b) => { (patPorLoc[b.localizacao_id] = patPorLoc[b.localizacao_id] || []).push(b); });
    }
    res.json((salas || []).map((s) => {
      const list = porSala[s.id] || [];
      const faltando = list.filter((i) => (i.qtd_atual || 0) < (i.qtd_esperada || 0)).length;
      const patrimonio = s.pat_localizacao_id ? (patPorLoc[s.pat_localizacao_id] || []) : [];
      return { ...s, itens: list, faltando, total_itens: list.length, patrimonio };
    }));
  } catch (e) { console.error('[totemKids] estoque:', e.message); res.status(500).json({ error: 'Erro ao carregar estoque' }); }
});

// POST /salas/:salaId/estoque · novo item de estoque
router.post('/salas/:salaId/estoque', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { nome, categoria, unidade, qtd_esperada, qtd_atual, observacao } = req.body || {};
    if (!nome) return res.status(400).json({ error: 'Nome do item é obrigatório' });
    const { data, error } = await supabase.from('kids_estoque').insert({
      sala_id: req.params.salaId, nome: String(nome).trim(),
      categoria: categoria || null, unidade: unidade || 'un',
      qtd_esperada: Number(qtd_esperada) || 0, qtd_atual: Number(qtd_atual) || 0,
      observacao: observacao || null, created_by: req.user?.userId || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { console.error('[totemKids] estoque add:', e.message); res.status(500).json({ error: 'Erro ao adicionar item' }); }
});

// PATCH /estoque/:id · editar (quantidades, nome, categoria...)
router.patch('/estoque/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const upd = {};
    for (const k of ['nome', 'categoria', 'unidade', 'qtd_esperada', 'qtd_atual', 'observacao', 'ativo']) if (k in req.body) upd[k] = req.body[k];
    upd.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('kids_estoque').update(upd).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao editar item' }); }
});

// DELETE /estoque/:id · soft delete
router.delete('/estoque/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('kids_estoque').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover item' }); }
});

// POST /estoque/:id/patrimonio · registra o item no Patrimônio (tag Kids + sala)
router.post('/estoque/:id/patrimonio', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data: item } = await supabase.from('kids_estoque')
      .select('id, nome, observacao, pat_bem_id, sala_id').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (item.pat_bem_id) return res.status(409).json({ error: 'Item já está no patrimônio' });
    const { data: sala } = await supabase.from('kids_salas').select('nome').eq('id', item.sala_id).maybeSingle();
    const salaNome = sala?.nome || 'Kids';
    // categoria "Kids" (tag)
    const { data: cat } = await supabase.from('pat_categorias').select('id').ilike('nome', 'kids').limit(1).maybeSingle();
    // localização "Kids · <sala>" (find-or-create sob o nó "Kids")
    let { data: parent } = await supabase.from('pat_localizacoes').select('id').ilike('nome', 'Kids').is('pai_id', null).limit(1).maybeSingle();
    if (!parent) { const r = await supabase.from('pat_localizacoes').insert({ nome: 'Kids' }).select('id').single(); parent = r.data; }
    const locNome = `Kids · ${salaNome}`;
    let { data: loc } = await supabase.from('pat_localizacoes').select('id').ilike('nome', locNome).limit(1).maybeSingle();
    if (!loc) { const r = await supabase.from('pat_localizacoes').insert({ nome: locNome, pai_id: parent?.id || null }).select('id').single(); loc = r.data; }
    const { data: bem, error } = await supabase.from('pat_bens').insert({
      nome: item.nome, categoria_id: cat?.id || null, localizacao_id: loc?.id || null,
      status: 'ativo', observacoes: item.observacao || `Item do Kids · sala ${salaNome}`,
      created_by: req.user?.userId || null,
    }).select('id').single();
    if (error) throw error;
    await supabase.from('kids_estoque').update({ pat_bem_id: bem.id, updated_at: new Date().toISOString() }).eq('id', item.id);
    res.json({ ok: true, pat_bem_id: bem.id });
  } catch (e) { console.error('[totemKids] estoque->patrimonio:', e.message); res.status(500).json({ error: 'Erro ao registrar no patrimônio' }); }
});

// ── Resumo do Kids no fim do culto (WhatsApp + in-app/e-mail) ─────────────────
// Líderes: Matheus, Milena, Mariane (Mariane sem telefone → só in-app/e-mail).
async function lideresKidsComTelefone() {
  const { data } = await supabase.from('mem_membros')
    .select('id, nome, telefone')
    .or('nome.ilike.*milena*rochet*,nome.ilike.*mariane*gaia*,nome.ilike.*matheus*toscano*')
    .not('telefone', 'is', null).is('deleted_at', null);
  const seen = new Set(); const out = [];
  (data || []).forEach((m) => {
    const n = (m.nome || '').toLowerCase();
    const key = n.includes('milena') ? 'milena' : n.includes('mariane') ? 'mariane' : 'matheus';
    if (!seen.has(key)) { seen.add(key); out.push(m); }
  });
  return out;
}

async function gerarResumoKids(sessaoId, { exemplo = false } = {}) {
  let culto = { nome: 'Domingo 10:00', data: null };
  let totalCriancas = 0, decisoes = 0, porSala = [], voluntarios = [];
  if (exemplo) {
    culto = { nome: 'Domingo 10:00', data: new Date().toISOString().slice(0, 10) };
    totalCriancas = 23; decisoes = 2;
    porSala = [{ sala: 'Berçário', n: 4 }, { sala: 'Maternal', n: 6 }, { sala: 'Infantil 1', n: 8 }, { sala: 'Infantil 2', n: 5 }];
    voluntarios = ['Mariane Gaia · Coordenação', 'Milena Rochet · Recepção', 'Ana · Berçário'];
  } else if (sessaoId) {
    const { data: sessao } = await supabase.from('kids_sessoes').select('id, culto:cultos(nome, data)').eq('id', sessaoId).maybeSingle();
    if (sessao?.culto) culto = sessao.culto;
    const { data: cis } = await supabase.from('kids_checkins').select('sala_id, fez_decisao_jesus').eq('sessao_id', sessaoId).is('deleted_at', null);
    totalCriancas = (cis || []).length;
    decisoes = (cis || []).filter((c) => c.fez_decisao_jesus).length;
    const salaCount = {};
    (cis || []).forEach((c) => { if (c.sala_id) salaCount[c.sala_id] = (salaCount[c.sala_id] || 0) + 1; });
    const { data: salas } = await supabase.from('kids_salas').select('id, nome');
    const nomeSala = Object.fromEntries((salas || []).map((s) => [s.id, s.nome]));
    porSala = Object.entries(salaCount).map(([id, n]) => ({ sala: nomeSala[id] || 'Sala', n }));
  }
  const dataFmt = culto.data ? new Date(culto.data + 'T00:00:00').toLocaleDateString('pt-BR') : '';
  const linhas = [
    `🧒 *Resumo do Kids*${exemplo ? ' (exemplo)' : ''}`,
    `${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`,
    '',
    `👶 Crianças no check-in: *${totalCriancas}*`,
    `✝️ Decisões de fé: *${decisoes}*`,
  ];
  if (porSala.length) { linhas.push('', '*Por sala:*'); porSala.forEach((s) => linhas.push(`• ${s.sala}: ${s.n}`)); }
  if (voluntarios.length) { linhas.push('', '*Voluntários:*'); voluntarios.forEach((v) => linhas.push(`• ${v}`)); }
  linhas.push('', '_CBRio · enviado ao fim de cada culto com Kids._');
  const detalheParts = [];
  if (porSala.length) detalheParts.push(porSala.map((s) => `${s.sala} ${s.n}`).join(', '));
  if (voluntarios.length) detalheParts.push(`Voluntários: ${voluntarios.join(', ')}`);
  const params = [
    `${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`,
    String(totalCriancas),
    String(decisoes),
    detalheParts.join(' · ') || 'sem registros',
  ];
  return { texto: linhas.join('\n'), params };
}

// Envia o resumo por TEMPLATE aprovado (WHATSAPP_TEMPLATE_KIDS_RESUMO) quando a
// env existe (chega fora da janela de 24h); senão cai no texto livre (dentro da
// janela de 24h). pt_BR por padrão (configurável por WHATSAPP_TEMPLATE_KIDS_RESUMO_LANG).
async function enviarResumoWpp(telefone, { texto, params }) {
  const tpl = process.env.WHATSAPP_TEMPLATE_KIDS_RESUMO;
  if (tpl) return enviarTemplateWpp(telefone, tpl, process.env.WHATSAPP_TEMPLATE_KIDS_RESUMO_LANG || 'pt_BR', params);
  return enviarTextoWpp(telefone, texto);
}

async function enviarResumoKids(sessaoId) {
  try {
    const { texto, params } = await gerarResumoKids(sessaoId);
    const lideres = await lideresKidsComTelefone();
    for (const l of lideres) { await enviarResumoWpp(l.telefone, { texto, params }).catch(() => {}); }
    notificar({ modulo: 'kids', tipo: 'resumo_kids', titulo: 'Resumo do Kids (fim de culto)', mensagem: texto.replace(/\*/g, ''), severidade: 'info', link: '/ministerial/kids', email: true }).catch(() => {});
  } catch (e) { console.error('[totemKids] enviarResumoKids:', e.message); }
}

// POST /resumo/exemplo · envia um exemplo do resumo pro WhatsApp do solicitante
router.post('/resumo/exemplo', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { texto, params } = await gerarResumoKids(null, { exemplo: true });
    let telefone = req.body?.telefone || null;
    if (!telefone && req.user?.userId) {
      const { data: prof } = await supabase.from('profiles').select('email, membro_id').eq('id', req.user.userId).maybeSingle();
      if (prof?.membro_id) { const { data: m } = await supabase.from('mem_membros').select('telefone').eq('id', prof.membro_id).maybeSingle(); telefone = m?.telefone || null; }
      if (!telefone && prof?.email) { const { data: m } = await supabase.from('mem_membros').select('telefone').ilike('email', prof.email).is('deleted_at', null).not('telefone', 'is', null).limit(1).maybeSingle(); telefone = m?.telefone || null; }
    }
    if (!telefone) return res.status(400).json({ error: 'Você não tem telefone cadastrado na Membresia.' });
    const r = await enviarResumoWpp(telefone, { texto, params });
    if (!r?.ok) return res.status(502).json({ error: 'O WhatsApp não enviou — a janela de 24h pode ter fechado. Mande qualquer mensagem pro bot (21 99907-9031) e tente de novo.', preview: texto });
    res.json({ ok: true, telefone, preview: texto });
  } catch (e) { console.error('[totemKids] resumo exemplo:', e.message); res.status(500).json({ error: 'Erro ao enviar exemplo' }); }
});

// POST /resumo-pco/testar · DIAGNÓSTICO (só leitura · não grava, não envia):
// puxa os check-ins do Planning Center de um dia e devolve a frequência de
// crianças por culto + um retrato da estrutura do PCO. Default = último domingo.
router.post('/resumo-pco/testar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { coletarFrequenciaKidsPCO } = require('../services/planningCenterKidsCheckins');
    let data = req.body?.data;
    if (!data) {
      // último domingo (BRT)
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000);
      const d = new Date(hojeBRT); d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      data = d.toISOString().slice(0, 10);
    }
    const r = await coletarFrequenciaKidsPCO(data);
    res.json(r);
  } catch (e) {
    console.error('[totemKids] resumo-pco/testar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao consultar o Planning Center' });
  }
});

// POST /criancas/depurar-inativos · desativa as crianças (com vínculo PCO) que
// NÃO tiveram check-in nos últimos N meses (default 6). Saem da lista (que mostra
// só ativos). Reversível (ativo=false · não apaga). Body: { meses }.
router.post('/criancas/depurar-inativos', authorizeModule('kids', 3), async (req, res) => {
  try {
    const meses = Math.min(Math.max(Number(req.body?.meses) || 6, 1), 60);
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - meses);
    const { idsComCheckinDesde } = require('../services/planningCenterKidsCheckins');
    const ativosPco = await idsComCheckinDesde(cutoff.toISOString());

    // Crianças ativas COM vínculo PCO que não aparecem nos check-ins recentes.
    const inativar = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from('kids_criancas')
        .select('id, planning_center_id')
        .eq('ativo', true).is('deleted_at', null)
        .not('planning_center_id', 'is', null)
        .range(from, from + 999);
      if (error) throw error;
      if (!data || !data.length) break;
      for (const c of data) if (!ativosPco.has(String(c.planning_center_id))) inativar.push(c.id);
      if (data.length < 1000) break;
      from += 1000;
    }

    let desativadas = 0;
    const motivo = `Sem check-in no Planning Center nos últimos ${meses} meses`;
    for (let i = 0; i < inativar.length; i += 500) {
      const lote = inativar.slice(i, i + 500);
      const { error } = await supabase.from('kids_criancas')
        .update({ ativo: false, inativado_em: new Date().toISOString(), motivo_inativacao: motivo })
        .in('id', lote);
      if (!error) desativadas += lote.length;
    }
    res.json({ ok: true, meses, ativos_pco: ativosPco.size, desativadas });
  } catch (e) {
    console.error('[totemKids] depurar-inativos:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao depurar inativos' });
  }
});

// GET /pco-pessoa/:pcoId · ficha + histórico de check-ins de uma criança no PCO
// (clique na lista de frequência). Resolve a ficha local por planning_center_id
// quando existir (sexo, responsáveis). Só leitura.
router.get('/pco-pessoa/:pcoId', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { detalhePessoaPCO } = require('../services/planningCenterKidsCheckins');
    const r = await detalhePessoaPCO(req.params.pcoId);
    const { data: cr } = await supabase.from('kids_criancas')
      .select('id, nome, data_nascimento, sexo, visitante')
      .eq('planning_center_id', req.params.pcoId).maybeSingle();
    let responsaveis = [];
    if (cr?.id) {
      const { data: resp } = await supabase.from('kids_responsaveis')
        .select('parentesco, autorizado_buscar, membro:mem_membros(nome, telefone)')
        .eq('crianca_id', cr.id);
      responsaveis = (resp || []).map(x => ({
        parentesco: x.parentesco, autorizado_buscar: x.autorizado_buscar,
        nome: x.membro?.nome || null, telefone: x.membro?.telefone || null,
      }));
    }
    res.json({ ...r, crianca_local: cr || null, responsaveis });
  } catch (e) {
    console.error('[totemKids] pco-pessoa:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao consultar o Planning Center' });
  }
});

// E-mails dos destinatários do resumo (Mari Gaia, Milena, Matheus) → profile ids
// pra notificação in-app/e-mail (a Mari não tem WhatsApp, recebe por aqui).
const RESUMO_KIDS_EMAILS = ['mariane.gaia@cbrio.org', 'milena.rochet@cbrio.org', 'matheus.toscano@cbrio.org', 'matheus@cbrio.com.br'];

// Dispara o resumo de UM culto (total de crianças do PCO) pros líderes.
async function dispararResumoKidsCulto(culto, total) {
  const dataFmt = culto.data ? new Date(culto.data + 'T00:00:00').toLocaleDateString('pt-BR') : '';
  const linhas = [
    '🧒 *Resumo do Kids*',
    `${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`,
    '',
    `👶 Crianças no check-in: *${total}*`,
    '',
    '_Frequência do Planning Center · confira a lista em /ministerial/totem-kids/frequencia_',
  ];
  const texto = linhas.join('\n');
  const params = [`${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`, String(total), '—', 'Frequência do Planning Center'];
  // WhatsApp pros líderes com telefone (Matheus, Milena)
  const lideres = await lideresKidsComTelefone();
  for (const l of lideres) { await enviarResumoWpp(l.telefone, { texto, params }).catch(() => {}); }
  // In-app + e-mail pros 3 nominais (cobre a Mari, que não tem WhatsApp)
  let targetIds;
  try {
    const { data: alvos } = await supabase.from('profiles').select('id').in('email', RESUMO_KIDS_EMAILS);
    targetIds = (alvos || []).map(a => a.id);
  } catch { /* fallback no módulo kids */ }
  await notificar({
    modulo: 'kids', tipo: 'resumo_kids',
    titulo: 'Resumo do Kids (fim de culto)',
    mensagem: texto.replace(/\*/g, '').replace(/_/g, ''),
    link: '/ministerial/totem-kids/frequencia', severidade: 'info', email: true,
    chaveDedup: `resumo_kids_${culto.id}`,
    targetIds: targetIds && targetIds.length ? targetIds : undefined,
  }).catch(() => {});
}

// GET /cron/resumo-pco · roda de hora em hora (vercel.json · crons da Vercel são
// GET). Pra cada culto com Kids que JÁ terminou (data+horário+90min) e ainda não
// teve resumo enviado, puxa o total de crianças do PCO, grava em
// cultos.presencial_kids e dispara o resumo pros líderes. Idempotente (dedup por
// kids_resumo_enviado_at). Self-gating (barato quando não há culto pendente).
router.get('/cron/resumo-pco', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { coletarFrequenciaKidsPCO } = require('../services/planningCenterKidsCheckins');
    const agora = Date.now();
    const agoraBRT = new Date(agora - 3 * 3600 * 1000);
    const hoje = agoraBRT.toISOString().slice(0, 10);
    const ontem = new Date(agoraBRT.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Cultos com Kids dos últimos 2 dias (pendentes de resumo + já resumidos,
    // estes pra RECONCILIAR o número · check-ins corrigidos no PCO depois da
    // foto deixavam o dashboard ±1 diferente do módulo · 06/07).
    const { data: cultos } = await supabase
      .from('cultos')
      .select('id, nome, data, presencial_kids, kids_resumo_enviado_at, vol_service_types(recurrence_time, has_kids)')
      .in('data', [ontem, hoje]);

    // Só os que têm Kids e JÁ terminaram (início + 90 min de folga).
    const terminados = (cultos || []).filter((c) => {
      if (!c.vol_service_types?.has_kids) return false;
      const hhmm = (c.vol_service_types.recurrence_time || '').slice(0, 5);
      if (!hhmm) return false;
      const inicio = new Date(`${c.data}T${hhmm}:00-03:00`).getTime();
      return agora >= inicio + 90 * 60 * 1000;
    });
    const pendentes = terminados.filter((c) => !c.kids_resumo_enviado_at);
    const reconciliar = terminados.filter((c) => c.kids_resumo_enviado_at);
    if (!pendentes.length && !reconciliar.length) {
      return res.json({ ok: true, enviados: 0, motivo: 'nenhum culto pendente' });
    }

    // Coleta 1x por data (a coleta já devolve o total por culto do dia).
    const datas = [...new Set([...pendentes, ...reconciliar].map((c) => c.data))];
    const porData = {};
    for (const d of datas) {
      try { porData[d] = await coletarFrequenciaKidsPCO(d); } catch (e) { console.error(`[resumo-pco] coleta ${d}:`, e.message); porData[d] = null; }
    }

    let enviados = 0;
    const detalhe = [];
    for (const c of pendentes) {
      const col = porData[c.data];
      if (!col) continue; // coleta falhou → tenta de novo na próxima hora
      const entry = (col.por_culto || []).find((p) => p.culto_id === c.id);
      const total = entry?.total || 0;
      if (total <= 0) continue; // sem dado ainda (ou culto sem Kids) → não envia "0", reavalia depois
      await supabase.from('cultos')
        .update({ presencial_kids: total, kids_resumo_enviado_at: new Date().toISOString() })
        .eq('id', c.id);
      await dispararResumoKidsCulto(c, total);
      enviados += 1;
      detalhe.push({ culto: c.nome, total });
    }

    // Reconciliação: check-ins corrigidos no PCO depois da foto → atualiza o
    // número SEM reenviar o resumo (kids_resumo_enviado_at fica como está).
    let reconciliados = 0;
    for (const c of reconciliar) {
      const col = porData[c.data];
      if (!col) continue;
      const entry = (col.por_culto || []).find((p) => p.culto_id === c.id);
      const total = entry?.total || 0;
      if (total > 0 && total !== c.presencial_kids) {
        await supabase.from('cultos').update({ presencial_kids: total }).eq('id', c.id);
        reconciliados += 1;
        detalhe.push({ culto: c.nome, total, reconciliado: true, antes: c.presencial_kids });
      }
    }
    // Persiste a presença por criança (frequência do Kids · alimenta a aba/alerta
    // "faltando 3+ cultos") a partir do que já foi coletado do PCO.
    try {
      const { data: cris } = await supabase.from('kids_criancas')
        .select('id, planning_center_id').not('planning_center_id', 'is', null).is('deleted_at', null);
      const porPco = new Map((cris || []).map((c) => [String(c.planning_center_id), c.id]));
      for (const d of datas) {
        const col = porData[d]; if (!col) continue;
        const uniq = new Map();
        for (const culto of col.por_culto || []) for (const cr of culto.criancas || []) {
          const cid = cr.pco_id ? porPco.get(String(cr.pco_id)) : null;
          if (cid) uniq.set(cid, { crianca_id: cid, data: d, culto_id: culto.culto_id || null });
        }
        if (uniq.size) await supabase.from('kids_pco_presencas').upsert([...uniq.values()], { onConflict: 'crianca_id,data', ignoreDuplicates: true });
      }
    } catch (e) { console.error('[resumo-pco] presencas:', e.message); }

    res.json({ ok: true, enviados, reconciliados, detalhe });
  } catch (e) {
    console.error('[totemKids] cron resumo-pco:', e.message);
    res.status(500).json({ error: e.message || 'Erro no resumo do Kids' });
  }
});

// POST /sync-presencas-pco?dias=90 · backfill das presenças por criança (do PCO)
// pras datas de culto com Kids no período. Alimenta a aba/alerta de faltantes.
router.post('/sync-presencas-pco', authorizeModule('kids', 3), async (req, res) => {
  try {
    const dias = Math.min(400, Math.max(1, Number(req.query.dias || req.body?.dias) || 90));
    const { sincronizarPresencasKidsPCO } = require('../services/planningCenterKidsCheckins');
    const r = await sincronizarPresencasKidsPCO({ dias });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[totemKids] sync-presencas-pco:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao sincronizar presenças do PCO' });
  }
});

// GET /batismos · crianças inscritas pra batismo (eh_crianca ou <13 anos) · a
// equipe Kids contata a família. Aparece também na Integração (não duplica dado).
router.get('/batismos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const corte = new Date(); corte.setFullYear(corte.getFullYear() - 13);
    const corteISO = corte.toISOString().slice(0, 10);
    const { data } = await supabase.from('batismo_inscricoes')
      .select('id, nome, sobrenome, data_nascimento, telefone, email, status, data_batismo, horario_culto, possui_deficiencia, deficiencia_descricao, observacoes, created_at, membro_id')
      .is('deleted_at', null)
      .or(`eh_crianca.eq.true,data_nascimento.gte.${corteISO}`)
      .order('data_batismo', { ascending: true, nullsFirst: false })
      .limit(500);
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids] batismos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar batismos' });
  }
});

// Apresentação de crianças · inscrições do form público (agrupadas por turma na UI)
router.get('/apresentacoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data } = await supabase.from('apresentacao_criancas')
      .select('id, nome_pai, nome_mae, crianca_nome, crianca_idade, telefone, data_apresentacao, status, observacoes, origem, crianca_id, created_at')
      .is('deleted_at', null)
      .order('data_apresentacao', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1000);
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids] apresentacoes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar apresentações' });
  }
});

router.patch('/apresentacoes/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const allowed = ['status', 'observacoes', 'data_apresentacao', 'crianca_idade'];
    const payload = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (req.body[k] !== undefined) payload[k] = req.body[k];
    const { data, error } = await supabase.from('apresentacao_criancas')
      .update(payload).eq('id', req.params.id).is('deleted_at', null)
      .select('id, status, observacoes, data_apresentacao, crianca_idade').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[totemKids] apresentacao update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar apresentação' });
  }
});

router.delete('/apresentacoes/:id', authorizeModule('kids', 4), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'apresentacao_criancas', p_row_id: req.params.id, p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] apresentacao delete:', e.message);
    res.status(500).json({ error: 'Erro ao remover apresentação' });
  }
});

// GET /dashboard · resumo do Kids (cards) + solicitações de vínculo pendentes +
// aniversariantes da semana. Alimenta o hub/dashboard do módulo.
router.get('/dashboard', authorizeModule('kids', 1), async (req, res) => {
  try {
    const corteBat = new Date(); corteBat.setFullYear(corteBat.getFullYear() - 13);
    const [ativas, pend, salas, sess, bat] = await Promise.all([
      supabase.from('kids_criancas').select('id', { count: 'exact', head: true }).eq('ativo', true).is('deleted_at', null),
      supabase.from('kids_vinculo_solicitacoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente').is('deleted_at', null),
      supabase.from('kids_salas').select('id', { count: 'exact', head: true }),
      supabase.from('kids_sessoes').select('id', { count: 'exact', head: true }).eq('status', 'aberta').is('deleted_at', null),
      supabase.from('batismo_inscricoes').select('id', { count: 'exact', head: true }).is('deleted_at', null).neq('status', 'realizado').or(`eh_crianca.eq.true,data_nascimento.gte.${corteBat.toISOString().slice(0, 10)}`),
    ]);
    const { data: vinc } = await supabase.from('kids_vinculo_solicitacoes')
      .select('id, crianca_nome, solicitante_nome, solicitante_parentesco, created_at')
      .eq('status', 'pendente').is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(8);
    const { data: kids } = await supabase.from('kids_criancas')
      .select('id, nome, data_nascimento, foto_url')
      .eq('ativo', true).is('deleted_at', null).not('data_nascimento', 'is', null).range(0, 999);
    const hoje = new Date();
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(hoje); d.setDate(hoje.getDate() + i);
      dias.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    const aniversariantes = (kids || [])
      .filter((k) => dias.includes(String(k.data_nascimento).slice(5, 10)))
      .map((k) => ({ id: k.id, nome: k.nome, data_nascimento: k.data_nascimento, foto_url: k.foto_url }))
      .sort((a, b) => String(a.data_nascimento).slice(5).localeCompare(String(b.data_nascimento).slice(5)));
    res.json({
      resumo: {
        criancas_ativas: ativas.count || 0,
        vinculos_pendentes: pend.count || 0,
        salas: salas.count || 0,
        sessoes_abertas: sess.count || 0,
        aniversariantes_semana: aniversariantes.length,
        batismos_criancas: bat.count || 0,
      },
      vinculos: vinc || [],
      aniversariantes,
    });
  } catch (e) {
    console.error('[totemKids] dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

// POST /criancas/:id/foto · equipe Kids adiciona/troca a foto da criança (no
// sistema). Recebe dataURL base64, sobe pro bucket privado kids-documentos via
// service_role; a foto só aparece resolvida por signed URL (fotoVisivelCrianca).
router.post('/criancas/:id/foto', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Imagem inválida' });
    const mime = m[1];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'Imagem muito grande (máx 5MB)' });
    const path = `foto-crianca/${req.params.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('kids-documentos').upload(path, buffer, { contentType: mime, upsert: true });
    if (upErr) throw upErr;
    // apaga a foto anterior (se houver)
    const { data: prev } = await supabase.from('kids_criancas').select('foto_storage_path').eq('id', req.params.id).maybeSingle();
    if (prev?.foto_storage_path && prev.foto_storage_path !== path) {
      await supabase.storage.from('kids-documentos').remove([prev.foto_storage_path]).catch(() => {});
    }
    await supabase.from('kids_criancas').update({
      foto_storage_path: path, foto_url: null,
      foto_consentimento_em: new Date().toISOString(), foto_consentimento_por: req.user?.userId || null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    const { data: signed } = await supabase.storage.from('kids-documentos').createSignedUrl(path, 60 * 30);
    res.json({ foto_url: signed?.signedUrl || null });
  } catch (e) {
    console.error('[totemKids] foto upload:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a foto' });
  }
});

// DELETE /criancas/:id/foto · remove a foto
router.delete('/criancas/:id/foto', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { data: c } = await supabase.from('kids_criancas').select('foto_storage_path').eq('id', req.params.id).maybeSingle();
    if (c?.foto_storage_path) await supabase.storage.from('kids-documentos').remove([c.foto_storage_path]).catch(() => {});
    await supabase.from('kids_criancas').update({ foto_storage_path: null, foto_url: null, foto_consentimento_em: null, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] foto remove:', e.message);
    res.status(500).json({ error: 'Erro ao remover a foto' });
  }
});

// GET /criancas/:id/jornada · família (membros) + frequência (check-ins por mês)
// + conversão sugerida (1ª decisão de fé no check-in). Frequência fica vazia até
// os check-ins do totem rodarem.
router.get('/criancas/:id/jornada', authorizeModule('kids', 1), async (req, res) => {
  try {
    const id = req.params.id;
    const { data: crianca } = await supabase.from('kids_criancas').select('familia_id, planning_center_id').eq('id', id).maybeSingle();
    let familia_membros = [];
    if (crianca?.familia_id) {
      const { data: ms } = await supabase.from('mem_membros')
        .select('id, nome, telefone').eq('familia_id', crianca.familia_id).is('deleted_at', null).order('nome');
      familia_membros = ms || [];
    }
    const { data: cis } = await supabase.from('kids_checkins')
      .select('checkin_at, fez_decisao_jesus, decisao_jesus_em')
      .eq('crianca_id', id).is('deleted_at', null).order('checkin_at');
    const lista = cis || [];
    const porMesMap = {};
    let ultima = null;     // 'YYYY-MM-DD'
    let total = 0;
    const addCheckin = (dataYmd) => {
      if (!dataYmd) return;
      const ymd = String(dataYmd).slice(0, 10);
      porMesMap[ymd.slice(0, 7)] = (porMesMap[ymd.slice(0, 7)] || 0) + 1;
      if (!ultima || ymd > ultima) ultima = ymd;
      total += 1;
    };
    lista.forEach((c) => addCheckin(c.checkin_at)); // totem (quando houver)

    // Frequência REAL vem do Planning Center: histórico de check-ins da criança
    // nos eventos do Kids (CBKids). Liga o gráfico mesmo sem o totem.
    if (crianca?.planning_center_id) {
      try {
        const { detalhePessoaPCO, ehEventoKids } = require('../services/planningCenterKidsCheckins');
        const det = await detalhePessoaPCO(crianca.planning_center_id);
        (det?.historico || []).forEach((h) => {
          if (String(h.kind || '').toLowerCase() === 'volunteer') return;
          if (h.evento && !ehEventoKids(h.evento)) return; // só check-ins do Kids
          addCheckin(h.data);
        });
      } catch (e) { console.error('[totemKids] jornada PCO:', e.message); }
    }

    const porMes = Object.entries(porMesMap).map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes));
    const dec = lista.filter((c) => c.fez_decisao_jesus).map((c) => c.decisao_jesus_em || c.checkin_at).filter(Boolean).sort();
    res.json({
      familia_membros,
      frequencia: { porMes, ultima, total },
      conversao_sugerida: dec.length ? String(dec[0]).slice(0, 10) : null,
    });
  } catch (e) {
    console.error('[totemKids] jornada:', e.message);
    res.status(500).json({ error: 'Erro ao carregar jornada' });
  }
});

// GET /criancas/:id/analise-frequencia · análise de IA (Haiku) da frequência da
// criança a partir do histórico de check-ins do Planning Center. As estatísticas
// são calculadas em JS (não no modelo); a IA só interpreta e sugere ação pastoral.
router.get('/criancas/:id/analise-frequencia', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: cr } = await supabase.from('kids_criancas')
      .select('nome, data_nascimento, planning_center_id, data_conversao, data_batismo')
      .eq('id', req.params.id).maybeSingle();
    if (!cr) return res.status(404).json({ error: 'Criança não encontrada' });
    if (!cr.planning_center_id) return res.json({ sem_dados: true, motivo: 'Criança sem vínculo com o Planning Center.' });

    const { detalhePessoaPCO, ehEventoKids } = require('../services/planningCenterKidsCheckins');
    const det = await detalhePessoaPCO(cr.planning_center_id);
    const datas = (det?.historico || [])
      .filter(h => String(h.kind || '').toLowerCase() !== 'volunteer' && (!h.evento || ehEventoKids(h.evento)) && h.data)
      .map(h => h.data).sort();
    if (!datas.length) return res.json({ sem_dados: true, motivo: 'Sem check-ins do Kids no Planning Center.' });

    const hoje = new Date();
    const diasDesde = (d) => Math.floor((hoje - new Date(d + 'T00:00:00')) / 86400000);
    const ultimo = datas[datas.length - 1];
    const primeiro = datas[0];
    const dias90 = datas.filter(d => diasDesde(d) <= 90).length;
    const dias90a180 = datas.filter(d => diasDesde(d) > 90 && diasDesde(d) <= 180).length;
    const porMes = {};
    datas.forEach(d => { const m = d.slice(0, 7); porMes[m] = (porMes[m] || 0) + 1; });
    const mesesComPresenca = Object.keys(porMes).length;
    const idade = cr.data_nascimento ? Math.floor((hoje - new Date(cr.data_nascimento + 'T00:00:00')) / (365.25 * 86400000)) : null;

    const stats = {
      nome: cr.nome, idade,
      total_checkins: datas.length,
      primeiro_checkin: primeiro, ultimo_checkin: ultimo,
      dias_desde_ultimo: diasDesde(ultimo),
      checkins_ultimos_90d: dias90, checkins_90_a_180d: dias90a180,
      meses_com_presenca: mesesComPresenca,
      ja_convertida: !!cr.data_conversao, ja_batizada: !!cr.data_batismo,
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ stats, situacao: null, analise: 'Análise de IA indisponível (chave não configurada).', recomendacao: null });
    }
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();
    const sys = 'Você é analista do ministério infantil (Kids) de uma igreja. A partir de estatísticas de frequência (check-ins) de UMA criança, escreva uma análise curta e útil pra liderança. Responda SOMENTE com JSON válido: {"situacao":"frequente|regular|esporadica|afastada","analise":"2 a 3 frases, específica com números e datas","recomendacao":"1 frase de ação pastoral"}. Português do Brasil. Hoje é ' + hoje.toISOString().slice(0, 10) + '. "afastada" = sem check-in há 60+ dias.';
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: sys,
      messages: [{ role: 'user', content: JSON.stringify(stats) }],
    });
    const raw = (msg?.content?.[0]?.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { analise: raw }; }
    res.json({ stats, situacao: parsed.situacao || null, analise: parsed.analise || '', recomendacao: parsed.recomendacao || null });
  } catch (e) {
    console.error('[totemKids] analise-frequencia:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar análise' });
  }
});

// GET /cron/age-out · desativa crianças que completaram 13 anos (12a+12m) ·
// vira adolescente, sai do Kids (preserva histórico). Cron diário OU admin.
router.get('/cron/age-out', async (req, res) => {
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const limite = new Date(); limite.setFullYear(limite.getFullYear() - 13);
    const limiteISO = limite.toISOString().slice(0, 10); // nasceu até esta data = 13+
    const { data, error } = await supabase.from('kids_criancas')
      .update({ ativo: false, inativado_em: new Date().toISOString(), motivo_inativacao: 'Completou 13 anos · graduou para adolescente' })
      .eq('ativo', true).is('deleted_at', null)
      .not('data_nascimento', 'is', null).lte('data_nascimento', limiteISO)
      .select('id');
    if (error) throw error;
    res.json({ ok: true, graduados: (data || []).length });
  } catch (e) { console.error('[totemKids] age-out:', e.message); res.status(500).json({ error: 'Erro no age-out' }); }
});

// POST /api/totem-kids/sync-pco · puxa a base de crianças do Planning Center
// Check-Ins e faz upsert por planning_center_id (idempotente). Nível 3 no módulo.
router.post('/sync-pco', authorizeModule('kids', 3), async (req, res) => {
  try {
    const maxIdade = Number(req.body?.maxIdade) || 12;
    const resumo = await syncCriancasPCO({ maxIdade });
    res.json({ ok: true, ...resumo });
  } catch (e) {
    console.error('[totemKids/sync-pco]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao sincronizar com o Planning Center' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSÁVEIS
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/totem-kids/criancas/:id/responsaveis · adiciona responsável autorizado
router.post('/criancas/:id/responsaveis', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { membro_id, parentesco, autorizado_buscar, contato_emergencia, observacao } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });

    const { data, error } = await supabase
      .from('kids_responsaveis')
      .insert({
        crianca_id: req.params.id,
        membro_id,
        parentesco: parentesco || 'outro',
        autorizado_buscar: autorizado_buscar !== false,
        contato_emergencia: !!contato_emergencia,
        observacao: observacao || null,
      })
      .select('*, membro:mem_membros(id, nome, telefone, foto_url)')
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Responsável já cadastrado' });
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao adicionar responsável' });
  }
});

// POST /api/totem-kids/criancas/:id/responsavel-rapido
// Cria/vincula responsável a partir de dados crus (nome, tel, cpf, parentesco).
// Cria mem_membros se não existir (match por cpf/telefone) + liga em kids_responsaveis.
// Usado pelo modal de auto-cadastro quando criança chega sem responsável.
router.post('/criancas/:id/responsavel-rapido', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { nome, telefone, cpf, parentesco, autorizado_buscar } = req.body || {};
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'nome obrigatorio' });
    if (!telefone || !telefone.trim()) return res.status(400).json({ error: 'telefone obrigatorio' });

    const tel = normalizarTelefone(telefone);
    const cpfNorm = normalizarCpf(cpf);
    if (!tel) return res.status(400).json({ error: 'telefone invalido (precisa ter pelo menos 8 digitos)' });

    // 1. Resolve criança + família (pra vincular novo mem_membros na família)
    const { data: crianca, error: errC } = await supabase
      .from('kids_criancas')
      .select('id, nome, familia_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (errC) throw errC;
    if (!crianca) return res.status(404).json({ error: 'criança não encontrada' });

    // 2. Resolve mem_membros · guarda na origem (CPF→e-mail→telefone+nome→cria)
    const r = await acharOuCriarGuardado({
      cpf: cpfNorm, telefone: tel, nome: nome.trim(), status: 'visitante',
      extra: { familia_id: crianca.familia_id || null },
    });
    const { data: membro } = await supabase.from('mem_membros')
      .select('id, nome, familia_id').eq('id', r.membro_id).single();
    // Membro já existia sem família → herda a da criança
    if (!r.created && crianca.familia_id && !membro.familia_id) {
      await supabase.from('mem_membros').update({ familia_id: crianca.familia_id }).eq('id', membro.id);
    }

    // 4. Vincula kids_responsaveis (upsert · idempotente)
    const { data: ligacao, error: errLig } = await supabase
      .from('kids_responsaveis')
      .upsert({
        crianca_id: req.params.id,
        membro_id: membro.id,
        parentesco: parentesco || 'outro',
        autorizado_buscar: autorizado_buscar !== false,
      }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false })
      .select('*, membro:mem_membros(id, nome, telefone, foto_url)')
      .single();
    if (errLig) throw errLig;

    res.status(201).json(ligacao);
  } catch (e) {
    console.error('[totemKids/responsavel-rapido]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao adicionar responsável' });
  }
});

// DELETE /api/totem-kids/responsaveis/:id · remove responsável
router.delete('/responsaveis/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('kids_responsaveis').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover responsável' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CHECK-IN / CHECK-OUT
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/totem-kids/ausentes?min=3 · crianças ativas faltando N cultos seguidos
// (aba dedicada · mesma régua do alerta) + contato dos responsáveis pra ação.
router.get('/ausentes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const min = Math.max(1, Number(req.query.min) || 3);
    const { data: ausentes, error } = await supabase
      .rpc('fn_kids_ausentes_consecutivos', { p_min: min });
    if (error) throw error;
    const ids = (ausentes || []).map(a => a.crianca_id);
    let respPorCrianca = {};
    if (ids.length) {
      const { data: resps } = await supabase
        .from('kids_responsaveis')
        .select('crianca_id, parentesco, autorizado_buscar, membro:mem_membros(nome, telefone)')
        .in('crianca_id', ids);
      for (const r of resps || []) {
        (respPorCrianca[r.crianca_id] = respPorCrianca[r.crianca_id] || []).push({
          nome: r.membro?.nome || null,
          telefone: r.membro?.telefone || null,
          parentesco: r.parentesco || null,
          autorizado_buscar: r.autorizado_buscar || false,
        });
      }
    }
    res.json((ausentes || []).map(a => ({
      ...a,
      responsaveis: respPorCrianca[a.crianca_id] || [],
    })));
  } catch (e) {
    console.error('[totemKids/ausentes]', e.message);
    res.status(500).json({ error: 'Erro ao listar crianças faltantes' });
  }
});

// GET /api/totem-kids/cultos-do-dia?data=YYYY-MM-DD · cultos COM Kids do dia
// (pro check-in multi-culto: marcar em quais a criança vai ficar).
router.get('/cultos-do-dia', authorizeModule('kids', 2), async (req, res) => {
  try {
    const data = req.query.data;
    if (!data) return res.json([]);
    const { data: cultos } = await supabase.from('cultos')
      .select('id, nome, vol_service_types(has_kids, recurrence_time)')
      .eq('data', data);
    const lista = (cultos || [])
      .filter(c => c.vol_service_types?.has_kids)
      .map(c => ({ id: c.id, nome: c.nome, hora: (c.vol_service_types?.recurrence_time || '').slice(0, 5) }))
      .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    res.json(lista);
  } catch (e) {
    console.error('[totemKids/cultos-do-dia]', e.message);
    res.status(500).json({ error: 'Erro ao listar cultos do dia' });
  }
});

// POST /api/totem-kids/checkin · cria check-in + gera código + retorna pra impressão
router.post('/checkin', authorizeModule('kids', 2), async (req, res) => {
  try {
    const {
      sessao_id, crianca_id, sala_id, estacao_id,
      responsavel_id, responsavel_nome_manual, responsavel_telefone_manual, responsavel_parentesco,
      pager_id,
      cultos_extras, // ids de OUTROS cultos do dia em que a criança também fica (multi-culto)
    } = req.body;

    if (!sessao_id) return res.status(400).json({ error: 'sessao_id obrigatorio' });
    if (!crianca_id) return res.status(400).json({ error: 'crianca_id obrigatorio' });
    if (!sala_id) return res.status(400).json({ error: 'sala_id obrigatorio' });

    // Sessão deve estar aberta
    const { data: sessao } = await supabase
      .from('kids_sessoes')
      .select('id, status, culto_id, culto:cultos(data, nome)')
      .eq('id', sessao_id)
      .maybeSingle();
    if (!sessao) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (sessao.status !== 'aberta') {
      return res.status(400).json({ error: 'Sessão não esta aberta', status: sessao.status });
    }

    // Anti-duplicidade: não deixa 2 checkins na mesma sessão pra mesma criança
    const { data: existing } = await supabase
      .from('kids_checkins')
      .select('id, codigo_seguranca, sala_id, checkout_at')
      .eq('sessao_id', sessao_id)
      .eq('crianca_id', crianca_id)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({
        error: 'Criança já com check-in nessa sessão',
        checkin_existente: existing,
      });
    }

    // Resolve snapshot do responsável
    let respId = null, respNome = null, respTel = null;
    if (responsavel_id) {
      const { data: m } = await supabase
        .from('mem_membros').select('id, nome, telefone').eq('id', responsavel_id).maybeSingle();
      if (m) {
        respId = m.id;
        respNome = m.nome;
        respTel = m.telefone;
      }
    }
    if (!respNome && responsavel_nome_manual) {
      respNome = responsavel_nome_manual;
      respTel = normalizarTelefone(responsavel_telefone_manual);
    }
    if (!respNome) return res.status(400).json({ error: 'responsavel_id ou responsavel_nome_manual obrigatório' });

    // Buscar dados da criança (pro snapshot na resposta)
    const { data: crianca } = await supabase
      .from('kids_criancas')
      .select('id, nome, data_nascimento, observacoes_medicas, necessidades_especiais')
      .eq('id', crianca_id)
      .maybeSingle();
    if (!crianca) return res.status(404).json({ error: 'Criança não encontrada' });

    // Buscar sala
    const { data: sala } = await supabase
      .from('kids_salas')
      .select('id, nome, cor')
      .eq('id', sala_id)
      .maybeSingle();
    if (!sala) return res.status(404).json({ error: 'Sala não encontrada' });

    // Gera código via função do banco
    const { data: codigoRow, error: errCod } = await supabase.rpc('fn_kids_gerar_codigo_seguranca');
    const codigo = codigoRow || (errCod ? null : null);
    if (!codigo) {
      // fallback js
      const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let c = '';
      for (let i = 0; i < 4; i++) c += alfa[Math.floor(Math.random() * alfa.length)];
      // tenta
    }
    const codigoFinal = codigo || (() => {
      const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let c = '';
      for (let i = 0; i < 4; i++) c += alfa[Math.floor(Math.random() * alfa.length)];
      return c;
    })();

    // Multi-culto: se a criança fica em mais de um culto, todas as linhas
    // (uma por culto) compartilham o mesmo código + checkin_grupo_id. A retirada
    // fecha o grupo; cada culto conta a presença (consolidação por sessao_id).
    const cultosExtras = Array.isArray(cultos_extras)
      ? [...new Set(cultos_extras.map(String))].filter(cid => cid && cid !== sessao.culto_id)
      : [];
    const grupoId = cultosExtras.length ? require('crypto').randomUUID() : null;

    // INSERT (primário · culto atual · leva pager/etiqueta)
    const { data: checkin, error: errIns } = await supabase
      .from('kids_checkins')
      .insert({
        sessao_id,
        crianca_id,
        sala_id,
        estacao_checkin_id: estacao_id || null,
        responsavel_checkin_id: respId,
        responsavel_checkin_nome: respNome,
        responsavel_checkin_telefone: respTel,
        responsavel_checkin_parentesco: responsavel_parentesco || null,
        codigo_seguranca: codigoFinal,
        codigo_barras: codigoFinal,                      // mesmo código
        pager_id: pager_id || null,                      // pager entregue a família (opcional)
        checkin_por: req.user.userId,
        checkin_grupo_id: grupoId,
      })
      .select('*')
      .single();
    if (errIns) throw errIns;

    // Cultos do grupo (pro recibo): começa com o atual.
    const cultosDoGrupo = [{ id: sessao.culto_id, nome: sessao.culto?.nome || null }];

    // Linhas secundárias dos outros cultos do dia (find-or-create a sessão).
    for (const cultoId of cultosExtras) {
      try {
        let { data: sx } = await supabase.from('kids_sessoes')
          .select('id, status, culto:cultos(nome)').eq('culto_id', cultoId).maybeSingle();
        if (!sx) {
          const { data: nova } = await supabase.from('kids_sessoes')
            .insert({ culto_id: cultoId, status: 'aberta', abrir_em: new Date().toISOString() })
            .select('id, status, culto:cultos(nome)').single();
          sx = nova;
        }
        if (!sx) continue;
        const { error: e2 } = await supabase.from('kids_checkins').insert({
          sessao_id: sx.id, crianca_id, sala_id,
          estacao_checkin_id: estacao_id || null,
          responsavel_checkin_id: respId,
          responsavel_checkin_nome: respNome,
          responsavel_checkin_telefone: respTel,
          responsavel_checkin_parentesco: responsavel_parentesco || null,
          codigo_seguranca: codigoFinal, codigo_barras: codigoFinal,
          checkin_por: req.user.userId, checkin_grupo_id: grupoId, labels_impressas: 0,
        });
        // 23505 = criança já tinha check-in nesse culto · ignora
        if (!e2 || e2.code === '23505') cultosDoGrupo.push({ id: cultoId, nome: sx.culto?.nome || null });
      } catch (ex) { console.error('[totemKids/checkin] culto extra:', ex.message); }
    }

    // Retorna tudo pro frontend renderizar as 2 etiquetas
    res.status(201).json({
      checkin,
      crianca,
      sala,
      sessao: { id: sessao.id, culto: sessao.culto },
      cultos: cultosDoGrupo,
      responsavel: { id: respId, nome: respNome, telefone: respTel, parentesco: responsavel_parentesco },
      codigo_seguranca: codigoFinal,
      codigo_barras: codigoFinal,
    });
  } catch (e) {
    console.error('[totemKids/checkin]', e.message);
    res.status(500).json({ error: 'Erro ao fazer check-in' });
  }
});

// GET /api/totem-kids/checkin/codigo/:código · busca por código de segurança
router.get('/checkin/codigo/:codigo', authorizeModule('kids', 2), async (req, res) => {
  try {
    const codigo = String(req.params.codigo).toUpperCase().trim();
    if (codigo.length !== 4) return res.status(400).json({ error: 'Codigo invalido' });

    const { data, error } = await supabase
      .from('kids_checkins')
      .select(`
        *,
        crianca:kids_criancas(id, nome, data_nascimento, foto_url, observacoes_medicas, tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual),
        sala:kids_salas(id, nome, cor),
        sessao:kids_sessoes(id, status, culto:cultos(id, nome, data))
      `)
      .eq('codigo_seguranca', codigo)
      .is('checkout_at', null)
      .order('checkin_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Código não encontrado ou já foi feito checkout' });

    // Lista responsáveis autorizados pra exibir no pickup
    const { data: responsaveis } = await supabase
      .from('kids_responsaveis')
      .select('id, parentesco, autorizado_buscar, membro:mem_membros(id, nome, telefone, foto_url)')
      .eq('crianca_id', data.crianca.id)
      .eq('autorizado_buscar', true);

    // Multi-culto: cultos em que a criança ficou (pra mostrar no pickup que a
    // retirada encerra todos).
    let cultos_grupo = null;
    if (data.checkin_grupo_id) {
      const { data: grupo } = await supabase.from('kids_checkins')
        .select('sessao:kids_sessoes(culto:cultos(id, nome))')
        .eq('checkin_grupo_id', data.checkin_grupo_id).is('checkout_at', null);
      cultos_grupo = (grupo || []).map(g => g.sessao?.culto?.nome).filter(Boolean);
    }

    res.json({ ...data, responsaveis: responsaveis || [], cultos_grupo });
  } catch (e) {
    console.error('[totemKids/checkin/codigo]', e.message);
    res.status(500).json({ error: 'Erro ao buscar código' });
  }
});

// POST /api/totem-kids/checkout · faz checkout
// Body: { checkin_id, responsavel_id?, responsavel_nome?, método, override_motivo? }
router.post('/checkout', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { checkin_id, responsavel_id, responsavel_nome, metodo, override_motivo } = req.body;
    if (!checkin_id) return res.status(400).json({ error: 'checkin_id obrigatorio' });
    if (!metodo) return res.status(400).json({ error: 'metodo obrigatorio' });

    const validMetodos = ['codigo_digitado', 'barcode_escaneado', 'responsavel_autorizado', 'override_supervisor'];
    if (!validMetodos.includes(metodo)) return res.status(400).json({ error: 'metodo invalido', validos: validMetodos });

    // Override exige motivo + permissão
    if (metodo === 'override_supervisor') {
      if (!override_motivo || override_motivo.trim().length < 10) {
        return res.status(400).json({ error: 'override_motivo obrigatorio (min 10 chars)' });
      }
      // Verifica se pode aprovar override: coord-kids OU admin OU líder Kids do dia
      const podeOverride =
        ['admin', 'diretor'].includes(req.user.role) ||
        (req.user.granular?.modulePerms?.kids?.pode_aprovar) ||
        (req.user.granular?.modulePerms?.kids?.leitura >= 5) ||
        await isLiderKidsDoDia(req.user.userId);
      if (!podeOverride) {
        return res.status(403).json({ error: 'Sem permissão pra override · pedir coord Kids ou admin' });
      }
    }

    // Buscar nome do responsável (snapshot)
    let respNome = responsavel_nome;
    if (responsavel_id && !respNome) {
      const { data: m } = await supabase.from('mem_membros').select('nome').eq('id', responsavel_id).maybeSingle();
      respNome = m?.nome;
    }
    if (!respNome) return res.status(400).json({ error: 'responsavel_nome obrigatorio (snapshot)' });

    // Multi-culto: se o check-in faz parte de um grupo (criança ficou em mais de
    // um culto), a retirada fecha TODAS as linhas ativas do grupo de uma vez.
    const { data: alvo } = await supabase.from('kids_checkins')
      .select('id, checkin_grupo_id, checkout_at').eq('id', checkin_id).maybeSingle();
    if (!alvo) return res.status(404).json({ error: 'Check-in não encontrado' });
    if (alvo.checkout_at) return res.status(409).json({ error: 'Check-in já foi feito checkout' });

    const patch = {
      checkout_at: new Date().toISOString(),
      responsavel_checkout_id: responsavel_id || null,
      responsavel_checkout_nome: respNome,
      checkout_metodo: metodo,
      checkout_por: req.user.userId,
      override_motivo: metodo === 'override_supervisor' ? override_motivo : null,
      override_aprovado_por: metodo === 'override_supervisor' ? req.user.userId : null,
    };
    let q = supabase.from('kids_checkins').update(patch).is('checkout_at', null);
    q = alvo.checkin_grupo_id ? q.eq('checkin_grupo_id', alvo.checkin_grupo_id) : q.eq('id', checkin_id);
    const { data, error } = await q.select(`*, crianca:kids_criancas(id, nome), sala:kids_salas(id, nome)`);
    if (error) throw error;
    if (!data || !data.length) return res.status(409).json({ error: 'Check-in já foi feito checkout' });
    res.json({ ...data[0], cultos_encerrados: data.length });
  } catch (e) {
    console.error('[totemKids/checkout]', e.message);
    res.status(500).json({ error: 'Erro ao fazer checkout' });
  }
});

// PATCH /api/totem-kids/checkin/:id · marca observacoes/decisao Jesus
router.patch('/checkin/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const allowed = ['observacoes_no_dia', 'fez_decisao_jesus'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    if ('fez_decisao_jesus' in update && update.fez_decisao_jesus === true) {
      update.decisao_jesus_marcada_por = req.user.userId;
      update.decisao_jesus_em = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('kids_checkins')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar check-in' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL AO VIVO
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/totem-kids/painel/dia?data=YYYY-MM-DD · resumo dos cultos do dia com
// a contagem de crianças por culto (pra Milena abrir no celular e ver rápido
// quantas crianças em cada culto do dia + drilldown por sala/criança). Sem
// `data`, usa hoje (America/Sao_Paulo).
router.get('/painel/dia', authorizeModule('kids', 1), async (req, res) => {
  try {
    const data = req.query.data
      || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const { data: linhas, error } = await supabase
      .from('vw_kids_sessao_ao_vivo')
      .select('sessao_id, culto_id, data_culto, culto_nome, service_type_name, status, abrir_em, criancas_presentes, criancas_saidas, decisoes_jesus, total_checkins')
      .eq('data_culto', data);
    if (error) throw error;

    // Agrega por culto (a view vem 1 linha por sala)
    const porCulto = new Map();
    for (const r of (linhas || [])) {
      const k = r.culto_id;
      const cur = porCulto.get(k) || {
        culto_id: r.culto_id,
        sessao_id: r.sessao_id,
        culto_nome: r.culto_nome,
        service_type_name: r.service_type_name,
        abrir_em: r.abrir_em,
        status: r.status,
        presentes: 0, sairam: 0, decisoes: 0, total: 0,
      };
      cur.presentes += Number(r.criancas_presentes) || 0;
      cur.sairam    += Number(r.criancas_saidas) || 0;
      cur.decisoes  += Number(r.decisoes_jesus) || 0;
      cur.total     += Number(r.total_checkins) || 0;
      // aberta vence encerrada pra sinalizar culto em andamento
      if (r.status === 'aberta') cur.status = 'aberta';
      porCulto.set(k, cur);
    }
    const lista = Array.from(porCulto.values())
      .sort((a, b) => String(a.abrir_em || '').localeCompare(String(b.abrir_em || '')));
    res.json({ data, cultos: lista });
  } catch (e) {
    console.error('[totemKids/painel/dia]', e.message);
    res.status(500).json({ error: 'Erro ao resumir os cultos do dia' });
  }
});

// GET /api/totem-kids/painel/ao-vivo?sessao_id=... · agregado por sala
router.get('/painel/ao-vivo', authorizeModule('kids', 1), async (req, res) => {
  try {
    const sessaoId = req.query.sessao_id;
    let q = supabase.from('vw_kids_sessao_ao_vivo').select('*');
    if (sessaoId) q = q.eq('sessao_id', sessaoId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro no painel ao vivo' });
  }
});

// GET /api/totem-kids/painel/sala/:id?sessao_id=... · lista de crianças na sala
router.get('/painel/sala/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const sessaoId = req.query.sessao_id;
    let q = supabase
      .from('kids_checkins')
      .select(`
        id, checkin_at, checkout_at, codigo_seguranca, crianca_id,
        responsavel_checkin_nome, fez_decisao_jesus, observacoes_no_dia,
        crianca:kids_criancas(id, nome, data_nascimento, foto_url, observacoes_medicas, tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual)
      `)
      .eq('sala_id', req.params.id)
      .order('checkin_at', { ascending: false });
    if (sessaoId) q = q.eq('sessao_id', sessaoId);
    const { data, error } = await q;
    if (error) throw error;

    // Anexa total de decisões anteriores por criança (vw_kids_decisoes_resumo_crianca)
    const criancaIds = [...new Set((data || []).map(d => d.crianca_id).filter(Boolean))];
    let resumoPorCrianca = {};
    if (criancaIds.length) {
      const { data: resumo } = await supabase
        .from('vw_kids_decisoes_resumo_crianca')
        .select('crianca_id, total_decisoes')
        .in('crianca_id', criancaIds);
      resumoPorCrianca = Object.fromEntries((resumo || []).map(r => [r.crianca_id, r.total_decisoes]));
    }

    res.json((data || []).map(ci => ({
      ...ci,
      crianca: ci.crianca && {
        ...ci.crianca,
        idade_label: formatIdade(calcIdadeMeses(ci.crianca.data_nascimento)),
      },
      total_decisoes_historico: resumoPorCrianca[ci.crianca_id] || 0,
    })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar crianças da sala' });
  }
});

// GET /api/totem-kids/sessoes/:id/criancas-presentes · lista quem fez check-in
// Usado pela UI de decisões pra selecionar crianças reais (não texto livre).
router.get('/sessoes/:id/criancas-presentes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_criancas_presentes_sessao')
      .select('*')
      .eq('sessao_id', req.params.id)
      .order('crianca_nome');
    if (error) throw error;
    res.json((data || []).map(c => ({
      ...c,
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    })));
  } catch (e) {
    console.error('[totemKids/sessoes/criancas-presentes]', e.message);
    res.status(500).json({ error: 'Erro ao listar crianças presentes' });
  }
});

// GET /api/totem-kids/decisoes/historico/:criancaId · todas as decisões da criança
router.get('/decisoes/historico/:criancaId', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_decisoes_historico_crianca')
      .select('*')
      .eq('crianca_id', req.params.criancaId)
      .order('sequencia_decisao');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar histórico de decisões' });
  }
});

// GET /api/totem-kids/decisoes/resumo-por-crianca · ranking de decisões
router.get('/decisoes/resumo-por-crianca', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_decisoes_resumo_crianca')
      .select('*')
      .gt('total_decisoes', 0)
      .order('total_decisoes', { ascending: false })
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar resumo de decisões' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SALAS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/salas', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_salas')
      .select('*')
      .order('ordem')
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar salas' });
  }
});

router.post('/salas', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_salas')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar sala' });
  }
});

router.patch('/salas/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_salas')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao editar sala' });
  }
});

router.delete('/salas/:id', authorizeModule('kids', 5), async (req, res) => {
  try {
    // Soft delete via ativo=false
    const { error } = await supabase.from('kids_salas').update({ ativo: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao desativar sala' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ESTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/estacoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_estacoes')
      .select('*, sala:kids_salas(id, nome)')
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar estações' });
  }
});

router.post('/estacoes', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_estacoes')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar estação' });
  }
});

router.patch('/estacoes/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    // Bloqueia mexer no token via PATCH normal · usar /regenerar-token
    const { token_pareamento, pareada_em, user_agent_pareada, ...resto } = req.body;
    void token_pareamento; void pareada_em; void user_agent_pareada;
    const { data, error } = await supabase
      .from('kids_estacoes')
      .update(resto)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao editar estação' });
  }
});

// ── Pareamento de tablet ↔ estação ──

// GET /api/totem-kids/estacoes/:id/info-pareamento · pra admin gerar QR
// Retorna URL completa pareada · so coord-kids/admin (nível 3+)
router.get('/estacoes/:id/info-pareamento', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_estacoes')
      .select('id, nome, tipo, token_pareamento, pareada_em, user_agent_pareada')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Estação não encontrada' });

    const baseUrl = process.env.FRONTEND_URL || `https://${req.get('host')}`;
    const url = `${baseUrl}/ministerial/totem-kids/parear?estacao=${data.id}&token=${data.token_pareamento}`;
    res.json({ ...data, url });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar info de pareamento' });
  }
});

// POST /api/totem-kids/estacoes/:id/regenerar-token · revoga pareamentos anteriores
router.post('/estacoes/:id/regenerar-token', authorizeModule('kids', 3), async (req, res) => {
  try {
    const novoToken = require('crypto').randomUUID();
    const { data, error } = await supabase
      .from('kids_estacoes')
      .update({ token_pareamento: novoToken, pareada_em: null, user_agent_pareada: null })
      .eq('id', req.params.id)
      .select('id, nome, token_pareamento')
      .single();
    if (error) throw error;
    const baseUrl = process.env.FRONTEND_URL || `https://${req.get('host')}`;
    const url = `${baseUrl}/ministerial/totem-kids/parear?estacao=${data.id}&token=${data.token_pareamento}`;
    res.json({ ...data, url });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao regenerar token' });
  }
});

// POST /api/totem-kids/estacoes/parear · tablet confirma pareamento
// Body: { estacao_id, token }
// Returns: { id, nome, tipo, printer_modelo } (sem expor o token de volta)
router.post('/estacoes/parear', async (req, res) => {
  try {
    const { estacao_id, token } = req.body || {};
    if (!estacao_id || !token) return res.status(400).json({ error: 'estacao_id e token obrigatórios' });

    const { data: estacao } = await supabase
      .from('kids_estacoes')
      .select('id, nome, tipo, printer_modelo, token_pareamento, ativo')
      .eq('id', estacao_id)
      .maybeSingle();

    if (!estacao) return res.status(404).json({ error: 'Estação não encontrada' });
    if (!estacao.ativo) return res.status(400).json({ error: 'Estacao inativa' });
    if (!estacao.token_pareamento || !safeEqual(String(token), String(estacao.token_pareamento))) {
      return res.status(403).json({ error: 'Token invalido · pareamento foi revogado · peca admin pra gerar QR novo' });
    }

    // Atualiza auditoria
    await supabase
      .from('kids_estacoes')
      .update({
        pareada_em: new Date().toISOString(),
        user_agent_pareada: req.get('user-agent')?.slice(0, 200) || null,
      })
      .eq('id', estacao_id);

    res.json({
      id: estacao.id,
      nome: estacao.nome,
      tipo: estacao.tipo,
      printer_modelo: estacao.printer_modelo,
    });
  } catch (e) {
    console.error('[totemKids/parear]', e);
    res.status(500).json({ error: 'Erro ao parear' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ETIQUETAS · LOG (auditoria de impressão)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/etiquetas-log', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { checkin_id, estacao_id, tipo, conteudo, reimpressao, motivo_reimpressao, status, erro } = req.body;
    if (!checkin_id || !tipo) return res.status(400).json({ error: 'checkin_id e tipo obrigatórios' });

    const { data, error } = await supabase
      .from('kids_etiquetas_log')
      .insert({
        checkin_id,
        estacao_id: estacao_id || null,
        tipo,
        conteudo_json: conteudo || {},
        reimpressao: !!reimpressao,
        motivo_reimpressao: motivo_reimpressao || null,
        impressa_por: req.user.userId,
        status: status || 'enviada',
        erro: erro || null,
      })
      .select('id')
      .single();
    if (error) throw error;

    // Incrementa contador no checkin (best effort)
    const { data: cur } = await supabase
      .from('kids_checkins').select('labels_impressas').eq('id', checkin_id).maybeSingle();
    if (cur) {
      await supabase
        .from('kids_checkins')
        .update({ labels_impressas: (cur.labels_impressas || 0) + 1 })
        .eq('id', checkin_id);
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao logar etiqueta' });
  }
});

// GET /api/totem-kids/auditoria/overrides · log de overrides pra coord
router.get('/auditoria/overrides', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_checkins')
      .select(`
        id, checkin_at, checkout_at, codigo_seguranca,
        responsavel_checkin_nome, responsavel_checkout_nome,
        override_motivo, override_aprovado_por,
        crianca:kids_criancas(id, nome),
        sessao:kids_sessoes(id, culto:cultos(nome, data))
      `)
      .eq('checkout_metodo', 'override_supervisor')
      .order('checkout_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar overrides' });
  }
});

// GET /api/totem-kids/historico/crianca/:id · histórico completo
router.get('/historico/crianca/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_historico_crianca')
      .select('*')
      .eq('crianca_id', req.params.id)
      .order('data_culto', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT XLSX · cadastro em massa de crianças + responsáveis
// ═══════════════════════════════════════════════════════════════════════════

// Normaliza nome de coluna pra match · lowercase, sem acento, sem espaco
function normalizeColName(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Aliases aceitos por campo lógico
const COL_ALIASES = {
  nome_crianca:           ['nome_crianca','nome','crianca','child_name','first_name'],
  data_nascimento:        ['data_nascimento','nascimento','aniversario','birthdate','dob','data_nasc'],
  sexo:                   ['sexo','genero','gender'],
  alergia:                ['alergia','alergias','observacoes_medicas','medical','medical_notes','allergies'],
  observacoes:            ['observacoes','obs','notas','notes','observacao'],
  responsavel_nome:       ['responsavel_nome','responsavel','mae','pai','household_name','parent_name'],
  responsavel_telefone:   ['responsavel_telefone','telefone','phone','mobile'],
  responsavel_cpf:        ['responsavel_cpf','cpf'],
  responsavel_parentesco: ['responsavel_parentesco','parentesco','relationship'],
  responsavel2_nome:      ['responsavel2_nome','responsavel_2','segundo_responsavel','parent2_name'],
  responsavel2_telefone:  ['responsavel2_telefone','telefone2','phone2'],
  responsavel2_cpf:       ['responsavel2_cpf','cpf2'],
  responsavel2_parentesco: ['responsavel2_parentesco','parentesco2'],
  ultima_visita:          ['ultima_visita','ultima_presenca','last_visit'],
};

// Resolve mapa coluna_planilha → campo_logico
function resolveColumnMap(firstRow) {
  const keys = Object.keys(firstRow).map(k => ({ original: k, norm: normalizeColName(k) }));
  const map = {};
  for (const [logico, aliases] of Object.entries(COL_ALIASES)) {
    const found = keys.find(k => aliases.includes(k.norm));
    if (found) map[logico] = found.original;
  }
  return map;
}

function pickRowValue(row, colMap, logico) {
  const orig = colMap[logico];
  if (!orig) return null;
  const v = row[orig];
  if (v == null || v === '') return null;
  return typeof v === 'string' ? v.trim() : v;
}

function normalizeTelefone(t) {
  if (!t) return null;
  const d = String(t).replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}
function normalizeCpf(c) {
  if (!c) return null;
  const d = String(c).replace(/\D/g, '');
  return d.length === 11 ? d : null;
}
function normalizeDateStr(v) {
  if (v == null || v === '') return null;
  // Excel date number
  if (typeof v === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch { /* fallthrough */ }
  }
  // Date object
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // dd/mm/yyyy
  const m1 = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (m1) {
    const ano = m1[3].length === 2 ? `20${m1[3]}` : m1[3];
    return `${ano}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}
function normalizeSexo(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (['m','masc','masculino','male','menino','boy','h','homem'].includes(s)) return 'M';
  if (['f','fem','feminino','female','menina','girl','mulher'].includes(s)) return 'F';
  return null;
}
function normalizeParentesco(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (['mae','mother','mom'].includes(s)) return 'mae';
  if (['pai','father','dad'].includes(s)) return 'pai';
  if (['padrasto','step_father','step-father'].includes(s)) return 'padrasto';
  if (['madrasta','step_mother','step-mother'].includes(s)) return 'madrasta';
  if (['avo','avo_a','avo(a)','grandparent','grandpa','grandma','vovo','vovó'].includes(s)) return 'avo_a';
  if (['tio','tia','tio_a','tio(a)','uncle','aunt'].includes(s)) return 'tio_a';
  if (['irmao','irma','irmao_a','irmao(a)','brother','sister'].includes(s)) return 'irmao_a';
  if (['tutor','guardian'].includes(s)) return 'tutor';
  return 'outro';
}

// Resolve ou cria mem_membros do responsável
async function resolveOrCreateMembro({ nome, telefone, cpf, parentesco }) {
  // guarda na origem (CPF→e-mail→telefone+nome→cria · não liga por telefone só)
  const r = await acharOuCriarGuardado({
    cpf, telefone, nome, status: 'visitante',
    extra: { parentesco: parentesco === 'mae' || parentesco === 'pai' ? 'responsavel' : null },
  });
  const { data: membro } = await supabase.from('mem_membros')
    .select('id, nome, familia_id, parentesco').eq('id', r.membro_id).single();
  return { membro, criado: !!r.created };
}

async function getOrCreateFamilia(membro) {
  if (membro.familia_id) return membro.familia_id;
  const primeiroNome = (membro.nome || 'Familia').split(' ')[0];
  const { data, error } = await supabase.from('mem_familias')
    .insert({ nome: `Familia ${primeiroNome}` })
    .select('id').single();
  if (error) throw error;
  await supabase.from('mem_membros').update({ familia_id: data.id }).eq('id', membro.id);
  return data.id;
}

// Processa 1 linha · retorna { status, msg } pra relatório
async function processarLinhaImport(row, colMap, dryRun, userId) {
  const nomeCrianca = pickRowValue(row, colMap, 'nome_crianca');
  const respNome = pickRowValue(row, colMap, 'responsavel_nome');
  const respTel = normalizeTelefone(pickRowValue(row, colMap, 'responsavel_telefone'));

  if (!nomeCrianca) return { status: 'erro', msg: 'nome_crianca obrigatorio' };
  if (!respNome) return { status: 'erro', msg: 'responsavel_nome obrigatorio' };
  if (!respTel) return { status: 'erro', msg: 'responsavel_telefone obrigatorio (>=8 digitos)' };

  const dataNasc = normalizeDateStr(pickRowValue(row, colMap, 'data_nascimento'));
  const sexo = normalizeSexo(pickRowValue(row, colMap, 'sexo'));
  const alergia = pickRowValue(row, colMap, 'alergia');
  const obs = pickRowValue(row, colMap, 'observacoes');
  const respCpf = normalizeCpf(pickRowValue(row, colMap, 'responsavel_cpf'));
  const respParentesco = normalizeParentesco(pickRowValue(row, colMap, 'responsavel_parentesco'));

  if (dryRun) {
    return { status: 'preview', msg: `${nomeCrianca} → resp ${respNome}` };
  }

  // 1. Resolve responsável
  const { membro: resp1, criado: resp1Criado } = await resolveOrCreateMembro({
    nome: respNome, telefone: respTel, cpf: respCpf, parentesco: respParentesco,
  });

  // 2. Família
  const familiaId = await getOrCreateFamilia(resp1);

  // 3. Criança · match por nome (case-insensitive) + família
  const { data: jaExiste } = await supabase
    .from('kids_criancas')
    .select('id')
    .ilike('nome', nomeCrianca)
    .eq('familia_id', familiaId)
    .maybeSingle();

  let criancaId;
  let statusResp;
  if (jaExiste) {
    criancaId = jaExiste.id;
    const update = {};
    if (dataNasc) update.data_nascimento = dataNasc;
    if (sexo) update.sexo = sexo;
    if (alergia) update.observacoes_medicas = alergia;
    if (obs) update.observacoes_internas = obs;
    if (Object.keys(update).length) {
      await supabase.from('kids_criancas').update(update).eq('id', criancaId);
    }
    statusResp = 'atualizada';
  } else {
    const { data: nova, error } = await supabase.from('kids_criancas').insert({
      nome: nomeCrianca,
      data_nascimento: dataNasc,
      sexo,
      familia_id: familiaId,
      observacoes_medicas: alergia,
      observacoes_internas: obs,
      visitante: true,
      ativo: true,
      created_by: userId,
    }).select('id').single();
    if (error) throw error;
    criancaId = nova.id;
    statusResp = 'criada';
  }

  // 4. Liga responsável 1 (se não tem)
  await supabase.from('kids_responsaveis').upsert({
    crianca_id: criancaId,
    membro_id: resp1.id,
    parentesco: respParentesco,
    autorizado_buscar: true,
  }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false });

  // 5. Responsável 2 (opcional)
  const resp2Nome = pickRowValue(row, colMap, 'responsavel2_nome');
  const resp2Tel = normalizeTelefone(pickRowValue(row, colMap, 'responsavel2_telefone'));
  if (resp2Nome && resp2Tel) {
    const resp2Cpf = normalizeCpf(pickRowValue(row, colMap, 'responsavel2_cpf'));
    const resp2Parentesco = normalizeParentesco(pickRowValue(row, colMap, 'responsavel2_parentesco'));
    try {
      const { membro: resp2 } = await resolveOrCreateMembro({
        nome: resp2Nome, telefone: resp2Tel, cpf: resp2Cpf, parentesco: resp2Parentesco,
      });
      // Mesma família
      if (!resp2.familia_id) {
        await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', resp2.id);
      }
      await supabase.from('kids_responsaveis').upsert({
        crianca_id: criancaId,
        membro_id: resp2.id,
        parentesco: resp2Parentesco,
        autorizado_buscar: true,
      }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false });
    } catch (e) {
      console.warn('[import] resp2 falhou:', e.message);
    }
  }

  return {
    status: statusResp,
    msg: `${nomeCrianca} → ${respNome}${resp1Criado ? ' (resp novo)' : ''}`,
  };
}

// POST /api/totem-kids/criancas/importar?dry_run=1
router.post(
  '/criancas/importar',
  authorizeModule('kids', 3),
  xlsxUpload.single('arquivo'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'arquivo obrigatorio (campo "arquivo")' });

      const dryRun = ['1','true','yes'].includes(String(req.query.dry_run || '').toLowerCase());

      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return res.status(400).json({ error: 'planilha vazia' });
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
      if (!rows.length) return res.status(400).json({ error: 'nenhuma linha encontrada' });

      const colMap = resolveColumnMap(rows[0]);

      const colObrigatorias = ['nome_crianca','responsavel_nome','responsavel_telefone'];
      const faltando = colObrigatorias.filter(c => !colMap[c]);
      if (faltando.length) {
        return res.status(400).json({
          error: 'colunas obrigatorias faltando',
          faltando,
          colunas_encontradas: Object.keys(rows[0]),
          colunas_mapeadas: colMap,
        });
      }

      const relatorio = { total: rows.length, criadas: 0, atualizadas: 0, preview: 0, erros: 0, detalhes: [] };

      for (let i = 0; i < rows.length; i++) {
        try {
          const r = await processarLinhaImport(rows[i], colMap, dryRun, req.user.userId);
          if (r.status === 'criada') relatorio.criadas++;
          else if (r.status === 'atualizada') relatorio.atualizadas++;
          else if (r.status === 'preview') relatorio.preview++;
          else if (r.status === 'erro') relatorio.erros++;
          relatorio.detalhes.push({ linha: i + 2, ...r }); // +2 = +1 header +1 base 1
        } catch (e) {
          relatorio.erros++;
          relatorio.detalhes.push({ linha: i + 2, status: 'erro', msg: e.message || 'erro desconhecido' });
        }
      }

      res.json({ dry_run: dryRun, coluna_mapeamento: colMap, ...relatorio });
    } catch (e) {
      console.error('[totemKids/importar]', e);
      res.status(500).json({ error: e.message || 'Erro ao processar planilha' });
    }
  }
);

// GET /api/totem-kids/criancas/modelo-importacao · gera modelo XLSX
router.get('/criancas/modelo-importacao', authorizeModule('kids', 1), async (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      'nome_crianca', 'data_nascimento', 'sexo', 'alergia', 'observacoes',
      'responsavel_nome', 'responsavel_telefone', 'responsavel_cpf', 'responsavel_parentesco',
      'responsavel2_nome', 'responsavel2_telefone', 'responsavel2_cpf', 'responsavel2_parentesco',
      'ultima_visita',
    ],
    [
      'Maria Clara Silva', '2020-05-15', 'F', 'Amendoim', 'Usa óculos',
      'Cláudia Silva', '21999998888', '12345678900', 'mae',
      'João Silva', '21988887777', '98765432100', 'pai',
      '2026-05-15',
    ],
    [
      'Pedro Oliveira', '2019-08-20', 'M', '', '',
      'Ana Oliveira', '21977776666', '', 'mae',
      '', '', '', '',
      '',
    ],
  ]);
  ws['!cols'] = [
    { wch: 22 }, { wch: 14 }, { wch: 6 }, { wch: 16 }, { wch: 18 },
    { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Criancas');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-importacao-criancas.xlsx"');
  res.send(buf);
});

// ═══════════════════════════════════════════════════════════════════════════
// CHAMADAS · sistema de display nas TVs das salas
// ═══════════════════════════════════════════════════════════════════════════
// Fluxo:
//   1. Pai digita código no PC touch self-service da recepcao
//   2. POST /api/totem-kids/chamadas { código, estacao_token }
//   3. Backend valida + cria row em kids_chamadas
//   4. TV da sala (estação tipo=display) faz polling em /display/sala
//   5. Renderiza grande + sino + TTS
//   6. Quando voluntaria confirma checkout, trigger fecha chamada
//      (atendida_em e preenchido) e TV remove do display

const publicRouter = require('express').Router();
// Sub-router público (sem authenticate) · pareamento via token de estação
// E montado dentro do main router em rota separada

// Helper: valida token de estação e retorna { id, nome, tipo, sala_id, sala_nome }
async function validarEstacaoToken(token, tipoEsperado = null) {
  if (!token) return null;
  let q = supabase
    .from('kids_estacoes')
    .select('id, nome, tipo, sala_id, ativo, kids_salas:sala_id(id, nome, cor)')
    .eq('token_pareamento', token)
    .eq('ativo', true);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  if (tipoEsperado && data.tipo !== tipoEsperado) {
    // Se for um array de tipos, aceita qualquer um
    if (Array.isArray(tipoEsperado) && !tipoEsperado.includes(data.tipo)) return null;
    if (!Array.isArray(tipoEsperado)) return null;
  }
  return {
    id: data.id,
    nome: data.nome,
    tipo: data.tipo,
    sala_id: data.sala_id,
    sala_nome: data.kids_salas?.nome,
    sala_cor: data.kids_salas?.cor,
  };
}

// POST /api/totem-kids/chamadas
// Body: { código, estacao_token? }
// Cria chamada · valida código · faz upsert (se já tem ativa, incrementa re_chamadas)
router.post('/chamadas', async (req, res) => {
  try {
    const { codigo, estacao_token } = req.body || {};
    if (!codigo || String(codigo).trim().length !== 4) {
      return res.status(400).json({ error: 'código de 4 caracteres obrigatório' });
    }

    // Se enviou estacao_token, valida (modo self-service · sem login)
    // Senão, exige auth (modo manned via header Authorization)
    let estacao = null;
    let userId = null;
    if (estacao_token) {
      estacao = await validarEstacaoToken(estacao_token, ['self', 'manned']);
      if (!estacao) return res.status(403).json({ error: 'estação invalida ou não pareada' });
    } else {
      // Exige auth normal · req.user populado pelo authenticate
      if (!req.user) return res.status(401).json({ error: 'login ou estacao_token necessário' });
      userId = req.user.userId;
    }

    const codigoUpper = String(codigo).toUpperCase().trim();

    // Acha checkin ativo
    const { data: checkin } = await supabase
      .from('kids_checkins')
      .select('id, sessao_id, crianca_id, sala_id, codigo_seguranca, responsavel_checkin_nome, responsavel_checkin_telefone, checkout_at, pager_id, pager:kids_pagers(id, numero, cor, tipo_lrs, ativo), kids_criancas(nome, observacoes_medicas), kids_salas(nome, cor)')
      .eq('codigo_seguranca', codigoUpper)
      .is('checkout_at', null)
      .order('checkin_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!checkin) {
      return res.status(404).json({ error: 'Código não encontrado · criança pode já ter saido ou código errado' });
    }

    // Upsert · se já tem chamada ativa, incrementa re_chamadas
    const { data: existente } = await supabase
      .from('kids_chamadas')
      .select('id, re_chamadas')
      .eq('checkin_id', checkin.id)
      .is('atendida_em', null)
      .maybeSingle();

    let chamada;
    if (existente) {
      const { data, error } = await supabase
        .from('kids_chamadas')
        .update({
          re_chamadas: existente.re_chamadas + 1,
          ultima_rechamada_em: new Date().toISOString(),
        })
        .eq('id', existente.id)
        .select('*')
        .single();
      if (error) throw error;
      chamada = data;
    } else {
      const { data, error } = await supabase
        .from('kids_chamadas')
        .insert({
          sessao_id: checkin.sessao_id,
          checkin_id: checkin.id,
          crianca_id: checkin.crianca_id,
          sala_id: checkin.sala_id,
          estacao_origem_id: estacao?.id || null,
          codigo_seguranca: codigoUpper,
          responsavel_nome_snapshot: checkin.responsavel_checkin_nome,
          responsavel_telefone_snapshot: checkin.responsavel_checkin_telefone,
        })
        .select('*')
        .single();
      if (error) throw error;
      chamada = data;
    }

    // Enfileira o toque no pager da família (se a criança recebeu um no check-in).
    // O agente local da recepcao consome /pager/bridge/fila e dispara via LRSN/TCP.
    let pager_enfileirado = false;
    if (checkin.pager && checkin.pager.ativo) {
      const { error: errEnvio } = await supabase
        .from('kids_pager_envios')
        .insert({
          chamada_id: chamada.id,
          checkin_id: checkin.id,
          pager_id: checkin.pager.id,
          pager_numero: checkin.pager.numero,
          cor: checkin.pager.cor || 'R',
          tipo_lrs: checkin.pager.tipo_lrs ?? 2,
          origem: existente ? 'rechamada' : 'chamada',
          criado_por: userId,
        });
      if (errEnvio) console.warn('[totemKids/chamadas] enfileirar pager falhou:', errEnvio.message);
      else pager_enfileirado = true;
    }

    res.json({
      chamada,
      crianca: { id: checkin.crianca_id, nome: checkin.kids_criancas?.nome, observacoes_medicas: checkin.kids_criancas?.observacoes_medicas },
      sala: { id: checkin.sala_id, nome: checkin.kids_salas?.nome, cor: checkin.kids_salas?.cor },
      responsavel: { nome: checkin.responsavel_checkin_nome, telefone: checkin.responsavel_checkin_telefone },
      pager: checkin.pager ? { numero: checkin.pager.numero } : null,
      pager_enfileirado,
      ja_existia: !!existente,
    });
  } catch (e) {
    console.error('[totemKids/chamadas]', e.message);
    res.status(500).json({ error: 'Erro ao criar chamada' });
  }
});

// GET /api/totem-kids/display/info?token=X
// Tela display da TV consulta no boot · valida token e retorna sua estação
router.get('/display/info', async (req, res) => {
  try {
    const token = req.query.token;
    const estacao = await validarEstacaoToken(token, ['display', 'display_foyer']);
    if (!estacao) return res.status(403).json({ error: 'token invalido' });
    res.json(estacao);
  } catch (e) {
    res.status(500).json({ error: 'Erro' });
  }
});

// GET /api/totem-kids/display/chamadas-ativas?token=X
// TV chama a cada 2s (polling) · retorna chamadas ativas da sala (ou todas se foyer)
router.get('/display/chamadas-ativas', async (req, res) => {
  try {
    const token = req.query.token;
    const estacao = await validarEstacaoToken(token, ['display', 'display_foyer']);
    if (!estacao) return res.status(403).json({ error: 'token invalido' });

    let q = supabase
      .from('vw_kids_chamadas_ativas')
      .select('*')
      .order('chamada_em', { ascending: true });
    if (estacao.tipo === 'display' && estacao.sala_id) {
      q = q.eq('sala_id', estacao.sala_id);
    }
    const { data, error } = await q;
    if (error) throw error;

    res.json({
      estacao_id: estacao.id,
      estacao_nome: estacao.nome,
      tipo: estacao.tipo,
      sala_id: estacao.sala_id,
      sala_nome: estacao.sala_nome,
      sala_cor: estacao.sala_cor,
      chamadas: data || [],
      server_time: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[totemKids/display/chamadas]', e.message);
    res.status(500).json({ error: 'Erro ao buscar chamadas' });
  }
});

// GET /api/totem-kids/display/foyer-resumo?token=X
// Painel central · resumo por sala (ocupacao + chamadas atrasadas)
router.get('/display/foyer-resumo', async (req, res) => {
  try {
    const token = req.query.token;
    const estacao = await validarEstacaoToken(token, ['display_foyer', 'display']);
    if (!estacao) return res.status(403).json({ error: 'token invalido' });

    // Sessão aberta atual
    const { data: sessao } = await supabase
      .from('kids_sessoes')
      .select('id, culto:cultos(nome, data)')
      .eq('status', 'aberta')
      .order('abrir_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sessao) {
      return res.json({ sessao: null, salas: [] });
    }

    // Ocupação por sala
    const { data: salas } = await supabase
      .from('kids_salas')
      .select('id, nome, cor, capacidade, ordem')
      .eq('ativo', true)
      .order('ordem');

    // Conta presentes por sala
    const { data: presentes } = await supabase
      .from('kids_checkins')
      .select('sala_id')
      .eq('sessao_id', sessao.id)
      .is('checkout_at', null);
    const presPorSala = {};
    for (const p of presentes || []) presPorSala[p.sala_id] = (presPorSala[p.sala_id] || 0) + 1;

    // Chamadas ativas
    const { data: chamadas } = await supabase
      .from('vw_kids_chamadas_ativas')
      .select('sala_id, segundos_esperando');
    const chamPorSala = {};
    for (const c of chamadas || []) {
      if (!chamPorSala[c.sala_id]) chamPorSala[c.sala_id] = { total: 0, max_segundos: 0 };
      chamPorSala[c.sala_id].total++;
      if (c.segundos_esperando > chamPorSala[c.sala_id].max_segundos) {
        chamPorSala[c.sala_id].max_segundos = c.segundos_esperando;
      }
    }

    res.json({
      sessao,
      salas: (salas || []).map(s => ({
        ...s,
        presentes: presPorSala[s.id] || 0,
        chamadas_ativas: chamPorSala[s.id]?.total || 0,
        max_espera_segundos: chamPorSala[s.id]?.max_segundos || 0,
      })),
      server_time: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[totemKids/display/foyer]', e.message);
    res.status(500).json({ error: 'Erro' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGERS · integração com o transmissor físico (LRS Freedom via agente local)
// ═══════════════════════════════════════════════════════════════════════════

// Autoriza o agente local da recepcao por bearer token (PAGER_BRIDGE_TOKEN).
// Usado so nas rotas /pager/bridge/* (que bypassam o authenticate de JWT).
function bridgeAutorizado(req) {
  const expected = process.env.PAGER_BRIDGE_TOKEN;
  if (!expected) return false;
  const header = String(req.headers.authorization || '');
  const token = header.replace(/^Bearer\s+/i, '').trim() || String(req.query.token || '');
  return token.length > 0 && safeEqual(token, expected);
}

// ─── CRUD do catalogo de pagers (admin do módulo) ───────────────────────────
router.get('/pager/pagers', authorizeModule('kids', 1), async (req, res) => {
  try {
    let q = supabase
      .from('kids_pagers')
      .select('*, responsavel:mem_membros(id, nome)')
      .is('deleted_at', null)
      .order('numero');
    if (req.query.ativo === 'true') q = q.eq('ativo', true);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids/pagers list]', e.message);
    res.status(500).json({ error: 'Erro ao listar pagers' });
  }
});

// Quem esta com cada pager AGORA (check-ins ativos da sessão aberta)
router.get('/pager/em-uso', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_checkins')
      .select('id, pager_id, codigo_seguranca, responsavel_checkin_nome, crianca:kids_criancas(nome), sala:kids_salas(nome)')
      .not('pager_id', 'is', null)
      .is('checkout_at', null);
    if (error) throw error;
    const porPager = {};
    for (const c of (data || [])) porPager[c.pager_id] = c;
    res.json(porPager);
  } catch (e) {
    console.error('[totemKids/pagers em-uso]', e.message);
    res.status(500).json({ error: 'Erro ao listar uso dos pagers' });
  }
});

router.post('/pager/pagers', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { numero, rotulo, cor, tipo_lrs, responsavel_padrao_id, observacao, ativo } = req.body || {};
    if (numero == null || isNaN(Number(numero))) {
      return res.status(400).json({ error: 'número do pager obrigatório' });
    }
    const { data, error } = await supabase
      .from('kids_pagers')
      .insert({
        numero: Number(numero),
        rotulo: rotulo || null,
        cor: (cor || 'R').toUpperCase(),
        tipo_lrs: tipo_lrs ?? 2,
        responsavel_padrao_id: responsavel_padrao_id || null,
        observacao: observacao || null,
        ativo: ativo !== false,
      })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe um pager com esse número' });
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[totemKids/pagers create]', e.message);
    res.status(500).json({ error: 'Erro ao criar pager' });
  }
});

router.patch('/pager/pagers/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { numero, rotulo, cor, tipo_lrs, responsavel_padrao_id, observacao, ativo } = req.body || {};
    const patch = {};
    if (numero != null) patch.numero = Number(numero);
    if (rotulo !== undefined) patch.rotulo = rotulo || null;
    if (cor !== undefined) patch.cor = (cor || 'R').toUpperCase();
    if (tipo_lrs !== undefined) patch.tipo_lrs = tipo_lrs ?? 2;
    if (responsavel_padrao_id !== undefined) patch.responsavel_padrao_id = responsavel_padrao_id || null;
    if (observacao !== undefined) patch.observacao = observacao || null;
    if (ativo !== undefined) patch.ativo = !!ativo;
    const { data, error } = await supabase
      .from('kids_pagers')
      .update(patch)
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe um pager com esse número' });
      throw error;
    }
    res.json(data);
  } catch (e) {
    console.error('[totemKids/pagers update]', e.message);
    res.status(500).json({ error: 'Erro ao editar pager' });
  }
});

router.delete('/pager/pagers/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    // soft delete (kids_pagers esta na whitelist app_soft_deletable_tables)
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'kids_pagers',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.userId ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids/pagers delete]', e.message);
    res.status(500).json({ error: 'Erro ao remover pager' });
  }
});

// Toque de teste · enfileira um envio avulso pro agente disparar
router.post('/pager/pagers/:id/testar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data: pager, error: errP } = await supabase
      .from('kids_pagers')
      .select('id, numero, cor, tipo_lrs')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (errP) throw errP;
    if (!pager) return res.status(404).json({ error: 'Pager não encontrado' });

    const { data, error } = await supabase
      .from('kids_pager_envios')
      .insert({
        pager_id: pager.id,
        pager_numero: pager.numero,
        cor: pager.cor || 'R',
        tipo_lrs: pager.tipo_lrs ?? 2,
        origem: 'teste',
        criado_por: req.user?.userId ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ ok: true, envio_id: data.id });
  } catch (e) {
    console.error('[totemKids/pagers testar]', e.message);
    res.status(500).json({ error: 'Erro ao enfileirar teste' });
  }
});

// Histórico recente de envios (pro admin acompanhar status)
router.get('/pager/envios', authorizeModule('kids', 1), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { data, error } = await supabase
      .from('kids_pager_envios')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar envios' });
  }
});

// ─── Endpoints do AGENTE LOCAL (bearer token · sem JWT) ─────────────────────
// GET /pager/bridge/fila?max=20 · pendentes mais antigos primeiro
router.get('/pager/bridge/fila', async (req, res) => {
  try {
    if (!bridgeAutorizado(req)) return res.status(401).json({ error: 'bridge não autorizado' });
    const max = Math.min(Number(req.query.max) || 20, 100);
    const { data, error } = await supabase
      .from('kids_pager_envios')
      .select('id, pager_numero, cor, tipo_lrs, origem, tentativas, created_at')
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })
      .limit(max);
    if (error) throw error;
    res.json({ envios: data || [], server_time: new Date().toISOString() });
  } catch (e) {
    console.error('[totemKids/pager/bridge/fila]', e.message);
    res.status(500).json({ error: 'Erro ao buscar fila' });
  }
});

// POST /pager/bridge/envios/:id/resultado · { ok:boolean, erro?:string }
router.post('/pager/bridge/envios/:id/resultado', async (req, res) => {
  try {
    if (!bridgeAutorizado(req)) return res.status(401).json({ error: 'bridge não autorizado' });
    const { ok, erro } = req.body || {};
    // tentativas++ e status final
    const { data: atual } = await supabase
      .from('kids_pager_envios')
      .select('tentativas, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'envio não encontrado' });
    if (atual.status === 'cancelado') return res.json({ ok: true, ignorado: 'cancelado' });

    const patch = {
      tentativas: (atual.tentativas || 0) + 1,
      status: ok ? 'enviado' : 'erro',
      erro: ok ? null : (erro ? String(erro).slice(0, 500) : 'falha no envio'),
    };
    if (ok) patch.enviado_em = new Date().toISOString();
    const { error } = await supabase
      .from('kids_pager_envios')
      .update(patch)
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids/pager/bridge/resultado]', e.message);
    res.status(500).json({ error: 'Erro ao registrar resultado' });
  }
});

// ── Pré-check-in (vindo do app de membros) ─────────────────────────────────
// GET /pre-checkin/codigo/:codigo — o voluntário escaneia/digita o código do
// app e recebe responsável + filhos (com sala sugerida) pra confirmar e
// imprimir. Só pré-popula; o check-in real continua sendo o POST /checkin.
router.get('/pre-checkin/codigo/:codigo', authorizeModule('kids', 2), async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: 'Código vazio' });

    const { data: pre } = await supabase
      .from('kids_pre_checkins')
      .select('*')
      .eq('codigo', codigo)
      .eq('status', 'pendente')
      .maybeSingle();
    if (!pre) return res.status(404).json({ error: 'Pré-check-in não encontrado ou já usado' });
    if (new Date(pre.expira_em) < new Date()) {
      return res.status(410).json({ error: 'Pré-check-in expirado. Peça pro responsável gerar de novo.' });
    }

    const { data: criancas } = await supabase
      .from('kids_criancas')
      .select('id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas, necessidades_especiais')
      .in('id', pre.crianca_ids)
      .eq('ativo', true);

    const enriquecidas = await Promise.all((criancas || []).map(async (c) => {
      let idadeMeses = null;
      if (c.data_nascimento) {
        const nasc = new Date(c.data_nascimento);
        idadeMeses = Math.floor((Date.now() - nasc.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      }
      const sala = await sugerirSala(idadeMeses);
      return { ...c, foto_url: await fotoVisivelCrianca(c), idade_meses: idadeMeses, sala_sugerida: sala };
    }));

    res.json({
      pre_checkin_id: pre.id,
      responsavel: {
        membro_id: pre.responsavel_membro_id,
        nome: pre.responsavel_nome,
        telefone: pre.responsavel_telefone,
      },
      criancas: enriquecidas,
    });
  } catch (e) {
    console.error('[TOTEM-KIDS] pre-checkin/codigo:', e.message);
    res.status(500).json({ error: 'Erro ao ler pré-check-in' });
  }
});

// POST /pre-checkin/:id/consumir { checkin_ids } — marca como usado após o
// voluntário confirmar os check-ins reais (auditoria: quem e quais).
router.post('/pre-checkin/:id/consumir', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { checkin_ids } = req.body || {};
    const { error } = await supabase
      .from('kids_pre_checkins')
      .update({
        status: 'usado',
        usado_em: new Date().toISOString(),
        usado_por: req.user?.id || null,
        checkin_ids: Array.isArray(checkin_ids) ? checkin_ids : null,
      })
      .eq('id', req.params.id)
      .eq('status', 'pendente');
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[TOTEM-KIDS] pre-checkin/consumir:', e.message);
    res.status(500).json({ error: 'Erro ao consumir pré-check-in' });
  }
});

// ============================================================
// Solicitações de vínculo (criança↔responsável) feitas pelo app
// A equipe Kids confere os documentos e aprova/rejeita. Aprovar cria a
// criança (se nova) + o vínculo kids_responsaveis (autorizado_buscar).
// ============================================================

// GET /pre-checkin é separado · aqui /vinculo-solicitacoes
// GET /vinculo-solicitacoes?status=pendente — lista pra triagem
router.get('/vinculo-solicitacoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const status = String(req.query.status || 'pendente');
    let q = supabase
      .from('kids_vinculo_solicitacoes')
      .select('id, solicitante_nome, solicitante_telefone, solicitante_parentesco, crianca_nome, crianca_data_nascimento, status, motivo_rejeicao, observacao, created_at, decidido_em, decidido_por_nome')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (status && status !== 'todos') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[TOTEM-KIDS] vinculo-solicitacoes list:', e.message);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});

// GET /vinculo-solicitacoes/:id — detalhe + signed URLs dos documentos (15 min)
router.get('/vinculo-solicitacoes/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { data: s, error } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!s) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const signed = async (path) => {
      if (!path) return null;
      const { data } = await supabase.storage.from('kids-documentos').createSignedUrl(path, 900);
      return data?.signedUrl || null;
    };
    // Foto da criança só é exibida com consentimento registrado. Docs legados
    // (versões antigas do app) seguem assinados pra triagem das pendentes.
    const [crianca_foto_url, crianca_doc_url, doc_pai_url, doc_mae_url, foto_mae_url, foto_pai_url] = await Promise.all([
      s.foto_consentimento_em ? signed(s.crianca_foto_path) : null,
      signed(s.crianca_doc_path), signed(s.doc_pai_path), signed(s.doc_mae_path),
      signed(s.foto_mae_path), signed(s.foto_pai_path),
    ]);

    // Anti-duplicata: se o pedido não aponta uma criança existente, sugere
    // crianças com nome parecido (a equipe vincula a uma em vez de criar nova).
    let possiveis_criancas = [];
    if (!s.crianca_id && s.crianca_nome && String(s.crianca_nome).trim().length >= 3) {
      const termo = String(s.crianca_nome).trim().replace(/[%_,]/g, '');
      const { data: cands } = await supabase.from('kids_criancas')
        .select('id, nome, data_nascimento, ativo, familia:mem_familias(nome), responsaveis:kids_responsaveis(membro:mem_membros(nome))')
        .ilike('nome', `%${termo}%`).is('deleted_at', null).limit(10);
      possiveis_criancas = (cands || []).map((c) => ({
        id: c.id, nome: c.nome, data_nascimento: c.data_nascimento, ativo: c.ativo,
        familia: c.familia?.nome || null,
        responsaveis: (c.responsaveis || []).map((r) => r.membro?.nome).filter(Boolean),
        match_forte: !!(s.crianca_data_nascimento && c.data_nascimento && c.data_nascimento === s.crianca_data_nascimento),
      })).sort((a, b) => (b.match_forte ? 1 : 0) - (a.match_forte ? 1 : 0));
    }

    res.json({ ...s, crianca_foto_url, crianca_doc_url, doc_pai_url, doc_mae_url, foto_mae_url, foto_pai_url, possiveis_criancas });
  } catch (e) {
    console.error('[TOTEM-KIDS] vinculo-solicitacoes detalhe:', e.message);
    res.status(500).json({ error: 'Erro ao abrir solicitação' });
  }
});

// POST /vinculo-solicitacoes/:id/aprovar — cria criança (se nova) + vínculo
router.post('/vinculo-solicitacoes/:id/aprovar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data: s } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!s) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (s.status !== 'pendente') return res.status(409).json({ error: 'Solicitação já decidida' });

    // 1. Resolve a criança: criança escolhida na triagem (anti-duplicata) >
    //    a apontada no pedido > cria nova na família do solicitante.
    let criancaId = req.body?.crianca_id || s.crianca_id;
    if (!criancaId) {
      // garante família do solicitante
      const { data: membro } = await supabase
        .from('mem_membros').select('id, nome, familia_id').eq('id', s.solicitante_membro_id).maybeSingle();
      if (!membro) return res.status(400).json({ error: 'Membro solicitante não encontrado' });
      let familiaId = membro.familia_id;
      if (!familiaId) {
        const { data: f, error: fe } = await supabase
          .from('mem_familias').insert({ nome: `Familia ${membro.nome.split(' ')[0]}` }).select('id').single();
        if (fe) throw fe;
        familiaId = f.id;
        await supabase.from('mem_membros').update({ familia_id: familiaId, parentesco: 'responsavel' }).eq('id', membro.id);
      }
      const { data: criada, error: ce } = await supabase
        .from('kids_criancas')
        .insert({
          nome: s.crianca_nome,
          data_nascimento: s.crianca_data_nascimento || null,
          serie: s.serie || null,
          necessidades_especiais: s.necessidade_especial || null,
          consent_marketing: s.consent_marketing ?? null,
          consent_marketing_em: s.consent_marketing_em || null,
          consent_marketing_versao: s.consent_marketing_versao || null,
          tem_espectro: s.tem_espectro ?? null,
          espectro_qual: s.espectro_qual || null,
          tem_alergia: s.tem_alergia ?? null,
          alergia_qual: s.alergia_qual || null,
          tem_limitacao_fisica: s.tem_limitacao_fisica ?? null,
          limitacao_fisica_qual: s.limitacao_fisica_qual || null,
          observacoes_medicas: s.observacoes_medicas || null,
          familia_id: familiaId,
          visitante: true,
          created_by: req.user?.id || null,
        })
        .select('id')
        .single();
      if (ce) throw ce;
      criancaId = criada.id;
    }
    // Dados informados no pedido acompanham a criança (cria ou atualiza).
    {
      const upd = {};
      if (s.serie) upd.serie = s.serie;
      if (s.necessidade_especial) upd.necessidades_especiais = s.necessidade_especial;
      if (s.consent_marketing != null) {
        upd.consent_marketing = s.consent_marketing;
        upd.consent_marketing_em = s.consent_marketing_em || null;
        upd.consent_marketing_versao = s.consent_marketing_versao || null;
      }
      if (Object.keys(upd).length) await supabase.from('kids_criancas').update(upd).eq('id', criancaId);
    }

    // 2. Cria/garante o vínculo do solicitante como responsável autorizado.
    const { error: ve } = await supabase
      .from('kids_responsaveis')
      .upsert({
        crianca_id: criancaId,
        membro_id: s.solicitante_membro_id,
        parentesco: s.solicitante_parentesco || 'outro',
        autorizado_buscar: true,
      }, { onConflict: 'crianca_id,membro_id' });
    if (ve) throw ve;

    // 3. Marca a solicitação como aprovada.
    const { error: ue } = await supabase
      .from('kids_vinculo_solicitacoes')
      .update({
        status: 'aprovado',
        crianca_criada_id: criancaId,
        decidido_por: req.user?.id || null,
        decidido_por_nome: req.user?.name || req.user?.email || null,
        decidido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', s.id);
    if (ue) throw ue;

    // Avisa o responsável no WhatsApp (no-op até template aprovado/configurado).
    wpp.notificarMembro(s.solicitante_membro_id, 'kids_vinculo', [s.crianca_nome, 'aprovado'])
      .catch((e) => console.warn('[TOTEM-KIDS] vinculo wpp:', e.message));

    res.json({ ok: true, crianca_id: criancaId });
  } catch (e) {
    console.error('[TOTEM-KIDS] vinculo-solicitacoes aprovar:', e.message);
    res.status(500).json({ error: 'Erro ao aprovar solicitação' });
  }
});

// POST /vinculo-solicitacoes/:id/rejeitar { motivo } — não cria vínculo
router.post('/vinculo-solicitacoes/:id/rejeitar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const motivo = req.body?.motivo ? String(req.body.motivo).trim() : null;
    const { data: s } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('id, status, solicitante_membro_id, crianca_nome')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!s) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (s.status !== 'pendente') return res.status(409).json({ error: 'Solicitação já decidida' });

    const { error } = await supabase
      .from('kids_vinculo_solicitacoes')
      .update({
        status: 'rejeitado',
        motivo_rejeicao: motivo,
        decidido_por: req.user?.id || null,
        decidido_por_nome: req.user?.name || req.user?.email || null,
        decidido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', s.id);
    if (error) throw error;

    wpp.notificarMembro(s.solicitante_membro_id, 'kids_vinculo', [s.crianca_nome, 'recusado'])
      .catch((e) => console.warn('[TOTEM-KIDS] vinculo wpp:', e.message));

    res.json({ ok: true });
  } catch (e) {
    console.error('[TOTEM-KIDS] vinculo-solicitacoes rejeitar:', e.message);
    res.status(500).json({ error: 'Erro ao rejeitar solicitação' });
  }
});

module.exports = router;
