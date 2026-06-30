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

// Puxa os check-ins de um dia (paginado) com event_time e person inclusos.
async function buscarCheckinsDia(dataBRT) {
  const { basic } = getPCCredentials();
  const headers = { Authorization: `Basic ${basic}` };
  const { start, end } = rangeUTC(dataBRT);
  const perPage = 100;
  let offset = 0;
  const checkins = [];
  const eventTimes = new Map();
  const persons = new Map();

  while (true) {
    const url = `${PC_CHECKINS_BASE}/check_ins`
      + `?where[created_at][gte]=${encodeURIComponent(start)}`
      + `&where[created_at][lte]=${encodeURIComponent(end)}`
      + `&include=event_time,person&per_page=${perPage}&offset=${offset}`;
    const resp = await fetchWithRetry(url, headers);
    if (!resp || !resp.ok) {
      throw new Error(`PCO Check-Ins ${resp?.status || '???'}: falha ao listar check_ins (offset ${offset})`);
    }
    const json = await resp.json();
    for (const inc of (json.included || [])) {
      if (inc.type === 'EventTime') eventTimes.set(inc.id, inc.attributes || {});
      if (inc.type === 'Person') persons.set(inc.id, inc.attributes || {});
    }
    const data = json.data || [];
    checkins.push(...data);
    if (data.length < perPage) break;
    offset += perPage;
    if (offset > 100000) break; // trava de segurança
  }
  return { checkins, eventTimes, persons };
}

// Coleta a frequência de crianças por culto num dia. Retorna os totais por culto
// (mapeados pela hora do event_time → recurrence_time do culto) + um diagnóstico
// da estrutura do PCO (pra validar o que está vindo). NÃO grava nada.
async function coletarFrequenciaKidsPCO(dataBRT) {
  const { checkins, eventTimes, persons } = await buscarCheckinsDia(dataBRT);

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
  let totalCriancas = 0;
  const porCulto = {}; // cultoId -> { culto_id, nome, hhmm, total, criancas:[{nome,hora,kind}] }
  const naoContadas = []; // check-ins não-criança (pra validação: ver quem ficou de fora)
  let semCulto = 0;

  for (const ci of checkins) {
    const kind = ci.attributes?.kind || '—';
    porKind[kind] = (porKind[kind] || 0) + 1;
    const personId = ci.relationships?.person?.data?.id;
    const pessoa = personId ? persons.get(personId) : null;
    const ehCrianca = pessoa?.child === true;
    const nome = (pessoa?.name || ci.attributes?.name || `${pessoa?.first_name || ''} ${pessoa?.last_name || ''}`).trim() || 'Sem nome';
    // Horário do check-in: o event_time costuma não vir na lista; o created_at do
    // PRÓPRIO check-in (momento da entrada) é o sinal confiável → casa com o culto.
    const etId = ci.relationships?.event_time?.data?.id;
    const et = etId ? eventTimes.get(etId) : null;
    const hora = horaBRT(et?.starts_at || et?.shows_at || ci.attributes?.created_at);
    const culto = cultoMaisProximo(hora);
    if (!ehCrianca) {
      naoContadas.push({ nome, hora, kind, culto: culto?.nome || null });
      continue;
    }
    totalCriancas += 1;
    if (culto) {
      const acc = porCulto[culto.id] || (porCulto[culto.id] = { culto_id: culto.id, nome: culto.nome, hhmm: culto.hhmm, total: 0, criancas: [] });
      acc.total += 1;
      acc.criancas.push({ nome, hora, kind });
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
    },
  };
}

module.exports = { coletarFrequenciaKidsPCO };
