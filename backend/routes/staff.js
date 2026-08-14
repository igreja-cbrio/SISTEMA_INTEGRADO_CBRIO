// API self-service do app "CBRio Staff" (app dos colaboradores).
// Todas as rotas operam SOMENTE sobre os dados do próprio usuário logado
// (JWT do Supabase via `authenticate`) — por isso NÃO usa authorizeModule.
//
// ── Fontes canônicas (decididas olhando onde o SISTEMA lê/edita) ──
// · Foto:     profiles.avatar_url + bucket público `avatars` (mesmo lugar do
//             POST /api/auth/profile/foto e do header/perfil do sistema —
//             mudar aqui muda lá e vice-versa). Sincroniza mem_membros.foto_url
//             (best-effort) quando o profile tem membro_id, pois módulos como
//             face/membresia também leem foto de lá.
// · Telefone: profiles.telefone (é onde o /perfil do sistema salva, com a
//             máscara "(21) 99999-9999" — mesma função mascaraTelefone).
//             Sincroniza mem_membros.telefone e rh_funcionarios.telefone
//             (best-effort).
// · CPF:      mem_membros.cpf (dígitos, via profiles.membro_id) — a membresia
//             é a base canônica de pessoas do sistema e `profiles` NÃO tem
//             coluna cpf. Sincroniza rh_funcionarios.cpf (best-effort). Sem
//             membro nem funcionário vinculado, não há onde gravar → 400.
// · Vínculo auth → rh_funcionarios: por E-MAIL (rh_funcionarios.email =
//             profiles.email), mesmo critério do middleware authenticate
//             (auto-sync de área) e do escopo próprio do módulo RH
//             (applyAccessFilter ownerEmail). Não existe profile_id no RH.
// · Docs RH:  tabela rh_documentos + bucket `rh-fotos` (público — o sistema
//             grava a PUBLIC URL em storage_path e a abre direto; por isso a
//             URL retornada é a mesma, sem signed URL).
const router = require('express').Router();
const { supabase } = require('../utils/supabase');
const { authenticate } = require('../middleware/auth');
const { sanitizePath } = require('../services/storageService');
// Réguas únicas de contato (camposContato.js) — a MESMA que o /perfil do
// sistema e o app de membros usam. Não duplicar mascaraTelefone aqui: duas
// cópias é exatamente o que faz o formato canônico divergir.
const { soDigitos, mascaraTelefone } = require('../utils/camposContato');
const { notificar } = require('../services/notificar');

router.use(authenticate);

const FOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB (mesmo teto do multer do sistema)

// Decodifica um data URL de imagem (png/jpg/webp). Retorna null se inválido.
function parseDataUrlImagem(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
  if (!m) return null;
  const buffer = Buffer.from(m[3], 'base64');
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  return { mime: m[1], ext, buffer };
}

// Docs aceitam também PDF (documento pessoal mais comum).
function parseDataUrlDocumento(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,(.+)$/);
  if (!m) return null;
  const buffer = Buffer.from(m[3], 'base64');
  const ext = m[1] === 'application/pdf' ? 'pdf' : (m[2] === 'jpeg' ? 'jpg' : m[2]);
  return { mime: m[1], ext, buffer };
}

// Resolve o funcionário RH vinculado ao usuário logado (match por e-mail,
// mesmo critério do middleware authenticate). Ignora desligados/soft-deleted.
async function resolverFuncionario(email) {
  if (!email) return null;
  const { data } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, cargo, area, cpf, telefone, data_admissao, status')
    .ilike('email', email)
    .in('status', ['ativo', 'ferias', 'licenca'])
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function resolverMembro(membroId) {
  if (!membroId) return null;
  const { data } = await supabase
    .from('mem_membros')
    .select('id, cpf, telefone, foto_url')
    .eq('id', membroId)
    .maybeSingle();
  return data || null;
}

// ── GET /api/staff/me — perfil do colaborador logado ──
router.get('/me', async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, name, email, telefone, avatar_url, membro_id')
      .eq('id', req.user.userId)
      .single();
    if (error || !profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    const [funcionario, membro] = await Promise.all([
      resolverFuncionario(profile.email),
      resolverMembro(profile.membro_id),
    ]);

    // Férias do funcionário (rh_ferias_licencas · tipo=ferias)
    let ferias = { proxima: null, dias_ate_proxima: null, ultima: null };
    if (funcionario) {
      const hoje = new Date().toISOString().slice(0, 10);
      const [{ data: proximas }, { data: passadas }] = await Promise.all([
        supabase
          .from('rh_ferias_licencas')
          .select('data_inicio, data_fim, status')
          .eq('funcionario_id', funcionario.id)
          .eq('tipo', 'ferias')
          .in('status', ['pendente', 'aprovado'])
          .gte('data_inicio', hoje)
          .order('data_inicio', { ascending: true })
          .limit(1),
        supabase
          .from('rh_ferias_licencas')
          .select('data_inicio, data_fim, status')
          .eq('funcionario_id', funcionario.id)
          .eq('tipo', 'ferias')
          .in('status', ['pendente', 'aprovado'])
          .lt('data_inicio', hoje)
          .order('data_inicio', { ascending: false })
          .limit(1),
      ]);
      const prox = proximas?.[0] || null;
      const ult = passadas?.[0] || null;
      if (prox) {
        const diffMs = new Date(prox.data_inicio + 'T00:00:00Z') - new Date(hoje + 'T00:00:00Z');
        ferias.proxima = { inicio: prox.data_inicio, fim: prox.data_fim };
        ferias.dias_ate_proxima = Math.round(diffMs / 86400000);
      }
      if (ult) ferias.ultima = { inicio: ult.data_inicio, fim: ult.data_fim };
    }

    res.json({
      id: profile.id,
      nome: profile.name,
      email: profile.email,
      // telefone canônico = profiles.telefone; fallbacks pra quem nunca editou no sistema
      telefone: profile.telefone || membro?.telefone || funcionario?.telefone || null,
      // cpf canônico = mem_membros.cpf; fallback rh_funcionarios.cpf
      cpf: membro?.cpf || funcionario?.cpf || null,
      cargo_nome: req.user.granular?.cargoNome || funcionario?.cargo || null,
      avatar_url: profile.avatar_url || null,
      membro_id: profile.membro_id || null,
      funcionario: funcionario
        ? { id: funcionario.id, data_admissao: funcionario.data_admissao, ferias }
        : null,
    });
  } catch (e) {
    console.error('[STAFF] /me:', e.message);
    res.status(500).json({ error: 'Erro ao carregar perfil' });
  }
});

// ── PATCH /api/staff/me — atualiza telefone/cpf do próprio usuário ──
router.patch('/me', async (req, res) => {
  try {
    const { telefone, cpf } = req.body || {};
    if (telefone === undefined && cpf === undefined) {
      return res.status(400).json({ error: 'Informe telefone e/ou cpf' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, membro_id')
      .eq('id', req.user.userId)
      .single();
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    // Valida TUDO antes de gravar qualquer coisa (evita atualização parcial)
    const telDig = telefone !== undefined ? soDigitos(telefone) : null;
    if (telefone !== undefined && telDig && (telDig.length < 10 || telDig.length > 11)) {
      return res.status(400).json({ error: 'Telefone inválido. Informe DDD + número (10 ou 11 dígitos).' });
    }
    const cpfDig = cpf !== undefined ? soDigitos(cpf) : null;
    if (cpf !== undefined && cpfDig.length !== 11) {
      return res.status(400).json({ error: 'CPF inválido. Informe 11 dígitos.' });
    }

    const funcionario = await resolverFuncionario(profile.email);

    if (cpf !== undefined && !profile.membro_id && !funcionario) {
      return res.status(400).json({ error: 'Seu usuário não tem cadastro de membro nem de funcionário vinculado — fale com a secretaria para atualizar o CPF.' });
    }

    const out = {};

    if (telefone !== undefined) {
      const dig = telDig;
      const telMascarado = dig ? mascaraTelefone(dig) : null;
      // Fonte canônica: profiles.telefone
      const { error: telErr } = await supabase
        .from('profiles')
        .update({ telefone: telMascarado, updated_at: new Date().toISOString() })
        .eq('id', profile.id);
      if (telErr) return res.status(400).json({ error: telErr.message });
      out.telefone = telMascarado;
      // Sincronização best-effort nas tabelas vinculadas
      if (profile.membro_id) {
        await supabase.from('mem_membros').update({ telefone: telMascarado }).eq('id', profile.membro_id)
          .then(({ error: e2 }) => { if (e2) console.warn('[STAFF] sync telefone mem_membros:', e2.message); });
      }
      if (funcionario) {
        await supabase.from('rh_funcionarios').update({ telefone: telMascarado }).eq('id', funcionario.id)
          .then(({ error: e2 }) => { if (e2) console.warn('[STAFF] sync telefone rh_funcionarios:', e2.message); });
      }
    }

    if (cpf !== undefined) {
      const dig = cpfDig;
      // Fonte canônica: mem_membros.cpf (profiles não tem coluna cpf).
      if (profile.membro_id) {
        const { error: cpfErr } = await supabase
          .from('mem_membros')
          .update({ cpf: dig, updated_at: new Date().toISOString() })
          .eq('id', profile.membro_id);
        if (cpfErr) return res.status(400).json({ error: cpfErr.message });
      }
      // Best-effort no RH (canônico quando não há membro vinculado)
      if (funcionario) {
        const { error: e2 } = await supabase.from('rh_funcionarios').update({ cpf: dig }).eq('id', funcionario.id);
        if (e2) {
          if (!profile.membro_id) return res.status(400).json({ error: e2.message });
          console.warn('[STAFF] sync cpf rh_funcionarios:', e2.message);
        }
      }
      out.cpf = dig;
    }

    res.json(out);
  } catch (e) {
    console.error('[STAFF] PATCH /me:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar dados' });
  }
});

// ── GET /api/staff/dados-pessoais — dados pessoais do colaborador (self-service) ──
// Lê do rh_funcionarios (match por e-mail). É o que o colaborador mantém sozinho;
// o RH só cuida de salário/cargo. Cargo/área/admissão vêm read-only pra contexto.
router.get('/dados-pessoais', async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles').select('id, name, email, telefone, membro_id').eq('id', req.user.userId).single();
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });
    const { data: func } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, cargo, area, data_admissao, tipo_contrato, telefone, cpf, data_nascimento, endereco, filhos, status')
      .ilike('email', profile.email).in('status', ['ativo', 'ferias', 'licenca']).is('deleted_at', null).limit(1).maybeSingle();
    const membro = await resolverMembro(profile.membro_id);
    res.json({
      tem_ficha: !!func,
      nome: func?.nome || profile.name,
      cargo: func?.cargo || null,
      area: func?.area || null,
      data_admissao: func?.data_admissao || null,
      tipo_contrato: func?.tipo_contrato || null,
      telefone: profile.telefone || membro?.telefone || func?.telefone || null,
      cpf: membro?.cpf || func?.cpf || null,
      data_nascimento: func?.data_nascimento || null,
      endereco: func?.endereco || null,
      filhos: Array.isArray(func?.filhos) ? func.filhos : [],
    });
  } catch (e) {
    console.error('[STAFF] dados-pessoais GET:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seus dados' });
  }
});

// ── PUT /api/staff/dados-pessoais — o colaborador atualiza os PRÓPRIOS dados ──
// Só campos pessoais (nunca salário/cargo). Grava direto no rh_funcionarios e
// sincroniza telefone/cpf nas fontes canônicas. Auto-atualiza o sistema.
router.put('/dados-pessoais', async (req, res) => {
  try {
    const { telefone, cpf, data_nascimento, endereco, filhos } = req.body || {};
    const { data: profile } = await supabase
      .from('profiles').select('id, email, membro_id').eq('id', req.user.userId).single();
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });
    const func = await resolverFuncionario(profile.email);
    if (!func) return res.status(404).json({ error: 'Não encontramos sua ficha de colaborador. Fale com o RH.' });

    const patch = {};
    if (telefone !== undefined) {
      const dig = soDigitos(telefone);
      if (dig && (dig.length < 10 || dig.length > 11)) return res.status(400).json({ error: 'Telefone inválido (DDD + número).' });
      patch.telefone = dig ? mascaraTelefone(dig) : null;
    }
    if (cpf !== undefined) {
      const dig = soDigitos(cpf);
      if (dig && dig.length !== 11) return res.status(400).json({ error: 'CPF inválido (11 dígitos).' });
      patch.cpf = dig || null;
    }
    if (data_nascimento !== undefined) patch.data_nascimento = data_nascimento || null;
    if (endereco !== undefined) patch.endereco = endereco ? String(endereco).slice(0, 500) : null;
    if (filhos !== undefined) {
      const arr = Array.isArray(filhos) ? filhos : [];
      patch.filhos = arr.slice(0, 20).map((f) => ({
        nome: f?.nome ? String(f.nome).slice(0, 120) : null,
        idade: (f?.idade === '' || f?.idade == null) ? null
          : (Number.isFinite(Number(f.idade)) ? Math.max(0, Math.min(120, Math.trunc(Number(f.idade)))) : null),
      })).filter((f) => f.nome || f.idade != null);
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar.' });

    const { error } = await supabase.from('rh_funcionarios')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', func.id);
    if (error) return res.status(400).json({ error: error.message });

    // Sincroniza telefone/cpf nas fontes canônicas (best-effort).
    if (patch.telefone !== undefined) {
      supabase.from('profiles').update({ telefone: patch.telefone }).eq('id', profile.id).then(() => {}).catch(() => {});
      if (profile.membro_id) supabase.from('mem_membros').update({ telefone: patch.telefone }).eq('id', profile.membro_id).then(() => {}).catch(() => {});
    }
    if (patch.cpf !== undefined && profile.membro_id) {
      supabase.from('mem_membros').update({ cpf: patch.cpf }).eq('id', profile.membro_id).then(() => {}).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[STAFF] dados-pessoais PUT:', e.message);
    res.status(500).json({ error: 'Erro ao salvar seus dados' });
  }
});

// ── POST /api/staff/me/foto — foto de perfil (a MESMA do sistema) ──
// Grava no MESMO lugar do POST /api/auth/profile/foto: bucket público
// `avatars` + profiles.avatar_url. Mudar no app muda no sistema e vice-versa.
router.post('/me/foto', async (req, res) => {
  try {
    const img = parseDataUrlImagem(req.body?.dataUrl);
    if (!img) return res.status(400).json({ error: 'Envie dataUrl de imagem (png, jpg ou webp)' });
    if (img.buffer.length > FOTO_MAX_BYTES) {
      return res.status(400).json({ error: 'Imagem muito grande (máx. 5MB)' });
    }

    const path = `${req.user.userId}/avatar-${Date.now()}.${img.ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, img.buffer, { contentType: img.mime, upsert: true });
    if (upErr) return res.status(500).json({ error: 'Falha ao salvar imagem: ' + upErr.message });

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatar_url = urlData.publicUrl;

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url, updated_at: new Date().toISOString() })
      .eq('id', req.user.userId);
    if (updErr) return res.status(400).json({ error: updErr.message });

    // Sincroniza a foto da membresia (best-effort · face/membresia leem de lá)
    if (req.user.membro_id) {
      await supabase.from('mem_membros').update({ foto_url: avatar_url }).eq('id', req.user.membro_id)
        .then(({ error: e2 }) => { if (e2) console.warn('[STAFF] sync foto mem_membros:', e2.message); });
    }

    res.json({ avatar_url });
  } catch (e) {
    console.error('[STAFF] /me/foto:', e.message);
    res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});

function docToJson(d) {
  return {
    id: d.id,
    tipo: d.tipo,
    nome: d.nome,
    validade: d.data_expiracao || null,
    // storage_path já é a PUBLIC URL do bucket `rh-fotos` (público) — mesmo
    // valor que o módulo RH do sistema abre direto. Fallback: SharePoint.
    url: d.storage_path || d.sharepoint_url || null,
  };
}

// ── GET /api/staff/me/documentos — documentos pessoais (rh_documentos) ──
router.get('/me/documentos', async (req, res) => {
  try {
    const funcionario = await resolverFuncionario(req.user.email);
    if (!funcionario) return res.json([]);

    const { data, error } = await supabase
      .from('rh_documentos')
      .select('id, tipo, nome, storage_path, sharepoint_url, data_expiracao, created_at')
      .eq('funcionario_id', funcionario.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });

    res.json((data || []).map(docToJson));
  } catch (e) {
    console.error('[STAFF] /me/documentos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar documentos' });
  }
});

// ── POST /api/staff/me/documentos — sobe documento do próprio funcionário ──
router.post('/me/documentos', async (req, res) => {
  try {
    const { dataUrl, nome, tipo, data_expiracao } = req.body || {};
    if (!nome || !tipo) return res.status(400).json({ error: 'Nome e tipo são obrigatórios' });
    // Validade opcional (YYYY-MM-DD) — liga o alerta de vencimento do módulo RH
    if (data_expiracao != null && data_expiracao !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(data_expiracao))) {
      return res.status(400).json({ error: 'data_expiracao deve estar no formato AAAA-MM-DD' });
    }

    const funcionario = await resolverFuncionario(req.user.email);
    if (!funcionario) {
      return res.status(400).json({ error: 'Seu usuário não tem cadastro de funcionário vinculado no RH — fale com o RH para enviar documentos.' });
    }

    const doc = parseDataUrlDocumento(dataUrl);
    if (!doc) return res.status(400).json({ error: 'Envie dataUrl de imagem (png, jpg, webp) ou PDF' });
    if (doc.buffer.length > FOTO_MAX_BYTES) {
      return res.status(400).json({ error: 'Arquivo muito grande (máx. 5MB)' });
    }

    // Mesmo bucket/caminho do módulo RH do sistema (rh-fotos/documentos/<id>/...)
    const path = `documentos/${funcionario.id}/${Date.now()}_${sanitizePath(nome)}.${doc.ext}`;
    const { error: upErr } = await supabase.storage
      .from('rh-fotos')
      .upload(path, doc.buffer, { contentType: doc.mime, upsert: true });
    if (upErr) return res.status(500).json({ error: 'Falha ao salvar arquivo: ' + upErr.message });

    const { data: urlData } = supabase.storage.from('rh-fotos').getPublicUrl(path);

    const { data, error } = await supabase
      .from('rh_documentos')
      .insert({
        funcionario_id: funcionario.id,
        tipo,
        nome,
        storage_path: urlData.publicUrl,
        ...(data_expiracao ? { data_expiracao } : {}),
      })
      .select('id, tipo, nome, storage_path, sharepoint_url, data_expiracao')
      .single();
    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json(docToJson(data));
  } catch (e) {
    console.error('[STAFF] POST /me/documentos:', e.message);
    res.status(500).json({ error: 'Erro ao enviar documento' });
  }
});

// ── GET /api/staff/me/qr — payload do QR do colaborador ──
// ID primário do usuário (profiles.id = auth.users.id) · futuro controle de
// acesso/portas lê `cbrio-staff:v1:<uuid>`.
router.get('/me/qr', (req, res) => {
  res.json({ id: req.user.userId, payload: `cbrio-staff:v1:${req.user.userId}` });
});

// ── POST /api/staff/push-token — registra Expo push token (idempotente) ──
// Mesma tabela do app de membros (app_push_tokens · PK = token).
router.post('/push-token', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token obrigatório' });
    if (token.length > 512) return res.status(400).json({ error: 'Token inválido' });

    const { error } = await supabase
      .from('app_push_tokens')
      .upsert({
        token,
        user_id: req.user.userId,
        membro_id: req.user.membro_id || null,
        platform: typeof req.body?.platform === 'string' ? req.body.platform.slice(0, 20) : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' });
    if (error) return res.status(400).json({ error: error.message });

    res.json({ ok: true });
  } catch (e) {
    console.error('[STAFF] /push-token:', e.message);
    res.status(500).json({ error: 'Erro ao registrar token' });
  }
});

// ── POST /api/staff/bugs — reporta um bug (vira tarefa do Agente Dev) ──
// Cria `agent_tarefas` classe='bug' + agente_key='developer_agent' + status
// 'nova': o dispatcher (Railway) pega automaticamente, DIAGNOSTICA sem alterar
// nada e deixa em 'aguardando_aprovacao'. O gate único (aprovar/recusar a
// correção) é humano, em /assistente-ia. Ao concluir, o agente notifica o
// reportado_por ("Bug corrigido") pelo sino/push do app.
router.post('/bugs', async (req, res) => {
  try {
    const titulo = String(req.body?.titulo || '').trim();
    const descricao = String(req.body?.descricao || '').trim();
    if (!titulo) return res.status(400).json({ error: 'Dê um título curto para o bug (obrigatório).' });
    if (titulo.length > 80) return res.status(400).json({ error: 'Título muito longo (máx. 80 caracteres).' });
    if (descricao.length > 5000) return res.status(400).json({ error: 'Descrição muito longa (máx. 5000 caracteres).' });

    const insert = {
      titulo,
      descricao,
      classe: 'bug',
      agente_key: 'developer_agent',
      status: 'nova',
      origem: 'app',
      reportado_por: req.user.id,
      created_by: req.user.id,
    };
    const { data, error } = await supabase
      .from('agent_tarefas')
      .insert(insert)
      .select('id, titulo, descricao, status, prioridade, created_at')
      .single();
    if (error) return res.status(400).json({ error: error.message });

    // Avisa o time de agentes (módulo assistente-ia) que chegou um bug novo.
    notificar({
      modulo: 'assistente-ia',
      tipo: 'agent_task',
      titulo: `Bug reportado no app · ${data.titulo}`,
      mensagem: `Colaborador reportou um bug: ${data.titulo}`,
      link: '/assistente-ia',
      severidade: 'info',
      chaveDedup: `staff_bug_${data.id}`,
    }).catch(() => {});

    res.status(201).json(data);
  } catch (e) {
    console.error('[STAFF] POST /bugs:', e.message);
    res.status(500).json({ error: 'Erro ao registrar o bug' });
  }
});

// ── GET /api/staff/bugs — bugs que EU reportei (nunca os dos outros) ──
router.get('/bugs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('agent_tarefas')
      .select('id, titulo, descricao, status, prioridade, diagnostico, diagnostico_em, pull_request_url, branch, created_at, updated_at')
      .eq('reportado_por', req.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[STAFF] GET /bugs:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seus bugs' });
  }
});

module.exports = router;
