/**
 * Cerebro CBRio — Busca textual no vault para o Assistente IA (RAG).
 *
 * Consultada pelo agentContext antes de cada chamada ao Claude: dada a
 * pergunta do usuário, retorna até N notas relevantes do vault, filtradas
 * pela permissão do usuário (não vaza nota de financeiro pra quem não tem
 * acesso ao módulo financeiro).
 *
 * Fontes atualmente indexadas:
 *  - cerebro_entidades_indice (notas geradas pelo sync reverso ERP → vault)
 *  - cerebro_fila (status='concluido', notas geradas pelo processamento
 *    de documentos do SharePoint — trazem resumo + tags)
 */

const { supabase } = require('../utils/supabase');
const { getEffectiveLevel } = require('../middleware/auth');

// ── Mapa area_vault (pasta no vault) → routeKey de permissão ─────────
// Usado para filtrar resultados do cerebro_entidades_indice.
const AREA_VAULT_TO_ROUTE_KEY = {
  '01-crm-pessoas/membros':       'membresia',
  '02-eventos':                   'events',
  '03-projetos':                  'projects',
  '04-financas/contribuicoes':    'financeiro',
  '04-financas':                  'financeiro',
  '06-ministerios/voluntariado':  'voluntariado',
  '06-ministerios/cuidados':      'cuidados',
  '08-administrativo/rh':         'rh',
};

// ── Mapa biblioteca (origem no SharePoint) → routeKey ────────────────
// Usado para filtrar resultados do cerebro_fila.
// Quando a biblioteca é genérica (ex: Gestão) cobre vários módulos —
// exigimos admin/diretor para esses resultados (via 'admin_only').
const BIBLIOTECA_TO_ROUTE_KEY = {
  'CRM e Pessoas':  'membresia',
  'Ministerial':    'membresia',
  'Planejamento':   'events',
  'Gestão':         'admin_only',
  'Criativo':       'admin_only',
};

const MAX_RESULTS_DEFAULT = 5;
const MAX_QUERY_TERMS = 5;

/**
 * Retorna true se o usuário pode ver o conteúdo naquele módulo.
 */
function canReadRouteKey(req, routeKey) {
  if (!req || !req.user) return false;
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  if (routeKey === 'admin_only') return false;
  if (!routeKey) return true;
  return getEffectiveLevel(req, routeKey) >= 2;
}

/**
 * Extrai termos úteis (stop-words removidas, mín 3 chars, normalizados).
 */
function extractTerms(query) {
  const stop = new Set([
    'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'um', 'uma',
    'uns', 'umas', 'para', 'por', 'com', 'sem', 'em', 'no', 'na', 'nos',
    'nas', 'que', 'e', 'ou', 'mas', 'se', 'eu', 'voce', 'ele', 'ela',
    'nos', 'vocês', 'eles', 'elas', 'meu', 'minha', 'seu', 'sua', 'qual',
    'quais', 'quando', 'como', 'onde', 'quem', 'quantos', 'quantas',
    'temos', 'tem', 'ter', 'foi', 'ser', 'está', 'estao', 'são', 'sao',
  ]);
  return String(query || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stop.has(w))
    .slice(0, MAX_QUERY_TERMS);
}

/**
 * Busca no vault (entidades sincronizadas + notas ingeridas).
 * @param {string} query — pergunta do usuário
 * @param {object} req — Express request (com req.user)
 * @param {number} limit — máximo de resultados devolvidos
 * @returns {Promise<Array>} [{ titulo, resumo, area_vault, url, origem }]
 */
async function searchVault(query, req, limit = MAX_RESULTS_DEFAULT) {
  const terms = extractTerms(query);
  if (!terms.length) return [];

  const results = [];

  // ── 1. cerebro_entidades_indice: busca por titulo (ilike) ─────────
  try {
    // ilike %termo% em titulo para cada termo, combinados via OR.
    const orCondition = terms.map((t) => `titulo.ilike.%${t}%`).join(',');
    const { data } = await supabase
      .from('cerebro_entidades_indice')
      .select('titulo, area_vault, note_path, sharepoint_url, entity_type, atualizada_em')
      .or(orCondition)
      .order('atualizada_em', { ascending: false })
      .limit(limit * 3); // sobra p/ filtrar por permissão depois

    for (const row of data || []) {
      const routeKey = AREA_VAULT_TO_ROUTE_KEY[row.area_vault]
        || (row.area_vault ? AREA_VAULT_TO_ROUTE_KEY[row.area_vault.split('/')[0]] : null);
      if (!canReadRouteKey(req, routeKey)) continue;
      results.push({
        titulo: row.titulo,
        area_vault: row.area_vault,
        note_path: row.note_path,
        url: row.sharepoint_url || null,
        entity_type: row.entity_type,
        origem: 'sync-erp',
      });
    }
  } catch (e) {
    console.warn('[CEREBRO SEARCH] indice falhou:', e.message);
  }

  // ── 2. cerebro_fila: notas geradas por ingestão de documentos ─────
  try {
    const orCondition = terms
      .map((t) => `nome_arquivo.ilike.%${t}%,resumo.ilike.%${t}%`)
      .join(',');
    const { data } = await supabase
      .from('cerebro_fila')
      .select('nome_arquivo, biblioteca, nota_path, resumo, tags, sharepoint_url, processado_em')
      .eq('status', 'concluido')
      .or(orCondition)
      .order('processado_em', { ascending: false })
      .limit(limit * 3);

    for (const row of data || []) {
      const routeKey = BIBLIOTECA_TO_ROUTE_KEY[row.biblioteca];
      if (!canReadRouteKey(req, routeKey)) continue;
      results.push({
        titulo: row.nome_arquivo,
        resumo: row.resumo ? row.resumo.slice(0, 400) : null,
        biblioteca: row.biblioteca,
        note_path: row.nota_path,
        url: row.sharepoint_url || null,
        tags: row.tags,
        origem: 'ingestao-sharepoint',
      });
    }
  } catch (e) {
    console.warn('[CEREBRO SEARCH] fila falhou:', e.message);
  }

  // Dedup por note_path e corta no limite final.
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    const key = r.note_path || r.titulo;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

module.exports = { searchVault, extractTerms };
