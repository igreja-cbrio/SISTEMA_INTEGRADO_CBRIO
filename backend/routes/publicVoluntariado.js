/**
 * Rotas publicas do módulo de voluntariado.
 *
 * Usado quando alguém escaneia o QR de self-checkin no celular SEM estar
 * autenticado. Permite:
 *   1. Lookup por CPF (descobrir se já existe em algum cadastro do sistema)
 *   2. Login magico: enviar link de acesso por email para usuário existente
 *      (colaborador, membro ou voluntário). Cria vol_profile se necessário.
 *   3. Registro: cadastro completo quando o CPF não existe em lugar nenhum.
 *
 * Segurança:
 *   - Rate limit de 10 req/IP em 15 min (alinhado com publicMembresia)
 *   - CPF validado (algoritmo oficial)
 *   - Emails retornados ao cliente sempre mascarados (d***@dominio.com)
 *   - Honeypot `website` para deter bots
 */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { acharMembroGuardado } = require('../services/membroMatch');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
const {
  temAbreviacaoNome, splitNomeCompleto, registrarConsentimentos, SEXOS, TEXTOS,
} = require('../services/inscricaoContrato');

// Limiter GENEROSO do router (padrão grupos/NPS/eventos): o form roda em
// Wi-Fi único da igreja — o teto global de 30/15min derrubava a fila do
// lounge (sweep 28/07). Anti-spam real = honeypot + contrato.
const limiterGeral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_FORM_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 600 : 5000),
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições deste endereço. Tente novamente em alguns minutos.' },
});
router.use(limiterGeral);

// Estrito (10/15min) SÓ nos endpoints de probing de dados/auth (lookup-cpf,
// request-login, register) — a inscrição em si usa o teto generoso acima.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas deste endereço. Tente novamente em alguns minutos.' },
});

function soDigitos(v) {
  return (v || '').toString().replace(/\D+/g, '');
}

function ehEmailValido(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// (temAbreviacaoNome agora vem de services/inscricaoContrato — fonte única)

// Valida que serviceId é UUID v4 (evita open redirect via path injection)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ehUuidValido(s) {
  return typeof s === 'string' && UUID_REGEX.test(s);
}

function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base, fator) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) {
      soma += parseInt(base[i], 10) * (fator - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const dv1 = calc(d.slice(0, 9), 10);
  const dv2 = calc(d.slice(0, 10), 11);
  return dv1 === parseInt(d[9], 10) && dv2 === parseInt(d[10], 10);
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 1);
  const masked = visible + '***';
  return `${masked}@${domain}`;
}

function getFrontendUrl() {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}

// Busca por CPF em 3 tabelas (vol_profiles, rh_funcionarios, mem_membros).
// Ordem de prioridade: vol_profile > rh_funcionarios > mem_membros.
async function lookupByCpf(cpf) {
  const cleanCpf = soDigitos(cpf);

  // 1. Voluntário existente (vol_profiles)
  const { data: vol } = await supabase.from('vol_profiles')
    .select('id, auth_user_id, full_name, email, cpf')
    .eq('cpf', cleanCpf)
    .maybeSingle();
  if (vol) {
    return { type: 'voluntario', record: vol, email: vol.email, name: vol.full_name };
  }

  // 2. Colaborador (rh_funcionarios)
  const { data: func } = await supabase.from('rh_funcionarios')
    .select('id, nome, email, cpf, telefone')
    .eq('cpf', cleanCpf)
    .maybeSingle();
  if (func) {
    return { type: 'colaborador', record: func, email: func.email, name: func.nome };
  }

  // 3. Membro (mem_membros)
  const { data: membro } = await supabase.from('mem_membros')
    .select('id, nome, email, cpf, telefone')
    .eq('cpf', cleanCpf)
    .maybeSingle();
  if (membro) {
    return { type: 'membro', record: membro, email: membro.email, name: membro.nome };
  }

  return { type: 'none' };
}

// ── POST /api/public/voluntariado/lookup-cpf ──────────────────────────
// Cliente envia CPF, backend responde se já existe em algum cadastro.
// Nunca expoe email completo — apenas mascarado para o usuário confirmar.
router.post('/lookup-cpf', publicLimiter, async (req, res) => {
  try {
    const { cpf, website } = req.body || {};
    if (website) return res.status(200).json({ found: false }); // honeypot

    if (!cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF invalido' });
    }

    const result = await lookupByCpf(cpf);

    if (result.type === 'none') {
      return res.json({ found: false });
    }

    const hasEmail = !!result.email;
    return res.json({
      found: true,
      type: result.type,
      hasEmail,
      maskedEmail: hasEmail ? maskEmail(result.email) : null,
      name: result.name || null,
    });
  } catch (err) {
    console.error('[PublicVol] lookup-cpf error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar cadastro' });
  }
});

// ── POST /api/public/voluntariado/request-login ───────────────────────
// Para usuários existentes (colaborador, membro, voluntário): cria vol_profile
// se ainda não tiver, garante auth user, e envia magic link por email.
// O link redireciona para /voluntariado/self-checkin?serviceId=... (se vier)
// ou para /voluntariado/checkin/painel.
router.post('/request-login', publicLimiter, async (req, res) => {
  try {
    const { cpf, serviceId, website } = req.body || {};
    if (website) return res.status(200).json({ ok: true }); // honeypot

    if (!cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF invalido' });
    }

    const result = await lookupByCpf(cpf);

    if (result.type === 'none') {
      return res.status(404).json({ error: 'Cadastro não encontrado', needsRegistration: true });
    }

    if (!result.email || !ehEmailValido(result.email)) {
      return res.status(400).json({
        error: 'Seu cadastro não tem email valido. Procure um líder para atualizar.',
      });
    }

    const email = result.email.toLowerCase().trim();
    const cleanCpf = soDigitos(cpf);

    // Garantir auth user (criar se ainda não existe)
    let authUserId = null;
    if (result.type === 'voluntario' && result.record.auth_user_id) {
      authUserId = result.record.auth_user_id;
    } else {
      // Procurar profile pelo email
      const { data: existingProfile } = await supabase.from('profiles')
        .select('id, role').eq('email', email).maybeSingle();
      if (existingProfile) {
        authUserId = existingProfile.id;
      } else {
        // Criar novo auth user
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { name: result.name || 'Voluntario' },
        });
        if (createErr) {
          console.error('[PublicVol] createUser error:', createErr.message);
          return res.status(500).json({ error: 'Erro ao criar conta' });
        }
        authUserId = created.user.id;

        // Criar profile (role voluntário, não sobrescreve se já existir por trigger)
        await supabase.from('profiles').upsert({
          id: authUserId,
          email,
          name: result.name || 'Voluntario',
          role: 'voluntario',
          active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      }
    }

    // Garantir vol_profile (criar ou linkar)
    if (result.type === 'voluntario') {
      // Já existe vol_profile, so linkar auth_user_id se faltar
      if (!result.record.auth_user_id) {
        await supabase.from('vol_profiles')
          .update({ auth_user_id: authUserId })
          .eq('id', result.record.id);
      }
    } else {
      // Não tem vol_profile ainda: criar
      const origem = result.type === 'colaborador' ? 'manual' : 'membresia';
      const membresiaId = result.type === 'membro' ? result.record.id : null;

      // Verificar se já existe vol_profile pelo CPF ou auth_user_id (defesa)
      const { data: existingVol } = await supabase.from('vol_profiles')
        .select('id')
        .or(`cpf.eq.${cleanCpf},auth_user_id.eq.${authUserId}`)
        .maybeSingle();

      if (existingVol) {
        await supabase.from('vol_profiles')
          .update({ auth_user_id: authUserId, cpf: cleanCpf, email })
          .eq('id', existingVol.id);
      } else {
        await supabase.from('vol_profiles').insert({
          auth_user_id: authUserId,
          full_name: result.name || 'Voluntario',
          email,
          cpf: cleanCpf,
          phone: result.record.telefone || null,
          membresia_id: membresiaId,
          origem,
          profile_complete: true,
          allocation_status: 'active',
        });
      }
    }

    // Gerar magic link
    const frontendUrl = getFrontendUrl();
    // Valida serviceId como UUID v4 (anti open redirect)
    const serviceIdSeguro = ehUuidValido(serviceId) ? serviceId : null;
    const redirectPath = serviceIdSeguro
      ? `/voluntariado/self-checkin?serviceId=${encodeURIComponent(serviceIdSeguro)}`
      : '/voluntariado/checkin/painel';

    const { error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${frontendUrl}${redirectPath}` },
    });

    if (linkErr) {
      console.error('[PublicVol] generateLink error:', linkErr.message);
      return res.status(500).json({ error: 'Erro ao gerar link de acesso' });
    }

    console.log(`[PublicVol] Magic link enviado para ${maskEmail(email)} (tipo: ${result.type})`);
    return res.json({ ok: true, maskedEmail: maskEmail(email) });
  } catch (err) {
    console.error('[PublicVol] request-login error:', err.message);
    res.status(500).json({ error: 'Erro ao enviar link de acesso' });
  }
});

// ── POST /api/public/voluntariado/register ────────────────────────────
// Cadastro completo quando o CPF não existe em nenhum lugar.
// Cria auth user + profile (role='voluntário') + vol_profile, envia magic link.
router.post('/register', publicLimiter, async (req, res) => {
  try {
    const { cpf, full_name, email: rawEmail, phone, serviceId, website } = req.body || {};
    if (website) return res.status(200).json({ ok: true }); // honeypot

    if (!cpfValido(cpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!full_name || full_name.trim().length < 3 || full_name.trim().length > 200) {
      return res.status(400).json({ error: 'Nome invalido (3-200 chars)' });
    }
    if (!ehEmailValido(rawEmail)) return res.status(400).json({ error: 'Email invalido' });

    const email = rawEmail.toLowerCase().trim().slice(0, 200);
    const cleanCpf = soDigitos(cpf);

    // Defesa: se já existe em algum lugar, rejeitar (o fluxo de request-login
    // deveria ter sido usado)
    const existing = await lookupByCpf(cleanCpf);
    if (existing.type !== 'none') {
      return res.status(409).json({ error: 'CPF já cadastrado. Use "Entrar" em vez de cadastrar.', type: existing.type });
    }

    // Verificar se o email já tem profile
    const { data: profileByEmail } = await supabase.from('profiles')
      .select('id').eq('email', email).maybeSingle();

    let authUserId = profileByEmail?.id || null;
    if (!authUserId) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name: full_name },
      });
      if (createErr) {
        console.error('[PublicVol] createUser error:', createErr.message);
        return res.status(500).json({ error: 'Erro ao criar conta' });
      }
      authUserId = created.user.id;
    }

    // Upsert profile (role voluntário)
    await supabase.from('profiles').upsert({
      id: authUserId,
      email,
      name: full_name,
      role: 'voluntario',
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    // Membresia e fonte única: garantir mem_membros antes de criar vol_profile
    let membresiaId = null;
    try {
      const { findOrCreateMembro } = require('./pessoas');
      const r = await findOrCreateMembro({
        cpf: cleanCpf, email, telefone: phone, nome: full_name, status: 'visitante',
        origem: 'voluntariado_autoatendimento',
      });
      membresiaId = r.membro_id;
    } catch (e) {
      console.error('publicVoluntariado findOrCreateMembro:', e.message);
    }

    // Criar vol_profile vinculado a mem_membros
    await supabase.from('vol_profiles').insert({
      auth_user_id: authUserId,
      full_name,
      email,
      cpf: cleanCpf,
      phone: phone ? soDigitos(phone) : null,
      origem: 'manual',
      profile_complete: true,
      allocation_status: 'active',
      membresia_id: membresiaId,
    });

    // Magic link
    const frontendUrl = getFrontendUrl();
    // Valida serviceId como UUID v4 (anti open redirect)
    const serviceIdSeguro = ehUuidValido(serviceId) ? serviceId : null;
    const redirectPath = serviceIdSeguro
      ? `/voluntariado/self-checkin?serviceId=${encodeURIComponent(serviceIdSeguro)}`
      : '/voluntariado/checkin/painel';

    const { error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${frontendUrl}${redirectPath}` },
    });

    if (linkErr) {
      console.error('[PublicVol] generateLink error:', linkErr.message);
      return res.status(500).json({ error: 'Conta criada, mas erro ao enviar link de acesso' });
    }

    console.log(`[PublicVol] Novo voluntario cadastrado: ${maskEmail(email)}`);
    return res.json({ ok: true, maskedEmail: maskEmail(email) });
  } catch (err) {
    console.error('[PublicVol] register error:', err.message);
    res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

// ============================================================================
// POST /api/public/voluntariado/inscrever-form
// Formulário público de inscrição "quero ser voluntário" · grava em
// vol_inscricoes com status='inscrito' pra entrar no funil de alocacao.
// Espelha o Google Form descontinuado (mesmos campos · compat com 749 linhas
// históricas em vol_inscricoes).
// ============================================================================
const AREAS_VALIDAS = new Set(['kids', 'sede', 'ami', 'bridge', 'online']);

router.post('/inscrever-form', async (req, res) => { // teto = limiterGeral do router (o estrito de 10 travava a fila do lounge)
  try {
    const {
      nome, sobrenome, nome_completo, email, telefone, cpf, data_nascimento,
      sexo, endereco, nome_mae,
      area, participou_next, dom_predominante, ministerios_interesse,
      consentimento_antecedentes, // Kids/Bridge · autoriza consulta de antecedentes
      aceita_termos, // termos LGPD gerais (Contrato de Inscrição)
      whatsapp_optin, // consentimento p/ receber mensagens no WhatsApp (Marketing)
      website, // honeypot
    } = req.body || {};

    if (website) return res.status(200).json({ ok: true }); // bot

    // D1: campo único "Nome completo" (split determinístico); tolera o payload
    // antigo nome+sobrenome de abas abertas antes do deploy.
    let cleanNome = String(nome || '').trim();
    let cleanSobrenome = String(sobrenome || '').trim();
    if (nome_completo && String(nome_completo).trim()) {
      const s = splitNomeCompleto(nome_completo);
      cleanNome = s.nome;
      cleanSobrenome = s.sobrenome;
    }
    if (cleanNome.length < 2) return res.status(400).json({ error: 'Nome obrigatório' });
    if (cleanSobrenome.length < 2) return res.status(400).json({ error: 'Informe seu nome completo' });
    // Nome completo sem abreviação ("Maria S." / "J. Silva" não valem).
    if (temAbreviacaoNome(cleanNome) || temAbreviacaoNome(cleanSobrenome)) {
      return res.status(400).json({ error: 'Escreva seu nome completo, sem abreviações' });
    }
    // Participação no NEXT é resposta obrigatória (Sim/Não).
    if (!participou_next || !String(participou_next).trim()) {
      return res.status(400).json({ error: 'Conta pra gente se você já participou do NEXT' });
    }

    const cleanEmail = email ? String(email).toLowerCase().trim() : null;
    if (!cleanEmail || !ehEmailValido(cleanEmail)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    const cleanTelefone = soDigitos(telefone);
    if (cleanTelefone.length < 10 || cleanTelefone.length > 11) {
      return res.status(400).json({ error: 'Telefone inválido' });
    }
    const cleanCpf = soDigitos(cpf);
    if (!cleanCpf) {
      return res.status(400).json({ error: 'CPF obrigatório' });
    }
    if (!cpfValido(cleanCpf)) {
      return res.status(400).json({ error: 'CPF inválido' });
    }
    const cleanDataNascimento = data_nascimento ? String(data_nascimento).slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDataNascimento)) {
      return res.status(400).json({ error: 'Data de nascimento obrigatória' });
    }
    const nascimento = new Date(`${cleanDataNascimento}T12:00:00Z`);
    if (Number.isNaN(nascimento.getTime()) || nascimento.toISOString().slice(0, 10) !== cleanDataNascimento || nascimento > new Date()) {
      return res.status(400).json({ error: 'Data de nascimento inválida' });
    }
    if (!area || !AREAS_VALIDAS.has(String(area).toLowerCase())) {
      return res.status(400).json({ error: 'Selecione uma área' });
    }
    // Contrato (28/07): sexo obrigatório; endereço fixo-opcional; termos gerais.
    const cleanSexo = String(sexo || '').toLowerCase();
    if (!SEXOS.includes(cleanSexo)) {
      return res.status(400).json({ error: 'Selecione masculino ou feminino' });
    }
    const cleanEndereco = endereco ? String(endereco).trim().slice(0, 300) : null;
    if (!aceita_termos) {
      return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever' });
    }

    // Dados do menor (LGPD): exige quando alguma opção marcada tem a flag
    // `exige_dados_menor` OU a área é Kids/Bridge — a MESMA união que o client
    // aplica pra mostrar os campos. Critérios divergentes davam ou formulário
    // insubmissível (400 citando campo que a tela não mostrava) ou o inverso,
    // pior: consentimento de antecedentes colhido e triagem nunca aberta
    // (opção de menor mapeada com area_canonica errada).
    const areaLower = String(area).toLowerCase();
    let flagMenorDasOpcoes = false;
    try {
      const labels = Array.isArray(ministerios_interesse) ? ministerios_interesse.filter(Boolean) : [];
      if (labels.length) {
        const { data: opsMenor } = await supabase.from('vol_form_opcoes')
          .select('id').in('label', labels).eq('exige_dados_menor', true).limit(1);
        flagMenorDasOpcoes = !!(opsMenor && opsMenor.length);
      }
    } catch (e) { console.warn('[PublicVol/inscrever-form] opções de menor:', e.message); }
    const exigeDadosMenor = flagMenorDasOpcoes || areaLower === 'kids' || areaLower === 'bridge';
    if (exigeDadosMenor && (!nome_mae || String(nome_mae).trim().length < 2)) {
      return res.status(400).json({ error: 'Nome da mãe é obrigatório para servir em ministério com crianças e adolescentes' });
    }
    // Ministério com menores exige consentimento explícito pra consulta de antecedentes (LGPD · dado sensível).
    if (exigeDadosMenor && !consentimento_antecedentes) {
      return res.status(400).json({ error: 'É necessário autorizar a consulta de antecedentes para servir em ministério com crianças e adolescentes' });
    }

    const nomeCompleto = [cleanNome, cleanSobrenome].filter(Boolean).join(' ');
    const cleanMinisterios = Array.isArray(ministerios_interesse)
      ? ministerios_interesse.filter(Boolean).join(', ')
      : (ministerios_interesse ? String(ministerios_interesse).trim() : null);

    // Roteia pro membro existente pela política canônica (Contrato de porta):
    // CPF → e-mail+NOME → telefone+NOME → nascimento+NOME. NUNCA por e-mail
    // sozinho (a família compartilha a caixa · vincular por e-mail solto junta
    // pessoas distintas). Read-only: sem match, a inscrição fica sem membro_id
    // (lead) e a fila do Entradas reconcilia depois.
    let membroId = null;
    try {
      const achado = await acharMembroGuardado({
        cpf: cleanCpf, email: cleanEmail, telefone: cleanTelefone,
        nome: nomeCompleto, dataNascimento: cleanDataNascimento || null,
      });
      membroId = achado?.membro_id || null;
    } catch (e) {
      console.warn('[PublicVol/inscrever-form] match membro:', e.message);
    }

    // Dedup (novo · antes reenviar DUPLICAVA): candidatura aberta por CPF ou
    // membro em status inscrito/enviado_ministerio → responde "já recebemos".
    try {
      const orParts = [`cpf.eq.${cleanCpf}`];
      if (membroId) orParts.push(`membro_id.eq.${membroId}`);
      const { data: aberta } = await supabase.from('vol_inscricoes')
        .select('id, status')
        .or(orParts.join(','))
        .in('status', ['inscrito', 'enviado_ministerio'])
        .is('deleted_at', null)
        .limit(1);
      if (aberta && aberta.length) {
        return res.json({
          ok: true, ja_inscrito: true, id: aberta[0].id,
          mensagem: 'Já recebemos a sua inscrição — a coordenação de voluntários vai falar com você em breve.',
        });
      }
    } catch (e) {
      console.warn('[PublicVol/inscrever-form] dedup:', e.message);
    }

    const { data: insc, error: insErr } = await supabase
      .from('vol_inscricoes')
      .insert({
        nome: cleanNome,
        sobrenome: cleanSobrenome,
        nome_completo: nomeCompleto,
        cpf: cleanCpf,
        email: cleanEmail,
        telefone: cleanTelefone,
        data_nascimento: cleanDataNascimento,
        sexo: cleanSexo,
        endereco: cleanEndereco,
        nome_mae: nome_mae ? String(nome_mae).trim() : null,
        data_inscricao: new Date().toISOString(),
        participou_next: participou_next ? String(participou_next).trim() : null,
        dom_predominante: dom_predominante ? String(dom_predominante).trim() : null,
        ministerios_interesse: cleanMinisterios,
        area: String(area).toLowerCase(),
        status: 'inscrito',
        primeiro_contato_em: 'False',
        membro_id: membroId,
        origem: 'formulario_publico',
        whatsapp_optin: !!whatsapp_optin,
        whatsapp_optin_em: whatsapp_optin ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (insErr) {
      console.error('[PublicVol/inscrever-form] insert:', insErr.message);
      return res.status(500).json({ error: 'Erro ao registrar inscrição' });
    }

    // Contrato de porta: registra a evidência de identidade (não funde nada ·
    // best-effort · tolera a tabela de observações ausente).
    await registrarObservacaoSegura({
      membroId, origem: 'voluntariado_formulario', origemId: insc?.id || null,
      nome: nomeCompleto, cpf: cleanCpf, telefone: cleanTelefone,
      email: cleanEmail, dataNascimento: cleanDataNascimento || null,
    });

    // Atos de consentimento na satélite (o de ANTECEDENTES continua no sistema
    // próprio vol_background_checks — não duplicar). Best-effort.
    registrarConsentimentos({
      porta: 'voluntariado', refId: insc.id, membroId,
      ip: req.ip || null, userAgent: (req.headers['user-agent'] || '').slice(0, 300) || null,
      itens: [
        { tipo: 'termos_lgpd', aceito: true },
        { tipo: 'whatsapp', aceito: !!whatsapp_optin },
      ],
    }).catch((e) => console.error('[PublicVol/inscrever-form] consentimentos:', e.message));

    // Opt-in de WhatsApp: se a pessoa consentiu E já casou com um membro,
    // grava o consentimento direto no mem_membros (só liga, nunca desliga um
    // consentimento existente). Se ficou órfã (membro_id null), o consentimento
    // fica guardado na vol_inscricoes e é propagado quando o vínculo acontecer.
    if (whatsapp_optin && membroId) {
      try {
        await supabase.from('mem_membros')
          .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
          .eq('id', membroId).is('deleted_at', null);
      } catch (e) {
        console.warn('[PublicVol/inscrever-form] optin membro:', e.message);
      }
    }

    // Kids/Bridge · abre a triagem de antecedentes (pendente). A consulta
    // automática roda no cron / botão da coordenação. Sem o token Infosimples,
    // a triagem fica pra conferência manual — a trava de integração já vale.
    if (exigeDadosMenor) {
      try {
        const { criarCheckParaInscricao } = require('../services/antecedentesCriminais');
        await criarCheckParaInscricao({
          id: insc.id,
          area: areaLower,
          membro_id: membroId,
          nome_completo: nomeCompleto,
          cpf: cleanCpf,
          nome_mae: nome_mae ? String(nome_mae).trim() : null,
          data_nascimento: cleanDataNascimento,
        }, { consentimento: true, origem: 'formulario_publico' });
      } catch (e) {
        console.error('[PublicVol/inscrever-form] antecedentes:', e.message);
      }
    }

    try {
      const { notificar } = require('../services/notificar');
      await notificar({
        modulo: 'voluntariado',
        tipo: 'nova_inscricao',
        titulo: 'Nova inscrição de voluntário',
        mensagem: `${nomeCompleto} (${cleanEmail}) se inscreveu para servir${cleanMinisterios ? ` em: ${cleanMinisterios}` : ` na área ${String(area).toUpperCase()}`}.`,
        link: '/ministerial/voluntariado/inscricoes',
        severidade: 'info',
        chaveDedup: `vol_inscricao_${insc.id}`,
      });
    } catch (e) {
      console.error('[PublicVol/inscrever-form] notificar:', e.message);
    }

    // Mensagem automática de boas-vindas no WhatsApp (se ligada na config).
    try {
      const { dispararAuto } = require('../services/whatsappAuto');
      await dispararAuto('voluntariado_inscricao', {
        refId: insc.id, telefone: cleanTelefone, nome: nomeCompleto, origem: 'formulario_publico',
      });
    } catch (e) {
      console.error('[PublicVol/inscrever-form] whatsapp:', e.message);
    }

    return res.json({ ok: true, id: insc.id });
  } catch (err) {
    console.error('[PublicVol/inscrever-form] error:', err.message);
    res.status(500).json({ error: 'Erro ao registrar inscrição' });
  }
});

// GET /textos — textos canônicos de consentimento (o snapshot gravado é
// sempre o do backend)
router.get('/textos', (_req, res) => {
  res.json({ termos_lgpd: TEXTOS.termos_lgpd, aviso_optin: TEXTOS.aviso_optin });
});

// ---------------------------------------------------------------------------
// GET /form-opcoes · opções ativas do formulário "Onde você quer servir".
// Público (leitura de catalogo · sem PII). Cai num fallback vazio se a tabela
// ainda não existir (migration não aplicada) pra não quebrar o formulário.
// ---------------------------------------------------------------------------
router.get('/form-opcoes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_form_opcoes')
      .select('id, label, area_canonica, exige_dados_menor, aviso_titulo, aviso_texto')
      .eq('ativo', true)
      .order('ordem', { ascending: true });
    if (error) {
      console.warn('[PublicVol/form-opcoes]', error.message);
      return res.json({ opcoes: [] });
    }
    res.json({ opcoes: data || [] });
  } catch (e) {
    console.error('[PublicVol/form-opcoes] error:', e.message);
    res.json({ opcoes: [] });
  }
});

module.exports = router;
