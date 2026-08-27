// ════════════════════════════════════════════════════════════════════════════
//  Quem é RESPONSÁVEL por uma tarefa da campanha — régua PURA
//
//  Três formas, e elas convivem (pedido do Matheus · 27/08): uma pessoa, várias
//  pessoas, ou uma ÁREA inteira. "Marketing + Pedro" é o caso comum — a área
//  responde e uma pessoa puxa.
//
//  ⚠️ Vive em `utils/` (sem tocar o banco) porque é aqui que se decide QUEM
//  recebe aviso de que ganhou uma tarefa, e essa decisão tem de ser testável sem
//  Supabase — o gate de deploy roda sem as dependências de `backend/`.
//
//  ⚠️ O RÓTULO de exibição ("sem responsável" × "a área toda") mora SÓ na tela
//  (`src/pages/Campanhas.tsx`), de propósito: um gêmeo aqui não teria chamador
//  nenhum e divergiria da tela no primeiro ajuste — é a regra da casa de não
//  manter código morto como se fosse referência viva.
// ════════════════════════════════════════════════════════════════════════════

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Teto de responsáveis por tarefa.
 *
 * ⚠️ Existe porque cada pessoa nova ganha uma NOTIFICAÇÃO: atribuir uma tarefa a
 * 40 pessoas viraria 40 avisos de uma vez, e o sino desta igreja já tem histórico
 * de inundação (10.914 avisos em 21 dias, 88% não lidos). Tarefa que precisa de
 * mais de 12 pessoas é uma ÁREA — e área é o outro caminho, que avisa quem cuida
 * dela sem nomear uma multidão.
 */
const MAX_RESPONSAVEIS = 12;

/**
 * Normaliza a lista que veio do cliente.
 *
 * Devolve `{ ids, invalidos, truncados }` — os três, sempre. O chamador DECLARA
 * o que ficou de fora: descartar em silêncio faz a pessoa salvar, ver menos gente
 * do que marcou e concluir que a tela está quebrada.
 */
function normalizarResponsaveis(bruto) {
  const lista = Array.isArray(bruto) ? bruto : (bruto === undefined || bruto === null ? [] : [bruto]);
  const ids = [];
  const invalidos = [];
  const vistos = new Set();

  for (const item of lista) {
    // Aceita string ou objeto ({id} / {profile_id}) — as duas formas existem no
    // front (o multi-select devolve objeto; um reenvio devolve string), e obrigar
    // a chamada a converter é como se fabrica divergência entre chamadores.
    const cru = typeof item === 'string' ? item
      : (item && typeof item === 'object' ? (item.profile_id ?? item.id) : null);
    const id = String(cru ?? '').trim();
    if (!UUID_RE.test(id)) { if (id) invalidos.push(id); continue; }
    const chave = id.toLowerCase();
    if (vistos.has(chave)) continue;   // marcar a mesma pessoa 2× não é erro, é ruído
    vistos.add(chave);
    ids.push(id);
  }

  const truncados = Math.max(0, ids.length - MAX_RESPONSAVEIS);
  return { ids: ids.slice(0, MAX_RESPONSAVEIS), invalidos, truncados };
}

/** Área válida = inteiro positivo. `null`/`''` significa "tirar a área". */
function normalizarArea(bruto) {
  if (bruto === null || bruto === '' || bruto === undefined) return null;
  const n = Number(bruto);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * O que MUDOU entre a atribuição atual e a nova.
 *
 * ⚠️⚠️ É o coração do aviso: notifica só quem ENTROU. Sem isso, salvar a tarefa
 * três vezes (mudar o prazo, corrigir o título, mexer no status) mandaria três
 * avisos para as MESMAS pessoas — o padrão que treina a equipe a ignorar o sino.
 * É a mesma régua do `.select('id')` amarrando efeito à transição real.
 */
function diffResponsaveis(atuais, novos) {
  const norm = (l) => new Set((Array.isArray(l) ? l : []).map((x) => {
    const v = typeof x === 'string' ? x : (x?.profile_id ?? x?.id);
    return String(v ?? '').trim().toLowerCase();
  }).filter(Boolean));

  const a = norm(atuais);
  const b = norm(novos);
  return {
    adicionados: [...b].filter((x) => !a.has(x)),
    removidos: [...a].filter((x) => !b.has(x)),
    inalterados: [...b].filter((x) => a.has(x)),
  };
}

/**
 * Quem recebe o aviso "você ganhou uma tarefa".
 *
 * ⚠️ Pessoa nomeada SEMPRE recebe. Área só avisa quando **não há ninguém
 * nomeado**: com "Marketing + Pedro", o Pedro é quem puxa — avisar a área
 * inteira junto transformaria toda atribuição nominal em 7 avisos.
 *
 * ⚠️ E quem acabou de atribuir NÃO se avisa a si mesmo (`autorId`): aviso que a
 * própria pessoa acabou de causar é ruído puro.
 */
function destinatariosDoAviso({ adicionados = [], pessoasDaArea = [], autorId = null } = {}) {
  const fora = new Set([String(autorId ?? '').toLowerCase()].filter(Boolean));
  const nominais = adicionados.map((x) => String(x).toLowerCase()).filter((x) => !fora.has(x));
  if (nominais.length) return { ids: [...new Set(nominais)], via: 'pessoa' };

  const daArea = (Array.isArray(pessoasDaArea) ? pessoasDaArea : [])
    .map((p) => String(typeof p === 'string' ? p : (p?.profile_id ?? p?.id) ?? '').toLowerCase())
    .filter((x) => x && !fora.has(x));
  if (daArea.length) return { ids: [...new Set(daArea)], via: 'area' };

  return { ids: [], via: null };
}

module.exports = {
  MAX_RESPONSAVEIS,
  normalizarResponsaveis,
  normalizarArea,
  diffResponsaveis,
  destinatariosDoAviso,
};
