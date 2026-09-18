// Dashboard da Comunicação — régua PURA (09/09/2026 · F2 do redesenho).
//
// Pedido do Marcos (08/09): "Dashboard está muito cru" — pizza por área, linha
// por dia, filtro por data e ano, engajamento (quanto respondem os disparos),
// pessoas sem resposta há mais de 2 dias, tempo de resposta por atendente/área.
// Aqui mora TODA a conta; a rota (routes/comunicacao.js) só lê o banco e
// chama isto. Vive em utils/ sem Supabase para entrar no gate.
//
// ⚠️⚠️ Dia de operação da igreja é BRT (UTC-3, sem horário de verão desde 2019):
// das 21h do Rio em diante o dia UTC já virou, e a mensagem do culto de
// domingo à noite cairia na segunda. Toda chave de dia/semana/mês sai de
// `diaBrt`, a MESMA função que o resto do módulo usa.
const { diaBrt } = require('./whatsappModulo');

const ENTRADA = 'Entrada';
const LIMITE_SEM_RESPOSTA_H = 48;
const MS_MIN = 60_000;
const MS_H = 3_600_000;
const MS_D = 86_400_000;

function ms(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Dia BRT ('YYYY-MM-DD') de um instante ISO. */
function diaDe(iso) {
  const t = ms(iso);
  return t === null ? null : diaBrt(new Date(t));
}

/** Segunda-feira da semana do dia ('YYYY-MM-DD' → 'YYYY-MM-DD'). Calendário puro, sem fuso. */
function segundaDe(dia) {
  const [y, m, d] = String(dia).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const recuo = (dt.getUTCDay() + 6) % 7; // seg=0 … dom=6
  dt.setUTCDate(dt.getUTCDate() - recuo);
  return dt.toISOString().slice(0, 10);
}

/** Chave do balde de um DIA BRT, pela granularidade. */
function chaveDoDia(dia, gran = 'dia') {
  if (!dia) return null;
  if (gran === 'mes') return String(dia).slice(0, 7);
  if (gran === 'semana') return segundaDe(dia);
  return String(dia).slice(0, 10);
}

/** Chave do balde de um INSTANTE ISO (dia BRT → balde). */
function chaveSerie(iso, gran = 'dia') {
  return chaveDoDia(diaDe(iso), gran);
}

function proximaChave(chave, gran = 'dia') {
  if (gran === 'mes') {
    const [y, m] = String(chave).split('-').map(Number);
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  }
  const [y, m, d] = String(chave).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (gran === 'semana' ? 7 : 1));
  return dt.toISOString().slice(0, 10);
}

/**
 * Granularidade da série pela janela: até 31 dias em DIA (o pedido literal foi
 * "por dia"), depois semana, ano em mês — 365 pontos numa tela vira mancha.
 */
function granularidade({ dias, ano, inicio, fim } = {}) {
  if (ano) return 'mes';
  if (dias && dias <= 31) return 'dia';
  if (dias) return dias <= 180 ? 'semana' : 'mes';
  if (inicio && fim) {
    const n = Math.round((ms(`${fim}T12:00:00Z`) - ms(`${inicio}T12:00:00Z`)) / MS_D) + 1;
    return n <= 31 ? 'dia' : n <= 180 ? 'semana' : 'mes';
  }
  return 'dia';
}

/**
 * Limites UTC de uma janela de DIAS BRT (inclusive nas duas pontas): o dia BRT
 * `D` vai de `D 03:00Z` até `D+1 03:00Z`. Filtrar por `'YYYY-MM-DD'` cru seria
 * meia-noite UTC, ou seja 21h do dia ANTERIOR no Rio — a faixa do culto de
 * domingo à noite entraria no dia errado.
 */
function limitesUtc(inicioDia, fimDia) {
  const de = `${inicioDia}T03:00:00.000Z`;
  const [y, m, d] = String(fimDia).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
  return { de, ate: dt.toISOString() };
}

/** Sufixo de 8 dígitos — a MESMA chave de `whatsapp_envios.tel8` e do casamento do inbox. */
function tel8(telefone) {
  const d = String(telefone || '').replace(/\D+/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
}

/**
 * Série recebidas × enviadas por balde, com os baldes VAZIOS presentes: dia sem
 * mensagem é ZERO, não some (a lei do card de cadastros do Kids). Mensagem de
 * `tipo 'sistema'` (nota de transferência) não é conversa e fica fora.
 */
function montarSerie(mensagens, { inicio, fim, gran = 'dia', max = 400 } = {}) {
  if (!inicio || !fim) return [];
  const kFim = chaveDoDia(fim, gran);
  const baldes = new Map();
  const ordem = [];
  for (let k = chaveDoDia(inicio, gran); k && k <= kFim && ordem.length < max; k = proximaChave(k, gran)) {
    ordem.push(k);
    baldes.set(k, { chave: k, recebidas: 0, enviadas: 0 });
  }
  for (const m of Array.isArray(mensagens) ? mensagens : []) {
    if (!m || m.tipo === 'sistema') continue;
    const b = baldes.get(chaveSerie(m.criado_em, gran));
    if (!b) continue;
    if (m.direcao === 'in') b.recebidas += 1;
    else if (m.direcao === 'out') b.enviadas += 1;
  }
  return ordem.map(k => baldes.get(k));
}

/** Mensagens e conversas por área ('Entrada' = sem área), da mais movimentada para a menos. */
function agruparPorArea(mensagens, conversas) {
  const areaDe = new Map((Array.isArray(conversas) ? conversas : []).map(c => [c.id, c.area || ENTRADA]));
  const acc = new Map();
  const convsPorArea = new Map();
  for (const m of Array.isArray(mensagens) ? mensagens : []) {
    if (!m || m.tipo === 'sistema') continue;
    const area = areaDe.get(m.conversa_id) || ENTRADA;
    if (!acc.has(area)) { acc.set(area, { area, recebidas: 0, enviadas: 0, conversas: 0 }); convsPorArea.set(area, new Set()); }
    const a = acc.get(area);
    if (m.direcao === 'in') a.recebidas += 1;
    else if (m.direcao === 'out') a.enviadas += 1;
    convsPorArea.get(area).add(m.conversa_id);
  }
  for (const [area, set] of convsPorArea) acc.get(area).conversas = set.size;
  return [...acc.values()].sort((a, b) => (b.recebidas - a.recebidas) || (b.enviadas - a.enviadas) || a.area.localeCompare(b.area));
}

// ── "Sem resposta" · ESPELHO EXATO de src/lib/waConversaEstado.ts ────────────
// O inbox pinta o chip com esta régua no cliente; o dashboard conta com ela no
// servidor. `src/test/comunicacaoDashboard.test.ts` roda a MESMA tabela de
// casos nos dois lados — divergir é a tela e o número discordando.
function semResposta(c) {
  if (!c || c.resolvida) return false;
  const inb = ms(c.last_inbound_at);
  if (inb === null) return false;
  const ult = ms(c.last_message_at);
  return ult === null || inb >= ult;
}
function horasSemResposta(c, agoraMs) {
  const inb = ms(c?.last_inbound_at);
  if (inb === null) return null;
  return Math.max(0, (agoraMs - inb) / MS_H);
}
function vencida(horas) { return horas !== null && horas >= LIMITE_SEM_RESPOSTA_H; }

/**
 * Retrato das conversas AGORA (não da janela): quantas abertas, quantas
 * esperando, quantas há +48h, e a fila de quem espera há mais tempo. `novas`
 * é o único número da janela (conversa criada dentro dela).
 */
function resumoConversas(conversas, { agoraMs, inicio = null, fim = null, top = 20 } = {}) {
  const arr = (Array.isArray(conversas) ? conversas : []).filter(c => c && !c.deleted_at);
  const abertas = arr.filter(c => !c.resolvida);
  const esperando = abertas.filter(semResposta)
    .map(c => ({ ...c, horas: horasSemResposta(c, agoraMs) }))
    .sort((a, b) => (ms(a.last_inbound_at) ?? 0) - (ms(b.last_inbound_at) ?? 0));
  const vencidas = esperando.filter(c => vencida(c.horas));
  const novas = inicio && fim
    ? arr.filter(c => { const d = diaDe(c.created_at); return d && d >= inicio && d <= fim; }).length
    : null;
  return {
    abertas: abertas.length,
    sem_resposta: esperando.length,
    vencidas: vencidas.length,
    novas,
    lista: esperando.slice(0, top).map(c => ({
      id: c.id, nome: c.nome || null, telefone: c.telefone, area: c.area || ENTRADA,
      atribuido_a: c.atribuido_a || null, horas: Math.round((c.horas || 0) * 10) / 10,
      vencida: vencida(c.horas), last_inbound_at: c.last_inbound_at,
    })),
  };
}

/**
 * Tempo de resposta HUMANA: em cada conversa, a espera começa na PRIMEIRA
 * mensagem da pessoa depois da última saída nossa e termina na próxima saída.
 * Só vira amostra quando a saída é de GENTE (`autor_id`); bot, template e
 * pesquisa encerram a espera (a pessoa recebeu algo) mas não contam como
 * tempo de atendente. Nota de `tipo 'sistema'` não é resposta.
 */
function temposDeResposta(mensagens, conversas) {
  const areaDe = new Map((Array.isArray(conversas) ? conversas : []).map(c => [c.id, c.area || ENTRADA]));
  const porConv = new Map();
  for (const m of Array.isArray(mensagens) ? mensagens : []) {
    if (!m?.conversa_id || m.tipo === 'sistema') continue;
    const t = ms(m.criado_em);
    if (t === null) continue;
    if (!porConv.has(m.conversa_id)) porConv.set(m.conversa_id, []);
    porConv.get(m.conversa_id).push({ direcao: m.direcao, autor_id: m.autor_id || null, t, criado_em: m.criado_em });
  }
  const amostras = [];
  for (const [cid, lista] of porConv) {
    lista.sort((a, b) => a.t - b.t);
    let esperandoDesde = null;
    for (const m of lista) {
      if (m.direcao === 'in') { if (esperandoDesde === null) esperandoDesde = m.t; continue; }
      if (m.direcao !== 'out') continue;
      if (esperandoDesde !== null && m.autor_id) {
        amostras.push({ conversa_id: cid, autor_id: m.autor_id, area: areaDe.get(cid) || ENTRADA, minutos: (m.t - esperandoDesde) / MS_MIN, em: m.criado_em });
      }
      esperandoDesde = null;
    }
  }
  return amostras;
}

function mediana(xs) {
  const a = xs.filter(x => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const meio = Math.floor(a.length / 2);
  return a.length % 2 ? a[meio] : (a[meio - 1] + a[meio]) / 2;
}
function media(xs) {
  const a = xs.filter(x => Number.isFinite(x));
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}
const arr1 = v => (v === null ? null : Math.round(v * 10) / 10);

/** Agrega amostras de tempo por `autor_id` ou por `area`, com o n na frente. */
function agregarTempos(amostras, chave) {
  const grupos = new Map();
  for (const a of Array.isArray(amostras) ? amostras : []) {
    const k = a[chave];
    if (!k) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(a.minutos);
  }
  return [...grupos.entries()]
    .map(([k, xs]) => ({ [chave]: k, n: xs.length, mediana_min: arr1(mediana(xs)), media_min: arr1(media(xs)) }))
    .sort((a, b) => b.n - a.n || (a.mediana_min ?? Infinity) - (b.mediana_min ?? Infinity));
}

/**
 * Engajamento dos DISPAROS: % dos envios que receberam mensagem da pessoa em
 * até `janelaDias`. Casa pelo `tel8` (a MESMA chave de `whatsapp_envios`). Sem
 * envio na janela, taxa é null — nunca 0%, que se lê como "ninguém respondeu".
 */
function engajamentoDisparos(envios, inbounds, { janelaDias = 7 } = {}) {
  const porTel = new Map();
  for (const i of Array.isArray(inbounds) ? inbounds : []) {
    const k = tel8(i?.tel8 || i?.telefone);
    const t = typeof i?.t === 'number' ? i.t : ms(i?.criado_em);
    if (!k || t === null) continue;
    if (!porTel.has(k)) porTel.set(k, []);
    porTel.get(k).push(t);
  }
  const jan = janelaDias * MS_D;
  const porModulo = new Map();
  let enviados = 0, respondidos = 0;
  for (const e of Array.isArray(envios) ? envios : []) {
    const k = tel8(e?.tel8 || e?.telefone);
    const t0 = ms(e?.enviado_em || e?.criado_em);
    if (!k || t0 === null) continue;
    enviados += 1;
    const modulo = String(e.contexto || 'sem_contexto').split('.')[0] || 'sem_contexto';
    if (!porModulo.has(modulo)) porModulo.set(modulo, { modulo, enviados: 0, respondidos: 0 });
    const pm = porModulo.get(modulo);
    pm.enviados += 1;
    const resp = (porTel.get(k) || []).some(t => t > t0 && t <= t0 + jan);
    if (resp) { respondidos += 1; pm.respondidos += 1; }
  }
  const taxa = (r, e) => (e ? Math.round((r / e) * 1000) / 10 : null);
  return {
    enviados, respondidos, taxa_pct: taxa(respondidos, enviados), janela_dias: janelaDias,
    por_modulo: [...porModulo.values()].map(m => ({ ...m, taxa_pct: taxa(m.respondidos, m.enviados) }))
      .sort((a, b) => b.enviados - a.enviados),
  };
}

module.exports = {
  ENTRADA, LIMITE_SEM_RESPOSTA_H,
  diaDe, segundaDe, chaveDoDia, chaveSerie, proximaChave, granularidade, limitesUtc, tel8,
  montarSerie, agruparPorArea, semResposta, horasSemResposta, vencida, resumoConversas,
  temposDeResposta, mediana, media, agregarTempos, engajamentoDisparos,
};
