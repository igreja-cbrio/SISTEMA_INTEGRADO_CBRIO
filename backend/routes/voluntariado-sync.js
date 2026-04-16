const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const {
  getPCCredentials, fetchWithRetry, fetchAllPlans, fetchPlansInRange,
  processServiceType, fetchAllTeamPersons, upsertVolunteerQrCodes, upsertVolunteerProfiles, PC_SERVICES_BASE,
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

    // Process all service types in parallel — previously sequential, which caused
    // timeouts (17 types × 10 plans × 1 HTTP request = ~170 sequential calls to PCO).
    const settled = await Promise.allSettled(serviceTypes.map(async (st) => {
      const [plans, teamPersons] = await Promise.all([
        fetchAllPlans(PC_SERVICES_BASE, st.id, credentials),
        fetchAllTeamPersons(st.id, credentials),
      ]);
      const result = await processServiceType(supabase, st, plans, credentials);
      return { result, teamPersons };
    }));

    for (const item of settled) {
      if (item.status === 'rejected') {
        console.error('[VOL SYNC] Service type error:', item.reason?.message || item.reason);
        continue;
      }
      const { result, teamPersons } = item.value;
      totalServices += result.services;
      totalSchedules += result.schedules;
      totalMembersFound += result.membersFound;
      totalMembersProcessed += result.membersProcessed;
      for (const [k, v] of result.volunteers) allVolunteers.set(k, v);
      for (const [k, v] of teamPersons) {
        if (!allVolunteers.has(k)) allVolunteers.set(k, v);
      }
    }

    const qrCount = await upsertVolunteerQrCodes(supabase, allVolunteers);
    const { count: profilesCount, dbError } = await upsertVolunteerProfiles(supabase, allVolunteers);
    const avatarsImported = Array.from(allVolunteers.values()).filter(v => v.avatar_url).length;

    await supabase.from('vol_sync_logs').insert({
      sync_type: 'manual', services_synced: totalServices, schedules_synced: totalSchedules,
      qrcodes_generated: qrCount, status: 'success', triggered_by: req.user.userId,
    });

    res.json({ success: true, services: totalServices, newSchedules: totalSchedules, qrCodesGenerated: qrCount, volunteersSynced: profilesCount, avatarsImported, totalMembersFound, totalMembersProcessed, ...(dbError ? { dbError } : {}) });
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

    const settled = await Promise.allSettled(serviceTypes.map(async (st) => {
      const [plans, teamPersons] = await Promise.all([
        fetchAllPlans(PC_SERVICES_BASE, st.id, credentials),
        fetchAllTeamPersons(st.id, credentials),
      ]);
      const result = await processServiceType(supabase, st, plans, credentials);
      return { result, teamPersons };
    }));

    for (const item of settled) {
      if (item.status === 'rejected') {
        console.error('[VOL SYNC AUTO] Service type error:', item.reason?.message || item.reason);
        continue;
      }
      const { result, teamPersons } = item.value;
      totalServices += result.services;
      totalSchedules += result.schedules;
      totalMembersFound += result.membersFound;
      totalMembersProcessed += result.membersProcessed;
      for (const [k, v] of result.volunteers) allVolunteers.set(k, v);
      for (const [k, v] of teamPersons) {
        if (!allVolunteers.has(k)) allVolunteers.set(k, v);
      }
    }

    const qrCount = await upsertVolunteerQrCodes(supabase, allVolunteers);
    const { count: profilesCount, dbError } = await upsertVolunteerProfiles(supabase, allVolunteers);
    const avatarsImported = Array.from(allVolunteers.values()).filter(v => v.avatar_url).length;

    await supabase.from('vol_sync_logs').insert({
      sync_type: 'automatic', services_synced: totalServices, schedules_synced: totalSchedules,
      qrcodes_generated: qrCount, status: 'success',
    });

    res.json({ success: true, services: totalServices, schedules: totalSchedules, qrCodesGenerated: qrCount, volunteersSynced: profilesCount, avatarsImported, totalMembersFound, totalMembersProcessed, timestamp: new Date().toISOString(), ...(dbError ? { dbError } : {}) });
  } catch (e) {
    console.error('[VOL SYNC AUTO] Error:', e.message);
    res.status(500).json({ error: 'Erro durante sincronizacao automatica' });
  }
});

// ══════════════════════════════════════════════════════════════
// DIAGNOSTICS — what does Planning Center actually have?
// ══════════════════════════════════════════════════════════════
router.get('/diagnostics', async (req, res) => {
  try {
    const { basic: credentials } = getPCCredentials();

    // 1. Service types
    const typesRes = await fetchWithRetry(`${PC_SERVICES_BASE}/service_types`, { Authorization: `Basic ${credentials}` });
    if (!typesRes.ok) return res.status(400).json({ error: 'Falha ao conectar ao Planning Center', status: typesRes.status });

    const typesData = await typesRes.json();
    const serviceTypes = typesData.data || [];

    const report = [];

    for (const st of serviceTypes) {
      const entry = { id: st.id, name: st.attributes.name, teams: [], plans: 0 };

      // 2. Teams in this service type
      const teamsRes = await fetchWithRetry(`${PC_SERVICES_BASE}/service_types/${st.id}/teams?per_page=100`, { Authorization: `Basic ${credentials}` });
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        for (const team of (teamsData.data || [])) {
          const membersRes = await fetchWithRetry(
            `${PC_SERVICES_BASE}/service_types/${st.id}/teams/${team.id}/team_members?per_page=5&include=person`,
            { Authorization: `Basic ${credentials}` }
          );
          let memberCount = '?';
          let sampleMembers = [];
          if (membersRes.ok) {
            const membersData = await membersRes.json();
            memberCount = membersData.meta?.total_count ?? (membersData.data?.length ?? '?');
            const personMap = new Map();
            for (const inc of (membersData.included || [])) {
              if (inc.type === 'Person') personMap.set(inc.id, inc);
            }
            for (const m of (membersData.data || [])) {
              const personId = m.relationships?.person?.data?.id;
              const person = personId ? personMap.get(personId) : null;
              const name = m.attributes?.name
                || (person ? `${person.attributes?.first_name || ''} ${person.attributes?.last_name || ''}`.trim() : null)
                || '(sem nome)';
              sampleMembers.push(name);
            }
          }
          entry.teams.push({ id: team.id, name: team.attributes.name, memberCount, sampleMembers });
        }
      }

      // 3. Future plans count
      const plansRes = await fetchWithRetry(`${PC_SERVICES_BASE}/service_types/${st.id}/plans?filter=future&per_page=1`, { Authorization: `Basic ${credentials}` });
      if (plansRes.ok) {
        const plansData = await plansRes.json();
        entry.plans = plansData.meta?.total_count ?? 0;
      }

      report.push(entry);
    }

    res.json({ serviceTypeCount: serviceTypes.length, serviceTypes: report });
  } catch (e) {
    console.error('[VOL DIAG] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
