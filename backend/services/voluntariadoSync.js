// Sync completo do Planning Center pro voluntariado · compartilhado entre o
// botão manual (POST /voluntariado/sync), o /sync-auto e o cron diário
// (GET /voluntariado/cron/sync). Estratégia dupla por tipo de serviço:
//   1. fetchAllPlans      → cultos futuros/passados (escalas + check-in)
//   2. fetchAllTeamPersons → pessoas das equipes (vol_profiles)
const { supabase } = require('../utils/supabase');
const {
  getPCCredentials, fetchAllServiceTypes, fetchAllPlans, fetchAllTeamPersons,
  fetchAllServicesPeople, processServiceType, PC_SERVICES_BASE,
  upsertVolunteerQrCodes, upsertVolunteerProfiles, reconcilePlanningCenterProfiles,
} = require('./planningCenter');
const { decidirReconciliacao } = require('../utils/volSyncIntegrity');

async function executarSyncCompleto() {
  const { basic: credentials } = getPCCredentials();

  const serviceTypes = await fetchAllServiceTypes(credentials, { requireComplete: true });
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
      fetchAllPlans(PC_SERVICES_BASE, st.id, credentials, { requireComplete: true }),
      fetchAllTeamPersons(st.id, credentials, { requireComplete: true }),
    ]);
    const result = await processServiceType(supabase, st, plans, credentials);
    return { result, teamPersons };
  }));

  let tiposComFalha = 0;
  for (const item of settled) {
    if (item.status === 'rejected') {
      tiposComFalha += 1;
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
  let pessoasCompletas = false;
  try {
    const allPeople = await fetchAllServicesPeople(credentials, { requireComplete: true });
    servicesPeople = allPeople.size;
    pessoasCompletas = true;
    for (const [k, v] of allPeople) if (!allVolunteers.has(k)) allVolunteers.set(k, v);
  } catch (e) {
    console.error('[VOL SYNC] fetchAllServicesPeople:', e.message);
  }

  const qrCount = await upsertVolunteerQrCodes(supabase, allVolunteers);
  const { count: profilesCount, dbError } = await upsertVolunteerProfiles(supabase, allVolunteers);
  const avatarsImported = Array.from(allVolunteers.values()).filter(v => v.avatar_url).length;

  // Reconciliacao: arquiva quem saiu do PCO (allVolunteers = roster COMPLETO do
  // Planning Center · inclui fetchAllServicesPeople). Só roda quando TODAS as
  // fontes terminaram — uma leitura parcial jamais pode arquivar alguém.
  // ⚠️ A chave vem do banco, não de env: desligar o Planning Center é decisão
  // operacional (tomada na tela de Voluntariado), não de deploy. Falha de
  // leitura mantém `true` — o comportamento de hoje — porque o efeito de
  // assumir `false` por engano seria parar de arquivar quem realmente saiu,
  // e o de assumir `true` por engano é o arquivamento em massa que esta chave
  // existe pra impedir. Na dúvida, a guarda fecha.
  let pcoAtivo = true;
  try {
    const { data: cfg } = await supabase.from('vol_config').select('pco_ativo').eq('id', 1).maybeSingle();
    if (cfg && cfg.pco_ativo === false) pcoAtivo = false;
  } catch (e) {
    console.error('[VOL SYNC] leitura de vol_config.pco_ativo:', e.message);
  }

  const decisaoReconciliacao = decidirReconciliacao({
    tiposComFalha,
    pessoasCompletas,
    pcoAtivo,
  });
  let reconciliacao = { arquivados: 0, desarquivados: 0, skipped: true, motivo: decisaoReconciliacao.motivo };
  if (decisaoReconciliacao.podeReconciliar) {
    try {
      reconciliacao = await reconcilePlanningCenterProfiles(supabase, allVolunteers);
    } catch (e) {
      console.error('[VOL SYNC] reconcilePlanningCenterProfiles:', e.message);
    }
  } else {
    console.warn(`[VOL SYNC] reconciliação ignorada: ${decisaoReconciliacao.motivo}`);
  }

  // Materializa as escalas recentes do PCO na Frequência (quem serviu nos
  // últimos ~100 dias) — assim cada culto reflete sozinho, sem a planilha.
  let freqPco = 0;
  try {
    const { bridgeFrequenciaPCO } = require('./voluntariadoFreqPCO');
    const desde = new Date(Date.now() - 100 * 864e5).toISOString();
    const r = await bridgeFrequenciaPCO(desde);
    freqPco = r.inseridos;
  } catch (e) {
    console.error('[VOL SYNC] bridgeFrequenciaPCO:', e.message);
  }

  return {
    services: totalServices,
    schedules: totalSchedules,
    qrCodesGenerated: qrCount,
    volunteersSynced: profilesCount,
    servicesPeople,
    freqPco,
    avatarsImported,
    totalMembersFound,
    totalMembersProcessed,
    reconciliacao,
    dbError,
  };
}

module.exports = { executarSyncCompleto };
