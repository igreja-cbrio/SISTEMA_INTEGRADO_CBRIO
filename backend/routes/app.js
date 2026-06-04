/**
 * Rotas do aplicativo mobile CBRio
 * Auth: Supabase JWT leve (sem sistema de permissões do ERP interno)
 */
const router   = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');

// ── Auth middleware leve ───────────────────────────────────────────────────
async function authApp(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token inválido' });
  req.user = user;
  next();
}

// Tenta extrair usuário do token mas não bloqueia se não tiver
async function tryAuth(req, _res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
    req.user = user || null;
  }
  next();
}

const limiterStrict = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const limiterNormal = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });

// ── Anúncios (público) ────────────────────────────────────────────────────
router.get('/anuncios', limiterNormal, async (_req, res) => {
  try {
    const { data } = await supabase
      .from('app_anuncios')
      .select('titulo, descricao, cor, link, created_at')
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(10);
    res.json(data || []);
  } catch {
    res.json([]);
  }
});

// ── Visitante (público) ───────────────────────────────────────────────────
router.post('/visitante', limiterStrict, async (req, res) => {
  try {
    const { nome, telefone, email, como_conheceu } = req.body;
    if (!nome?.trim() || !telefone?.trim()) {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    }
    const { data, error } = await supabase
      .from('mem_membros')
      .insert({
        nome: nome.trim(),
        telefone,
        email: email?.trim() || null,
        como_conheceu: como_conheceu || null,
        situacao: 'visitante',
        origem_cadastro: 'app',
      })
      .select('id, nome')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP] visitante:', e.message);
    res.status(500).json({ error: 'Erro ao registrar visitante' });
  }
});

// ── Check-in (autenticado) ────────────────────────────────────────────────
router.post('/checkin', authApp, limiterNormal, async (req, res) => {
  try {
    const { service_type_id, data: dataCheckin } = req.body;
    if (!service_type_id || !dataCheckin) {
      return res.status(400).json({ error: 'service_type_id e data são obrigatórios' });
    }
    const { data: membro } = await supabase
      .from('mem_membros')
      .select('id')
      .eq('auth_user_id', req.user.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from('mem_checkins')
      .insert({
        service_type_id,
        data: dataCheckin,
        membro_id: membro?.id || null,
        origem: 'app',
        registrado_por: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP] checkin:', e.message);
    res.status(500).json({ error: 'Erro ao registrar check-in' });
  }
});

// ── Grupos: lista pública ─────────────────────────────────────────────────
router.get('/grupos', limiterNormal, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_grupos')
      .select('id, nome, dia_semana, horario, bairro, local, descricao, ativo')
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupos' });
  }
});

// ── Meus grupos (autenticado) ─────────────────────────────────────────────
router.get('/membro/grupos', authApp, async (req, res) => {
  try {
    const { data: membro } = await supabase
      .from('mem_membros')
      .select('id')
      .eq('auth_user_id', req.user.id)
      .maybeSingle();
    if (!membro) return res.json([]);

    const { data: participacoes } = await supabase
      .from('mem_grupo_membros')
      .select('papel, grupo:mem_grupos(id, nome, dia_semana, horario, bairro, local)')
      .eq('membro_id', membro.id)
      .eq('ativo', true);

    res.json((participacoes || []).map(p => ({ ...p.grupo, papel: p.papel })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupos do membro' });
  }
});

// ── Perfil do membro (autenticado) ────────────────────────────────────────
router.get('/membro/perfil', authApp, async (req, res) => {
  try {
    const { data } = await supabase
      .from('mem_membros')
      .select('id, nome, telefone, email, data_nascimento, endereco, situacao, foto_url, membro_desde')
      .eq('auth_user_id', req.user.id)
      .maybeSingle();

    if (!data) return res.json(null);

    const { count: totalCheckins } = await supabase
      .from('mem_checkins')
      .select('*', { count: 'exact', head: true })
      .eq('membro_id', data.id);

    const { count: totalGrupos } = await supabase
      .from('mem_grupo_membros')
      .select('*', { count: 'exact', head: true })
      .eq('membro_id', data.id)
      .eq('ativo', true);

    res.json({ ...data, total_checkins: totalCheckins || 0, total_grupos: totalGrupos || 0 });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

// ── Atualizar perfil (autenticado) ────────────────────────────────────────
router.put('/membro/perfil', authApp, async (req, res) => {
  try {
    const allowed = ['nome', 'telefone', 'data_nascimento', 'endereco'];
    const update  = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }
    const { data: membro } = await supabase
      .from('mem_membros').select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!membro) return res.status(404).json({ error: 'Membro não encontrado' });

    const { data, error } = await supabase
      .from('mem_membros').update(update).eq('id', membro.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// ── Vincular conta via CPF + data nascimento ──────────────────────────────
router.post('/membro/vincular', limiterStrict, authApp, async (req, res) => {
  try {
    const { cpf, data_nascimento } = req.body;
    if (!cpf || !data_nascimento) {
      return res.status(400).json({ error: 'CPF e data de nascimento são obrigatórios' });
    }
    const cpfDigitos = cpf.replace(/\D/g, '');

    const { data: membro } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf, data_nascimento, auth_user_id')
      .eq('cpf', cpfDigitos)
      .maybeSingle();

    if (!membro) {
      return res.status(404).json({ error: 'CPF não encontrado em nosso cadastro' });
    }

    // Verifica data de nascimento (aceita DD/MM/AAAA ou YYYY-MM-DD)
    const normalizar = (v) => (v || '').replace(/\D/g, '');
    const nascBD  = normalizar(membro.data_nascimento);
    const nascReq = normalizar(data_nascimento);
    // Converte DDMMAAAA → AAAAMMDD para comparação com ISO
    const nascReqISO = nascReq.length === 8
      ? `${nascReq.slice(4)}${nascReq.slice(2, 4)}${nascReq.slice(0, 2)}`
      : nascReq;
    if (nascBD !== nascReq && nascBD !== nascReqISO) {
      return res.status(400).json({ error: 'Data de nascimento não confere' });
    }

    // SEGURANCA: nao permitir re-vincular um cadastro ja reivindicado por OUTRA
    // conta. CPF+nascimento sao de baixa entropia (frequentemente vazados no BR);
    // sem essa trava, quem adivinhasse esses dados sequestraria o cadastro de um
    // membro ja vinculado. Idempotente se ja for o proprio usuario.
    if (membro.auth_user_id && membro.auth_user_id !== req.user.id) {
      return res.status(409).json({ error: 'Este cadastro já está vinculado a outra conta. Fale com a secretaria.' });
    }

    // Vincula
    await supabase
      .from('mem_membros')
      .update({ auth_user_id: req.user.id })
      .eq('id', membro.id);

    res.json({ ok: true, nome: membro.nome });
  } catch (e) {
    console.error('[APP] vincular:', e.message);
    res.status(500).json({ error: 'Erro ao vincular conta' });
  }
});

// ── Voluntariado: status (autenticado) ────────────────────────────────────
router.get('/voluntariado/status/:userId', authApp, async (req, res) => {
  try {
    const { data: volProfile } = await supabase
      .from('vol_profiles')
      .select('id, status, area, funcao')
      .eq('auth_user_id', req.user.id)
      .maybeSingle();

    res.json({
      voluntario: volProfile?.status === 'ativo',
      area:       volProfile?.area   || null,
      funcao:     volProfile?.funcao || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao verificar status de voluntário' });
  }
});

// ── Inscrições ────────────────────────────────────────────────────────────
router.post('/inscricoes', limiterStrict, tryAuth, async (req, res) => {
  try {
    const { tipo, ...extras } = req.body;
    if (!tipo) return res.status(400).json({ error: 'Tipo de inscrição é obrigatório' });

    const { error } = await supabase
      .from('app_inscricoes')
      .insert({
        tipo,
        auth_user_id: req.user?.id || null,
        dados: extras || {},
        status: 'pendente',
      });

    if (error) {
      // Tabela ainda não existe ou outro erro não-crítico
      console.warn('[APP] inscricoes:', error.message);
    }
    res.status(201).json({ ok: true, message: 'Inscrição recebida! Nossa equipe entrará em contato.' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar inscrição' });
  }
});

// ── Voluntariado · self-service do membro (app) ───────────────────────────
// Carteira é UNIFICADA (um cartão por membro = mem_qrcodes.token) — não há
// cartão de voluntário aqui. Estes endpoints cobrem: status da inscrição,
// área, escalas (confirmar/recusar) e indisponibilidade (culto ou período).

// Resolve o mem_membros do usuário logado (profiles.membro_id → fallback email)
async function resolveMembroApp(req) {
  const authId = req.user?.id;
  const email = req.user?.email || null;
  if (authId) {
    const { data: prof } = await supabase.from('profiles').select('membro_id').eq('id', authId).maybeSingle();
    if (prof?.membro_id) {
      const { data: m } = await supabase.from('mem_membros')
        .select('id, nome, cpf, email, telefone').eq('id', prof.membro_id).maybeSingle();
      if (m) return m;
    }
  }
  if (email) {
    const { data: m } = await supabase.from('mem_membros')
      .select('id, nome, cpf, email, telefone').ilike('email', email).is('deleted_at', null).maybeSingle();
    if (m) return m;
  }
  return null;
}

async function escalasDoVoluntario(vp) {
  if (!vp) return [];
  const conds = [`volunteer_id.eq.${vp.id}`];
  if (vp.planning_center_id) conds.push(`planning_center_person_id.eq.${vp.planning_center_id}`);
  const { data: schedules } = await supabase.from('vol_schedules')
    .select('*, service:vol_services!inner(*)')
    .or(conds.join(','))
    .gte('service.scheduled_at', new Date().toISOString())
    .order('service(scheduled_at)', { ascending: true });
  const ids = (schedules || []).map(s => s.id);
  let checked = new Set();
  if (ids.length) {
    const { data: ci } = await supabase.from('vol_check_ins').select('schedule_id').in('schedule_id', ids);
    checked = new Set((ci || []).map(c => c.schedule_id));
  }
  return (schedules || []).map(s => ({ ...s, has_checkin: checked.has(s.id) }));
}

// GET /api/app/voluntariado/me — agregador: inscrição + área + escalas + indisponibilidades
router.get('/voluntariado/me', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);

    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, full_name, allocation_status, planning_center_id')
      .eq('auth_user_id', req.user.id).maybeSingle();

    // Inscrição mais recente (por membro_id ou e-mail)
    let inscricao = null;
    const orParts = [];
    if (membro?.id) orParts.push(`membro_id.eq.${membro.id}`);
    if (req.user.email) orParts.push(`email.ilike.${req.user.email}`);
    if (orParts.length) {
      const { data: ins } = await supabase.from('vol_inscricoes')
        .select('id, status, area, ministerios_interesse, data_inscricao, enviado_lider_em, integrado_em')
        .or(orParts.join(',')).order('data_inscricao', { ascending: false }).limit(1).maybeSingle();
      inscricao = ins || null;
    }

    const ativo = vp?.allocation_status === 'active';
    const [escalas, indispRes] = await Promise.all([
      escalasDoVoluntario(vp),
      vp ? supabase.from('vol_availability').select('*').eq('volunteer_profile_id', vp.id).order('unavailable_from') : Promise.resolve({ data: [] }),
    ]);

    res.json({
      membro_id: membro?.id || null,
      vol_profile_id: vp?.id || null,
      voluntario_ativo: ativo,
      inscricao,                              // status: inscrito | enviado_ministerio | integrado
      area: inscricao?.area || null,
      ministerios: inscricao?.ministerios_interesse || null,
      escalas,
      indisponibilidades: indispRes.data || [],
    });
  } catch (e) {
    console.error('[APP vol/me]', e.message);
    res.status(500).json({ error: 'Erro ao carregar voluntariado' });
  }
});

// POST /api/app/voluntariado/solicitar-area — pede pra servir (em outra área também)
// body: { areas: [labels], nome_mae? }  · cai na triagem do voluntariado
router.post('/voluntariado/solicitar-area', authApp, limiterStrict, async (req, res) => {
  try {
    const { areas, nome_mae } = req.body || {};
    if (!Array.isArray(areas) || areas.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos uma área' });
    }
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });

    // Dedup: já existe uma inscrição em aberto (em análise) pra essa pessoa?
    const { data: aberta } = await supabase.from('vol_inscricoes')
      .select('id, status, area')
      .eq('membro_id', membro.id)
      .in('status', ['inscrito', 'enviado_ministerio'])
      .limit(1).maybeSingle();
    if (aberta) {
      return res.status(409).json({
        error: 'Você já tem uma inscrição em análise. Aguarde a equipe entrar em contato.',
        jaInscrito: true, inscricao_status: aberta.status,
      });
    }

    const nomeCompleto = (membro.nome || '').trim();
    const nome = nomeCompleto.split(' ')[0] || nomeCompleto || 'Membro';
    const sobrenome = nomeCompleto.split(' ').slice(1).join(' ') || '-';

    // Insere em app_inscricoes → a trigger cria a inscrição em vol_inscricoes
    const { error } = await supabase.from('app_inscricoes').insert({
      tipo: 'voluntariado',
      auth_user_id: req.user.id,
      status: 'pendente',
      dados: {
        nome, sobrenome, nome_completo: nomeCompleto || nome,
        cpf: membro.cpf || null, email: membro.email || req.user.email || null,
        telefone: membro.telefone || null,
        nome_mae: nome_mae || null,
        areas, membro_id: membro.id,
      },
    });
    if (error) throw error;
    res.status(201).json({ ok: true, message: 'Pedido enviado! A coordenação de voluntários vai falar com você.' });
  } catch (e) {
    console.error('[APP vol/solicitar-area]', e.message);
    res.status(500).json({ error: 'Erro ao enviar pedido' });
  }
});

// GET /api/app/voluntariado/escalas — próximas escalas do voluntário
router.get('/voluntariado/escalas', authApp, limiterNormal, async (req, res) => {
  try {
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, planning_center_id').eq('auth_user_id', req.user.id).maybeSingle();
    res.json(await escalasDoVoluntario(vp));
  } catch (e) {
    console.error('[APP vol/escalas]', e.message);
    res.status(500).json({ error: 'Erro ao buscar escalas' });
  }
});

// POST /api/app/voluntariado/escalas/:id/responder — { status: 'confirmed'|'declined' }
router.post('/voluntariado/escalas/:id/responder', authApp, limiterNormal, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['confirmed', 'declined'].includes(status)) {
      return res.status(400).json({ error: "status deve ser 'confirmed' ou 'declined'" });
    }
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });
    // só responde escala própria
    const { data, error } = await supabase.from('vol_schedules')
      .update({ confirmation_status: status })
      .eq('id', req.params.id).eq('volunteer_id', vp.id).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Escala não encontrada' });
    res.json(data);
  } catch (e) {
    console.error('[APP vol/responder]', e.message);
    res.status(500).json({ error: 'Erro ao responder escala' });
  }
});

// GET /api/app/voluntariado/indisponibilidades
router.get('/voluntariado/indisponibilidades', authApp, limiterNormal, async (req, res) => {
  try {
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!vp) return res.json([]);
    const { data } = await supabase.from('vol_availability')
      .select('*').eq('volunteer_profile_id', vp.id).order('unavailable_from');
    res.json(data || []);
  } catch (e) {
    console.error('[APP vol/indisp list]', e.message);
    res.status(500).json({ error: 'Erro ao buscar indisponibilidade' });
  }
});

// POST /api/app/voluntariado/indisponibilidade
// body: { service_id } (culto específico) OU { inicio, fim } (faixa de datas) + motivo?
router.post('/voluntariado/indisponibilidade', authApp, limiterNormal, async (req, res) => {
  try {
    const { service_id, inicio, fim, motivo } = req.body || {};
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });

    let from = inicio; let to = fim || inicio;
    if (service_id) {
      const { data: s } = await supabase.from('vol_services').select('scheduled_at').eq('id', service_id).maybeSingle();
      if (!s) return res.status(404).json({ error: 'Culto não encontrado' });
      from = s.scheduled_at.split('T')[0]; to = from;
    }
    if (!from) return res.status(400).json({ error: 'Informe service_id ou inicio/fim' });

    const { data, error } = await supabase.from('vol_availability').insert({
      volunteer_profile_id: vp.id, service_id: service_id || null,
      unavailable_from: from, unavailable_to: to, reason: motivo || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP vol/indisp create]', e.message);
    res.status(500).json({ error: 'Erro ao registrar indisponibilidade' });
  }
});

// DELETE /api/app/voluntariado/indisponibilidade/:id
router.delete('/voluntariado/indisponibilidade/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Perfil não encontrado' });
    const { error } = await supabase.from('vol_availability')
      .delete().eq('id', req.params.id).eq('volunteer_profile_id', vp.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP vol/indisp delete]', e.message);
    res.status(500).json({ error: 'Erro ao remover indisponibilidade' });
  }
});

module.exports = router;