// Sync completo do Planning Center pro voluntariado · compartilhado entre o
// botão manual (POST /voluntariado/sync), o /sync-auto e o cron diário
// (GET /voluntariado/cron/sync). Estratégia dupla por tipo de serviço:
//   1. fetchAllPlans      → cultos futuros/passados (escalas + check-in)
//   2. fetchAllTeamPersons → pessoas das equipes (vol_profiles)
const { supabase } = require('../utils/supabase');
const {
  getPCCredentials, fetchAllServiceTypes, fetchAllPlans, fetchAllTeamPersons,
  fetchAllServicesPeople, processServiceType, PC_SERVICES_BASE,
  upsertVolunteerQrCodes, upsertVolunteerProfiles,
} = require('./planningCenter');

async function executarSyncCompleto() {
  const { basic: credentials } = getPCCredentials();

  const serviceTypes = await fetchAllServiceTypes(credentials);
  if (!serviceTypes.length) {
    const err = new Error('Falha ao conectar ao Planning Center ou nenhum tipo encontrado');
    err.code = 'NO_SERVICE_TYPES';
    throw err;
  }

  let totalServices = 0, totalSchedules = 0, totalMembersFound = 0, totalMembersProcessed = 0;
  const allVolunteers = new Map();

  // Todos os tipos de serviço em paralelo
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
    // teamPersons complementa com quem não aparece nos planos recentes
    for (const [k, v] of teamPersons) {
      if (!allVolunteers.has(k)) allVolunteers.set(k, v);
    }
  }

  // Complementa com TODAS as people do Services (inclui quem nunca foi escalado
  // e não está em nenhuma equipe) — pra o sistema espelhar o total do PCO.
  let servicesPeople = 0;
  try {
    const allPeople = await fetchAllServicesPeople(credentials);
    servicesPeople = allPeople.size;
    for (const [k, v] of allPeople) if (!allVolunteers.has(k)) allVolunteers.set(k, v);
  } catch (e) {
    console.error('[VOL SYNC] fetchAllServicesPeople:', e.message);
  }

  const qrCount = await upsertVolunteerQrCodes(supabase, allVolunteers);
  const { count: profilesCount, dbError } = await upsertVolunteerProfiles(supabase, allVolunteers);
  const avatarsImported = Array.from(allVolunteers.values()).filter(v => v.avatar_url).length;

  return {
    services: totalServices,
    schedules: totalSchedules,
    qrCodesGenerated: qrCount,
    volunteersSynced: profilesCount,
    servicesPeople,
    avatarsImported,
    totalMembersFound,
    totalMembersProcessed,
    dbError,
  };
}

module.exports = { executarSyncCompleto };
