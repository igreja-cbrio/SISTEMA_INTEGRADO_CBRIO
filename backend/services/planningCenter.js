/**
 * Planning Center API helper — shared logic for voluntariado sync operations.
 *
 * Provides:
 *  - fetchWithRetry (rate-limit + server-error resilience)
 *  - fetchAllTeamMembers (paginated)
 *  - fetchAllPlans (future + recent past, deduplicated)
 *  - fetchPlansInRange (historical date range)
 *  - processServiceType (sync a single service type → services + schedules)
 *  - STATUS_MAP / STATUS_PRIORITY
 */

const STATUS_PRIORITY = { confirmed: 4, scheduled: 3, pending: 2, unknown: 1, declined: 0 };
const STATUS_MAP = { C: 'confirmed', U: 'pending', D: 'declined', S: 'scheduled', P: 'pending', N: 'pending' };

function getPCCredentials() {
  const appId = process.env.PLANNING_CENTER_APP_ID;
  const secret = process.env.PLANNING_CENTER_SECRET;
  if (!appId || !secret) throw new Error('Planning Center credentials not configured');
  return { appId, secret, basic: Buffer.from(`${appId}:${secret}`).toString('base64') };
}

const PC_SERVICES_BASE = 'https://api.planningcenteronline.com/services/v2';
const PC_PEOPLE_BASE = 'https://api.planningcenteronline.com/people/v2';

// ── Retry with exponential backoff ──────────────────────────────────────────
async function fetchWithRetry(url, headers, maxRetries = 3) {
  let lastResponse = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, { headers });
    lastResponse = response;
    if (response.ok) return response;
    if (response.status === 429) {
      const wait = Math.pow(2, attempt) * 1000;
      console.warn(`[PC Retry] 429 — waiting ${wait}ms (${attempt}/${maxRetries})`);
      await new Promise(r => setTimeout(r, wait));
    } else if (response.status >= 500) {
      const wait = attempt * 1000;
      console.warn(`[PC Retry] ${response.status} — waiting ${wait}ms (${attempt}/${maxRetries})`);
      await new Promise(r => setTimeout(r, wait));
    } else {
      break;
    }
  }
  return lastResponse;
}

// ── Paginated team members ──────────────────────────────────────────────────
async function fetchAllTeamMembers(baseUrl, serviceTypeId, planId, credentials) {
  const allMembers = [];
  const allIncluded = [];
  let offset = 0;
  const perPage = 100;
  let pageCount = 0;
  while (true) {
    const url = `${baseUrl}/service_types/${serviceTypeId}/plans/${planId}/team_members?per_page=${perPage}&offset=${offset}&include=person`;
    const response = await fetchWithRetry(url, { Authorization: `Basic ${credentials}` });
    if (!response.ok) break;
    const data = await response.json();
    pageCount++;
    if (data.data) allMembers.push(...data.data);
    if (data.included) allIncluded.push(...data.included);
    if (!data.data || data.data.length < perPage || pageCount >= 50) break;
    offset += perPage;
  }
  return { data: allMembers, included: allIncluded, meta: { total_count: allMembers.length } };
}

// ── Future + recent past plans (deduplicated) ───────────────────────────────
async function fetchAllPlans(baseUrl, serviceTypeId, credentials) {
  const headers = { Authorization: `Basic ${credentials}` };
  const planMap = new Map();

  const futureRes = await fetchWithRetry(`${baseUrl}/service_types/${serviceTypeId}/plans?filter=future&per_page=5`, headers);
  if (futureRes.ok) {
    const d = await futureRes.json();
    for (const p of d.data || []) planMap.set(p.id, p);
  }

  const pastRes = await fetchWithRetry(`${baseUrl}/service_types/${serviceTypeId}/plans?filter=past&per_page=3&order=-sort_date`, headers);
  if (pastRes.ok) {
    const d = await pastRes.json();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    for (const p of d.data || []) {
      if (new Date(p.attributes.sort_date) >= threeDaysAgo) planMap.set(p.id, p);
    }
  }

  return Array.from(planMap.values());
}

// ── Historical plans in a date range ────────────────────────────────────────
async function fetchPlansInRange(baseUrl, serviceTypeId, credentials, startDate, endDate) {
  const headers = { Authorization: `Basic ${credentials}` };
  const allPlans = [];
  let offset = 0;
  const perPage = 25;
  let pageCount = 0;
  while (true) {
    const url = `${baseUrl}/service_types/${serviceTypeId}/plans?filter=after,before&after=${startDate}&before=${endDate}&per_page=${perPage}&offset=${offset}&order=sort_date`;
    const response = await fetchWithRetry(url, headers);
    if (!response.ok) break;
    const data = await response.json();
    pageCount++;
    allPlans.push(...(data.data || []));
    if ((data.data || []).length < perPage || pageCount >= 100) break;
    offset += perPage;
  }
  return allPlans;
}

// ── Get volunteer name with fallbacks ───────────────────────────────────────
function getVolunteerName(member, personData) {
  if (member.attributes.name) return member.attributes.name;
  if (personData?.attributes) {
    const full = `${personData.attributes.first_name || ''} ${personData.attributes.last_name || ''}`.trim();
    if (full) return full;
  }
  return 'Sem nome';
}

// ── Fetch all persons from all teams of a service type (independent of plans) ─
async function fetchAllTeamPersons(serviceTypeId, credentials) {
  const headers = { Authorization: `Basic ${credentials}` };
  const volunteers = new Map();

  // 1. Get all teams for this service type
  const teamsRes = await fetchWithRetry(`${PC_SERVICES_BASE}/service_types/${serviceTypeId}/teams?per_page=100`, headers);
  if (!teamsRes.ok) return volunteers;

  const teamsData = await teamsRes.json();
  const teams = teamsData.data || [];

  // 2. For each team, fetch all team members (people with positions)
  for (const team of teams) {
    let offset = 0;
    const perPage = 100;
    let pageCount = 0;
    while (true) {
      const url = `${PC_SERVICES_BASE}/service_types/${serviceTypeId}/teams/${team.id}/team_members?per_page=${perPage}&offset=${offset}&include=person`;
      const res = await fetchWithRetry(url, headers);
      if (!res.ok) break;

      const data = await res.json();
      pageCount++;

      const personMap = new Map();
      for (const item of (data.included || [])) {
        if (item.type === 'Person') personMap.set(item.id, item);
      }

      for (const member of (data.data || [])) {
        const personId = member.relationships?.person?.data?.id || member.id;
        const personData = personMap.get(personId);
        const volunteerName = getVolunteerName(member, personData);

        if (personId && volunteerName !== 'Sem nome') {
          const email = personData?.attributes?.email_address || personData?.attributes?.email || null;
          const avatarUrl = personData?.attributes?.avatar || member.attributes?.photo_thumbnail || null;
          if (!volunteers.has(personId)) {
            volunteers.set(personId, {
              planning_center_person_id: personId,
              volunteer_name: volunteerName,
              avatar_url: avatarUrl,
              email,
            });
          }
        }
      }

      if (!data.data || data.data.length < perPage || pageCount >= 50) break;
      offset += perPage;
    }
  }

  return volunteers;
}


async function processServiceType(supabase, serviceType, plans, credentials) {
  const baseUrl = PC_SERVICES_BASE;
  let typeServices = 0;
  let typeSchedules = 0;
  let typeMembersFound = 0;
  let typeMembersProcessed = 0;
  const volunteers = new Map();
  const memberTeamMap = new Map(); // personId -> Set<teamName> — acumulado em todos os planos

  for (const plan of plans) {
    const serviceDate = plan.attributes.sort_date;
    const serviceName = plan.attributes.title || serviceType.attributes.name;
    const serviceTypeName = serviceType.attributes.name;
    const dateOnly = serviceDate.slice(0, 10); // 'yyyy-MM-dd'

    // Busca servico gerado internamente com mesmo tipo e data
    const { data: internalService } = await supabase
      .from('vol_services')
      .select('id')
      .not('service_type_id', 'is', null)
      .eq('service_type_name', serviceTypeName)
      .gte('scheduled_at', `${dateOnly}T00:00:00`)
      .lte('scheduled_at', `${dateOnly}T23:59:59`)
      .maybeSingle();

    let service;
    if (internalService) {
      // Remove o servico PCO-only com esse plan.id, se existir (evita conflito de unique)
      await supabase.from('vol_services')
        .delete()
        .eq('planning_center_id', plan.id)
        .is('service_type_id', null);

      // Vincula o plan ID do PCO ao servico interno para proximas sincronizacoes
      await supabase.from('vol_services')
        .update({ planning_center_id: plan.id })
        .eq('id', internalService.id);

      service = internalService;
    } else {
      // Sem servico interno para esse tipo+data: cria/atualiza pelo planning_center_id
      const { data: svc, error: serviceError } = await supabase
        .from('vol_services')
        .upsert({
          planning_center_id: plan.id,
          name: serviceName,
          service_type_name: serviceTypeName,
          scheduled_at: serviceDate,
        }, { onConflict: 'planning_center_id' })
        .select()
        .single();
      if (serviceError) { console.error('[PC] upsert service error:', serviceError.message); continue; }
      service = svc;
    }

    typeServices++;

    const teamData = await fetchAllTeamMembers(baseUrl, serviceType.id, plan.id, credentials);
    typeMembersFound += teamData.data.length;

    const personMap = new Map();
    for (const item of (teamData.included || [])) {
      if (item.type === 'Person') personMap.set(item.id, item);
    }

    const scheduleMap = new Map();
    const teamNamesMap = new Map();

    for (const member of (teamData.data || [])) {
      const memberStatus = member.attributes.status || 'unknown';
      const personId = member.relationships?.person?.data?.id || member.id;
      const confirmationStatus = STATUS_MAP[memberStatus] || 'unknown';
      const teamPosition = member.attributes.team_position_name || '';
      const parts = teamPosition.split(' - ');
      const teamName = parts[0] || null;
      const personData = personMap.get(personId);
      const avatarUrl = personData?.attributes?.avatar || member.attributes?.photo_thumbnail || null;
      const volunteerName = getVolunteerName(member, personData);
      const key = `${service.id}_${personId}`;

      if (!scheduleMap.has(key)) {
        scheduleMap.set(key, {
          service_id: service.id,
          planning_center_person_id: personId,
          volunteer_name: volunteerName,
          team_name: teamName,
          position_name: parts[1] || null,
          confirmation_status: confirmationStatus,
        });
        teamNamesMap.set(key, new Set(teamName ? [teamName] : []));
        typeMembersProcessed++;
      } else {
        const existing = scheduleMap.get(key);
        const ep = STATUS_PRIORITY[existing.confirmation_status] ?? 1;
        const np = STATUS_PRIORITY[confirmationStatus] ?? 1;
        if (np > ep) existing.confirmation_status = confirmationStatus;
        const teams = teamNamesMap.get(key);
        if (teamName && !teams.has(teamName)) {
          teams.add(teamName);
          existing.team_name = Array.from(teams).join(', ');
        }
      }

      if (personId && volunteerName !== 'Sem nome') {
        const email = personData?.attributes?.email_address || personData?.attributes?.email || null;
        volunteers.set(personId, {
          planning_center_person_id: personId,
          volunteer_name: volunteerName,
          avatar_url: avatarUrl,
          email,
        });
      }
    }

    const schedulesToUpsert = Array.from(scheduleMap.values());
    for (const schedule of schedulesToUpsert) {
      const { error } = await supabase
        .from('vol_schedules')
        .upsert(schedule, { onConflict: 'service_id,planning_center_person_id' });
      if (!error) typeSchedules++;
      else console.error('[PC] upsert schedule error:', error.message);

      // Acumula atribuicoes de equipe para processar ao final
      const personId = schedule.planning_center_person_id;
      if (personId && schedule.team_name) {
        if (!memberTeamMap.has(personId)) memberTeamMap.set(personId, new Set());
        schedule.team_name.split(',').forEach(t => {
          const trimmed = t.trim();
          if (trimmed) memberTeamMap.get(personId).add(trimmed);
        });
      }
    }
  }

  // Opção A: atribui voluntários às equipes com base nas escalas sincronizadas
  await assignVolunteersToTeams(supabase, memberTeamMap);

  return { services: typeServices, schedules: typeSchedules, membersFound: typeMembersFound, membersProcessed: typeMembersProcessed, volunteers };
}

// ── Batch upsert volunteer QR codes ─────────────────────────────────────────
async function upsertVolunteerQrCodes(supabase, volunteersMap) {
  const codes = Array.from(volunteersMap.values());
  if (codes.length === 0) return 0;
  const batchSize = 100;
  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize);
    const { error } = await supabase
      .from('vol_volunteer_qrcodes')
      .upsert(batch, { onConflict: 'planning_center_person_id', ignoreDuplicates: false });
    if (error) console.error('[PC] upsert qr codes error:', error.message);
  }
  return codes.length;
}

// ── Batch upsert vol_profiles (the volunteer pool) ──────────────────────────
// Returns { count, dbError } so callers can surface DB errors to the user.
async function upsertVolunteerProfiles(supabase, volunteersMap) {
  const entries = Array.from(volunteersMap.values());
  if (entries.length === 0) return { count: 0, dbError: null };

  const profiles = entries.map(v => ({
    planning_center_id: v.planning_center_person_id,
    full_name: v.volunteer_name,
    email: v.email || null,
    avatar_url: v.avatar_url || null,
    origem: 'planning_center',
    allocation_status: 'active',
  }));

  let upserted = 0;
  let firstError = null;
  const batchSize = 100;
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);
    const { error, count } = await supabase
      .from('vol_profiles')
      .upsert(batch, { onConflict: 'planning_center_id', ignoreDuplicates: false, count: 'exact' });
    if (error) {
      console.error('[PC] upsert vol_profiles error:', error.message);
      if (!firstError) firstError = error.message;
    } else {
      upserted += (count ?? batch.length);
    }
  }
  return { count: upserted, dbError: firstError };
}

// ── Sync team members from vol_schedules ────────────────────────────────────
// Reads vol_schedules (source of truth) and populates vol_teams, vol_positions,
// and vol_team_members. Supports both membresia-linked (volunteer_profile_id)
// and PC-only (planning_center_person_id) volunteers.
//
// If restrictPersonIds is provided, only syncs schedules for those PC person IDs
// (used during per-service-type PC sync). Otherwise syncs everything.
async function syncTeamMembersFromSchedules(supabase, restrictPersonIds = null) {
  let q = supabase.from('vol_schedules')
    .select('planning_center_person_id, volunteer_id, volunteer_name, team_name, position_name')
    .not('team_name', 'is', null);
  if (restrictPersonIds && restrictPersonIds.length) {
    q = q.in('planning_center_person_id', restrictPersonIds);
  }
  const { data: schedules, error } = await q;
  if (error) {
    console.error('[sync-members] fetch schedules:', error.message);
    return { assigned: 0, volunteers: 0, teams: 0 };
  }
  if (!schedules?.length) return { assigned: 0, volunteers: 0, teams: 0 };

  // Collapse to distinct (person, team, position) assignments
  const assignments = new Map();
  for (const s of schedules) {
    const name = (s.volunteer_name || '').trim();
    if (!name) continue; // volunteer_name is NOT NULL in vol_team_members
    const teams = (s.team_name || '').split(',').map(t => t.trim()).filter(Boolean);
    for (const team of teams) {
      const pos = (s.position_name || '').trim() || null;
      const personKey = s.volunteer_id || `pc:${s.planning_center_person_id}`;
      const key = `${personKey}:${team}:${pos || ''}`;
      if (!assignments.has(key)) {
        assignments.set(key, {
          volunteer_name: name,
          volunteer_profile_id: s.volunteer_id || null,
          planning_center_person_id: s.planning_center_person_id || null,
          team_name: team,
          position_name: pos,
        });
      }
    }
  }
  if (!assignments.size) return { assigned: 0, volunteers: 0, teams: 0 };

  // Ensure teams
  const allTeamNames = [...new Set([...assignments.values()].map(a => a.team_name))];
  await supabase.from('vol_teams')
    .upsert(allTeamNames.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true });
  const { data: teamRows } = await supabase.from('vol_teams')
    .select('id, name').in('name', allTeamNames);
  const teamByName = new Map((teamRows || []).map(t => [t.name, t.id]));

  // Ensure positions
  const positionsSeen = new Set();
  const positionsToInsert = [];
  for (const a of assignments.values()) {
    if (!a.position_name) continue;
    const teamId = teamByName.get(a.team_name);
    if (!teamId) continue;
    const k = `${teamId}:${a.position_name}`;
    if (positionsSeen.has(k)) continue;
    positionsSeen.add(k);
    positionsToInsert.push({ team_id: teamId, name: a.position_name });
  }
  if (positionsToInsert.length) {
    await supabase.from('vol_positions')
      .upsert(positionsToInsert, { onConflict: 'team_id,name', ignoreDuplicates: true });
  }
  const teamIds = [...teamByName.values()];
  const { data: posRows } = teamIds.length
    ? await supabase.from('vol_positions').select('id, team_id, name').in('team_id', teamIds)
    : { data: [] };
  const posByKey = new Map((posRows || []).map(p => [`${p.team_id}:${p.name}`, p.id]));

  // Build memberships — one per (team, person); if multiple positions collide,
  // keep the first that has a position_id (vol_team_members doesn't support multi-position per team).
  const membershipByKey = new Map();
  for (const a of assignments.values()) {
    const teamId = teamByName.get(a.team_name);
    if (!teamId) continue;
    const personKey = a.volunteer_profile_id || `pc:${a.planning_center_person_id}`;
    const key = `${teamId}:${personKey}`;
    const positionId = a.position_name ? posByKey.get(`${teamId}:${a.position_name}`) || null : null;
    const existing = membershipByKey.get(key);
    if (!existing) {
      membershipByKey.set(key, {
        team_id: teamId,
        volunteer_profile_id: a.volunteer_profile_id,
        planning_center_person_id: a.planning_center_person_id,
        volunteer_name: a.volunteer_name,
        position_id: positionId,
        is_active: true,
      });
    } else if (positionId && !existing.position_id) {
      existing.position_id = positionId;
    }
  }

  const memberships = [...membershipByKey.values()];
  const withProfile = memberships.filter(m => m.volunteer_profile_id);
  const pcOnly = memberships.filter(m => !m.volunteer_profile_id && m.planning_center_person_id);

  let assigned = 0;

  // Upsert profile-linked (unique: team_id, volunteer_profile_id)
  for (let i = 0; i < withProfile.length; i += 100) {
    const batch = withProfile.slice(i, i + 100);
    const { error: e } = await supabase.from('vol_team_members')
      .upsert(batch, { onConflict: 'team_id,volunteer_profile_id', ignoreDuplicates: false });
    if (e) console.error('[sync-members] profile batch:', e.message);
    else assigned += batch.length;
  }

  // PC-only: check existing first to avoid duplicates (partial unique index covers the case
  // but PostgREST can't always target it, so we dedup manually).
  if (pcOnly.length) {
    const pcTeamIds = [...new Set(pcOnly.map(m => m.team_id))];
    const pcIds = [...new Set(pcOnly.map(m => m.planning_center_person_id))];
    const { data: existing } = await supabase.from('vol_team_members')
      .select('team_id, planning_center_person_id')
      .is('volunteer_profile_id', null)
      .in('team_id', pcTeamIds)
      .in('planning_center_person_id', pcIds);
    const existingKeys = new Set((existing || []).map(e => `${e.team_id}:${e.planning_center_person_id}`));
    const toInsert = pcOnly.filter(m => !existingKeys.has(`${m.team_id}:${m.planning_center_person_id}`));
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error: e } = await supabase.from('vol_team_members').insert(batch);
      if (e) console.error('[sync-members] pc-only batch:', e.message);
      else assigned += batch.length;
    }
  }

  // Mark profile-linked volunteers as active
  const profileIds = [...new Set(withProfile.map(m => m.volunteer_profile_id))];
  if (profileIds.length) {
    await supabase.from('vol_profiles')
      .update({ allocation_status: 'active' }).in('id', profileIds);
  }

  const volunteerCount = new Set(memberships.map(m => m.volunteer_profile_id || `pc:${m.planning_center_person_id}`)).size;
  return { assigned, volunteers: volunteerCount, teams: allTeamNames.length };
}

// Legacy signature kept for PC sync caller — delegates to syncTeamMembersFromSchedules
// restricted to the person IDs that just had schedules upserted.
async function assignVolunteersToTeams(supabase, memberTeamMap) {
  if (!memberTeamMap.size) return 0;
  const personIds = Array.from(memberTeamMap.keys()).filter(Boolean);
  const result = await syncTeamMembersFromSchedules(supabase, personIds);
  return result.assigned;
}

module.exports = {
  STATUS_PRIORITY,
  STATUS_MAP,
  PC_SERVICES_BASE,
  PC_PEOPLE_BASE,
  getPCCredentials,
  fetchWithRetry,
  fetchAllTeamMembers,
  fetchAllPlans,
  fetchPlansInRange,
  getVolunteerName,
  processServiceType,
  fetchAllTeamPersons,
  upsertVolunteerQrCodes,
  upsertVolunteerProfiles,
  assignVolunteersToTeams,
  syncTeamMembersFromSchedules,
};
