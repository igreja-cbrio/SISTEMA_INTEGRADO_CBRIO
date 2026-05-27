const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const {
  getPCCredentials, fetchWithRetry, fetchAllPlans,
  processServiceType, fetchAllTeamPersons, upsertVolunteerQrCodes, upsertVolunteerProfiles, PC_SERVICES_BASE,
  fetchAllServiceTypes,
} = require('../services/planningCenter');

// Sync do Planning Center e operacoes administrativas pesadas — apenas admin/diretor.
router.use(authenticate, authorize('admin', 'diretor'));

// ══════════════════════════════════════════════════════════════
// SYNC — MANUAL
// Estrategia dupla:
//   1. fetchAllPlans  → 5 cultos futuros + 3 passados (para escalas/check-in)
//   2. fetchAllTeamPersons → todas as pessoas das equipes (para vol_profiles)
// ══════════════════════════════════════════════════════════════
router.post('/sync', async (req, res) => {
  try {
    const { basic: credentials } = getPCCredentials();

    const serviceTypes = await fetchAllServiceTypes(credentials);
    if (!serviceTypes.length) return res.status(400).json({ error: 'Falha ao conectar ao Planning Center ou nenhum tipo encontrado' });
    console.log(`[VOL SYNC] Found ${serviceTypes.length} service types`);

    let totalServices = 0, totalSchedules = 0, totalMembersFound = 0, totalMembersProcessed = 0;
    const allVolunteers = new Map();

    // All service types in parallel
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
      // teamPersons complementa com quem nao aparece nos planos recentes
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
// DIAGNOSTICO — por que schedules_synced = 0?
// Replica o caminho de escalas do sync pra UM dia (default hoje) e
// retorna o status cru da API do PCO + contagem de team_members por
// plano. Read-only · nao grava nada. Igual padrao do pco-cpf-check.
// ══════════════════════════════════════════════════════════════
router.get('/pco-schedule-debug', async (req, res) => {
  try {
    const alvo = req.query.data || new Date().toISOString().slice(0, 10); // yyyy-MM-dd
    const { basic: credentials } = getPCCredentials();
    const serviceTypes = await fetchAllServiceTypes(credentials);
    if (!serviceTypes.length) {
      return res.status(400).json({ error: 'Sem service types · token PCO sem escopo Services?' });
    }

    const headers = { Authorization: `Basic ${credentials}` };
    const resultado = [];

    for (const st of serviceTypes) {
      const plans = await fetchAllPlans(PC_SERVICES_BASE, st.id, credentials);
      const planosDoDia = (plans || []).filter((p) => {
        const d = (p.attributes?.sort_date || '').slice(0, 10);
        return d === alvo;
      });
      if (!planosDoDia.length) continue;

      for (const plan of planosDoDia) {
        const url = `${PC_SERVICES_BASE}/service_types/${st.id}/plans/${plan.id}/team_members?per_page=10&include=person`;
        let httpStatus = null, memberCount = null, sample = null, bodySample = null;
        try {
          const r = await fetchWithRetry(url, headers);
          httpStatus = r.status;
          if (r.ok) {
            const d = await r.json();
            memberCount = (d.data || []).length;
            const m = d.data?.[0];
            if (m) {
              sample = {
                name: m.attributes?.name || null,
                status: m.attributes?.status || null,
                team_position: m.attributes?.team_position_name || null,
                tem_person_rel: !!m.relationships?.person?.data?.id,
                tem_person_include: (d.included || []).some((i) => i.type === 'Person'),
              };
            }
          } else {
            bodySample = (await r.text().catch(() => '')).slice(0, 300);
          }
        } catch (e) {
          bodySample = e.message;
        }

        resultado.push({
          service_type: st.attributes?.name,
          service_type_id: st.id,
          plan_id: plan.id,
          plan_date: plan.attributes?.sort_date,
          plan_title: plan.attributes?.title,
          team_members_http_status: httpStatus,
          team_members_count: memberCount,
          sample_member: sample,
          error_body: bodySample,
        });
      }
    }

    res.json({
      data_alvo: alvo,
      total_planos_no_dia: resultado.length,
      diagnostico: resultado,
      leitura: resultado.length === 0
        ? 'Nenhum plano do PCO nessa data · confira se a escala foi montada no Planning Center pra esse dia/tipo de culto.'
        : 'Se team_members_count=0 com http 200 → escala vazia no PCO. Se http 403/401 → escopo do token. Se count>0 → bug no processamento (upsert).',
    });
  } catch (e) {
    console.error('[VOL SYNC] pco-schedule-debug:', e.message);
    res.status(500).json({ error: e.message });
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

    const serviceTypes = await fetchAllServiceTypes(credentials);
    if (!serviceTypes.length) return res.status(400).json({ error: 'Falha ao conectar ao Planning Center ou nenhum tipo encontrado' });

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
    const serviceTypes = await fetchAllServiceTypes(credentials);
    if (!serviceTypes.length) return res.status(400).json({ error: 'Falha ao conectar ao Planning Center ou nenhum tipo encontrado' });

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

    // 1. Service types (paginated)
    const serviceTypes = await fetchAllServiceTypes(credentials);
    if (!serviceTypes.length) return res.status(400).json({ error: 'Falha ao conectar ao Planning Center ou nenhum tipo encontrado' });

    const report = [];

    for (const st of serviceTypes) {
      const entry = { id: st.id, name: st.attributes.name, teams: [], plans: 0, plans_in_window: 0, total_team_members: 0 };

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
            if (typeof memberCount === 'number') entry.total_team_members += memberCount;
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

      // 3. Future plans count (total no PC)
      const plansRes = await fetchWithRetry(`${PC_SERVICES_BASE}/service_types/${st.id}/plans?filter=future&per_page=1`, { Authorization: `Basic ${credentials}` });
      if (plansRes.ok) {
        const plansData = await plansRes.json();
        entry.plans = plansData.meta?.total_count ?? 0;
      }

      // 4. Plans dentro da janela operacional usada pelo sync (-7d / +60d)
      try {
        const janela = await fetchAllPlans(PC_SERVICES_BASE, st.id, credentials);
        entry.plans_in_window = janela.length;
      } catch (e) {
        entry.plans_in_window_error = e.message;
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
