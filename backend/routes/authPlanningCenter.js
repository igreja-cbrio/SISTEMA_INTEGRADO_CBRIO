/**
 * Planning Center OAuth 2.0 login flow for volunteers.
 *
 * Flow:
 *   1. Frontend links to GET /api/auth/planning-center/login
 *   2. Backend redirects to PC OAuth authorize URL
 *   3. PC redirects back to GET /api/auth/planning-center/callback?code=...
 *   4. Backend exchanges code for token, fetches user info from PC
 *   5. Creates / finds Supabase user with role='voluntario'
 *   6. Generates a magic-link token_hash via admin API
 *   7. Redirects browser to frontend /auth/pc-callback?token_hash=...
 *   8. Frontend verifies OTP and establishes session
 *
 * Env vars:
 *   PC_OAUTH_CLIENT_ID     — OAuth app client_id (falls back to PLANNING_CENTER_APP_ID)
 *   PC_OAUTH_CLIENT_SECRET — OAuth app client_secret (falls back to PLANNING_CENTER_SECRET)
 *   FRONTEND_URL           — e.g. https://sistema-cbrio.vercel.app
 */

const router = require('express').Router();
const { supabase } = require('../utils/supabase');

function getOAuthCredentials() {
  const clientId = process.env.PC_OAUTH_CLIENT_ID || process.env.PLANNING_CENTER_APP_ID;
  const clientSecret = process.env.PC_OAUTH_CLIENT_SECRET || process.env.PLANNING_CENTER_SECRET;
  return { clientId, clientSecret };
}

function getFrontendUrl() {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}

// ── GET /api/auth/planning-center/login ─────────────────────────────────
// Redirects user to Planning Center OAuth authorize page
router.get('/login', (req, res) => {
  const { clientId } = getOAuthCredentials();
  if (!clientId) {
    return res.status(500).json({ error: 'Planning Center OAuth not configured (PC_OAUTH_CLIENT_ID)' });
  }

  const frontendUrl = getFrontendUrl();
  const callbackUrl = `${frontendUrl}/api/auth/planning-center/callback`;
  const authorizeUrl = new URL('https://api.planningcenteronline.com/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'people');

  res.redirect(authorizeUrl.toString());
});

// ── GET /api/auth/planning-center/callback ──────────────────────────────
// Exchanges authorization code for PC access token, creates Supabase user, generates session
router.get('/callback', async (req, res) => {
  const frontendUrl = getFrontendUrl();
  const { code, error: oauthError } = req.query;

  if (oauthError || !code) {
    console.error('[PC OAuth] Error or no code:', oauthError);
    return res.redirect(`${frontendUrl}/login?error=pc_oauth_denied`);
  }

  try {
    const { clientId, clientSecret } = getOAuthCredentials();
    if (!clientId || !clientSecret) throw new Error('PC OAuth credentials not configured');

    const callbackUrl = `${frontendUrl}/api/auth/planning-center/callback`;

    // ── 1. Exchange code for access token ────────────────────────────
    const tokenRes = await fetch('https://api.planningcenteronline.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[PC OAuth] Token exchange failed:', tokenRes.status, body);
      throw new Error('Failed to exchange authorization code');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // ── 2. Fetch user info from Planning Center ─────────────────────
    const meRes = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) throw new Error('Failed to fetch Planning Center user info');

    const meData = await meRes.json();
    const pcUser = meData.data;
    const pcId = pcUser.id;
    const firstName = pcUser.attributes.first_name || '';
    const lastName = pcUser.attributes.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Voluntario';
    const avatar = pcUser.attributes.avatar || null;

    // ── 3. Get email from Planning Center ───────────────────────────
    const emailsRes = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${pcId}/emails`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    let email = null;
    if (emailsRes.ok) {
      const emailsData = await emailsRes.json();
      const primaryEmail = emailsData.data?.find(e => e.attributes.primary) || emailsData.data?.[0];
      email = primaryEmail?.attributes?.address;
    }

    if (!email) {
      console.error('[PC OAuth] No email found for PC user:', pcId);
      return res.redirect(`${frontendUrl}/login?error=pc_no_email`);
    }

    email = email.toLowerCase().trim();

    // ── 4. Create or find Supabase user ─────────────────────────────
    let supaUserId = null;

    // Check if a profile already exists with this email
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      supaUserId = existingProfile.id;
      // Update PC info on existing profile (don't change role if already set)
      await supabase.from('profiles').update({
        avatar_url: avatar || undefined,
        updated_at: new Date().toISOString(),
      }).eq('id', supaUserId);
    } else {
      // Create new Supabase auth user
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          name: fullName,
          planning_center_id: pcId,
          avatar_url: avatar,
        },
      });

      if (createErr) {
        // If user exists in auth but not in profiles (edge case), find by listing
        console.error('[PC OAuth] Create user error:', createErr.message);
        // Try to get user by email from auth
        const { data: listData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
        // Fallback: search directly
        const { data: authUser } = await supabase.auth.admin.getUserById(existingProfile?.id || '');
        if (authUser?.user) {
          supaUserId = authUser.user.id;
        } else {
          throw new Error(`Failed to create/find user: ${createErr.message}`);
        }
      } else {
        supaUserId = created.user.id;
      }

      // Create profile with 'voluntario' role
      await supabase.from('profiles').upsert({
        id: supaUserId,
        email,
        name: fullName,
        role: 'voluntario',
        avatar_url: avatar,
        active: true,
        updated_at: new Date().toISOString(),
      });
    }

    // ── 5. Link to vol_profiles if exists ───────────────────────────
    // Update the vol_profiles record to link the supabase user
    await supabase.from('vol_profiles')
      .update({ user_id: supaUserId })
      .eq('planning_center_id', pcId)
      .is('user_id', null);

    // ── 6. Generate magic-link token ────────────────────────────────
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${frontendUrl}/ministerial/voluntariado/checkin`,
      },
    });

    if (linkErr) {
      console.error('[PC OAuth] Generate link error:', linkErr.message);
      throw linkErr;
    }

    const tokenHash = linkData.properties.hashed_token;

    // ── 7. Redirect to frontend callback page ───────────────────────
    const redirectUrl = new URL(`${frontendUrl}/auth/pc-callback`);
    redirectUrl.searchParams.set('token_hash', tokenHash);
    redirectUrl.searchParams.set('type', 'magiclink');

    console.log(`[PC OAuth] Login successful for ${email} (PC: ${pcId})`);
    res.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('[PC OAuth] Callback error:', err.message);
    res.redirect(`${frontendUrl}/login?error=pc_oauth_failed`);
  }
});

module.exports = router;
