// ============================================================================
// planningCenterKidsCheckins.js · Frequência do Kids a partir dos CHECK-INS do
// Planning Center (produto Check-Ins · /check-ins/v2/check_ins).
// ============================================================================
// Diferente do planningCenterKids.js (que só traz a BASE de crianças pro
// kids_criancas), aqui lemos os EVENTOS de check-in (presença) de um dia e
// contamos quantas CRIANÇAS entraram em cada culto — pra alimentar a frequência
// do Kids e o resumo de fim de culto sem depender do totem.
//
// "Criança" = pessoa com attribute `child = true` no PCO Check-Ins (mesma régua
// do sync de cadastro). Voluntários (kind 'Volunteer') ficam de fora.
//
// Reusa as credenciais e o fetch resiliente do planningCenter.js (mesma Basic
// auth · o produto Check-Ins responde quando o token tem acesso · já provado
// pelo sync de cadastro).

const { getPCCredentials, fetchWithRetry } = require('./planningCenter');
const { supabase } = require('../utils/supabase');

const PC_CHECKINS_BASE = 'https://api.planningcenteronline.com/check-ins/v2';

// Janela UTC que cobre um dia BRT (UTC-3): 00:00 BRT = 03:00Z; 23:59:59 BRT =
// 02:59:59Z do dia seguinte.
function rangeUTC(dataBRT) {
  const start = `${dataBRT}T03:00:00Z`;
  const d = new Date(`${dataBRT}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const end = `${d.toISOString().slice(0, 10)}T02:59:59Z`;
  return { start, end };
}

// 'HH:MM' BRT a partir de um ISO UTC.
function horaBRT(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  const brt = new Date(t.getTime() - 3 * 3600 * 1000);
  return brt.toISOString().slice(11, 16);
}

function minutosDe(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Puxa os check-ins de um dia (paginado) com event e person inclusos.
async function buscarCheckinsDia(dataBRT) {
  const { basic } = getPCCredentials();
  const headers = { Authorization: `Basic ${basic}` };
  const { start, end } = rangeUTC(dataBRT);
  const perPage = 100;
  let offset = 0;
  const checkins = [];
  const events = new Map();
  const persons = new Map();

  while (true) {
    const url = `${PC_CHECKINS_BASE}/check_ins`
      + `?where[created_at][gte]=${encodeURIComponent(start)}`
      + `&where[created_at][lte]=${encodeURIComponent(end)}`
      + `&include=event,person&per_page=${perPage}&offset=${offset}`;
    const resp = await fetchWithRetry(url, headers);
    if (!resp || !resp.ok) {
      throw new Error(`PCO Check-Ins ${resp?.status || '???'}: falha ao listar check_ins (offset ${offset})`);
    }
    const json = await resp.json();
    for (const inc of (json.included || [])) {
      if (inc.type === 'Event') events.set(inc.id, inc.attributes || {});
      if (inc.type === 'Person') persons.set(inc.id, inc.attributes || {});
    }
    const data = json.data || [];
    checkins.push(...data);
    if (data.length < perPage) break;
    offset += perPage;
    if (offset > 100000) break; // trava de segurança
  }
  return { checkins, events, persons };
}

// "É check-in do Kids?" — o sinal confiável é o EVENTO (CBKids), não a flag
// `child` do PCO (que vem em branco pra muita criança). Casa por nome do evento.
function ehEventoKids(nome) {
  if (!nome) return false;
  const n = String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /\bkids?\b/.test(n) || n.includes('cbkids') || n.includes('infantil');
}

// Coleta a frequência de crianças por culto num dia. Retorna os totais por culto
// (mapeados pela hora do event_time → recurrence_time do culto) + um diagnóstico
// da estrutura do PCO (pra validar o que está vindo). NÃO grava nada.
async function coletarFrequenciaKidsPCO(dataBRT) {
  const { checkins, events, persons } = await buscarCheckinsDia(dataBRT);

  // Cultos do dia (com a hora recorrente do slot pra casar com o event_time).
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, nome, service_type_id, vol_service_types(recurrence_time)')
    .eq('data', dataBRT);
  const cultosDoDia = (cultos || []).map(c => ({
    id: c.id,
    nome: c.nome,
    hhmm: (c.vol_service_types?.recurrence_time || '').slice(0, 5) || null,
  }));

  // Casa uma hora BRT (do event_time) com o culto de horário mais próximo.
  function cultoMaisProximo(hhmm) {
    const alvo = minutosDe(hhmm);
    if (alvo == null || !cultosDoDia.length) return null;
    let best = null, bestDiff = Infinity;
    for (const c of cultosDoDia) {
      const cm = minutosDe(c.hhmm);
      if (cm == null) continue;
      const diff = Math.abs(cm - alvo);
      if (diff < bestDiff) { bestDiff = diff; best = c; }
    }
    // Só casa se estiver dentro de ~3h do horário do culto (evita grudar lixo).
    return bestDiff <= 180 ? best : null;
  }

  const porKind = {};
  const porEvento = {}; // nome do evento -> { total, kids } (diagnóstico)
  let totalCriancas = 0;
  const porCulto = {}; // cultoId -> { culto_id, nome, hhmm, total, criancas:[...] }
  const naoContadas = []; // check-ins que NÃO contam como criança (com o motivo)
  let semCulto = 0;

  for (const ci of checkins) {
    const kind = ci.attributes?.kind || '—';
    porKind[kind] = (porKind[kind] || 0) + 1;
    const personId = ci.relationships?.person?.data?.id;
    const pessoa = personId ? persons.get(personId) : null;
    const nome = (pessoa?.name || ci.attributes?.name || `${pessoa?.first_name || ''} ${pessoa?.last_name || ''}`).trim() || 'Sem nome';
    const evId = ci.relationships?.event?.data?.id;
    const evNome = evId ? (events.get(evId)?.name || null) : null;
    // created_at do PRÓPRIO check-in = horário de entrada → casa com o culto.
    const hora = horaBRT(ci.attributes?.created_at);
    const culto = cultoMaisProximo(hora);

    const ev = porEvento[evNome || '(sem evento)'] || (porEvento[evNome || '(sem evento)'] = { total: 0, kids: 0 });
    ev.total += 1;

    // É criança do Kids? Regra: deu check-in num EVENTO do Kids (CBKids) e não é
    // voluntário. A flag `child` do PCO serve só de reserva quando não há evento.
    const eventoKids = ehEventoKids(evNome);
    const ehVoluntario = String(kind).toLowerCase() === 'volunteer';
    const ehCrianca = !ehVoluntario && (eventoKids || (!evNome && pessoa?.child === true));

    if (!ehCrianca) {
      const motivo = ehVoluntario ? 'voluntário' : (evNome ? 'evento não-Kids' : 'sem evento');
      naoContadas.push({ nome, hora, kind, evento: evNome, motivo, culto: culto?.nome || null, pco_id: personId || null });
      continue;
    }
    ev.kids += 1;
    totalCriancas += 1;
    if (culto) {
      const acc = porCulto[culto.id] || (porCulto[culto.id] = { culto_id: culto.id, nome: culto.nome, hhmm: culto.hhmm, total: 0, criancas: [] });
      acc.total += 1;
      acc.criancas.push({ nome, hora, kind, evento: evNome, pco_id: personId || null });
    } else {
      semCulto += 1;
    }
  }
  // ordena crianças por nome dentro de cada culto
  Object.values(porCulto).forEach(c => c.criancas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt')));

  return {
    data: dataBRT,
    total_checkins: checkins.length,
    total_criancas: totalCriancas,
    sem_culto_casado: semCulto,
    por_culto: Object.values(porCulto).sort((a, b) => (a.hhmm || '').localeCompare(b.hhmm || '')),
    nao_contadas: naoContadas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    diagnostico: {
      cultos_do_dia: cultosDoDia,
      por_kind: porKind,
      por_evento: Object.entries(porEvento).map(([evento, v]) => ({ evento, ...v })).sort((a, b) => b.total - a.total),
    },
  };
}

// Ficha + histórico de check-ins de UMA criança no PCO (pela person id do
// Check-Ins). Usado no clique da lista de frequência pra ver os detalhes e a
// frequência histórica da criança.
async function detalhePessoaPCO(pcoId) {
  const { basic } = getPCCredentials();
  const headers = { Authorization: `Basic ${basic}` };

  // Pessoa (nome, nascimento, child)
  let pessoa = {};
  try {
    const rp = await fetchWithRetry(`${PC_CHECKINS_BASE}/people/${encodeURIComponent(pcoId)}`, headers);
    if (rp && rp.ok) {
      const pj = await rp.json();
      const a = pj?.data?.attributes || {};
      pessoa = { nome: a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim(), child: a.child === true, birthdate: a.birthdate || null };
    }
  } catch { /* best-effort */ }

  // Histórico de check-ins (mais recentes primeiro)
  const events = new Map(), locations = new Map();
  const historico = [];
  let offset = 0;
  while (true) {
    const url = `${PC_CHECKINS_BASE}/people/${encodeURIComponent(pcoId)}/check_ins`
      + `?include=event,location&order=-created_at&per_page=100&offset=${offset}`;
    const resp = await fetchWithRetry(url, headers);
    if (!resp || !resp.ok) break;
    const json = await resp.json();
    for (const inc of (json.included || [])) {
      if (inc.type === 'Event') events.set(inc.id, inc.attributes || {});
      if (inc.type === 'Location') locations.set(inc.id, inc.attributes || {});
    }
    const data = json.data || [];
    for (const ci of data) {
      const evId = ci.relationships?.event?.data?.id;
      const locId = ci.relationships?.location?.data?.id;
      const cr = ci.attributes?.created_at;
      const brt = cr ? new Date(new Date(cr).getTime() - 3 * 3600 * 1000) : null;
      historico.push({
        data: brt ? brt.toISOString().slice(0, 10) : null,
        hora: brt ? brt.toISOString().slice(11, 16) : null,
        evento: evId ? (events.get(evId)?.name || null) : null,
        local: locId ? (locations.get(locId)?.name || null) : null,
        kind: ci.attributes?.kind || null,
      });
    }
    if (data.length < 100) break;
    offset += 100;
    if (offset > 2000) break; // trava de segurança
  }

  return { pessoa, total_checkins: historico.length, historico };
}

// Conjunto de person ids do PCO que tiveram ALGUM check-in desde uma data
// (paginado). Usado pra depurar o cadastro: quem não aparece aqui está inativo.
async function idsComCheckinDesde(dataISO) {
  const { basic } = getPCCredentials();
  const headers = { Authorization: `Basic ${basic}` };
  const ids = new Set();
  let offset = 0;
  while (true) {
    const url = `${PC_CHECKINS_BASE}/check_ins`
      + `?where[created_at][gte]=${encodeURIComponent(dataISO)}`
      + `&per_page=100&offset=${offset}`;
    const resp = await fetchWithRetry(url, headers);
    if (!resp || !resp.ok) break;
    const json = await resp.json();
    const data = json.data || [];
    for (const ci of data) {
      const pid = ci.relationships?.person?.data?.id;
      if (pid) ids.add(String(pid));
    }
    if (data.length < 100) break;
    offset += 100;
    if (offset > 500000) break; // trava de segurança
  }
  return ids;
}

module.exports = { coletarFrequenciaKidsPCO, detalhePessoaPCO, ehEventoKids, idsComCheckinDesde };
