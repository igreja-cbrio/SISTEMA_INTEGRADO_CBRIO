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
  if (isDisplay || isChamadaComToken || isParear || isPagerBridge) {
    // Pula authenticate · handlers validam token internamente
    return next();
  }
  return authenticate(req, res, next);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  if (meses < 24) return `${meses}m`;
  const anos = Math.floor(meses / 12);
  return `${anos}a`;
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
        id, nome, data_nascimento, sexo, foto_url, observacoes_medicas,
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
              id, nome, data_nascimento, sexo, foto_url, observacoes_medicas,
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
    const lista = [...map.values()].map(c => ({
      ...c,
      idade_meses: calcIdadeMeses(c.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    }));

    res.json(lista);
  } catch (e) {
    console.error('[totemKids/criancas/buscar]', e.message);
    res.status(500).json({ error: 'Erro na busca' });
  }
});

// GET /api/totem-kids/criancas/:id · detalhe completo
router.get('/criancas/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_criancas')
      .select(`
        *, familia:mem_familias(id, nome),
        responsaveis:kids_responsaveis(
          id, parentesco, autorizado_buscar, contato_emergencia, observacao,
          membro:mem_membros(id, nome, telefone, cpf, foto_url, email)
        )
      `)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Criança não encontrada' });

    res.json({
      ...data,
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
    const { crianca, responsavel } = req.body || {};
    if (!crianca?.nome) return res.status(400).json({ error: 'crianca.nome obrigatorio' });
    if (!responsavel?.nome || !responsavel?.telefone) {
      return res.status(400).json({ error: 'responsavel.nome e responsavel.telefone obrigatórios' });
    }

    const tel = normalizarTelefone(responsavel.telefone);
    const cpf = normalizarCpf(responsavel.cpf);

    // 1. Resolve responsável em mem_membros (cpf > telefone > cria)
    let membro = null;
    if (cpf) {
      const { data } = await supabase.from('mem_membros').select('id, nome, familia_id').eq('cpf', cpf).maybeSingle();
      membro = data;
    }
    if (!membro && tel) {
      const { data } = await supabase.from('mem_membros').select('id, nome, familia_id').eq('telefone', tel).maybeSingle();
      membro = data;
    }
    if (!membro) {
      const { data, error } = await supabase.from('mem_membros')
        .insert({
          nome: responsavel.nome,
          telefone: tel,
          cpf,
          email: responsavel.email || null,
          status: 'visitante',
          active: true,
        })
        .select('id, nome, familia_id')
        .single();
      if (error) throw error;
      membro = data;
    }

    // 2. Garante família (se responsável não tem, cria)
    let familiaId = membro.familia_id;
    if (!familiaId) {
      const { data: f, error: fe } = await supabase.from('mem_familias')
        .insert({ nome: `Familia ${membro.nome.split(' ')[0]}` })
        .select('id')
        .single();
      if (fe) throw fe;
      familiaId = f.id;
      await supabase.from('mem_membros').update({ familia_id: familiaId, parentesco: 'responsavel' }).eq('id', membro.id);
    }

    // 3. Cria criança
    const { data: criancaCriada, error: errCrianca } = await supabase
      .from('kids_criancas')
      .insert({
        nome: crianca.nome,
        data_nascimento: crianca.data_nascimento || null,
        sexo: crianca.sexo || null,
        familia_id: familiaId,
        observacoes_medicas: crianca.observacoes_medicas || null,
        necessidades_especiais: crianca.necessidades_especiais || null,
        foto_url: crianca.foto_url || null,
        foto_consentimento_em: crianca.foto_url ? new Date().toISOString() : null,
        visitante: true,
        created_by: req.user.userId,
      })
      .select('*, familia:mem_familias(id, nome)')
      .single();
    if (errCrianca) throw errCrianca;

    // 4. Liga responsável <-> criança
    await supabase.from('kids_responsaveis').insert({
      crianca_id: criancaCriada.id,
      membro_id: membro.id,
      parentesco: responsavel.parentesco || 'outro',
      autorizado_buscar: true,
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
                     'necessidades_especiais', 'foto_url', 'visitante', 'ativo', 'observacoes_internas'];
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

// GET /api/totem-kids/criancas · listagem completa (admin)
router.get('/criancas', authorizeModule('kids', 1), async (req, res) => {
  try {
    const ativo = req.query.ativo !== 'false';
    const { data, error } = await supabase
      .from('kids_criancas')
      .select(`
        id, nome, data_nascimento, sexo, foto_url, observacoes_medicas,
        visitante, ativo, familia_id,
        familia:mem_familias(id, nome),
        responsaveis:kids_responsaveis(membro:mem_membros(id, nome, telefone))
      `)
      .eq('ativo', ativo)
      .order('nome')
      .limit(500);
    if (error) throw error;
    res.json((data || []).map(c => ({
      ...c,
      idade_meses: calcIdadeMeses(c.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar crianças' });
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

    // 2. Match mem_membros por cpf > telefone
    let membro = null;
    if (cpfNorm) {
      const { data } = await supabase.from('mem_membros').select('id, nome, familia_id').eq('cpf', cpfNorm).maybeSingle();
      if (data) membro = data;
    }
    if (!membro && tel) {
      const { data } = await supabase.from('mem_membros').select('id, nome, familia_id').eq('telefone', tel).maybeSingle();
      if (data) membro = data;
    }

    // 3. Cria mem_membros se não existe
    if (!membro) {
      const { data, error } = await supabase.from('mem_membros').insert({
        nome: nome.trim(),
        telefone: tel,
        cpf: cpfNorm,
        status: 'visitante',
        familia_id: crianca.familia_id,
        active: true,
      }).select('id, nome, familia_id').single();
      if (error) throw error;
      membro = data;
    } else if (crianca.familia_id && !membro.familia_id) {
      // Atualiza familia_id do membro existente se não tinha
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

// POST /api/totem-kids/checkin · cria check-in + gera código + retorna pra impressão
router.post('/checkin', authorizeModule('kids', 2), async (req, res) => {
  try {
    const {
      sessao_id, crianca_id, sala_id, estacao_id,
      responsavel_id, responsavel_nome_manual, responsavel_telefone_manual, responsavel_parentesco,
      pager_id,
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

    // INSERT
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
      })
      .select('*')
      .single();
    if (errIns) throw errIns;

    // Retorna tudo pro frontend renderizar as 2 etiquetas
    res.status(201).json({
      checkin,
      crianca,
      sala,
      sessao: { id: sessao.id, culto: sessao.culto },
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
        crianca:kids_criancas(id, nome, data_nascimento, foto_url, observacoes_medicas),
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

    res.json({ ...data, responsaveis: responsaveis || [] });
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

    const { data, error } = await supabase
      .from('kids_checkins')
      .update({
        checkout_at: new Date().toISOString(),
        responsavel_checkout_id: responsavel_id || null,
        responsavel_checkout_nome: respNome,
        checkout_metodo: metodo,
        checkout_por: req.user.userId,
        override_motivo: metodo === 'override_supervisor' ? override_motivo : null,
        override_aprovado_por: metodo === 'override_supervisor' ? req.user.userId : null,
      })
      .eq('id', checkin_id)
      .is('checkout_at', null)
      .select(`*, crianca:kids_criancas(id, nome), sala:kids_salas(id, nome)`)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(409).json({ error: 'Check-in já foi feito checkout' });
      throw error;
    }
    res.json(data);
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
        crianca:kids_criancas(id, nome, data_nascimento, foto_url, observacoes_medicas)
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
    if (estacao.token_pareamento !== token) {
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
  let membro = null;
  if (cpf) {
    const { data } = await supabase.from('mem_membros').select('id, nome, familia_id, parentesco').eq('cpf', cpf).maybeSingle();
    if (data) membro = data;
  }
  if (!membro && telefone) {
    const { data } = await supabase.from('mem_membros').select('id, nome, familia_id, parentesco').eq('telefone', telefone).maybeSingle();
    if (data) membro = data;
  }
  if (membro) return { membro, criado: false };

  const { data, error } = await supabase.from('mem_membros')
    .insert({
      nome,
      telefone,
      cpf,
      status: 'visitante',
      active: true,
      parentesco: parentesco === 'mae' || parentesco === 'pai' ? 'responsavel' : null,
    })
    .select('id, nome, familia_id')
    .single();
  if (error) throw error;
  return { membro: data, criado: true };
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
  return token.length > 0 && token === expected;
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

module.exports = router;
