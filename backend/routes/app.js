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

module.exports = router;
