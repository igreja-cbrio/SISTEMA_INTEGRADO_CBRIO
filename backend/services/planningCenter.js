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

// PC's sort_date returns the local datetime labeled with a 'Z' (UTC) suffix,
// but the hours/minutes reflect the organization's local timezone (BRT). Parsing
// it as UTC drops 3 hours off the real time. We extract the date/time portion
// and re-label it as America/Sao_Paulo (UTC-3, stable since 2019). Works for
// any ISO 8601 format PC may return.
function pcDateToBRT(pcDate) {
  if (!pcDate) return pcDate;
  const m = String(pcDate).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  if (!m) return pcDate;
  return `${m[1]}T${m[2]}-03:00`;
}

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

// ── Paginated service types ─────────────────────────────────────────────────
async function fetchAllServiceTypes(credentials) {
  const headers = { Authorization: `Basic ${credentials}` };
  const all = [];
  let offset = 0;
  const perPage = 100;
  while (true) {
    const url = `${PC_SERVICES_BASE}/service_types?per_page=${perPage}&offset=${offset}`;
    const response = await fetchWithRetry(url, headers);
    if (!response || !response.ok) break;
    const data = await response.json();
    const batch = data.data || [];
    all.push(...batch);
    if (batch.length < perPage) break;
    offset += perPage;
    if (offset > 5000) break; // safety
  }
  console.log(`[PC] Found ${all.length} service types (after pagination)`);
  return all;
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

// ── Future + recent past plans (paginated by window) ──────────────────────
// Janela ampla por padrão: próximos 60 dias + últimos 7 dias. Página por
// `offset` até esgotar — assim service types movimentados (Kids, Domingo etc.)
// não ficam limitados a 5 cultos futuros.
async function fetchAllPlans(baseUrl, serviceTypeId, credentials) {
  const headers = { Authorization: `Basic ${credentials}` };
  const planMap = new Map();

  const today = new Date();
  const past = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const future = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const perPage = 50;
  let offset = 0;
  let pageCount = 0;
  while (true) {
    const url = `${baseUrl}/service_types/${serviceTypeId}/plans?filter=after,before&after=${fmt(past)}&before=${fmt(future)}&per_page=${perPage}&offset=${offset}&order=sort_date`;
    const res = await fetchWithRetry(url, headers);
    if (!res || !res.ok) break;
    const d = await res.json();
    pageCount++;
    const batch = d.data || [];
    for (const p of batch) planMap.set(p.id, p);
    if (batch.length < perPage || pageCount >= 20) break;
    offset += perPage;
  }

  // Fallback: se a janela não retornou nada (service type sem datas no range),
  // ainda assim tenta pegar os próximos cultos via filter=future.
  if (planMap.size === 0) {
    const fr = await fetchWithRetry(`${baseUrl}/service_types/${serviceTypeId}/plans?filter=future&per_page=25`, headers);
    if (fr && fr.ok) {
      const d = await fr.json();
      for (const p of d.data || []) planMap.set(p.id, p);
    }
  }

  return Array.from(planMap.values());
}

// ── Upsert resiliente de vol_schedules ─────────────────────────────────────
// Tenta primeiro a constraint nova (4 colunas: service_id + person_id +
// team_name + position_name). Se o banco ainda estiver com a constraint
// antiga (apenas service_id + person_id), faz fallback automático para não
// perder o sync. Mantém um cache de "modo" para não tentar a versão nova
// múltiplas vezes na mesma execução depois de detectar incompatibilidade.
let _scheduleUpsertMode = 'auto'; // 'auto' | 'new' | 'legacy'
async function upsertScheduleResilient(supabase, schedule) {
  const tryNew = async () => supabase
    .from('vol_schedules')
    .upsert(schedule, { onConflict: 'service_id,planning_center_person_id,team_name,position_name' });
  const tryLegacy = async () => supabase
    .from('vol_schedules')
    .upsert(schedule, { onConflict: 'service_id,planning_center_person_id' });

  if (_scheduleUpsertMode === 'legacy') return tryLegacy();
  if (_scheduleUpsertMode === 'new') return tryNew();

  const r = await tryNew();
  if (!r.error) { _scheduleUpsertMode = 'new'; return r; }
  // Erros típicos quando a constraint nova não existe:
  //   "no unique or exclusion constraint matching the ON CONFLICT specification"
  const msg = (r.error.message || '').toLowerCase();
  if (msg.includes('on conflict') || msg.includes('unique') || msg.includes('exclusion')) {
    console.warn('[PC] Constraint nova de vol_schedules ausente — usando fallback legado.');
    _scheduleUpsertMode = 'legacy';
    return tryLegacy();
  }
  return r;
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

// Lista COMPLETA de people do Planning Center Services — inclui quem nunca foi
// escalado e não está em nenhuma equipe. É o total do "Services" (ex.: 875).
// Usada pra a galeria de voluntários espelhar o Planning Center inteiro.
async function fetchAllServicesPeople(credentials) {
  const headers = { Authorization: `Basic ${credentials}` };
  const people = new Map();
  const perPage = 100;
  let offset = 0;
  while (true) {
    const url = `${PC_SERVICES_BASE}/people?per_page=${perPage}&offset=${offset}`;
    const res = await fetchWithRetry(url, headers);
    if (!res.ok) break;
    const data = await res.json();
    for (const p of (data.data || [])) {
      const a = p.attributes || {};
      const name = a.full_name || [a.first_name, a.last_name].filter(Boolean).join(' ').trim();
      if (!p.id || !name) continue;
      if (!people.has(p.id)) {
        people.set(p.id, {
          planning_center_person_id: p.id,
          volunteer_name: name,
          avatar_url: a.photo_thumbnail || a.photo_url || null,
          email: null,
        });
      }
    }
    const total = data.meta?.total_count;
    if (!data.data || data.data.length < perPage) break;
    offset += perPage;
    if (total && offset >= total) break;
    if (offset > 20000) break; // safety
  }
  return people;
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
    const serviceDate = pcDateToBRT(plan.attributes.sort_date);
    const serviceName = plan.attributes.title || serviceType.attributes.name;
    const serviceTypeName = serviceType.attributes.name;
    const dateOnly = serviceDate.slice(0, 10); // 'yyyy-MM-dd'

    // Busca serviço gerado internamente com mesmo tipo e data
    const { data: internalService } = await supabase
      .from('vol_services')
      .select('id')
      .not('service_type_id', 'is', null)
      .eq('service_type_name', serviceTypeName)
      .gte('scheduled_at', `${dateOnly}T00:00:00-03:00`)
      .lte('scheduled_at', `${dateOnly}T23:59:59-03:00`)
      .maybeSingle();

    let service;
    if (internalService) {
      // Remove o serviço PCO-only com esse plan.id, se existir (evita conflito de unique)
      await supabase.from('vol_services')
        .delete()
        .eq('planning_center_id', plan.id)
        .is('service_type_id', null);

      // Vincula o plan ID do PCO ao serviço interno para próximas sincronizacoes
      await supabase.from('vol_services')
        .update({ planning_center_id: plan.id })
        .eq('id', internalService.id);

      service = internalService;
    } else {
      // Sem serviço interno para esse tipo+data: cria/atualiza pelo planning_center_id
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

    // Uma linha por (pessoa + equipe + posição). Mesma pessoa em múltiplas
    // posições/equipes gera múltiplas linhas — uma para cada escalação real.
    const scheduleMap = new Map();

    for (const member of (teamData.data || [])) {
      const memberStatus = member.attributes.status || 'unknown';
      const realPersonId = member.relationships?.person?.data?.id || null;
      // Se não houver person.id real (placeholder/visitante), usa member.id
      // como sufixo para garantir uma chave única — desde que tenhamos nome.
      const personId = realPersonId || member.id;
      const confirmationStatus = STATUS_MAP[memberStatus] || 'unknown';
      const teamPosition = member.attributes.team_position_name || '';
      const parts = teamPosition.split(' - ');
      const teamName = parts[0] || null;
      const positionName = parts[1] || null;
      const personData = realPersonId ? personMap.get(realPersonId) : null;
      const avatarUrl = personData?.attributes?.avatar || member.attributes?.photo_thumbnail || null;
      const volunteerName = getVolunteerName(member, personData);

      // Sem nome resolvível → não conseguimos exibir no totem; pula.
      if (volunteerName === 'Sem nome') continue;

      const key = `${service.id}_${personId}_${teamName || ''}_${positionName || ''}`;

      if (!scheduleMap.has(key)) {
        scheduleMap.set(key, {
          service_id: service.id,
          planning_center_person_id: personId,
          volunteer_name: volunteerName,
          team_name: teamName,
          position_name: positionName,
          confirmation_status: confirmationStatus,
        });
        typeMembersProcessed++;
      } else {
        // Mesma pessoa+equipe+posição duplicada na resposta do PC: mantém o
        // status de maior prioridade (confirmed > scheduled > pending > ...).
        const existing = scheduleMap.get(key);
        const ep = STATUS_PRIORITY[existing.confirmation_status] ?? 1;
        const np = STATUS_PRIORITY[confirmationStatus] ?? 1;
        if (np > ep) existing.confirmation_status = confirmationStatus;
      }

      if (realPersonId) {
        const email = personData?.attributes?.email_address || personData?.attributes?.email || null;
        volunteers.set(realPersonId, {
          planning_center_person_id: realPersonId,
          volunteer_name: volunteerName,
          avatar_url: avatarUrl,
          email,
        });
      }
    }

    const schedulesToUpsert = Array.from(scheduleMap.values());
    let okCount = 0;
    let failCount = 0;
    for (const schedule of schedulesToUpsert) {
      const { error } = await upsertScheduleResilient(supabase, schedule);
      if (!error) { typeSchedules++; okCount++; }
      else { failCount++; console.error('[PC] upsert schedule error:', error.message); }

      // Acumula atribuições de equipe para Opção A (vincular voluntários a teams)
      const personId = schedule.planning_center_person_id;
      if (personId && schedule.team_name) {
        if (!memberTeamMap.has(personId)) memberTeamMap.set(personId, new Set());
        memberTeamMap.get(personId).add(schedule.team_name.trim());
      }
    }
    console.log(`[PC] ${serviceTypeName} | plan=${plan.id} | members=${teamData.data.length} | schedules ok=${okCount} fail=${failCount}`);
  }

  console.log(`[PC] ► ${serviceType.attributes.name}: plans=${plans.length} services=${typeServices} schedules=${typeSchedules} membersFound=${typeMembersFound} membersProcessed=${typeMembersProcessed}`);

  // Opção A: atribui voluntários às equipes com base nas escalas sincronizadas
  await assignVolunteersToTeams(supabase, memberTeamMap);

  return { services: typeServices, schedules: typeSchedules, membersFound: typeMembersFound, membersProcessed: typeMembersProcessed, volunteers };
}

// ── Batch upsert volunteer QR codes ─────────────────────────────────────────
async function upsertVolunteerQrCodes(supabase, volunteersMap) {
  // Só as colunas que a tabela tem — o mapa carrega chaves extras (email) que
  // faziam o PostgREST rejeitar o batch inteiro ("Could not find the 'email'
  // column") e a tabela nunca era populada (bug silencioso · corrigido 2026-07-03).
  const codes = Array.from(volunteersMap.values()).map(v => ({
    planning_center_person_id: v.planning_center_person_id,
    volunteer_name: v.volunteer_name,
    avatar_url: v.avatar_url || null,
  }));
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

  // ⚠️ Email só entra no upsert quando o PCO trouxe um valor. A maioria dos
  // payloads (fetchAllServicesPeople) vem com email null — incluir a coluna
  // sobrescreveria com null os e-mails backfillados do People API a cada sync
  // horário (bug corrigido 2026-07-02). PostgREST exige as mesmas colunas por
  // batch, então separamos em dois grupos.
  const base = v => ({
    planning_center_id: v.planning_center_person_id,
    full_name: v.volunteer_name,
    avatar_url: v.avatar_url || null,
    origem: 'planning_center',
    allocation_status: 'active',
  });
  const comEmail = entries.filter(v => v.email).map(v => ({ ...base(v), email: v.email }));
  const semEmail = entries.filter(v => !v.email).map(base);

  let upserted = 0;
  let firstError = null;
  const batchSize = 100;
  for (const grupo of [comEmail, semEmail]) {
    for (let i = 0; i < grupo.length; i += batchSize) {
      const batch = grupo.slice(i, i + batchSize);
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
  }
  return { count: upserted, dbError: firstError };
}

// ── Reconciliacao com o roster atual do Planning Center ─────────────────────
// Chamar APENAS apos um sync COMPLETO (todos os service types + fetchAllServicesPeople,
// i.e. executarSyncCompleto) · NUNCA apos sync historico/range (senao arquiva quem
// so nao serviu no intervalo). O sync so fazia UPSERT (nunca removia), entao
// vol_profiles so crescia. Aqui: arquiva perfis origem='planning_center' que NAO
// vieram no roster atual (sairam do PCO) e desarquiva os que reapareceram. Internos
// (origem<>planning_center) nunca sao tocados.
// Guarda de seguranca: nao reconcilia se o roster veio pequeno (pull parcial/falho) —
// exige cobrir >= metade dos ativos atuais e >= 100 pessoas.
async function reconcilePlanningCenterProfiles(supabase, volunteersMap) {
  const pcIds = new Set(Array.from(volunteersMap.keys()).filter(Boolean).map(String));

  // Le os perfis PC do sistema, paginado (cap de 1000 do PostgREST).
  const fetchAll = async (arquivado) => {
    let all = [], offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('vol_profiles')
        .select('id, planning_center_id')
        .eq('origem', 'planning_center')
        .eq('arquivado', arquivado)
        .range(offset, offset + 999);
      if (error) throw error;
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    return all;
  };

  const ativos = await fetchAll(false);
  const minRoster = Math.max(100, Math.floor(ativos.length * 0.5));
  if (pcIds.size < minRoster) {
    return { skipped: true, motivo: 'roster_pequeno', roster: pcIds.size, minRoster, arquivados: 0, desarquivados: 0 };
  }

  const nowIso = new Date().toISOString();
  const updateInChunks = async (ids, patch) => {
    let n = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const { error } = await supabase.from('vol_profiles').update(patch).in('id', lote);
      if (!error) n += lote.length;
    }
    return n;
  };

  const paraArquivar = ativos
    .filter(p => p.planning_center_id && !pcIds.has(String(p.planning_center_id)))
    .map(p => p.id);
  const arquivados = paraArquivar.length
    ? await updateInChunks(paraArquivar, { arquivado: true, arquivado_em: nowIso }) : 0;

  const arquivadosDb = await fetchAll(true);
  const paraDesarquivar = arquivadosDb
    .filter(p => p.planning_center_id && pcIds.has(String(p.planning_center_id)))
    .map(p => p.id);
  const desarquivados = paraDesarquivar.length
    ? await updateInChunks(paraDesarquivar, { arquivado: false, arquivado_em: null }) : 0;

  return { skipped: false, roster: pcIds.size, arquivados, desarquivados };
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

  // Resolve o volunteer_profile_id pelos perfis JÁ existentes (via
  // planning_center_id) — sem isso a membership entra como "pc-only" e a pessoa
  // aparece SEM EQUIPE no sistema mesmo tendo equipe no Planning Center.
  const pcSemPerfil = [...new Set(memberships.filter(m => !m.volunteer_profile_id && m.planning_center_person_id).map(m => m.planning_center_person_id))];
  if (pcSemPerfil.length) {
    const profByPc = new Map();
    for (let i = 0; i < pcSemPerfil.length; i += 200) {
      const { data } = await supabase.from('vol_profiles').select('id, planning_center_id').in('planning_center_id', pcSemPerfil.slice(i, i + 200));
      (data || []).forEach(p => p.planning_center_id && profByPc.set(p.planning_center_id, p.id));
    }
    for (const m of memberships) {
      if (!m.volunteer_profile_id && m.planning_center_person_id && profByPc.has(m.planning_center_person_id)) {
        m.volunteer_profile_id = profByPc.get(m.planning_center_person_id);
      }
    }
  }

  // Re-dedup pós-resolução: uma membership que era "pc-only" pode ter ganhado o
  // MESMO volunteer_profile_id de outra já existente pra mesma equipe — duas
  // linhas com o mesmo (team_id, volunteer_profile_id) num batch estouram
  // "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const vistosProfile = new Map();
  for (const m of memberships.filter(x => x.volunteer_profile_id)) {
    const k = `${m.team_id}:${m.volunteer_profile_id}`;
    const ja = vistosProfile.get(k);
    if (!ja) vistosProfile.set(k, m);
    else if (m.position_id && !ja.position_id) ja.position_id = m.position_id;
  }
  const withProfile = [...vistosProfile.values()];
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

// ── CPF backfill a partir do custom field do People (PCO) ───────────────────
// O campo CPF vive como custom field no produto People do Planning Center
// (field_definition). Coletamos field_data desse campo e mapeamos
// person_id -> cpf normalizado (11 digitos). Como o tipo no PCO e 'number',
// zeros a esquerda podem ter sido perdidos · padStart corrige.
const PC_CPF_FIELD_ID = process.env.PLANNING_CENTER_CPF_FIELD_ID || '553633';

function _cpfValido(cpf) {
  const d = String(cpf || '').replace(/\D+/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (base, fator) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += parseInt(base[i], 10) * (fator - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(d.slice(0, 9), 10) === parseInt(d[9], 10)
      && calc(d.slice(0, 10), 11) === parseInt(d[10], 10);
}

// Retorna Map<planning_center_person_id, cpf(11 digitos)> com CPFs validos.
async function fetchPcoCpfMap(credentials) {
  const headers = { Authorization: `Basic ${credentials}` };
  const map = new Map();
  let offset = 0;
  const perPage = 100;
  while (true) {
    const url = `${PC_PEOPLE_BASE}/field_data?where[field_definition_id]=${PC_CPF_FIELD_ID}&per_page=${perPage}&offset=${offset}`;
    const r = await fetchWithRetry(url, headers);
    if (!r.ok) break;
    const j = await r.json();
    for (const fd of (j.data || [])) {
      const personId = fd.relationships?.customizable?.data?.id;
      const raw = fd.attributes?.value;
      if (!personId || raw == null) continue;
      let digits = String(raw).replace(/\D+/g, '');
      if (!digits) continue;
      if (digits.length < 11) digits = digits.padStart(11, '0'); // recupera zero a esquerda
      if (_cpfValido(digits)) map.set(personId, digits);
    }
    const total = j.meta?.total_count ?? map.size;
    offset += perPage;
    if (offset >= total || !(j.data || []).length) break;
  }
  return map;
}

// Preenche vol_profiles.cpf onde estiver vazio, casando por planning_center_id.
// NUNCA sobrescreve um CPF já existente. O trigger BEFORE UPDATE OF cpf cuida
// de vincular ao mem_membros automaticamente.
async function backfillVolProfilesCpf(supabase, credentials) {
  const cpfMap = await fetchPcoCpfMap(credentials);
  const totalCpfPco = cpfMap.size;
  if (!totalCpfPco) return { total_cpf_pco: 0, matched: 0, updated: 0, skipped_existing: 0, errors: 0 };

  const pcIds = [...cpfMap.keys()];
  let matched = 0, updated = 0, skippedExisting = 0, errors = 0;

  for (let i = 0; i < pcIds.length; i += 200) {
    const batch = pcIds.slice(i, i + 200);
    const { data: profiles, error } = await supabase
      .from('vol_profiles')
      .select('id, planning_center_id, cpf')
      .in('planning_center_id', batch);
    if (error) { errors++; continue; }

    for (const p of (profiles || [])) {
      const cpf = cpfMap.get(p.planning_center_id);
      if (!cpf) continue;
      matched++;
      if (p.cpf) { skippedExisting++; continue; } // nunca sobrescreve
      const { error: upErr } = await supabase
        .from('vol_profiles').update({ cpf }).eq('id', p.id);
      if (upErr) errors++; else updated++;
    }
  }

  return { total_cpf_pco: totalCpfPco, matched, updated, skipped_existing: skippedExisting, errors };
}

// Retorna Map<planning_center_person_id, email> via People API (people/v2/emails).
// Prioriza o e-mail marcado como primary; senão fica com o primeiro encontrado.
async function fetchPcoEmailMap(credentials) {
  const headers = { Authorization: `Basic ${credentials}` };
  const map = new Map();
  const perPage = 100;
  let offset = 0;
  while (true) {
    const url = `${PC_PEOPLE_BASE}/emails?per_page=${perPage}&offset=${offset}`;
    const r = await fetchWithRetry(url, headers);
    if (!r.ok) break;
    const j = await r.json();
    for (const em of (j.data || [])) {
      const personId = em.relationships?.person?.data?.id;
      const address = (em.attributes?.address || '').trim().toLowerCase();
      if (!personId || !address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) continue;
      if (em.attributes?.primary || !map.has(personId)) map.set(personId, address);
    }
    const total = j.meta?.total_count;
    if (!j.data || j.data.length < perPage) break;
    offset += perPage;
    if (total && offset >= total) break;
    if (offset > 50000) break; // safety
  }
  return map;
}

// Preenche vol_profiles.email onde estiver vazio, casando por planning_center_id.
// NUNCA sobrescreve um e-mail já existente (mesma regra do backfill de CPF).
async function backfillVolProfilesEmail(supabase, credentials) {
  const emailMap = await fetchPcoEmailMap(credentials);
  const totalEmailsPco = emailMap.size;
  if (!totalEmailsPco) return { total_emails_pco: 0, matched: 0, updated: 0, skipped_existing: 0, errors: 0 };

  const pcIds = [...emailMap.keys()];
  let matched = 0, updated = 0, skippedExisting = 0, errors = 0;

  for (let i = 0; i < pcIds.length; i += 200) {
    const batch = pcIds.slice(i, i + 200);
    const { data: profiles, error } = await supabase
      .from('vol_profiles')
      .select('id, planning_center_id, email')
      .in('planning_center_id', batch);
    if (error) { errors++; continue; }

    for (const p of (profiles || [])) {
      const email = emailMap.get(p.planning_center_id);
      if (!email) continue;
      matched++;
      if (p.email) { skippedExisting++; continue; } // nunca sobrescreve
      const { error: upErr } = await supabase
        .from('vol_profiles').update({ email }).eq('id', p.id);
      if (upErr) errors++; else updated++;
    }
  }

  return { total_emails_pco: totalEmailsPco, matched, updated, skipped_existing: skippedExisting, errors };
}

module.exports = {
  STATUS_PRIORITY,
  STATUS_MAP,
  PC_SERVICES_BASE,
  PC_PEOPLE_BASE,
  getPCCredentials,
  fetchWithRetry,
  fetchAllServiceTypes,
  fetchAllTeamMembers,
  fetchAllPlans,
  fetchPlansInRange,
  getVolunteerName,
  processServiceType,
  fetchAllTeamPersons,
  fetchAllServicesPeople,
  upsertVolunteerQrCodes,
  upsertVolunteerProfiles,
  reconcilePlanningCenterProfiles,
  assignVolunteersToTeams,
  syncTeamMembersFromSchedules,
  fetchPcoCpfMap,
  backfillVolProfilesCpf,
  fetchPcoEmailMap,
  backfillVolProfilesEmail,
};
