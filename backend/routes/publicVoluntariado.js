/**
 * Rotas publicas do modulo de voluntariado.
 *
 * Usado quando alguem escaneia o QR de self-checkin no celular SEM estar
 * autenticado. Permite:
 *   1. Lookup por CPF (descobrir se ja existe em algum cadastro do sistema)
 *   2. Login magico: enviar link de acesso por email para usuario existente
 *      (colaborador, membro ou voluntario). Cria vol_profile se necessario.
 *   3. Registro: cadastro completo quando o CPF nao existe em lugar nenhum.
 *
 * Seguranca:
 *   - Rate limit de 10 req/IP em 15 min (alinhado com publicMembresia)
 *   - CPF validado (algoritmo oficial)
 *   - Emails retornados ao cliente sempre mascarados (d***@dominio.com)
 *   - Honeypot `website` para deter bots
 */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas deste endereco. Tente novamente em alguns minutos.' },
});

function soDigitos(v) {
  return (v || '').toString().replace(/\D+/g, '');
}

function ehEmailValido(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  // 1. Voluntario existente (vol_profiles)
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
// Cliente envia CPF, backend responde se ja existe em algum cadastro.
// Nunca expoe email completo — apenas mascarado para o usuario confirmar.
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
// Para usuarios existentes (colaborador, membro, voluntario): cria vol_profile
// se ainda nao tiver, garante auth user, e envia magic link por email.
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
      return res.status(404).json({ error: 'Cadastro nao encontrado', needsRegistration: true });
    }

    if (!result.email || !ehEmailValido(result.email)) {
      return res.status(400).json({
        error: 'Seu cadastro nao tem email valido. Procure um lider para atualizar.',
      });
    }

    const email = result.email.toLowerCase().trim();
    const cleanCpf = soDigitos(cpf);

    // Garantir auth user (criar se ainda nao existe)
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

        // Criar profile (role voluntario, nao sobrescreve se ja existir por trigger)
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
      // Ja existe vol_profile, so linkar auth_user_id se faltar
      if (!result.record.auth_user_id) {
        await supabase.from('vol_profiles')
          .update({ auth_user_id: authUserId })
          .eq('id', result.record.id);
      }
    } else {
      // Nao tem vol_profile ainda: criar
      const origem = result.type === 'colaborador' ? 'manual' : 'membresia';
      const membresiaId = result.type === 'membro' ? result.record.id : null;

      // Verificar se ja existe vol_profile pelo CPF ou auth_user_id (defesa)
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
    const redirectPath = serviceId
      ? `/voluntariado/self-checkin?serviceId=${encodeURIComponent(serviceId)}`
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
// Cadastro completo quando o CPF nao existe em nenhum lugar.
// Cria auth user + profile (role='voluntario') + vol_profile, envia magic link.
router.post('/register', publicLimiter, async (req, res) => {
  try {
    const { cpf, full_name, email: rawEmail, phone, serviceId, website } = req.body || {};
    if (website) return res.status(200).json({ ok: true }); // honeypot

    if (!cpfValido(cpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!full_name || full_name.trim().length < 3) return res.status(400).json({ error: 'Nome invalido' });
    if (!ehEmailValido(rawEmail)) return res.status(400).json({ error: 'Email invalido' });

    const email = rawEmail.toLowerCase().trim();
    const cleanCpf = soDigitos(cpf);

    // Defesa: se ja existe em algum lugar, rejeitar (o fluxo de request-login
    // deveria ter sido usado)
    const existing = await lookupByCpf(cleanCpf);
    if (existing.type !== 'none') {
      return res.status(409).json({ error: 'CPF ja cadastrado. Use "Entrar" em vez de cadastrar.', type: existing.type });
    }

    // Verificar se o email ja tem profile
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

    // Upsert profile (role voluntario)
    await supabase.from('profiles').upsert({
      id: authUserId,
      email,
      name: full_name,
      role: 'voluntario',
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    // Criar vol_profile
    await supabase.from('vol_profiles').insert({
      auth_user_id: authUserId,
      full_name,
      email,
      cpf: cleanCpf,
      phone: phone ? soDigitos(phone) : null,
      origem: 'manual',
      profile_complete: true,
      allocation_status: 'active',
    });

    // Magic link
    const frontendUrl = getFrontendUrl();
    const redirectPath = serviceId
      ? `/voluntariado/self-checkin?serviceId=${encodeURIComponent(serviceId)}`
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

module.exports = router;
