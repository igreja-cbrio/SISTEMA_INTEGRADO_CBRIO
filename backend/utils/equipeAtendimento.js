// Equipe de atendimento do inbox de WhatsApp — régua PURA (08/09/2026).
//
// Pedido do Marcos (redesenho da Comunicação): "quem é responsável por receber
// as mensagens daquela área; uma pessoa poderá ser responsável por mais de uma
// área". A tabela é `wa_equipe_atendimento` (área → titular + suplente) e a
// chave 'Entrada' cobre a conversa que ainda não tem área — onde 162 das 232
// conversas estavam em 08/09, sem ninguém ser avisado.
//
// ⚠️ Vive em utils/ (sem Supabase) para entrar no gate de deploy. Quem lê o
// banco, atribui e avisa é services/waEquipe.js.

const ENTRADA = 'Entrada';
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizarArea(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Área da conversa como chave da equipe: vazia/nula ⇒ 'Entrada'. */
function chaveDaArea(area) {
  const a = String(area || '').trim();
  return a || ENTRADA;
}

function uuidOuNull(v) {
  const s = String(v || '').trim();
  return RE_UUID.test(s) ? s.toLowerCase() : null;
}

/**
 * Quem recebe a conversa daquela área: o TITULAR; sem titular (ou titular
 * marcado indisponível), o SUPLENTE; sem os dois, ninguém (null) — e aí vale o
 * comportamento antigo (avisar a área inteira, sem atribuir).
 *
 * `indisponiveis` = profile_ids que não podem receber agora (férias, fora do
 * horário). Hoje ninguém a preenche — é o gancho do escalonamento
 * titular → suplente, sem mudar a régua no dia em que ele existir.
 */
function decidirResponsavel({ area, equipe = [], indisponiveis = [] } = {}) {
  const alvo = chaveDaArea(area);
  const alvoN = normalizarArea(alvo);
  const row = (Array.isArray(equipe) ? equipe : []).find(r => r && normalizarArea(r.area) === alvoN);
  if (!row) return null;
  const fora = new Set((Array.isArray(indisponiveis) ? indisponiveis : []).map(uuidOuNull).filter(Boolean));
  const titular = uuidOuNull(row.titular_id);
  const suplente = uuidOuNull(row.suplente_id);
  if (titular && !fora.has(titular)) return { profileId: titular, papel: 'titular', area: alvo };
  if (suplente && !fora.has(suplente)) return { profileId: suplente, papel: 'suplente', area: alvo };
  return null;
}

/** Atribuição automática só entra onde NÃO há decisão humana: conversa sem responsável. */
function podeAutoAtribuir(conv) {
  return !!conv && !conv.atribuido_a;
}

/**
 * Valida o corpo do PUT /comunicacao/equipe/:area.
 * ⚠️ Titular e suplente não podem ser a MESMA pessoa: o suplente existe pra
 * quando o titular não pode — a mesma pessoa nos dois é suplente nenhum.
 */
function validarEquipe({ area, titular_id, suplente_id } = {}) {
  const a = String(area || '').trim();
  if (!a) return { ok: false, erro: 'Área obrigatória.' };
  if (a.length > 80) return { ok: false, erro: 'Nome de área longo demais.' };
  const vazio = v => v == null || v === '';
  const t = vazio(titular_id) ? null : uuidOuNull(titular_id);
  const s = vazio(suplente_id) ? null : uuidOuNull(suplente_id);
  if (!vazio(titular_id) && !t) return { ok: false, erro: 'Titular inválido.' };
  if (!vazio(suplente_id) && !s) return { ok: false, erro: 'Suplente inválido.' };
  if (t && s && t === s) return { ok: false, erro: 'Titular e suplente não podem ser a mesma pessoa.' };
  return { ok: true, valor: { area: a, titular_id: t, suplente_id: s } };
}

/**
 * Texto do aviso a quem recebeu a conversa. Determinístico. `origem` diz de
 * onde a conversa veio — a ação de quem lê muda: responder quem escreveu agora
 * não é o mesmo que receber uma transferência.
 */
function textoAviso({ nome, area, papel, cadastrada = true, origem = 'inbox' } = {}) {
  const rot = chaveDaArea(area);
  const quem = String(nome || '').trim() || 'Contato';
  const marca = cadastrada ? '' : ' (⚠️ não cadastrado na membresia)';
  const sup = papel === 'suplente' ? ' (você é o suplente da área)' : '';
  let corpo;
  if (origem === 'triagem') corpo = `${quem}${marca} foi movida para ${rot}`;
  else if (origem === 'disparo') corpo = `${quem}${marca} respondeu um disparo de ${rot}`;
  else if (origem === 'menu') corpo = `${quem}${marca} quer falar com ${rot}`;
  else if (rot === ENTRADA) corpo = `${quem}${marca} escreveu e a conversa ainda não tem área`;
  else corpo = `${quem}${marca} escreveu para ${rot}`;
  return { titulo: `Nova conversa · ${rot}`, mensagem: `${corpo} — atribuída a você${sup}.` };
}

/**
 * Linhas da tela: 'Entrada' primeiro, depois o catálogo de áreas, com o que já
 * está configurado. Área configurada que saiu do catálogo CONTINUA aparecendo
 * (marcada) — a decisão de alguém não some da tela porque outra pessoa
 * desativou a área.
 */
function montarLinhas({ areas = [], equipe = [] } = {}) {
  const eq = Array.isArray(equipe) ? equipe.filter(Boolean) : [];
  const porChave = new Map(eq.map(r => [normalizarArea(r.area), r]));
  const nomes = [ENTRADA, ...(Array.isArray(areas) ? areas : []).map(a => String(a || '').trim()).filter(Boolean)];
  const vistos = new Set();
  const linhas = [];
  for (const n of nomes) {
    const k = normalizarArea(n);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const r = porChave.get(k);
    linhas.push({
      area: n,
      titular_id: uuidOuNull(r?.titular_id),
      suplente_id: uuidOuNull(r?.suplente_id),
      configurada: !!(r && (uuidOuNull(r.titular_id) || uuidOuNull(r.suplente_id))),
    });
  }
  for (const r of eq) {
    const k = normalizarArea(r.area);
    if (vistos.has(k)) continue;
    vistos.add(k);
    linhas.push({
      area: String(r.area || '').trim(),
      titular_id: uuidOuNull(r.titular_id),
      suplente_id: uuidOuNull(r.suplente_id),
      configurada: !!(uuidOuNull(r.titular_id) || uuidOuNull(r.suplente_id)),
      fora_do_catalogo: true,
    });
  }
  return linhas;
}

module.exports = {
  ENTRADA, normalizarArea, chaveDaArea, decidirResponsavel, podeAutoAtribuir,
  validarEquipe, textoAviso, montarLinhas,
};
