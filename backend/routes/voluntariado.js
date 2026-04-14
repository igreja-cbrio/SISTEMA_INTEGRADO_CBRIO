const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate, authorizeModule('membresia', 1));

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

    const { data, error } = await supabase.from('vol_check_ins')
      .insert({
        schedule_id: schedule_id || null,
        volunteer_id: volunteer_id || null,
        service_id: service_id || null,
        checked_in_by: req.user.userId,
        method,
        is_unscheduled: is_unscheduled || false,
      }).select().single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Check-in ja foi realizado', alreadyCheckedIn: true });
      return res.status(400).json({ error: error.message });
    }

    // Confirm schedule if pending
    if (schedule_id) {
      await supabase.from('vol_schedules')
        .update({ confirmation_status: 'confirmed' }).eq('id', schedule_id).eq('confirmation_status', 'pending');
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar check-in' }); }
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

module.exports = router;
