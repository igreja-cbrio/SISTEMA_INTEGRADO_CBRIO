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

  // Todos os tipos de serviço em paralelo.
  //
  // ⚠️⚠️ A ENTRADA DE DADOS NÃO EXIGE COMPLETUDE — só o ARQUIVAMENTO exige.
  // Entre 17/08 10:02 e 20/08 o sync devolveu 0 cultos e 0 escalas em TODA
  // rodada, com status 'success', e voluntários escalados no Planning Center
  // pararam de aparecer no sistema. Causa: `fetchAllPlans` e
  // `fetchAllTeamPersons` passaram a rodar com `requireComplete: true`, que
  // troca `break` por `throw`. Uma única página com erro no PCO derrubava o
  // tipo de serviço inteiro, o `Promise.allSettled` engolia a exceção num
  // contador, e o total ficava zero.
  //
  // A intenção do PR #2524 era legítima e continua valendo: NÃO arquivar
  // gente com base num roster parcial. Mas isso se resolve travando a
  // reconciliação (que é o passo destrutivo), não travando a ingestão.
  // Escala é ADITIVA: uma página perdida significa menos escalas nesta
  // rodada, e a próxima rodada traz. Zero escalas não é mais seguro que
  // escalas parciais — é só pior.
  //
  // ⚠️ `fetchAllTeamPersons` alimenta `allVolunteers`, que é o roster contra
  // o qual a reconciliação decide quem sumiu. Ele fica em try/catch PRÓPRIO:
  // se falhar, marca o tipo como incompleto (bloqueando o arquivamento) mas
  // NÃO impede os planos daquele mesmo tipo de entrar.
  const settled = await Promise.allSettled(serviceTypes.map(async (st) => {
    const plans = await fetchAllPlans(PC_SERVICES_BASE, st.id, credentials);
    let teamPersons = new Map();
    let rosterCompleto = true;
    try {
      teamPersons = await fetchAllTeamPersons(st.id, credentials, { requireComplete: true });
    } catch (e) {
      rosterCompleto = false;
      console.error(`[VOL SYNC] roster incompleto no tipo ${st.id}:`, e.message);
    }
    const result = await processServiceType(supabase, st, plans, credentials);
    return { result, teamPersons, rosterCompleto };
  }));

  let tiposComFalha = 0;
  for (const item of settled) {
    if (item.status === 'rejected') {
      tiposComFalha += 1;
      console.error('[VOL SYNC] Service type error:', item.reason?.message || item.reason);
      continue;
    }
    const { result, teamPersons, rosterCompleto } = item.value;
    // Roster incompleto conta como falha PARA A RECONCILIAÇÃO, mesmo com os
    // planos tendo entrado normalmente.
    if (!rosterCompleto) tiposComFalha += 1;
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
    // ⚠️ Sai no retorno pra quem grava `vol_sync_logs` poder marcar a rodada
    // como parcial. Era isto que faltava: a falha existia, virava um contador
    // interno, e o log dizia 'success' com 0 cultos. Três dias assim sem
    // ninguém notar.
    tiposComFalha,
    tiposTotal: serviceTypes.length,
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
