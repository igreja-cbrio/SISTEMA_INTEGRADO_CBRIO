/**
 * Rotas do aplicativo mobile CBRio
 * Auth: Supabase JWT leve (sem sistema de permissões do ERP interno)
 */
const router   = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { dispararAuto } = require('../services/whatsappAuto');
const wpp = require('../services/whatsappService');
const { analisarOracao } = require('../services/oracaoAnalise');

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
// Tipos aceitos pelo app. Os pastorais (Cuidados) notificam a equipe e
// entram na fila da aba "Acompanhamentos" do módulo Cuidados.
const TIPOS_INSCRICAO = new Set([
  'grupos', 'batismo', 'retiro', 'cursos', 'next', 'voluntariado', 'eventos',
  'aconselhamento', 'oracao', 'sos', 'contato',
]);
const TIPOS_CUIDADOS = new Set(['aconselhamento', 'oracao', 'sos']);
// Tipos que geram confirmação por WhatsApp (template cbrio_inscricao_confirmada)
const LABEL_INSCRICAO_WPP = {
  grupos: 'Grupos de Conexão', batismo: 'Batismo', next: 'NEXT',
  voluntariado: 'Voluntariado', retiro: 'Retiro', cursos: 'Cursos', eventos: 'Eventos',
};
const LABEL_CUIDADOS = { aconselhamento: 'aconselhamento', oracao: 'oração', sos: 'SOS' };
// Mapeia a urgência pra cor do sino (SEV_COLORS no AppShell)
const SEV_CUIDADOS = { sos: 'urgente', aconselhamento: 'aviso', oracao: 'info' };

function extrairMensagem(d) {
  return d.mensagem || d.message || d.texto || d.descricao || d.obs || d.observacao || null;
}

router.post('/inscricoes', limiterStrict, tryAuth, async (req, res) => {
  try {
    const { tipo, ...extras } = req.body || {};
    if (!tipo) return res.status(400).json({ error: 'Tipo de inscrição é obrigatório' });
    if (!TIPOS_INSCRICAO.has(tipo)) {
      console.warn('[APP] inscricoes · tipo não reconhecido:', tipo);
      return res.status(400).json({ error: `Tipo de inscrição não reconhecido: ${tipo}` });
    }

    const ehCuidados = TIPOS_CUIDADOS.has(tipo);
    const dados = { ...extras };
    let membroId = null;

    // Pedidos pastorais: resolve o membro logado pra vincular a ficha +
    // guarda um snapshot de nome/telefone pra exibir mesmo se o cadastro mudar.
    if (ehCuidados) {
      const membro = await resolveMembroApp(req).catch(() => null);
      if (membro) {
        membroId = membro.id;
        dados.membro_id = membro.id;
        if (!dados.nome && membro.nome) dados.nome = membro.nome;
        if (!dados.telefone && membro.telefone) dados.telefone = membro.telefone;
      }
      // Fallback: o app também envia membro_id no corpo (já autenticado por JWT).
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!membroId && typeof extras.membro_id === 'string' && UUID_RE.test(extras.membro_id)) {
        membroId = extras.membro_id;
      }
    }

    // Pedido de oração: a IA classifica o tema (pra insights) já no insert.
    if (tipo === 'oracao') {
      const msgOra = extrairMensagem(extras);
      if (msgOra) {
        const analise = await analisarOracao(msgOra).catch(() => null);
        if (analise) dados.analise = analise;
      }
    }

    const { data: inserted, error } = await supabase
      .from('app_inscricoes')
      .insert({
        tipo,
        auth_user_id: req.user?.id || null,
        membro_id: membroId,
        dados,
        status: 'pendente',
      })
      .select('id')
      .single();

    // Erro de gravação NÃO devolve 200 silencioso — o app precisa saber.
    if (error) {
      console.error('[APP] inscricoes · falha ao gravar:', error.message);
      return res.status(500).json({ error: 'Não foi possível registrar sua solicitação. Tente novamente.' });
    }

    // Notifica a equipe de Cuidados (in-app + push). SOS é urgente.
    if (ehCuidados) {
      const nome = dados.nome || req.user?.email || 'Alguém';
      const label = LABEL_CUIDADOS[tipo] || tipo;
      const msg = extrairMensagem(extras);
      const urgente = tipo === 'sos';
      notificar({
        modulo: 'cuidados',
        tipo: `app_pedido_${tipo}`,
        titulo: urgente ? `🆘 SOS — ${nome}` : `Novo pedido de ${label} — ${nome}`,
        mensagem: `${nome} pediu ${label} pelo app${msg ? `: "${String(msg).slice(0, 180)}"` : '.'}`,
        link: '/ministerial/cuidados?tab=acomp',
        severidade: SEV_CUIDADOS[tipo] || 'info',
        chaveDedup: `app_pedido_${inserted.id}`,
      }).catch(e => console.warn('[APP] inscricoes · notificar:', e.message));
    }

    // Fale Conosco: notifica a secretaria (cai no fallback admin/diretor
    // se não houver regra de notificação configurada).
    if (tipo === 'contato') {
      const nome = dados.nome || req.user?.email || 'Alguém';
      const msg = extrairMensagem(extras);
      const assunto = dados.assunto ? ` (${String(dados.assunto).slice(0, 40)})` : '';
      notificar({
        modulo: 'membresia',
        tipo: 'app_contato',
        titulo: `Fale Conosco — ${nome}${assunto}`,
        mensagem: `${nome} mandou uma mensagem pelo app${msg ? `: "${String(msg).slice(0, 180)}"` : '.'}`,
        link: '/ministerial/membresia',
        severidade: 'info',
        chaveDedup: `app_contato_${inserted.id}`,
      }).catch(e => console.warn('[APP] inscricoes · notificar contato:', e.message));
    }

    // Mensagem automática de WhatsApp pro membro que pediu aconselhamento pastoral.
    if (tipo === 'aconselhamento') {
      try {
        await dispararAuto('cuidados_aconselhamento', {
          refId: inserted.id, telefone: dados.telefone, nome: dados.nome, origem: 'app',
        });
      } catch (e) { console.warn('[APP] aconselhamento whatsapp:', e.message); }
    }

    // Confirmação ao membro via WhatsApp · template aprovado (no-op até configurar
    // o env do template + opt-in respeitado dentro de notificarMembro).
    if (LABEL_INSCRICAO_WPP[tipo]) {
      resolveMembroApp(req).then((m) => {
        if (!m?.id) return;
        const primeiroNome = String(m.nome || dados.nome || '').split(' ')[0] || 'Olá';
        return wpp.notificarMembro(m.id, 'inscricao_confirmada', [primeiroNome, LABEL_INSCRICAO_WPP[tipo]]);
      }).catch((e) => console.warn('[APP] inscricao wpp:', e.message));
    }

    res.status(201).json({ ok: true, id: inserted.id, message: 'Solicitação recebida! Nossa equipe entrará em contato.' });
  } catch (e) {
    console.error('[APP] inscricoes:', e.message);
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

    // A trigger de fan-out já criou a inscrição em vol_inscricoes · busca o id
    // pra logar/idempotência e dispara a mensagem de boas-vindas no WhatsApp.
    try {
      const { data: vi } = await supabase.from('vol_inscricoes')
        .select('id').eq('membro_id', membro.id).eq('status', 'inscrito')
        .order('data_inscricao', { ascending: false }).limit(1).maybeSingle();
      await dispararAuto('voluntariado_inscricao', {
        refId: vi?.id || null,
        telefone: membro.telefone,
        nome: membro.nome,
        origem: 'app',
      });
    } catch (e) { console.warn('[APP vol/solicitar-area] whatsapp:', e.message); }

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

// ── NEXT · inscrição + próximos encontros + check-in geolocalizado ────────
// Tudo vinculado ao mem_membros (resolveMembroApp) → alimenta a jornada.
// Geofence configurável por env (defina as coordenadas EXATAS no Vercel):
//   NEXT_CHURCH_LAT, NEXT_CHURCH_LNG, NEXT_CHECKIN_RADIUS_M (default 500)
const NEXT_CHURCH = {
  lat: parseFloat(process.env.NEXT_CHURCH_LAT || '-23.001115'),  // Av. das Américas 7907, Barra da Tijuca/RJ
  lng: parseFloat(process.env.NEXT_CHURCH_LNG || '-43.388279'),
  raio: parseInt(process.env.NEXT_CHECKIN_RADIUS_M || '500', 10),
};
function distanciaMetros(aLat, aLng, bLat, bLng) {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function hojeBRT() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }
function partesNome(nomeCompleto) {
  const n = (nomeCompleto || '').trim();
  return { nome: n.split(' ')[0] || 'Membro', sobrenome: n.split(' ').slice(1).join(' ') || null };
}

// GET /api/app/next/me — próximos encontros + status de inscrição/check-in
router.get('/next/me', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    const hoje = hojeBRT();
    const { data: eventos } = await supabase.from('next_eventos')
      .select('id, data, titulo, status').eq('status', 'agendado')
      .gte('data', hoje).order('data', { ascending: true }).limit(12);

    let byEvento = {};
    if (membro && (eventos || []).length) {
      const { data: ins } = await supabase.from('next_inscricoes')
        .select('evento_id, check_in_at').eq('membro_id', membro.id)
        .in('evento_id', eventos.map(e => e.id));
      (ins || []).forEach(i => { byEvento[i.evento_id] = i; });
    }
    const encontros = (eventos || []).map(e => ({
      id: e.id, data: e.data, titulo: e.titulo,
      inscrito: !!byEvento[e.id],
      check_in_at: byEvento[e.id]?.check_in_at || null,
      pode_checkin_hoje: e.data === hoje,
    }));
    res.json({
      membro_id: membro?.id || null,
      inscrito_next: encontros.some(e => e.inscrito),
      encontros,
      igreja: { lat: NEXT_CHURCH.lat, lng: NEXT_CHURCH.lng, raio_m: NEXT_CHURCH.raio },
    });
  } catch (e) {
    console.error('[APP next/me]', e.message);
    res.status(500).json({ error: 'Erro ao carregar NEXT' });
  }
});

// POST /api/app/next/inscrever — inscreve o membro no próximo encontro
router.post('/next/inscrever', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });

    const { data: prox } = await supabase.from('next_eventos')
      .select('id, data, titulo').eq('status', 'agendado')
      .gte('data', hojeBRT()).order('data').limit(1).maybeSingle();
    if (!prox) return res.status(400).json({ error: 'Não há encontros do NEXT agendados no momento.' });

    const { data: ja } = await supabase.from('next_inscricoes')
      .select('id').eq('membro_id', membro.id).eq('evento_id', prox.id).maybeSingle();
    if (ja) return res.json({ ok: true, evento: prox, jaInscrito: true });

    const { nome, sobrenome } = partesNome(membro.nome);
    const { data: nova, error } = await supabase.from('next_inscricoes').insert({
      evento_id: prox.id, nome, sobrenome,
      cpf: membro.cpf || null, email: membro.email || req.user.email || null,
      telefone: membro.telefone || null, membro_id: membro.id, origem: 'app',
    }).select('id').single();
    if (error) throw error;

    // Notifica os responsáveis do NEXT (sino + push) — espelha o form público.
    notificar({
      modulo: 'next',
      tipo: 'next_nova_inscricao',
      titulo: 'Nova inscrição no NEXT',
      mensagem: `${membro.nome || nome} se inscreveu no NEXT pelo app${prox.titulo ? ` (${prox.titulo})` : ''}.`,
      link: '/ministerial/next?tab=inscritos',
      chaveDedup: nova?.id ? `next_insc_${nova.id}` : undefined,
    }).catch(e => console.warn('[APP next/inscrever] notificar:', e.message));

    res.status(201).json({ ok: true, evento: prox, message: 'Inscrição no NEXT confirmada!' });
  } catch (e) {
    console.error('[APP next/inscrever]', e.message);
    res.status(500).json({ error: 'Erro ao inscrever no NEXT' });
  }
});

// POST /api/app/next/encontros/:eventoId/checkin — body { lat, lng }
// Só no DIA do encontro (BRT) e dentro do raio da igreja.
router.post('/next/encontros/:eventoId/checkin', authApp, limiterNormal, async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });

    const { data: ev } = await supabase.from('next_eventos')
      .select('id, data, titulo').eq('id', req.params.eventoId).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Encontro não encontrado' });
    if (ev.data !== hojeBRT()) {
      return res.status(422).json({ error: 'O check-in só fica disponível no dia do encontro.' });
    }
    if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      return res.status(422).json({ needLocation: true, error: 'Ative a localização para confirmar sua presença.' });
    }
    const dist = distanciaMetros(Number(lat), Number(lng), NEXT_CHURCH.lat, NEXT_CHURCH.lng);
    if (dist > NEXT_CHURCH.raio) {
      return res.status(403).json({ error: 'Você precisa estar na igreja para fazer o check-in.', distancia_m: Math.round(dist) });
    }

    const agora = new Date().toISOString();
    const { data: insc } = await supabase.from('next_inscricoes')
      .select('id, check_in_at').eq('membro_id', membro.id).eq('evento_id', ev.id).maybeSingle();

    if (insc) {
      if (insc.check_in_at) return res.json({ ok: true, jaCheckin: true, check_in_at: insc.check_in_at });
      const { data: up, error } = await supabase.from('next_inscricoes')
        .update({ check_in_at: agora, check_in_by: req.user.id, updated_at: agora })
        .eq('id', insc.id).select('check_in_at').single();
      if (error) throw error;
      return res.json({ ok: true, check_in_at: up.check_in_at });
    }

    const { nome, sobrenome } = partesNome(membro.nome);
    const { data: novo, error } = await supabase.from('next_inscricoes').insert({
      evento_id: ev.id, nome, sobrenome,
      cpf: membro.cpf || null, email: membro.email || req.user.email || null,
      telefone: membro.telefone || null, membro_id: membro.id, origem: 'app',
      check_in_at: agora, check_in_by: req.user.id,
    }).select('id, check_in_at').single();
    if (error) throw error;

    // Inscrição nova surgida no check-in pelo app → notifica o NEXT.
    notificar({
      modulo: 'next',
      tipo: 'next_nova_inscricao',
      titulo: 'Nova inscrição no NEXT',
      mensagem: `${membro.nome || nome} se inscreveu no NEXT pelo app (check-in${ev.titulo ? ` · ${ev.titulo}` : ''}).`,
      link: '/ministerial/next?tab=inscritos',
      chaveDedup: novo?.id ? `next_insc_${novo.id}` : undefined,
    }).catch(e => console.warn('[APP next/checkin] notificar:', e.message));

    res.status(201).json({ ok: true, check_in_at: novo.check_in_at });
  } catch (e) {
    console.error('[APP next/checkin]', e.message);
    res.status(500).json({ error: 'Erro ao fazer check-in' });
  }
});

// ── Kids · pré-check-in pelo app ───────────────────────────────────────────
// O responsável prepara o check-in (escolhe os filhos), gera um código/QR,
// e no totem o voluntário aplica. NÃO faz a entrada/retirada — só adianta.

// GET /api/app/kids/meus-filhos — crianças de quem o membro é responsável
// AUTORIZADO (autorizado_buscar=true) + pré-check-in pendente, se houver.
router.get('/kids/meus-filhos', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ membro: null, filhos: [], preCheckin: null });

    const { data: vinculos } = await supabase
      .from('kids_responsaveis')
      .select('crianca_id, parentesco, kids_criancas!inner(id, nome, data_nascimento, observacoes_medicas, ativo)')
      .eq('membro_id', membro.id)
      .eq('autorizado_buscar', true);

    const filhos = (vinculos || [])
      .map((v) => (Array.isArray(v.kids_criancas) ? v.kids_criancas[0] : v.kids_criancas))
      .filter((c) => c && c.ativo)
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        data_nascimento: c.data_nascimento,
        observacoes_medicas: c.observacoes_medicas || null,
      }));

    // pré-check-in pendente e não expirado
    const { data: pre } = await supabase
      .from('kids_pre_checkins')
      .select('id, codigo, crianca_ids, criado_em, expira_em')
      .eq('responsavel_membro_id', membro.id)
      .eq('status', 'pendente')
      .gt('expira_em', new Date().toISOString())
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({ membro: { id: membro.id, nome: membro.nome }, filhos, preCheckin: pre || null });
  } catch (e) {
    console.error('[APP] kids/meus-filhos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar' });
  }
});

// POST /api/app/kids/pre-checkin { crianca_ids: [] } — gera o código/QR.
router.post('/kids/pre-checkin', authApp, limiterStrict, async (req, res) => {
  try {
    const { crianca_ids } = req.body || {};
    if (!Array.isArray(crianca_ids) || crianca_ids.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos uma criança' });
    }
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro de membro não encontrado' });

    // valida: TODAS as crianças são filhos AUTORIZADOS deste membro
    const { data: vinculos } = await supabase
      .from('kids_responsaveis')
      .select('crianca_id')
      .eq('membro_id', membro.id)
      .eq('autorizado_buscar', true)
      .in('crianca_id', crianca_ids);
    const permitidos = new Set((vinculos || []).map((v) => v.crianca_id));
    if (crianca_ids.some((id) => !permitidos.has(id))) {
      return res.status(403).json({ error: 'Você só pode preparar o check-in dos seus filhos.' });
    }

    // cancela pendentes anteriores (só 1 ativo por responsável)
    await supabase
      .from('kids_pre_checkins')
      .update({ status: 'cancelado' })
      .eq('responsavel_membro_id', membro.id)
      .eq('status', 'pendente');

    const { data: codigoRow } = await supabase.rpc('fn_kids_pre_checkin_codigo');
    const codigo = codigoRow || Math.random().toString(36).slice(2, 8).toUpperCase();
    const expira = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

    const { data: criado, error } = await supabase
      .from('kids_pre_checkins')
      .insert({
        codigo,
        responsavel_membro_id: membro.id,
        responsavel_nome: membro.nome,
        responsavel_telefone: membro.telefone || null,
        crianca_ids,
        expira_em: expira,
      })
      .select('id, codigo, crianca_ids, expira_em')
      .single();
    if (error) throw error;

    res.status(201).json(criado);
  } catch (e) {
    console.error('[APP] kids/pre-checkin:', e.message);
    res.status(500).json({ error: 'Não foi possível gerar o check-in' });
  }
});

// GET /api/app/kids/filho/:id — detalhe do filho (responsável autorizado):
// info + sala sugerida + histórico de check-ins + foto (se consentida).
router.get('/kids/filho/:id', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });
    // segurança: só responsável autorizado da criança
    const { data: vinc } = await supabase
      .from('kids_responsaveis')
      .select('id, parentesco')
      .eq('membro_id', membro.id)
      .eq('crianca_id', req.params.id)
      .eq('autorizado_buscar', true)
      .maybeSingle();
    if (!vinc) return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });

    const { data: c } = await supabase
      .from('kids_criancas')
      .select('id, nome, data_nascimento, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas, necessidades_especiais')
      .eq('id', req.params.id)
      .eq('ativo', true)
      .maybeSingle();
    if (!c) return res.status(404).json({ error: 'Criança não encontrada' });

    // Foto só com consentimento. App = bucket privado (signed URL); legado = foto_url.
    let fotoUrl = null;
    if (c.foto_consentimento_em) {
      if (c.foto_storage_path) {
        const { data: signed } = await supabase.storage.from('kids-documentos').createSignedUrl(c.foto_storage_path, 60 * 30);
        fotoUrl = signed?.signedUrl || null;
      } else {
        fotoUrl = c.foto_url;
      }
    }

    const idadeMeses = c.data_nascimento
      ? Math.floor((Date.now() - new Date(c.data_nascimento).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      : null;

    // sala sugerida pela faixa etária
    let salaSugerida = null;
    if (idadeMeses != null) {
      const { data: salas } = await supabase
        .from('kids_salas')
        .select('nome, cor, faixa_etaria_min_meses, faixa_etaria_max_meses')
        .eq('ativo', true);
      const s = (salas || []).find((x) => x.faixa_etaria_min_meses <= idadeMeses && x.faixa_etaria_max_meses >= idadeMeses);
      if (s) salaSugerida = { nome: s.nome, cor: s.cor };
    }

    // histórico de check-ins
    const { data: checkins } = await supabase
      .from('kids_checkins')
      .select('id, checkin_at, checkout_at, fez_decisao_jesus, sala:kids_salas(nome, cor), sessao:kids_sessoes(culto:cultos(nome, data))')
      .eq('crianca_id', req.params.id)
      .order('checkin_at', { ascending: false })
      .limit(20);

    const historico = (checkins || []).map((k) => {
      const sala = Array.isArray(k.sala) ? k.sala[0] : k.sala;
      const sessao = Array.isArray(k.sessao) ? k.sessao[0] : k.sessao;
      const culto = sessao && (Array.isArray(sessao.culto) ? sessao.culto[0] : sessao.culto);
      return {
        id: k.id,
        checkin_at: k.checkin_at,
        checkout_at: k.checkout_at,
        decisao: !!k.fez_decisao_jesus,
        sala: sala?.nome || null,
        cor: sala?.cor || null,
        culto: culto?.nome || null,
        data: culto?.data || null,
      };
    });

    res.json({
      crianca: {
        id: c.id,
        nome: c.nome,
        data_nascimento: c.data_nascimento,
        idade_meses: idadeMeses,
        observacoes_medicas: c.observacoes_medicas || null,
        necessidades_especiais: c.necessidades_especiais || null,
        parentesco: vinc.parentesco || null,
        foto_url: fotoUrl, // só com consentimento (signed URL se foto do app)
        foto_consentida: !!c.foto_consentimento_em,
      },
      sala_sugerida: salaSugerida,
      total_checkins: historico.length,
      historico,
    });
  } catch (e) {
    console.error('[APP] kids/filho:', e.message);
    res.status(500).json({ error: 'Erro ao carregar' });
  }
});

// Helper: confirma que o membro é responsável AUTORIZADO da criança.
async function ehResponsavelAutorizado(membroId, criancaId) {
  const { data } = await supabase
    .from('kids_responsaveis').select('id')
    .eq('membro_id', membroId).eq('crianca_id', criancaId).eq('autorizado_buscar', true)
    .maybeSingle();
  return !!data;
}

// POST /api/app/kids/filho/:id/foto — responsável adiciona a foto da criança.
// ⚠️ ECA/LGPD: exige consentimento explícito (consentimento=true). A foto já
// foi enviada pro bucket privado kids-documentos; aqui recebemos só o PATH
// (que precisa estar na pasta do próprio usuário).
router.post('/kids/filho/:id/foto', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });
    const { storage_path, consentimento, versao_consentimento } = req.body || {};
    if (consentimento !== true) {
      return res.status(400).json({ error: 'É necessário autorizar o uso da imagem da criança.' });
    }
    if (!storage_path || typeof storage_path !== 'string') {
      return res.status(400).json({ error: 'Arquivo inválido' });
    }
    if (!storage_path.startsWith(`${req.user.id}/`)) {
      return res.status(403).json({ error: 'Caminho inválido' });
    }
    if (!(await ehResponsavelAutorizado(membro.id, req.params.id))) {
      return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });
    }

    const { error } = await supabase.from('kids_criancas').update({
      foto_storage_path: storage_path,
      foto_url: null, // app usa storage privado; limpa URL legada
      foto_consentimento_em: new Date().toISOString(),
      foto_consentimento_por: req.user.id,
      foto_consentimento_versao: (versao_consentimento || 'eca-lgpd-v1').toString().slice(0, 40),
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).eq('ativo', true);
    if (error) throw error;

    const { data: signed } = await supabase.storage.from('kids-documentos').createSignedUrl(storage_path, 60 * 30);
    res.json({ ok: true, foto_url: signed?.signedUrl || null });
  } catch (e) {
    console.error('[APP] kids/foto:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a foto' });
  }
});

// POST /api/app/kids/filho/:id/foto/remover — revoga o consentimento e apaga a foto.
router.post('/kids/filho/:id/foto/remover', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });
    if (!(await ehResponsavelAutorizado(membro.id, req.params.id))) {
      return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });
    }
    const { data: c } = await supabase.from('kids_criancas')
      .select('foto_storage_path').eq('id', req.params.id).maybeSingle();
    const { error } = await supabase.from('kids_criancas').update({
      foto_storage_path: null,
      foto_url: null,
      foto_consentimento_em: null,
      foto_consentimento_por: null,
      foto_consentimento_versao: null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    if (error) throw error;
    if (c?.foto_storage_path) {
      try { await supabase.storage.from('kids-documentos').remove([c.foto_storage_path]); } catch { /* best-effort */ }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] kids/foto remover:', e.message);
    res.status(500).json({ error: 'Erro ao remover a foto' });
  }
});

// POST /api/app/kids/solicitar-vinculo — o responsável pede pra ser vinculado a
// uma criança e envia os documentos (criança + pai e/ou mãe). NÃO vincula
// automaticamente: vira solicitação pendente que a equipe Kids confere e aprova.
// Os documentos já foram enviados pelo app pro bucket privado kids-documentos;
// aqui recebemos só os PATHS (que precisam estar na pasta do próprio usuário).
router.post('/kids/solicitar-vinculo', authApp, limiterStrict, async (req, res) => {
  try {
    const {
      crianca_nome, crianca_data_nascimento, parentesco, observacao,
      crianca_doc_path, doc_pai_path, doc_mae_path,
    } = req.body || {};

    if (!crianca_nome || !String(crianca_nome).trim()) {
      return res.status(400).json({ error: 'Informe o nome da criança' });
    }
    if (!crianca_doc_path) {
      return res.status(400).json({ error: 'Envie o documento da criança' });
    }
    if (!doc_pai_path && !doc_mae_path) {
      return res.status(400).json({ error: 'Envie o documento do pai e/ou da mãe' });
    }

    // Segurança: cada documento tem que estar na pasta do próprio usuário
    // ({auth.uid}/...). Impede apontar arquivo de outra pessoa.
    const prefixo = `${req.user.id}/`;
    const paths = [crianca_doc_path, doc_pai_path, doc_mae_path].filter(Boolean);
    if (paths.some((p) => !String(p).startsWith(prefixo))) {
      return res.status(403).json({ error: 'Documento inválido.' });
    }

    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Complete seu cadastro de membro antes de solicitar.' });

    const parentescosOk = ['mae', 'pai', 'avo_a', 'tio_a', 'tutor', 'outro'];
    const parent = parentescosOk.includes(parentesco) ? parentesco : 'outro';

    const { data: criado, error } = await supabase
      .from('kids_vinculo_solicitacoes')
      .insert({
        solicitante_membro_id: membro.id,
        solicitante_nome: membro.nome,
        solicitante_telefone: membro.telefone || null,
        solicitante_parentesco: parent,
        crianca_nome: String(crianca_nome).trim(),
        crianca_data_nascimento: crianca_data_nascimento || null,
        crianca_doc_path,
        doc_pai_path: doc_pai_path || null,
        doc_mae_path: doc_mae_path || null,
        observacao: observacao ? String(observacao).trim() : null,
      })
      .select('id, status, created_at')
      .single();
    if (error) throw error;

    notificar({
      modulo: 'kids',
      tipo: 'kids_vinculo_solicitacao',
      titulo: 'Nova solicitação de vínculo Kids',
      mensagem: `${membro.nome} pediu vínculo com ${String(crianca_nome).trim()}. Confira os documentos e aprove.`,
      link: '/ministerial/totem-kids/vinculos',
      severidade: 'aviso',
      chaveDedup: `kids_vinculo_${criado.id}`,
    }).catch((e) => console.warn('[APP] solicitar-vinculo · notificar:', e.message));

    res.status(201).json(criado);
  } catch (e) {
    console.error('[APP] kids/solicitar-vinculo:', e.message);
    res.status(500).json({ error: 'Não foi possível enviar a solicitação' });
  }
});

// GET /api/app/whatsapp-optin — consentimento atual do membro pra WhatsApp.
router.get('/whatsapp-optin', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ optin: false, optin_em: null });
    const { data } = await supabase
      .from('mem_membros')
      .select('whatsapp_optin, whatsapp_optin_em')
      .eq('id', membro.id)
      .maybeSingle();
    res.json({ optin: !!data?.whatsapp_optin, optin_em: data?.whatsapp_optin_em || null });
  } catch (e) {
    console.error('[APP] whatsapp-optin get:', e.message);
    res.status(500).json({ error: 'Erro ao carregar preferência' });
  }
});

// POST /api/app/whatsapp-optin { optin } — grava consentimento (LGPD: + data).
router.post('/whatsapp-optin', authApp, async (req, res) => {
  try {
    const optin = !!req.body?.optin;
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro de membro não encontrado' });
    const { error } = await supabase
      .from('mem_membros')
      .update({ whatsapp_optin: optin, whatsapp_optin_em: new Date().toISOString() })
      .eq('id', membro.id);
    if (error) throw error;
    res.json({ ok: true, optin });
  } catch (e) {
    console.error('[APP] whatsapp-optin post:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar' });
  }
});

// GET /api/app/kids/minhas-solicitacoes — status das solicitações do membro.
router.get('/kids/minhas-solicitacoes', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ solicitacoes: [] });

    const { data } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('id, crianca_nome, status, motivo_rejeicao, created_at, decidido_em')
      .eq('solicitante_membro_id', membro.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20);

    res.json({ solicitacoes: data || [] });
  } catch (e) {
    console.error('[APP] kids/minhas-solicitacoes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar solicitações' });
  }
});

// Próximo encontro a partir do dia da semana (0=Dom..6=Sáb) + horário.
function proximoEncontroISO(diaSemana, horario) {
  if (diaSemana === null || diaSemana === undefined) return null;
  const now = new Date();
  const delta = ((Number(diaSemana) - now.getDay()) + 7) % 7;
  const [hh, mm] = String(horario || '19:00').split(':').map((x) => parseInt(x, 10) || 0);
  const d = new Date(now);
  d.setDate(now.getDate() + delta);
  d.setHours(hh, mm, 0, 0);
  if (delta === 0 && d.getTime() < now.getTime()) d.setDate(d.getDate() + 7);
  return d.toISOString();
}

// GET /api/app/meu-grupo — grupo(s) de conexão ativos do membro: info, líder,
// próximo encontro e materiais. Pra experiência "já estou no grupo".
router.get('/meu-grupo', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ grupos: [] });
    const { data: vinculos } = await supabase
      .from('mem_grupo_membros')
      .select('grupo_id, funcao, mem_grupos(id, nome, dia_semana, horario, local, endereco, bairro, complemento, lat, lng, foto_url, lider_id)')
      .eq('membro_id', membro.id)
      .is('saiu_em', null);

    const grupos = [];
    for (const v of vinculos || []) {
      const g = Array.isArray(v.mem_grupos) ? v.mem_grupos[0] : v.mem_grupos;
      if (!g) continue;
      let lider = null;
      if (g.lider_id) {
        const { data: l } = await supabase.from('mem_membros').select('nome, telefone').eq('id', g.lider_id).maybeSingle();
        if (l) lider = { nome: l.nome, telefone: l.telefone };
      }
      const { data: docs } = await supabase
        .from('mem_grupo_documentos')
        .select('id, nome, comentario, storage_path, created_at')
        .contains('grupo_ids', [g.id])
        .order('created_at', { ascending: false })
        .limit(15);
      const materiais = (docs || []).map((d) => ({
        id: d.id,
        nome: d.nome,
        comentario: d.comentario || null,
        url: d.storage_path ? supabase.storage.from('eventos-anexos').getPublicUrl(d.storage_path).data.publicUrl : null,
      }));
      grupos.push({
        id: g.id, nome: g.nome, dia_semana: g.dia_semana, horario: g.horario,
        local: g.local, endereco: g.endereco, bairro: g.bairro, complemento: g.complemento,
        lat: g.lat, lng: g.lng,
        foto_url: g.foto_url, funcao: v.funcao, lider,
        proximo_encontro: proximoEncontroISO(g.dia_semana, g.horario),
        materiais,
      });
    }
    res.json({ grupos });
  } catch (e) {
    console.error('[APP] meu-grupo:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seu grupo' });
  }
});

// GET /api/app/videos — pregações recentes + séries (YouTube) + link ao vivo.
router.get('/videos', authApp, async (req, res) => {
  try {
    const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCfjMVzaYlCS_VE3JuEJj2vQ';
    const { data: videos } = await supabase
      .from('online_videos')
      .select('video_id, titulo, thumbnail_url, publicado_em, duration_seconds, serie:online_series(titulo)')
      .order('publicado_em', { ascending: false })
      .limit(30);
    const { data: series } = await supabase
      .from('online_series')
      .select('playlist_id, titulo, thumbnail_url, total_videos')
      .order('publicada_em', { ascending: false, nullsFirst: false })
      .limit(20);

    res.json({
      canal_live: `https://www.youtube.com/channel/${channelId}/live`,
      videos: (videos || []).map((v) => ({
        video_id: v.video_id,
        titulo: v.titulo,
        thumbnail_url: v.thumbnail_url,
        publicado_em: v.publicado_em,
        duration_seconds: v.duration_seconds,
        serie: Array.isArray(v.serie) ? v.serie[0]?.titulo : v.serie?.titulo || null,
      })),
      series: series || [],
    });
  } catch (e) {
    console.error('[APP] videos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar vídeos' });
  }
});

// GET /api/app/culto/agora — Modo Culto: culto de hoje + link ao vivo + se já registrou decisão.
router.get('/culto/agora', authApp, async (req, res) => {
  try {
    const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCfjMVzaYlCS_VE3JuEJj2vQ';
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: culto } = await supabase
      .from('cultos')
      .select('id, nome, data, hora')
      .eq('data', hoje).is('deleted_at', null)
      .order('hora', { ascending: false }).limit(1).maybeSingle();

    let jaRegistrou = false;
    const membro = await resolveMembroApp(req).catch(() => null);
    if (membro?.id) {
      const { data: pend } = await supabase
        .from('app_decisoes').select('id')
        .eq('membro_id', membro.id).eq('status', 'pendente').is('deleted_at', null)
        .gte('criada_em', `${hoje}T00:00:00`).limit(1);
      jaRegistrou = (pend || []).length > 0;
    }
    res.json({ culto: culto || null, canal_live: `https://www.youtube.com/channel/${channelId}/live`, jaRegistrou });
  } catch (e) {
    console.error('[APP] culto/agora:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o culto' });
  }
});

// POST /api/app/culto/decisao — registra uma decisão de fé na FILA DE REVISÃO.
// NÃO entra na NSM até a Integração confirmar (decisão da liderança).
router.post('/culto/decisao', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro?.id) return res.status(400).json({ error: 'Complete seu cadastro de membro primeiro.' });

    const ambiente = ['presencial', 'online'].includes(req.body?.ambiente) ? req.body.ambiente : 'presencial';
    const tipo = ['aceitar', 'reconciliacao', 'rededicacao', 'batismo', 'outro'].includes(req.body?.tipo) ? req.body.tipo : null;
    const observacao = (req.body?.observacao || '').toString().trim().slice(0, 500) || null;
    const hoje = new Date().toISOString().slice(0, 10);

    // Dedup: 1 decisão pendente por membro por dia.
    const { data: pend } = await supabase
      .from('app_decisoes').select('id')
      .eq('membro_id', membro.id).eq('status', 'pendente').is('deleted_at', null)
      .gte('criada_em', `${hoje}T00:00:00`).limit(1);
    if ((pend || []).length) return res.json({ ok: true, jaRegistrou: true });

    const { data: culto } = await supabase
      .from('cultos').select('id').eq('data', hoje).is('deleted_at', null)
      .order('hora', { ascending: false }).limit(1).maybeSingle();

    const { error } = await supabase.from('app_decisoes').insert({
      membro_id: membro.id, culto_id: culto?.id || null, ambiente, tipo, observacao, status: 'pendente',
    });
    if (error) throw error;

    try {
      await notificar({
        modulo: 'integracao',
        tipo: 'decisao_app',
        titulo: 'Nova decisão de fé pelo app 🙌',
        mensagem: `${membro.nome} registrou uma decisão pelo app. Confirme na aba Decisões.`,
        link: '/integracao?tab=vis_decisoes',
        chaveDedup: `decisao_app-${membro.id}-${hoje}`,
      });
    } catch (e) { console.warn('[APP] notificar decisao_app:', e.message); }

    res.json({ ok: true, jaRegistrou: true });
  } catch (e) {
    console.error('[APP] culto/decisao:', e.message);
    res.status(500).json({ error: 'Erro ao registrar decisão' });
  }
});

// GET /api/app/comunicados — mural do membro (publicados, segmentados).
router.get('/comunicados', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    const segmentos = ['todos'];
    if (membro?.id) {
      const { data: m } = await supabase.from('mem_membros').select('frequenta_area').eq('id', membro.id).maybeSingle();
      if (m?.frequenta_area) segmentos.push(m.frequenta_area);
    }
    const { data } = await supabase
      .from('comunicados')
      .select('id, titulo, corpo, foto_url, segmento, publicado_em')
      .eq('status', 'publicado')
      .is('deleted_at', null)
      .in('segmento', segmentos)
      .order('publicado_em', { ascending: false })
      .limit(50);
    res.json({ comunicados: data || [] });
  } catch (e) {
    console.error('[APP] comunicados:', e.message);
    res.status(500).json({ error: 'Erro ao carregar comunicados' });
  }
});

// POST /api/app/telemetria { eventos: [{tipo,nome,props,plataforma,app_version}] }
// Ingestão de telemetria do app (telas/ações/erros). Auth opcional (captura
// também pré-login). NUNCA devolve erro pro app (telemetria não pode quebrar).
router.post('/telemetria', tryAuth, async (req, res) => {
  try {
    const eventos = Array.isArray(req.body?.eventos) ? req.body.eventos.slice(0, 50) : [];
    if (!eventos.length) return res.json({ ok: true, gravados: 0 });
    const uid = req.user?.id || null;
    const rows = eventos.map((e) => ({
      tipo: ['tela', 'acao', 'erro', 'ping'].includes(e?.tipo) ? e.tipo : 'acao',
      nome: String(e?.nome || 'desconhecido').slice(0, 120),
      props: e?.props && typeof e.props === 'object' ? e.props : null,
      plataforma: e?.plataforma ? String(e.plataforma).slice(0, 20) : null,
      app_version: e?.app_version ? String(e.app_version).slice(0, 40) : null,
      user_id: uid,
    }));
    const { error } = await supabase.from('app_eventos').insert(rows);
    if (error) throw error;
    res.json({ ok: true, gravados: rows.length });
  } catch (e) {
    console.warn('[APP] telemetria:', e.message);
    res.json({ ok: false }); // nunca 500 pro app
  }
});

module.exports = router;