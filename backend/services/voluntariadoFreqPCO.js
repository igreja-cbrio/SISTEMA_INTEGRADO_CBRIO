// Ponte Planning Center → Frequência: materializa as ESCALAS do PCO
// (vol_schedules × vol_services) como histórico de serviço (vol_servicos_historico,
// origem 'planning_center'), pra a aba Frequência refletir quem serviu nos
// cultos recentes — sem depender da planilha manual ser atualizada.
//
// Regras: ignora confirmation_status 'declined'; só serviços que JÁ passaram
// (data BRT <= hoje · escala futura não "serviu" ainda); dedupe por
// pessoa+data+culto. Vincula ao perfil pelo planning_center_id. Idempotente.
const { supabase } = require('../utils/supabase');

const normNome = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const CULTO = { 0: 'Domingo', 3: 'Quarta', 6: 'Sábado' };
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

async function bridgeFrequenciaPCO(desdeISO) {
  const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

  // services no range (paginado)
  let services = []; let off = 0;
  while (true) {
    const { data, error } = await supabase.from('vol_services').select('id, scheduled_at').gte('scheduled_at', desdeISO).range(off, off + 999);
    if (error) throw error;
    if (!data || !data.length) break;
    services = services.concat(data);
    if (data.length < 1000) break;
    off += 1000;
  }
  const svcMeta = new Map();
  for (const s of services) {
    const d = new Date(new Date(s.scheduled_at).getTime() - 3 * 3600 * 1000); // BRT
    const data = d.toISOString().slice(0, 10);
    if (data > hojeBRT) continue; // serviço futuro não serviu ainda
    svcMeta.set(s.id, { data, culto: CULTO[d.getUTCDay()] || '—', mes: MESES[d.getUTCMonth()] });
  }
  const svcIds = [...svcMeta.keys()];
  if (!svcIds.length) return { inseridos: 0, servicos: 0, escalas: 0 };

  // escalas dos services (paginado por chunk de service_id)
  let schedules = [];
  for (let i = 0; i < svcIds.length; i += 100) {
    const chunk = svcIds.slice(i, i + 100);
    let o = 0;
    while (true) {
      const { data, error } = await supabase.from('vol_schedules')
        .select('service_id, volunteer_name, planning_center_person_id, confirmation_status').in('service_id', chunk).range(o, o + 999);
      if (error) throw error;
      if (!data || !data.length) break;
      schedules = schedules.concat(data);
      if (data.length < 1000) break;
      o += 1000;
    }
  }

  // pessoa → perfil
  const pids = [...new Set(schedules.map((s) => s.planning_center_person_id).filter(Boolean))];
  const profMap = new Map();
  for (let i = 0; i < pids.length; i += 200) {
    const { data } = await supabase.from('vol_profiles').select('planning_center_id, id').in('planning_center_id', pids.slice(i, i + 200));
    (data || []).forEach((p) => p.planning_center_id && profMap.set(p.planning_center_id, p.id));
  }

  // monta linhas (dedupe pessoa+data+culto)
  const vistos = new Set(); const linhas = [];
  for (const s of schedules) {
    if (s.confirmation_status === 'declined' || !s.volunteer_name) continue;
    const meta = svcMeta.get(s.service_id);
    if (!meta) continue;
    const nn = normNome(s.volunteer_name);
    if (!nn) continue;
    const k = `${nn}|${meta.data}|${meta.culto}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    linhas.push({ nome_planilha: s.volunteer_name, nome_norm: nn, data: meta.data, culto_label: meta.culto, mes: meta.mes, origem: 'planning_center', vol_profile_id: profMap.get(s.planning_center_person_id) || null });
  }

  let inseridos = 0;
  for (let i = 0; i < linhas.length; i += 400) {
    const lote = linhas.slice(i, i + 400);
    const { error } = await supabase.from('vol_servicos_historico').upsert(lote, { onConflict: 'nome_norm,data,culto_label,origem', ignoreDuplicates: true });
    if (!error) inseridos += lote.length;
    else console.error('[freqPCO] upsert:', error.message);
  }
  return { inseridos, servicos: svcIds.length, escalas: schedules.length };
}

module.exports = { bridgeFrequenciaPCO };
