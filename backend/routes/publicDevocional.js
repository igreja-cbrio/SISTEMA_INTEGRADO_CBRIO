/**
 * Rotas publicas do devocional do membro.
 *
 * Fluxo:
 *   1. Membro acessa /devocional pelo celular sem login
 *   2. Digita o email
 *   3. Backend valida que existe em mem_membros, garante auth user +
 *      profile (com is_membro_only=true se profile nao existir ainda)
 *      e dispara magic link via Supabase
 *   4. Membro clica no email -> redirect pra /devocional/hoje autenticado
 */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
});

function ehEmailValido(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function getFrontendUrl() {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}

// ── POST /api/public/devocional/login ────────────────────────────
// body: { email }
// 1) busca mem_membros pelo email
// 2) garante auth user + profile (cria com is_membro_only=true se novo)
// 3) linka profile.membro_id
// 4) gera magic link redirecionando pra /devocional/hoje
router.post('/login', publicLimiter, async (req, res) => {
  try {
    const rawEmail = (req.body?.email || '').trim().toLowerCase();
    if (!ehEmailValido(rawEmail)) {
      return res.status(400).json({ error: 'Email invalido' });
    }

    // 1) Achar mem_membros pelo email
    const { data: membro, error: mErr } = await supabase
      .from('mem_membros')
      .select('id, nome, email, active, status')
      .ilike('email', rawEmail)
      .eq('active', true)
      .maybeSingle();

    if (mErr) {
      console.error('[PublicDevocional] mem_membros lookup:', mErr.message);
      return res.status(500).json({ error: 'Erro ao buscar cadastro' });
    }
    if (!membro) {
      return res.status(404).json({ error: 'Email nao cadastrado como membro. Procure um lider.' });
    }

    // 2) Achar auth user
    let authUserId = null;
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const existing = users?.find(u => (u.email || '').toLowerCase() === rawEmail);
    if (existing) {
      authUserId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: rawEmail,
        email_confirm: true,
        user_metadata: { source: 'devocional', membro_id: membro.id },
      });
      if (createErr) {
        console.error('[PublicDevocional] createUser:', createErr.message);
        return res.status(500).json({ error: 'Erro ao criar acesso' });
      }
      authUserId = created.user?.id;
    }
    if (!authUserId) return res.status(500).json({ error: 'Erro ao obter usuario' });

    // 3) Garantir profile + linkar
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, membro_id, is_membro_only')
      .eq('id', authUserId)
      .maybeSingle();

    if (!profile) {
      await supabase.from('profiles').insert({
        id: authUserId,
        email: rawEmail,
        name: membro.nome,
        role: null,
        membro_id: membro.id,
        is_membro_only: true,
        active: true,
      });
    } else if (!profile.membro_id) {
      await supabase.from('profiles')
        .update({ membro_id: membro.id })
        .eq('id', authUserId);
    }

    // 4) Magic link
    const frontendUrl = getFrontendUrl();
    const redirectTo = `${frontendUrl}/devocional/hoje`;
    const { error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: rawEmail,
      options: { redirectTo },
    });
    if (linkErr) {
      console.error('[PublicDevocional] generateLink:', linkErr.message);
      return res.status(500).json({ error: 'Erro ao enviar link de acesso' });
    }

    console.log(`[PublicDevocional] Magic link enviado para ${maskEmail(rawEmail)}`);
    return res.json({ ok: true, maskedEmail: maskEmail(rawEmail) });
  } catch (e) {
    console.error('[PublicDevocional] login:', e.message);
    res.status(500).json({ error: 'Erro ao processar login' });
  }
});

module.exports = router;
