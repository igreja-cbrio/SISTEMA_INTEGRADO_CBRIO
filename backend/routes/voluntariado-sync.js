const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const {
  getPCCredentials, fetchWithRetry, fetchAllPlans, fetchPlansInRange,
  processServiceType, upsertVolunteerQrCodes, upsertVolunteerProfiles, PC_SERVICES_BASE,
} = require('../services/planningCenter');

// Sync do Planning Center e operacoes administrativas pesadas — apenas admin/diretor.
router.use(authenticate, authorize('admin', 'diretor'));

// ══════════════════════════════════════════════════════════════
// SYNC — MANUAL (future + recent past)
// ══════════════════════════════════════════════════════════════
router.post('/sync', async (req, res) => {
  try {
    const { basic: credentials } = getPCCredentials();

    const testRes = await fetchWithRetry(`${PC_SERVICES_BASE}/service_types`, { Authorization: `Basic ${credentials}` });
    if (!testRes.ok) return res.status(400).json({ error: 'Falha ao conectar ao Planning Center' });

    const typesData = await testRes.json();
    const serviceTypes = typesData.data || [];
    console.log(`[VOL SYNC] Found ${serviceTypes.length} service types`);

    let totalServices = 0, totalSchedules = 0, totalMembersFound = 0, totalMembersProcessed = 0;
    const allVolunteers = new Map();

    for (const st of serviceTypes) {
      const plans = await fetchAllPlans(PC_SERVICES_BASE, st.id, credentials);
      const result = await processServiceType(supabase, st, plans, credentials);
      totalServices += result.services;
      totalSchedules += result.schedules;
      totalMembersFound += result.membersFound;
      totalMembersProcessed += result.membersProcessed;
      for (const [k, v] of result.volunteers) allVolunteers.set(k, v);
    }

    const qrCount = await upsertVolunteerQrCodes(supabase, allVolunteers);
    const profilesCount = await upsertVolunteerProfiles(supabase, allVolunteers);
    const avatarsImported = Array.from(allVolunteers.values()).filter(v => v.avatar_url).length;

    await supabase.from('vol_sync_logs').insert({
      sync_type: 'manual', services_synced: totalServices, schedules_synced: totalSchedules,
      qrcodes_generated: qrCount, status: 'success', triggered_by: req.user.userId,
    });

    res.json({ success: true, services: totalServices, newSchedules: totalSchedules, qrCodesGenerated: qrCount, volunteersSynced: profilesCount, avatarsImported, totalMembersFound, totalMembersProcessed });
  } catch (e) {
    console.error('[VOL SYNC] Error:', e.message);
    res.status(500).json({ error: 'Erro durante sincronizacao' });
  }
});

// ══════════════════════════════════════════════════════════════
// SYNC — HISTORICAL (date range)
// ══════════════════════════════════════════════════════════════
router.post('/sync-historical', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate e endDate obrigatorios' });

    const { basic: credentials } = getPCCredentials();

    const typesRes = await fetchWithRetry(`${PC_SERVICES_BASE}/service_types`, { Authorization: `Basic ${credentials}` });
    if (!typesRes.ok) return res.status(400).json({ error: 'Falha ao conectar ao Planning Center' });

    const typesData = await typesRes.json();
    const serviceTypes = typesData.data || [];

    let totalServices = 0, totalSchedules = 0;
    const allVolunteers = new Map();

    for (const st of serviceTypes) {
      const plans = await fetchPlansInRange(PC_SERVICES_BASE, st.id, credentials, startDate, endDate);
      const result = await processServiceType(supabase, st, plans, credentials);
      totalServices += result.services;
      totalSchedules += result.schedules;
      for (const [k, v] of result.volunteers) allVolunteers.set(k, v);
    }

    const qrCount = await upsertVolunteerQrCodes(supabase, allVolunteers);
    const profilesCount = await upsertVolunteerProfiles(supabase, allVolunteers);

    await supabase.from('vol_sync_logs').insert({
      sync_type: 'historical', services_synced: totalServices, schedules_synced: totalSchedules,
      qrcodes_generated: qrCount, status: 'success', triggered_by: req.user.userId,
    });

    res.json({ success: true, services: totalServices, schedules: totalSchedules, qrCodesGenerated: qrCount, volunteersSynced: profilesCount });
  } catch (e) {
    console.error('[VOL SYNC HIST] Error:', e.message);
    res.status(500).json({ error: 'Erro durante sincronizacao historica' });
  }
});

// ══════════════════════════════════════════════════════════════
// SYNC — AUTO (for cron job)
// ══════════════════════════════════════════════════════════════
router.post('/sync-auto', async (req, res) => {
  try {
    // Accept CRON_SECRET as alternative auth
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers['x-cron-secret'];
    if (cronSecret && authHeader === cronSecret) {
      // OK — cron authorized
    }
    // Otherwise normal auth already validated by middleware

    const { basic: credentials } = getPCCredentials();
    const testRes = await fetchWithRetry(`${PC_SERVICES_BASE}/service_types`, { Authorization: `Basic ${credentials}` });
    if (!testRes.ok) return res.status(400).json({ error: 'Falha ao conectar ao Planning Center' });

    const typesData = await testRes.json();
    const serviceTypes = typesData.data || [];

    let totalServices = 0, totalSchedules = 0, totalMembersFound = 0, totalMembersProcessed = 0;
    const allVolunteers = new Map();

    for (const st of serviceTypes) {
      const plans = await fetchAllPlans(PC_SERVICES_BASE, st.id, credentials);
      const result = await processServiceType(supabase, st, plans, credentials);
      totalServices += result.services;
      totalSchedules += result.schedules;
      totalMembersFound += result.membersFound;
      totalMembersProcessed += result.membersProcessed;
      for (const [k, v] of result.volunteers) allVolunteers.set(k, v);
    }

    const qrCount = await upsertVolunteerQrCodes(supabase, allVolunteers);
    const profilesCount = await upsertVolunteerProfiles(supabase, allVolunteers);
    const avatarsImported = Array.from(allVolunteers.values()).filter(v => v.avatar_url).length;

    await supabase.from('vol_sync_logs').insert({
      sync_type: 'automatic', services_synced: totalServices, schedules_synced: totalSchedules,
      qrcodes_generated: qrCount, status: 'success',
    });

    res.json({ success: true, services: totalServices, schedules: totalSchedules, qrCodesGenerated: qrCount, volunteersSynced: profilesCount, avatarsImported, totalMembersFound, totalMembersProcessed, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('[VOL SYNC AUTO] Error:', e.message);
    res.status(500).json({ error: 'Erro durante sincronizacao automatica' });
  }
});

module.exports = router;
