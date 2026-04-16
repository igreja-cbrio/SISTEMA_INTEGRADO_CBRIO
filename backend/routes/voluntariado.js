const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate, authorizeModule('membresia', 1));

// ══════════════════════════════════════════════════════════════
// VOLUNTEER PORTAL — endpoints for logged-in volunteers
// ══════════════════════════════════════════════════════════════

// Get my volunteer profile (linked to auth user)
router.get('/me', async (req, res) => {
  try {
    const userId = req.user.userId;
    // Try vol_profiles first
    let { data: volProfile } = await supabase.from('vol_profiles')
      .select('*').eq('auth_user_id', userId).maybeSingle();

    // If no vol_profile exists, try to find by email
    if (!volProfile) {
      const { data: authProfile } = await supabase.from('profiles')
        .select('email, name').eq('id', userId).maybeSingle();
      if (authProfile?.email) {
        const { data: byEmail } = await supabase.from('vol_profiles')
          .select('*').eq('email', authProfile.email).maybeSingle();
        if (byEmail) {
          // Link auth_user_id
          await supabase.from('vol_profiles').update({ auth_user_id: userId }).eq('id', byEmail.id);
          volProfile = { ...byEmail, auth_user_id: userId };
        }
      }
    }

    // Get team memberships
    let teams = [];
    if (volProfile) {
      const { data: memberData } = await supabase.from('vol_team_members')
        .select('*, team:vol_teams(id, name, color), position:vol_positions(id, name)')
        .eq('volunteer_profile_id', volProfile.id).eq('is_active', true);
      teams = memberData || [];
    }

    res.json({ profile: volProfile, teams });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar perfil do voluntario' }); }
});

// Save face descriptor for MY OWN volunteer profile (self-service enrollment)
router.post('/me/face', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { descriptor, photo_url } = req.body;
    if (!descriptor || !Array.isArray(descriptor)) {
      return res.status(400).json({ error: 'descriptor obrigatorio' });
    }

    const { data: profile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!profile) {
      return res.status(404).json({ error: 'Perfil de voluntario nao encontrado' });
    }

    const { data, error } = await supabase.rpc('vol_save_profile_face_descriptor', {
      p_profile_id: profile.id,
      descriptor,
      photo_url: photo_url || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[Vol] save my face error:', e.message);
    res.status(500).json({ error: 'Erro ao salvar reconhecimento facial' });
  }
});

// Complete/update my volunteer profile
router.put('/me', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { full_name, cpf, phone, email } = req.body;
    if (!full_name) return res.status(400).json({ error: 'Nome obrigatorio' });

    // Check if vol_profile exists (and fetch current cpf to detect changes)
    let { data: existing } = await supabase.from('vol_profiles')
      .select('id, cpf').eq('auth_user_id', userId).maybeSingle();

    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : '';
    const currentCpf = existing?.cpf ? existing.cpf.replace(/\D/g, '') : '';
    const cpfChanged = cleanCpf && cleanCpf !== currentCpf;

    // Quando o CPF for alterado (ou definido pela primeira vez), vincular com
    // o cadastro de membros. Se o CPF nao existir em mem_membros, devolver
    // MEMBER_NOT_FOUND para que o frontend peca o cadastro obrigatorio.
    let membroMatch = null;
    if (cpfChanged) {
      if (cleanCpf.length !== 11) {
        return res.status(400).json({ error: 'CPF invalido' });
      }
      const { data: membro } = await supabase.from('mem_membros')
        .select('id, nome, telefone, email').eq('cpf', cleanCpf).maybeSingle();
      if (!membro) {
        return res.status(409).json({
          error: 'CPF nao encontrado no cadastro de membros. Complete o cadastro para continuar.',
          code: 'MEMBER_NOT_FOUND',
          cpf: cleanCpf,
        });
      }
      membroMatch = membro;
    }

    let profileId;
    if (existing) {
      profileId = existing.id;
      const update = {
        full_name,
        cpf: cleanCpf || null,
        phone: phone || null,
        email: email || null,
        profile_complete: true,
      };
      if (membroMatch) update.membresia_id = membroMatch.id;
      await supabase.from('vol_profiles').update(update).eq('id', profileId);
    } else {
      const insert = {
        auth_user_id: userId,
        full_name,
        cpf: cleanCpf || null,
        phone: phone || null,
        email: email || null,
        profile_complete: true,
      };
      if (membroMatch) insert.membresia_id = membroMatch.id;
      const { data: created, error } = await supabase.from('vol_profiles').insert(insert).select().single();
      if (error) return res.status(400).json({ error: error.message });
      profileId = created.id;
    }

    const { data: updated } = await supabase.from('vol_profiles')
      .select('*').eq('id', profileId).single();

    res.json({
      profile: updated,
      membresiaMatch: membroMatch ? { id: membroMatch.id, nome: membroMatch.nome } : null,
    });
  } catch (e) {
    console.error('[Vol] update me error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// Cadastro obrigatorio de membro disparado quando o CPF informado em PUT /me
// nao existe em mem_membros. Cria o membro e vincula o vol_profile.
router.post('/me/register-member', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { nome, sobrenome, cpf, celular } = req.body || {};

    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
    if (!sobrenome || !sobrenome.trim()) return res.status(400).json({ error: 'Sobrenome obrigatorio' });
    if (!cpf) return res.status(400).json({ error: 'CPF obrigatorio' });
    if (!celular || !celular.trim()) return res.status(400).json({ error: 'Celular obrigatorio' });

    const cleanCpf = String(cpf).replace(/\D/g, '');
    if (cleanCpf.length !== 11) return res.status(400).json({ error: 'CPF invalido' });
    const cleanPhone = String(celular).replace(/\D/g, '');
    if (cleanPhone.length < 10) return res.status(400).json({ error: 'Celular invalido' });

    const fullName = `${nome.trim()} ${sobrenome.trim()}`.replace(/\s+/g, ' ');

    // Se ja existe membro com esse CPF, reutilizar em vez de duplicar
    let { data: membro } = await supabase.from('mem_membros')
      .select('id, nome, telefone, email').eq('cpf', cleanCpf).maybeSingle();

    if (!membro) {
      const { data: created, error } = await supabase.from('mem_membros').insert({
        nome: fullName,
        cpf: cleanCpf,
        telefone: cleanPhone,
        status: 'visitante',
        active: true,
      }).select('id, nome, telefone, email').single();
      if (error) return res.status(400).json({ error: error.message });
      membro = created;
    }

    // Buscar ou criar vol_profile e vincular
    let { data: profile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();

    if (profile) {
      await supabase.from('vol_profiles').update({
        full_name: fullName,
        cpf: cleanCpf,
        phone: cleanPhone,
        membresia_id: membro.id,
        profile_complete: true,
      }).eq('id', profile.id);
    } else {
      const { data: created, error } = await supabase.from('vol_profiles').insert({
        auth_user_id: userId,
        full_name: fullName,
        cpf: cleanCpf,
        phone: cleanPhone,
        membresia_id: membro.id,
        profile_complete: true,
      }).select('id').single();
      if (error) return res.status(400).json({ error: error.message });
      profile = created;
    }

    const { data: updated } = await supabase.from('vol_profiles')
      .select('*').eq('id', profile.id).single();

    res.json({
      profile: updated,
      membresiaMatch: { id: membro.id, nome: membro.nome },
      created: true,
    });
  } catch (e) {
    console.error('[Vol] register member error:', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar membro' });
  }
});

// Google Wallet — gera URL "Save to Google Wallet" com o QR pessoal do voluntario
router.get('/me/wallet/google', async (req, res) => {
  try {
    const userId = req.user.userId;

    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_WALLET_PRIVATE_KEY || '';
    const privateKey = rawKey.replace(/\\n/g, '\n');

    if (!issuerId || !serviceAccountEmail || !privateKey) {
      return res.status(503).json({ error: 'Google Wallet nao configurado' });
    }

    const { data: profile } = await supabase.from('vol_profiles')
      .select('id, full_name, qr_code').eq('auth_user_id', userId).maybeSingle();

    if (!profile) return res.status(404).json({ error: 'Perfil nao encontrado' });
    if (!profile.qr_code) return res.status(400).json({ error: 'QR Code ainda nao gerado para este perfil' });

    const jwt = require('jsonwebtoken');
    const classId = `${issuerId}.cbrio_voluntario_v1`;
    const objectId = `${issuerId}.vol_${profile.id.replace(/-/g, '_')}`;

    // ID legivel derivado do UUID do vol_profile (estavel, sem migration)
    const voluntarioId = `CBR-${profile.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    // Logo publica servida pelo frontend (Google busca pela internet para renderizar)
    const frontendUrl = (process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/+$/, '');
    const logoUrl = frontendUrl ? `${frontendUrl}/logo-cbrio-text.png` : 'https://sistema-cbrio.vercel.app/logo-cbrio-text.png';

    const genericObject = {
      id: objectId,
      classId: classId,
      genericType: 'GENERIC_OTHER',
      hexBackgroundColor: '#00B39D',
      logo: {
        sourceUri: { uri: logoUrl },
        contentDescription: { defaultValue: { language: 'pt-BR', value: 'CBRio' } },
      },
      cardTitle: { defaultValue: { language: 'pt-BR', value: 'CBRio' } },
      subheader: { defaultValue: { language: 'pt-BR', value: 'NOME' } },
      header: { defaultValue: { language: 'pt-BR', value: profile.full_name || 'Voluntario' } },
      textModulesData: [
        { id: 'vol_id', header: 'VOLUNTARIO ID', body: voluntarioId },
      ],
      barcode: { type: 'QR_CODE', value: profile.qr_code, alternateText: voluntarioId },
      state: 'ACTIVE',
    };

    const claims = {
      iss: serviceAccountEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      payload: { genericObjects: [genericObject] },
    };

    const token = jwt.sign(claims, privateKey, { algorithm: 'RS256' });
    res.json({ url: `https://pay.google.com/gp/v/save/${token}`, voluntarioId });
  } catch (err) {
    console.error('[Wallet] Google error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/voluntariado/me/wallet/apple — gera .pkpass para Apple Wallet (iOS)
router.get('/me/wallet/apple', async (req, res) => {
  try {
    const { buildVoluntarioPass } = require('../services/appleWallet');
    const userId = req.user.userId;

    const { data: profile } = await supabase.from('vol_profiles')
      .select('id, full_name, qr_code').eq('auth_user_id', userId).maybeSingle();

    if (!profile) return res.status(404).json({ error: 'Perfil nao encontrado' });
    if (!profile.qr_code) return res.status(400).json({ error: 'QR Code ainda nao gerado para este perfil' });

    const voluntarioId = `CBR-${profile.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const pkpassBuffer = await buildVoluntarioPass({
      nome: profile.full_name,
      qrCode: profile.qr_code,
      voluntarioId,
    });

    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="cbrio-voluntario.pkpass"`);
    res.send(pkpassBuffer);
  } catch (err) {
    console.error('[Wallet] Apple error:', err.message);
    res.status(503).json({ error: 'Apple Wallet indisponivel no momento.' });
  }
});

// Get my upcoming schedules
router.get('/my-schedules', async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get vol_profile
    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id, planning_center_id').eq('auth_user_id', userId).maybeSingle();

    if (!volProfile) return res.json([]);

    // Build query conditions
    const conditions = [`volunteer_id.eq.${volProfile.id}`];
    if (volProfile.planning_center_id) {
      conditions.push(`planning_center_person_id.eq.${volProfile.planning_center_id}`);
    }

    const { data: schedules } = await supabase.from('vol_schedules')
      .select('*, service:vol_services!inner(*)')
      .or(conditions.join(','))
      .gte('service.scheduled_at', new Date().toISOString())
      .order('service(scheduled_at)', { ascending: true });

    // Attach check-in status
    const scheduleIds = (schedules || []).map(s => s.id);
    let checkIns = [];
    if (scheduleIds.length > 0) {
      const { data: ci } = await supabase.from('vol_check_ins').select('schedule_id').in('schedule_id', scheduleIds);
      checkIns = ci || [];
    }
    const checkedIds = new Set(checkIns.map(c => c.schedule_id));

    const result = (schedules || []).map(s => ({
      ...s,
      has_checkin: checkedIds.has(s.id),
    }));

    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar minhas escalas' }); }
});

// Respond to schedule (accept/decline)
router.post('/my-schedules/:id/respond', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['confirmed', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Status deve ser confirmed ou declined' });
    }

    const { data, error } = await supabase.from('vol_schedules')
      .update({ confirmation_status: status })
      .eq('id', req.params.id)
      .select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao responder escala' }); }
});

// Get my availability
router.get('/my-availability', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!volProfile) return res.json([]);

    const { data, error } = await supabase.from('vol_availability')
      .select('*').eq('volunteer_profile_id', volProfile.id).order('unavailable_from');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar disponibilidade' }); }
});

// Set my availability (create unavailability)
router.post('/my-availability', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { unavailable_from, unavailable_to, reason } = req.body;
    if (!unavailable_from || !unavailable_to) return res.status(400).json({ error: 'Datas obrigatorias' });

    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!volProfile) return res.status(404).json({ error: 'Perfil de voluntario nao encontrado' });

    const { data, error } = await supabase.from('vol_availability')
      .insert({ volunteer_profile_id: volProfile.id, unavailable_from, unavailable_to, reason })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar indisponibilidade' }); }
});

// Delete my availability
router.delete('/my-availability/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!volProfile) return res.status(404).json({ error: 'Perfil nao encontrado' });

    // Only delete own availability
    const { error } = await supabase.from('vol_availability')
      .delete().eq('id', req.params.id).eq('volunteer_profile_id', volProfile.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover indisponibilidade' }); }
});

// Generate self-checkin token for a service (fixed QR code on totem)
router.get('/self-checkin-qr/:serviceId', async (req, res) => {
  try {
    const serviceId = req.params.serviceId;
    const { data: service } = await supabase.from('vol_services')
      .select('id, name, scheduled_at').eq('id', serviceId).single();
    if (!service) return res.status(404).json({ error: 'Culto nao encontrado' });

    // The QR code payload is a URL to the self-checkin page
    const frontendUrl = process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
    const qrUrl = `${frontendUrl}/voluntariado/self-checkin?serviceId=${serviceId}`;

    res.json({ url: qrUrl, service });
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar QR code' }); }
});

// ══════════════════════════════════════════════════════════════
// PROFILES
// ══════════════════════════════════════════════════════════════
router.get('/profiles', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_profiles').select('*').order('full_name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar perfis' }); }
});

router.get('/profiles/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_profiles').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Perfil nao encontrado' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar perfil' }); }
});

router.put('/profiles/:id', async (req, res) => {
  try {
    const { full_name, email, planning_center_id, avatar_url } = req.body;
    const { data, error } = await supabase.from('vol_profiles')
      .update({ full_name, email, planning_center_id, avatar_url }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar perfil' }); }
});

// ══════════════════════════════════════════════════════════════
// USER ROLES
// ══════════════════════════════════════════════════════════════
router.get('/roles', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_user_roles').select('*');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar roles' }); }
});

router.post('/roles', async (req, res) => {
  try {
    const { profile_id, role } = req.body;
    if (!profile_id || !role) return res.status(400).json({ error: 'profile_id e role obrigatorios' });
    const { data, error } = await supabase.from('vol_user_roles').insert({ profile_id, role }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao adicionar role' }); }
});

router.delete('/roles/:profileId/:role', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_user_roles')
      .delete().eq('profile_id', req.params.profileId).eq('role', req.params.role);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover role' }); }
});

// ══════════════════════════════════════════════════════════════
// CPF / MEMBRESIA UNIFICATION ENDPOINTS
// ══════════════════════════════════════════════════════════════

// GET /vol-by-membro/:membroId — vol_profile linked to a mem_membros record
router.get('/vol-by-membro/:membroId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_profiles')
      .select('id, full_name, allocation_status, origem, cpf, team_members:vol_team_members(id, team:vol_teams(id, name, color))')
      .eq('membresia_id', req.params.membroId)
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || null);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar perfil do voluntario' }); }
});

// POST /quero-servir — member opts in; creates or links vol_profile
router.post('/quero-servir', async (req, res) => {
  try {
    const { membro_id } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });

    // Load membro data
    const { data: membro, error: memErr } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf, email')
      .eq('id', membro_id)
      .single();
    if (memErr || !membro) return res.status(404).json({ error: 'Membro nao encontrado' });

    const cleanCpf = membro.cpf ? membro.cpf.replace(/\D/g, '') : null;
    let volProfile = null;

    // 1. Try to find existing vol_profile by membresia_id
    const { data: byMembro } = await supabase
      .from('vol_profiles')
      .select('id, allocation_status, cpf')
      .eq('membresia_id', membro_id)
      .maybeSingle();

    if (byMembro) {
      // Already linked — just ensure waiting_allocation if not yet active in a team
      const hasTeam = await supabase.from('vol_team_members')
        .select('id').eq('volunteer_profile_id', byMembro.id).limit(1);
      const newStatus = hasTeam.data?.length > 0 ? 'active' : 'waiting_allocation';
      await supabase.from('vol_profiles').update({
        membresia_id: membro_id,
        origem: 'membresia',
        allocation_status: newStatus,
      }).eq('id', byMembro.id);
      const { data: updated } = await supabase.from('vol_profiles').select('*').eq('id', byMembro.id).single();
      volProfile = updated;
    } else if (cleanCpf) {
      // 2. Try to find by CPF
      const { data: byCpf } = await supabase
        .from('vol_profiles')
        .select('id, allocation_status')
        .eq('cpf', cleanCpf)
        .maybeSingle();

      if (byCpf) {
        // Link existing vol_profile to this membro
        await supabase.from('vol_profiles').update({
          membresia_id: membro_id,
          origem: 'membresia',
          allocation_status: 'waiting_allocation',
        }).eq('id', byCpf.id);
        const { data: updated } = await supabase.from('vol_profiles').select('*').eq('id', byCpf.id).single();
        volProfile = updated;
      } else {
        // 3. Create new vol_profile
        const { data: created, error: createErr } = await supabase
          .from('vol_profiles')
          .insert({
            full_name: membro.nome,
            cpf: cleanCpf,
            email: membro.email,
            membresia_id: membro_id,
            origem: 'membresia',
            allocation_status: 'waiting_allocation',
            profile_complete: false,
          })
          .select('*')
          .single();
        if (createErr) return res.status(400).json({ error: createErr.message });
        volProfile = created;
      }
    } else {
      // No CPF — create anyway, admin will fill later
      const { data: created, error: createErr } = await supabase
        .from('vol_profiles')
        .insert({
          full_name: membro.nome,
          email: membro.email,
          membresia_id: membro_id,
          origem: 'membresia',
          allocation_status: 'waiting_allocation',
          profile_complete: false,
        })
        .select('*')
        .single();
      if (createErr) return res.status(400).json({ error: createErr.message });
      volProfile = created;
    }

    // Mark membro as wanting to serve
    await supabase.from('mem_membros').update({ quer_servir: true }).eq('id', membro_id);

    res.json({ success: true, vol_profile: volProfile });
  } catch (e) {
    console.error('[QUERO SERVIR]', e.message);
    res.status(500).json({ error: 'Erro ao registrar interesse em servir' });
  }
});

// GET /waiting-allocation — volunteers waiting for team assignment
router.get('/waiting-allocation', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_profiles')
      .select(`
        id, full_name, email, cpf, avatar_url, origem, created_at,
        membro:mem_membros!membresia_id(id, nome, status),
        team_members:vol_team_members(id, team:vol_teams(id, name, color))
      `)
      .eq('allocation_status', 'waiting_allocation')
      .order('created_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar fila de alocacao' }); }
});

// POST /allocate/:id — admin assigns volunteer to a team
router.post('/allocate/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { team_id, position_id } = req.body;
    if (!team_id) return res.status(400).json({ error: 'team_id obrigatorio' });

    // Verify vol_profile exists
    const { data: vol } = await supabase.from('vol_profiles').select('id').eq('id', id).maybeSingle();
    if (!vol) return res.status(404).json({ error: 'Voluntario nao encontrado' });

    // Add to team (upsert to avoid duplicate)
    const { error: tmErr } = await supabase.from('vol_team_members')
      .upsert({
        volunteer_profile_id: id,
        team_id,
        position_id: position_id || null,
      }, { onConflict: 'volunteer_profile_id,team_id', ignoreDuplicates: false });
    if (tmErr) return res.status(400).json({ error: tmErr.message });

    // Mark as active
    await supabase.from('vol_profiles').update({ allocation_status: 'active' }).eq('id', id);

    res.json({ success: true });
  } catch (e) {
    console.error('[ALLOCATE]', e.message);
    res.status(500).json({ error: 'Erro ao alocar voluntario' });
  }
});

// ══════════════════════════════════════════════════════════════
// VOLUNTEERS POOL — all active vol_profiles with team memberships
// Used by the schedule builder popup. Cached on the client (5 min staleTime).
// ══════════════════════════════════════════════════════════════
router.get('/volunteers-pool', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_profiles')
      .select(`
        id, full_name, email, avatar_url, planning_center_id, qr_code,
        team_members:vol_team_members(
          id, team_id, position_id,
          team:vol_teams(id, name, color),
          position:vol_positions(id, name)
        )
      `)
      .order('full_name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar pool de voluntarios' }); }
});

// ══════════════════════════════════════════════════════════════
// SERVICES
// ══════════════════════════════════════════════════════════════
router.get('/services', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_services').select('*').order('scheduled_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cultos' }); }
});

router.get('/services/upcoming', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_services').select('*')
      .gte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(10);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar proximos cultos' }); }
});

router.get('/services/today', async (req, res) => {
  try {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
    const { data, error } = await supabase.from('vol_services').select('*')
      .gte('scheduled_at', start).lt('scheduled_at', end).order('scheduled_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cultos de hoje' }); }
});

// ══════════════════════════════════════════════════════════════
// SCHEDULES
// ══════════════════════════════════════════════════════════════
router.get('/schedules', async (req, res) => {
  try {
    const { service_id, volunteer_id } = req.query;
    let q = supabase.from('vol_schedules').select('*, service:vol_services(*)').order('team_name');
    if (service_id) q = q.eq('service_id', service_id);
    if (volunteer_id) q = q.eq('volunteer_id', volunteer_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });

    // Attach check_ins
    const scheduleIds = data.map(s => s.id);
    let checkIns = [];
    if (scheduleIds.length > 0) {
      const { data: ci } = await supabase.from('vol_check_ins').select('*').in('schedule_id', scheduleIds);
      checkIns = ci || [];
    }
    const result = data.map(s => ({ ...s, check_in: checkIns.find(c => c.schedule_id === s.id) || null }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar escalas' }); }
});

// ══════════════════════════════════════════════════════════════
// CHECK-INS
// ══════════════════════════════════════════════════════════════
router.get('/check-ins', async (req, res) => {
  try {
    const { service_id, volunteer_id, is_unscheduled } = req.query;
    let q = supabase.from('vol_check_ins').select('*, volunteer:vol_profiles(id, full_name), service:vol_services(id, name, scheduled_at)')
      .order('checked_in_at', { ascending: false });
    if (service_id) q = q.eq('service_id', service_id);
    if (volunteer_id) q = q.eq('volunteer_id', volunteer_id);
    if (is_unscheduled === 'true') q = q.eq('is_unscheduled', true);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar check-ins' }); }
});

router.post('/check-ins', async (req, res) => {
  try {
    const { schedule_id, volunteer_id, service_id, method, is_unscheduled } = req.body;
    if (!method) return res.status(400).json({ error: 'method obrigatorio' });

    // Auto-detectar "sem escala" se nao informado explicitamente:
    // - sem schedule_id vinculado E
    // - existe volunteer_id + service_id E
    // - nao ha escala no vol_schedules pra esse volunteer+service
    let resolvedUnscheduled = is_unscheduled;
    if (resolvedUnscheduled === undefined && !schedule_id && volunteer_id && service_id) {
      const { data: sched } = await supabase.from('vol_schedules')
        .select('id').eq('volunteer_id', volunteer_id).eq('service_id', service_id).maybeSingle();
      resolvedUnscheduled = !sched;
    }

    const { data, error } = await supabase.from('vol_check_ins')
      .insert({
        schedule_id: schedule_id || null,
        volunteer_id: volunteer_id || null,
        service_id: service_id || null,
        checked_in_by: req.user.userId,
        method,
        is_unscheduled: resolvedUnscheduled || false,
      }).select().single();

    if (error) {
      if (error.code === '23505') {
        // Fetch volunteer name from the existing check-in for a better UX message
        let volunteerName = null;
        let checkedInAt = null;
        let existingMethod = null;
        try {
          let existing = null;
          if (schedule_id) {
            const r = await supabase.from('vol_check_ins')
              .select('checked_in_at, method, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name)')
              .eq('schedule_id', schedule_id).maybeSingle();
            existing = r.data;
            volunteerName = existing?.volunteer?.full_name || existing?.schedule?.volunteer_name || null;
          } else if (volunteer_id && service_id) {
            const r = await supabase.from('vol_check_ins')
              .select('checked_in_at, method, volunteer:vol_profiles(full_name)')
              .eq('volunteer_id', volunteer_id).eq('service_id', service_id)
              .eq('is_unscheduled', true).maybeSingle();
            existing = r.data;
            volunteerName = existing?.volunteer?.full_name || null;
          }
          checkedInAt = existing?.checked_in_at || null;
          existingMethod = existing?.method || null;
          // Fallback: fetch name from vol_profiles if still null
          if (!volunteerName && volunteer_id) {
            const { data: v } = await supabase.from('vol_profiles').select('full_name').eq('id', volunteer_id).maybeSingle();
            volunteerName = v?.full_name || null;
          }
        } catch {}
        return res.status(409).json({
          error: 'Check-in ja foi realizado',
          alreadyCheckedIn: true,
          volunteerName,
          checkedInAt,
          method: existingMethod,
        });
      }
      return res.status(400).json({ error: error.message });
    }

    // Confirm schedule if pending
    if (schedule_id) {
      await supabase.from('vol_schedules')
        .update({ confirmation_status: 'confirmed' }).eq('id', schedule_id).eq('confirmation_status', 'pending');
    }

    res.json({ ...data, isUnscheduled: !!resolvedUnscheduled });
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar check-in' }); }
});

// Historico de check-ins do voluntario logado (self-service)
router.get('/my-check-ins', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { data: profile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!profile) return res.json([]);

    const { data, error } = await supabase.from('vol_check_ins')
      .select('id, checked_in_at, method, is_unscheduled, schedule_id, service:vol_services(id, name, scheduled_at)')
      .eq('volunteer_id', profile.id)
      .order('checked_in_at', { ascending: false })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[Vol] my-check-ins error:', e.message);
    res.status(500).json({ error: 'Erro ao listar meus check-ins' });
  }
});

// ══════════════════════════════════════════════════════════════
// QR CODE LOOKUP (scan)
// ══════════════════════════════════════════════════════════════
router.post('/qr-lookup', async (req, res) => {
  try {
    const { qr_code } = req.body;
    if (!qr_code) return res.status(400).json({ error: 'qr_code obrigatorio' });

    // Try profiles first
    const { data: profile } = await supabase.from('vol_profiles')
      .select('id, planning_center_id, full_name').eq('qr_code', qr_code).maybeSingle();

    let volunteerData;
    if (profile) {
      volunteerData = { type: 'profile', id: profile.id, planning_center_id: profile.planning_center_id, name: profile.full_name || 'Voluntario' };
    } else {
      const { data: vqr } = await supabase.from('vol_volunteer_qrcodes')
        .select('id, planning_center_person_id, volunteer_name').eq('qr_code', qr_code).maybeSingle();
      if (!vqr) return res.status(404).json({ error: 'Voluntario nao encontrado' });
      volunteerData = { type: 'volunteer_qrcode', id: null, planning_center_id: vqr.planning_center_person_id, name: vqr.volunteer_name };
    }

    // Find today's schedules
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    let scheduleQuery = supabase.from('vol_schedules').select('*, service:vol_services!inner(*)')
      .gte('service.scheduled_at', startOfDay).lt('service.scheduled_at', endOfDay);

    if (volunteerData.type === 'profile' && volunteerData.id) {
      scheduleQuery = scheduleQuery.or(`volunteer_id.eq.${volunteerData.id},planning_center_person_id.eq.${volunteerData.planning_center_id}`);
    } else if (volunteerData.planning_center_id) {
      scheduleQuery = scheduleQuery.eq('planning_center_person_id', volunteerData.planning_center_id);
    }

    const { data: schedules } = await scheduleQuery;

    const profileResult = { id: volunteerData.id, planning_center_id: volunteerData.planning_center_id, full_name: volunteerData.name, type: volunteerData.type };

    if (!schedules || schedules.length === 0) {
      return res.json({ profile: profileResult, isUnscheduled: true, volunteerName: volunteerData.name });
    }

    // Check existing check-ins
    const { data: existingCIs } = await supabase.from('vol_check_ins').select('schedule_id').in('schedule_id', schedules.map(s => s.id));
    const unchecked = schedules.find(s => !(existingCIs || []).some(c => c.schedule_id === s.id));

    if (!unchecked) return res.status(409).json({ error: 'Voluntario ja fez check-in em todas as escalas de hoje' });

    res.json({ schedule: unchecked, profile: profileResult, isUnscheduled: false, volunteerName: unchecked.volunteer_name });
  } catch (e) { console.error('[VOL] qr-lookup error:', e.message); res.status(500).json({ error: 'Erro ao buscar QR' }); }
});

// ══════════════════════════════════════════════════════════════
// VOLUNTEER QR CODES MANAGEMENT
// ══════════════════════════════════════════════════════════════
router.get('/volunteer-qrcodes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_volunteer_qrcodes').select('*').order('volunteer_name');
    if (error) return res.status(400).json({ error: error.message });
    // Also get profiles with qr_code
    const { data: profiles } = await supabase.from('vol_profiles').select('id, full_name, qr_code, avatar_url, planning_center_id, face_descriptor').not('qr_code', 'is', null);
    res.json({ qrcodes: data, profiles: profiles || [] });
  } catch (e) { res.status(500).json({ error: 'Erro ao listar QR codes' }); }
});

router.post('/volunteer-qrcodes', async (req, res) => {
  try {
    const { planning_center_person_id, volunteer_name, avatar_url } = req.body;
    if (!planning_center_person_id || !volunteer_name) return res.status(400).json({ error: 'Campos obrigatorios' });
    const { data, error } = await supabase.from('vol_volunteer_qrcodes')
      .upsert({ planning_center_person_id, volunteer_name, avatar_url: avatar_url || null },
        { onConflict: 'planning_center_person_id', ignoreDuplicates: false }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar QR code' }); }
});

// ══════════════════════════════════════════════════════════════
// FACE DESCRIPTORS
// ══════════════════════════════════════════════════════════════
router.post('/face/save-profile', async (req, res) => {
  try {
    const { profile_id, descriptor, photo_url } = req.body;
    if (!profile_id || !descriptor) return res.status(400).json({ error: 'profile_id e descriptor obrigatorios' });
    const { data, error } = await supabase.rpc('vol_save_profile_face_descriptor', {
      p_profile_id: profile_id, descriptor, photo_url: photo_url || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar face descriptor' }); }
});

router.post('/face/save-qrcode', async (req, res) => {
  try {
    const { qrcode_id, descriptor, photo_url } = req.body;
    if (!qrcode_id || !descriptor) return res.status(400).json({ error: 'qrcode_id e descriptor obrigatorios' });
    const { data, error } = await supabase.rpc('vol_save_qrcode_face_descriptor', {
      qrcode_id, descriptor, photo_url: photo_url || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar face descriptor' }); }
});

router.post('/face/match', async (req, res) => {
  try {
    const { descriptor, threshold } = req.body;
    if (!descriptor) return res.status(400).json({ error: 'descriptor obrigatorio' });
    const { data, error } = await supabase.rpc('vol_find_face_match', {
      query_descriptor: `[${descriptor.join(',')}]`, match_threshold: threshold || 0.6,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar face match' }); }
});

// ══════════════════════════════════════════════════════════════
// SELF CHECK-IN (public-ish — still requires auth)
// ══════════════════════════════════════════════════════════════
router.post('/self-checkin', async (req, res) => {
  try {
    const { serviceId, action, scheduleId, volunteerName, planningCenterId } = req.body;
    if (!serviceId) return res.status(400).json({ error: 'serviceId obrigatorio' });

    const { data: service } = await supabase.from('vol_services').select('id, name, scheduled_at').eq('id', serviceId).single();
    if (!service) return res.status(404).json({ error: 'Culto nao encontrado' });

    const serviceDate = new Date(service.scheduled_at);
    const today = new Date();
    if (serviceDate.toDateString() !== today.toDateString()) {
      return res.status(400).json({ error: 'Este culto nao e de hoje' });
    }

    // LIST action
    if (action === 'list') {
      const { data: schedules } = await supabase.from('vol_schedules')
        .select('id, volunteer_name, team_name, position_name, planning_center_person_id')
        .eq('service_id', serviceId).order('volunteer_name');
      const { data: checkIns } = await supabase.from('vol_check_ins').select('schedule_id').eq('service_id', serviceId);
      const checkedIds = new Set((checkIns || []).map(c => c.schedule_id));
      const result = (schedules || []).map(s => ({ ...s, has_checkin: checkedIds.has(s.id) }));
      return res.json({ serviceName: service.name, schedules: result });
    }

    // Scheduled check-in
    if (scheduleId) {
      const { data: existing } = await supabase.from('vol_check_ins').select('id').eq('schedule_id', scheduleId).maybeSingle();
      if (existing) return res.status(409).json({ error: 'Check-in ja realizado', alreadyCheckedIn: true });

      const { data: schedule } = await supabase.from('vol_schedules')
        .select('id, volunteer_id, volunteer_name, team_name, position_name').eq('id', scheduleId).single();
      if (!schedule) return res.status(404).json({ error: 'Escala nao encontrada' });

      const { error } = await supabase.from('vol_check_ins').insert({
        schedule_id: scheduleId, volunteer_id: schedule.volunteer_id, service_id: serviceId, method: 'self_service', is_unscheduled: false,
      });
      if (error) { if (error.code === '23505') return res.status(409).json({ error: 'Check-in ja realizado', alreadyCheckedIn: true }); throw error; }

      await supabase.from('vol_schedules').update({ confirmation_status: 'confirmed' }).eq('id', scheduleId).eq('confirmation_status', 'pending');
      return res.json({ success: true, volunteerName: schedule.volunteer_name, teamName: schedule.team_name, positionName: schedule.position_name });
    }

    // Unscheduled
    if (!volunteerName) return res.status(400).json({ error: 'volunteerName obrigatorio para check-in sem escala' });
    let volunteerId = null;
    if (planningCenterId) {
      const { data: prof } = await supabase.from('vol_profiles').select('id').eq('planning_center_id', planningCenterId).maybeSingle();
      if (prof) volunteerId = prof.id;
    }
    const { error } = await supabase.from('vol_check_ins').insert({
      volunteer_id: volunteerId, service_id: serviceId, method: 'self_service', is_unscheduled: true,
    });
    if (error) throw error;
    res.json({ success: true, volunteerName, isUnscheduled: true });
  } catch (e) { console.error('[VOL] self-checkin error:', e.message); res.status(500).json({ error: 'Erro no self-checkin' }); }
});

// ══════════════════════════════════════════════════════════════
// SYNC LOGS
// ══════════════════════════════════════════════════════════════
router.get('/sync-logs', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_sync_logs').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar sync logs' }); }
});

// ══════════════════════════════════════════════════════════════
// TRAINING CHECKINS
// ══════════════════════════════════════════════════════════════
router.get('/training-checkins', async (req, res) => {
  try {
    const { service_id } = req.query;
    let q = supabase.from('vol_training_checkins').select('*').order('created_at', { ascending: false });
    if (service_id) q = q.eq('service_id', service_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar training checkins' }); }
});

router.post('/training-checkins', async (req, res) => {
  try {
    const { service_id, volunteer_name, team_name, phone } = req.body;
    if (!volunteer_name || !team_name) return res.status(400).json({ error: 'volunteer_name e team_name obrigatorios' });
    const { data, error } = await supabase.from('vol_training_checkins')
      .insert({ service_id: service_id || null, volunteer_name, team_name, phone: phone || null, registered_by: req.user.userId }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar training checkin' }); }
});

// ══════════════════════════════════════════════════════════════
// TEAMS (unique names from schedules)
// ══════════════════════════════════════════════════════════════
router.get('/teams', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_schedules').select('team_name').not('team_name', 'is', null);
    if (error) return res.status(400).json({ error: error.message });
    const teams = new Set();
    (data || []).forEach(s => {
      if (s.team_name) s.team_name.split(',').forEach(t => { const trimmed = t.trim(); if (trimmed) teams.add(trimmed); });
    });
    res.json([...teams].sort());
  } catch (e) { res.status(500).json({ error: 'Erro ao listar equipes' }); }
});

// ══════════════════════════════════════════════════════════════
// PLANNING CENTER SEARCH/GET (proxy)
// ══════════════════════════════════════════════════════════════
router.post('/pc/search-people', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length < 2) return res.status(400).json({ error: 'Query minimo 2 caracteres' });
    const appId = process.env.PLANNING_CENTER_APP_ID;
    const secret = process.env.PLANNING_CENTER_SECRET;
    if (!appId || !secret) return res.status(500).json({ error: 'Planning Center nao configurado' });
    const auth = Buffer.from(`${appId}:${secret}`).toString('base64');
    const url = `https://api.planningcenteronline.com/people/v2/people?where[search_name_or_email]=${encodeURIComponent(query.trim())}&per_page=10`;
    const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!response.ok) return res.status(response.status).json({ error: 'Falha ao buscar no Planning Center' });
    const data = await response.json();
    const people = (data.data || []).map(p => ({
      id: p.id, full_name: `${p.attributes.first_name || ''} ${p.attributes.last_name || ''}`.trim(),
      first_name: p.attributes.first_name || '', last_name: p.attributes.last_name || '', avatar_url: p.attributes.avatar || null,
    }));
    res.json({ people });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar no PC' }); }
});

router.post('/pc/get-person', async (req, res) => {
  try {
    const { person_id } = req.body;
    if (!person_id) return res.status(400).json({ error: 'person_id obrigatorio' });
    const appId = process.env.PLANNING_CENTER_APP_ID;
    const secret = process.env.PLANNING_CENTER_SECRET;
    if (!appId || !secret) return res.status(500).json({ error: 'Planning Center nao configurado' });
    const auth = Buffer.from(`${appId}:${secret}`).toString('base64');
    const response = await fetch(`https://api.planningcenteronline.com/people/v2/people/${person_id}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) return res.status(response.status).json({ error: 'Falha ao buscar pessoa' });
    const data = await response.json();
    const p = data.data;
    res.json({ person: { id: p.id, full_name: `${p.attributes.first_name || ''} ${p.attributes.last_name || ''}`.trim(), avatar_url: p.attributes.avatar || null } });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar pessoa no PC' }); }
});

// ══════════════════════════════════════════════════════════════
// SERVICE TYPES (recurring service templates)
// ══════════════════════════════════════════════════════════════
router.get('/service-types', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_service_types').select('*').order('name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar tipos de culto' }); }
});

router.post('/service-types', async (req, res) => {
  try {
    const { name, description, recurrence_day, recurrence_time, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name obrigatorio' });
    const { data, error } = await supabase.from('vol_service_types')
      .insert({ name, description, recurrence_day, recurrence_time, color }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar tipo de culto' }); }
});

router.put('/service-types/:id', async (req, res) => {
  try {
    const { name, description, recurrence_day, recurrence_time, color, is_active } = req.body;
    const { data, error } = await supabase.from('vol_service_types')
      .update({ name, description, recurrence_day, recurrence_time, color, is_active })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar tipo de culto' }); }
});

router.delete('/service-types/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_service_types').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover tipo de culto' }); }
});

// Generate services from service type recurrence pattern
router.post('/service-types/:id/generate', async (req, res) => {
  try {
    const { weeks } = req.body; // How many weeks ahead to generate (default 4)
    const weeksAhead = weeks || 4;

    const { data: sType, error: stErr } = await supabase.from('vol_service_types')
      .select('*').eq('id', req.params.id).single();
    if (stErr || !sType) return res.status(404).json({ error: 'Tipo de culto nao encontrado' });
    if (sType.recurrence_day == null || !sType.recurrence_time) {
      return res.status(400).json({ error: 'Tipo de culto sem recorrencia configurada' });
    }

    const generated = [];
    const now = new Date();
    for (let w = 0; w < weeksAhead; w++) {
      const target = new Date(now);
      target.setDate(target.getDate() + ((sType.recurrence_day - target.getDay() + 7) % 7) + (w * 7));
      // Skip if in the past
      if (target < now && w === 0) {
        target.setDate(target.getDate() + 7);
      }
      const [hours, minutes] = sType.recurrence_time.split(':');
      target.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const scheduledAt = target.toISOString();
      // Check if service already exists for this date/type
      const dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).toISOString();
      const dayEnd = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1).toISOString();
      const { data: existing } = await supabase.from('vol_services')
        .select('id').eq('service_type_id', sType.id)
        .gte('scheduled_at', dayStart).lt('scheduled_at', dayEnd);
      if (existing && existing.length > 0) continue;

      const { data: svc, error: svcErr } = await supabase.from('vol_services')
        .insert({
          name: sType.name,
          service_type_name: sType.name,
          service_type_id: sType.id,
          scheduled_at: scheduledAt,
        }).select().single();
      if (!svcErr && svc) generated.push(svc);
    }
    res.json({ generated: generated.length, services: generated });
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar cultos' }); }
});

// ══════════════════════════════════════════════════════════════
// SERVICES — Manual creation/update/delete
// ══════════════════════════════════════════════════════════════
router.post('/services', async (req, res) => {
  try {
    const { name, service_type_name, service_type_id, scheduled_at } = req.body;
    if (!name || !scheduled_at) return res.status(400).json({ error: 'name e scheduled_at obrigatorios' });
    const { data, error } = await supabase.from('vol_services')
      .insert({ name, service_type_name, service_type_id, scheduled_at }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar culto' }); }
});

router.put('/services/:id', async (req, res) => {
  try {
    const { name, service_type_name, scheduled_at } = req.body;
    const { data, error } = await supabase.from('vol_services')
      .update({ name, service_type_name, scheduled_at }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar culto' }); }
});

router.delete('/services/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_services').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover culto' }); }
});

// ══════════════════════════════════════════════════════════════
// TEAMS (formal team management)
// ══════════════════════════════════════════════════════════════
router.get('/teams-manage', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_teams')
      .select('*, leader:vol_profiles!vol_teams_leader_profile_id_fkey(id, full_name, avatar_url), positions:vol_positions(*), members:vol_team_members(count)')
      .order('sort_order').order('name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar equipes' }); }
});

router.post('/teams-manage', async (req, res) => {
  try {
    const { name, description, color, leader_profile_id, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name obrigatorio' });
    const { data, error } = await supabase.from('vol_teams')
      .insert({ name, description, color, leader_profile_id, sort_order: sort_order || 0 }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar equipe' }); }
});

router.put('/teams-manage/:id', async (req, res) => {
  try {
    const { name, description, color, leader_profile_id, is_active, sort_order } = req.body;
    const { data, error } = await supabase.from('vol_teams')
      .update({ name, description, color, leader_profile_id, is_active, sort_order })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar equipe' }); }
});

router.delete('/teams-manage/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_teams').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover equipe' }); }
});

// ══════════════════════════════════════════════════════════════
// POSITIONS (within teams)
// ══════════════════════════════════════════════════════════════
router.get('/positions', async (req, res) => {
  try {
    const { team_id } = req.query;
    let q = supabase.from('vol_positions').select('*, team:vol_teams(id, name)').order('sort_order').order('name');
    if (team_id) q = q.eq('team_id', team_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar posicoes' }); }
});

router.post('/positions', async (req, res) => {
  try {
    const { team_id, name, description, min_volunteers, max_volunteers, sort_order } = req.body;
    if (!team_id || !name) return res.status(400).json({ error: 'team_id e name obrigatorios' });
    const { data, error } = await supabase.from('vol_positions')
      .insert({ team_id, name, description, min_volunteers, max_volunteers, sort_order: sort_order || 0 }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar posicao' }); }
});

router.put('/positions/:id', async (req, res) => {
  try {
    const { name, description, min_volunteers, max_volunteers, is_active, sort_order } = req.body;
    const { data, error } = await supabase.from('vol_positions')
      .update({ name, description, min_volunteers, max_volunteers, is_active, sort_order })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar posicao' }); }
});

router.delete('/positions/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_positions').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover posicao' }); }
});

// ══════════════════════════════════════════════════════════════
// TEAM MEMBERS (volunteer ↔ team assignments)
// ══════════════════════════════════════════════════════════════
router.get('/team-members', async (req, res) => {
  try {
    const { team_id } = req.query;
    let q = supabase.from('vol_team_members')
      .select('*, team:vol_teams(id, name, color), position:vol_positions(id, name), profile:vol_profiles(id, full_name, avatar_url, planning_center_id)')
      .eq('is_active', true).order('volunteer_name');
    if (team_id) q = q.eq('team_id', team_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar membros da equipe' }); }
});

router.post('/team-members', async (req, res) => {
  try {
    const { team_id, position_id, volunteer_profile_id, planning_center_person_id, volunteer_name } = req.body;
    if (!team_id || !volunteer_name) return res.status(400).json({ error: 'team_id e volunteer_name obrigatorios' });
    if (!volunteer_profile_id && !planning_center_person_id) {
      return res.status(400).json({ error: 'volunteer_profile_id ou planning_center_person_id obrigatorio' });
    }
    const { data, error } = await supabase.from('vol_team_members')
      .insert({ team_id, position_id, volunteer_profile_id, planning_center_person_id, volunteer_name })
      .select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Voluntario ja esta nesta equipe' });
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao adicionar membro a equipe' }); }
});

router.put('/team-members/:id', async (req, res) => {
  try {
    const { position_id, is_active } = req.body;
    const { data, error } = await supabase.from('vol_team_members')
      .update({ position_id, is_active }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar membro' }); }
});

router.delete('/team-members/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_team_members').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover membro da equipe' }); }
});

// ══════════════════════════════════════════════════════════════
// AVAILABILITY (volunteer unavailability dates)
// ══════════════════════════════════════════════════════════════
router.get('/availability', async (req, res) => {
  try {
    const { volunteer_profile_id, from, to } = req.query;
    let q = supabase.from('vol_availability').select('*').order('unavailable_from');
    if (volunteer_profile_id) q = q.eq('volunteer_profile_id', volunteer_profile_id);
    if (from) q = q.gte('unavailable_to', from);
    if (to) q = q.lte('unavailable_from', to);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar disponibilidade' }); }
});

router.post('/availability', async (req, res) => {
  try {
    const { volunteer_profile_id, planning_center_person_id, unavailable_from, unavailable_to, reason } = req.body;
    if (!unavailable_from || !unavailable_to) return res.status(400).json({ error: 'Datas obrigatorias' });
    if (!volunteer_profile_id && !planning_center_person_id) {
      return res.status(400).json({ error: 'volunteer_profile_id ou planning_center_person_id obrigatorio' });
    }
    const { data, error } = await supabase.from('vol_availability')
      .insert({ volunteer_profile_id, planning_center_person_id, unavailable_from, unavailable_to, reason })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar indisponibilidade' }); }
});

router.delete('/availability/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_availability').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover indisponibilidade' }); }
});

// ══════════════════════════════════════════════════════════════
// SCHEDULE MANAGEMENT (CRUD for schedules)
// ══════════════════════════════════════════════════════════════

// Create a schedule entry (assign volunteer to service)
router.post('/schedules', async (req, res) => {
  try {
    const { service_id, volunteer_id, volunteer_name, team_id, team_name, position_id, position_name, planning_center_person_id, notes } = req.body;
    if (!service_id || !volunteer_name) return res.status(400).json({ error: 'service_id e volunteer_name obrigatorios' });

    const { data, error } = await supabase.from('vol_schedules')
      .insert({
        service_id,
        volunteer_id: volunteer_id || null,
        volunteer_name,
        team_id: team_id || null,
        team_name: team_name || null,
        position_id: position_id || null,
        position_name: position_name || null,
        planning_center_person_id: planning_center_person_id || null,
        confirmation_status: 'pending',
        source: 'manual',
        notes: notes || null,
      }).select().single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Voluntario ja escalado neste culto' });
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar escala' }); }
});

// Update schedule entry
router.put('/schedules/:id', async (req, res) => {
  try {
    const { team_id, team_name, position_id, position_name, confirmation_status, notes } = req.body;
    const updates = {};
    if (team_id !== undefined) updates.team_id = team_id;
    if (team_name !== undefined) updates.team_name = team_name;
    if (position_id !== undefined) updates.position_id = position_id;
    if (position_name !== undefined) updates.position_name = position_name;
    if (confirmation_status !== undefined) updates.confirmation_status = confirmation_status;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabase.from('vol_schedules')
      .update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar escala' }); }
});

// Delete schedule entry
router.delete('/schedules/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('vol_schedules').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover escala' }); }
});

// Bulk schedule — assign multiple volunteers to a service at once
router.post('/schedules/bulk', async (req, res) => {
  try {
    const { service_id, assignments } = req.body;
    if (!service_id || !Array.isArray(assignments) || !assignments.length) {
      return res.status(400).json({ error: 'service_id e assignments[] obrigatorios' });
    }

    const rows = assignments.map(a => ({
      service_id,
      volunteer_id: a.volunteer_id || null,
      volunteer_name: a.volunteer_name,
      team_id: a.team_id || null,
      team_name: a.team_name || null,
      position_id: a.position_id || null,
      position_name: a.position_name || null,
      planning_center_person_id: a.planning_center_person_id || null,
      confirmation_status: 'pending',
      source: a.source || 'manual',
      notes: a.notes || null,
    }));

    const { data, error } = await supabase.from('vol_schedules')
      .upsert(rows, { onConflict: 'service_id,planning_center_person_id', ignoreDuplicates: true })
      .select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ created: data.length, schedules: data });
  } catch (e) { res.status(500).json({ error: 'Erro ao criar escalas em lote' }); }
});

// Copy schedules from one service to another
router.post('/schedules/copy', async (req, res) => {
  try {
    const { from_service_id, to_service_id } = req.body;
    if (!from_service_id || !to_service_id) {
      return res.status(400).json({ error: 'from_service_id e to_service_id obrigatorios' });
    }

    const { data: source } = await supabase.from('vol_schedules')
      .select('*').eq('service_id', from_service_id);
    if (!source || !source.length) return res.status(404).json({ error: 'Nenhuma escala encontrada no culto de origem' });

    const rows = source.map(s => ({
      service_id: to_service_id,
      volunteer_id: s.volunteer_id,
      volunteer_name: s.volunteer_name,
      team_id: s.team_id,
      team_name: s.team_name,
      position_id: s.position_id,
      position_name: s.position_name,
      planning_center_person_id: s.planning_center_person_id,
      confirmation_status: 'pending',
      source: 'manual',
    }));

    const { data, error } = await supabase.from('vol_schedules')
      .insert(rows).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ copied: data.length, schedules: data });
  } catch (e) { res.status(500).json({ error: 'Erro ao copiar escalas' }); }
});

// Auto-fill schedule from team roster with rotation
router.post('/schedules/auto-fill', async (req, res) => {
  try {
    const { service_id, team_id } = req.body;
    if (!service_id || !team_id) return res.status(400).json({ error: 'service_id e team_id obrigatorios' });

    // Get service date
    const { data: service } = await supabase.from('vol_services')
      .select('scheduled_at').eq('id', service_id).single();
    if (!service) return res.status(404).json({ error: 'Culto nao encontrado' });

    const serviceDate = new Date(service.scheduled_at).toISOString().split('T')[0];

    // Get team members
    const { data: members } = await supabase.from('vol_team_members')
      .select('*, position:vol_positions(id, name)')
      .eq('team_id', team_id).eq('is_active', true);
    if (!members || !members.length) return res.status(404).json({ error: 'Nenhum membro ativo na equipe' });

    // Get team info
    const { data: team } = await supabase.from('vol_teams')
      .select('name').eq('id', team_id).single();

    // Check availability — exclude unavailable volunteers
    const { data: unavailable } = await supabase.from('vol_availability')
      .select('volunteer_profile_id, planning_center_person_id')
      .lte('unavailable_from', serviceDate)
      .gte('unavailable_to', serviceDate);

    const unavailableIds = new Set(
      (unavailable || []).map(u => u.volunteer_profile_id || u.planning_center_person_id)
    );

    // Check who's already scheduled for this service
    const { data: existing } = await supabase.from('vol_schedules')
      .select('volunteer_id, planning_center_person_id').eq('service_id', service_id);
    const alreadyScheduled = new Set(
      (existing || []).map(e => e.volunteer_id || e.planning_center_person_id)
    );

    // Get recent schedule counts for rotation (last 4 weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const { data: recentSchedules } = await supabase.from('vol_schedules')
      .select('volunteer_id, planning_center_person_id, service:vol_services!inner(scheduled_at)')
      .eq('team_name', team?.name)
      .gte('service.scheduled_at', fourWeeksAgo.toISOString());

    const scheduleCount = new Map();
    (recentSchedules || []).forEach(s => {
      const key = s.volunteer_id || s.planning_center_person_id;
      scheduleCount.set(key, (scheduleCount.get(key) || 0) + 1);
    });

    // Filter available members and sort by least recently scheduled (rotation)
    const available = members.filter(m => {
      const id = m.volunteer_profile_id || m.planning_center_person_id;
      return !unavailableIds.has(id) && !alreadyScheduled.has(id);
    }).sort((a, b) => {
      const countA = scheduleCount.get(a.volunteer_profile_id || a.planning_center_person_id) || 0;
      const countB = scheduleCount.get(b.volunteer_profile_id || b.planning_center_person_id) || 0;
      return countA - countB;
    });

    if (!available.length) return res.json({ created: 0, schedules: [], message: 'Todos os membros estao indisponiveis ou ja escalados' });

    const rows = available.map(m => ({
      service_id,
      volunteer_id: m.volunteer_profile_id || null,
      volunteer_name: m.volunteer_name,
      team_id,
      team_name: team?.name || null,
      position_id: m.position_id || null,
      position_name: m.position?.name || null,
      planning_center_person_id: m.planning_center_person_id || null,
      confirmation_status: 'pending',
      source: 'auto_rotation',
    }));

    const { data: created, error } = await supabase.from('vol_schedules')
      .insert(rows).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ created: created.length, schedules: created });
  } catch (e) { res.status(500).json({ error: 'Erro ao auto-preencher escala' }); }
});

// Import teams from existing schedule data (migration helper)
router.post('/teams-manage/import-from-schedules', async (req, res) => {
  try {
    // Extract unique team names from vol_schedules
    const { data: schedData } = await supabase.from('vol_schedules')
      .select('team_name').not('team_name', 'is', null);
    const teamNames = new Set();
    (schedData || []).forEach(s => {
      if (s.team_name) s.team_name.split(',').forEach(t => { const trimmed = t.trim(); if (trimmed) teamNames.add(trimmed); });
    });

    const created = [];
    for (const name of teamNames) {
      const { data, error } = await supabase.from('vol_teams')
        .upsert({ name }, { onConflict: 'name', ignoreDuplicates: true }).select().single();
      if (data && !error) created.push(data);
    }
    res.json({ imported: created.length, teams: created });
  } catch (e) { res.status(500).json({ error: 'Erro ao importar equipes' }); }
});

module.exports = router;
