/**
 * Base de conhecimento do sistema — busca full-text para o Assistente (Jarvis).
 *
 * FASE 1: responde perguntas de CONHECIMENTO ("como faço X", "o que significa
 * esse KPI", "o que cada módulo faz") a partir de conteúdo CURADO e NÃO-PII na
 * tabela `cerebro_conhecimento`, buscado por full-text do Postgres (tsv).
 *
 * Complementa o cerebroSearch (que indexa docs do SharePoint / entidades do
 * ERP). Aqui NÃO há PII — é ajuda/glossário do próprio sistema.
 *
 * Permissão: conteúdo geral (route_key NULL) é visível a qualquer autenticado.
 * Conteúdo específico de módulo (route_key preenchido) só é devolvido a quem
 * tem nível >= 1 no módulo — o mesmo padrão de filtro-antes-do-LLM do
 * cerebroSearch (filtra ANTES de mandar pro modelo, nunca depois).
 */

const { supabase } = require('../utils/supabase');
const { getEffectiveLevel } = require('../middleware/auth');
const { extractTerms } = require('./cerebroSearch');

const MAX_RESULTS_DEFAULT = 6;

/**
 * O usuário pode ver conteúdo daquela route_key?
 * - route_key NULL/vazia → geral, todos os autenticados.
 * - admin/diretor → tudo.
 * - senão → nível >= 1 no módulo correspondente.
 */
function canReadRouteKey(req, routeKey) {
  if (!req || !req.user) return false;
  if (!routeKey) return true;
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  return getEffectiveLevel(req, routeKey) >= 1;
}

/**
 * Monta a query websearch do Postgres a partir da pergunta do usuário.
 * Usa os termos já normalizados (stop-words fora) ligados por OR, para
 * casar quando a pergunta e o conteúdo não usam exatamente as mesmas palavras.
 */
function buildTsQuery(query) {
  const terms = extractTerms(query);
  if (!terms.length) return null;
  return terms.join(' | ');
}

/**
 * Busca na base de conhecimento do sistema.
 * @param {string} query — pergunta do usuário
 * @param {object} req — Express request (com req.user para filtrar permissão)
 * @param {number} limit — máximo de resultados
 * @returns {Promise<Array>} [{ titulo, secao, conteudo, fonte, tags }]
 */
async function searchConhecimento(query, req, limit = MAX_RESULTS_DEFAULT) {
  const tsQuery = buildTsQuery(query);
  if (!tsQuery) return [];

  try {
    const { data, error } = await supabase
      .from('cerebro_conhecimento')
      .select('titulo, secao, conteudo, fonte, tags, route_key')
      .eq('ativo', true)
      .textSearch('tsv', tsQuery, { config: 'portuguese' })
      .limit(limit * 3); // sobra pra filtrar por permissão

    if (error) throw error;

    const results = [];
    for (const row of data || []) {
      if (!canReadRouteKey(req, row.route_key)) continue;
      results.push({
        titulo: row.titulo,
        secao: row.secao || null,
        conteudo: row.conteudo,
        fonte: row.fonte,
        tags: row.tags || [],
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch (e) {
    console.warn('[CONHECIMENTO] busca falhou:', e.message);
    return [];
  }
}

module.exports = { searchConhecimento };
