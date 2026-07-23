// Leitor do motor de fluxo configurável de Solicitações (Fase 1 · read-only).
// Nada de escrita aqui. Serve a config pro visualizador e, no futuro (Fase 3),
// pro roteamento. Cache curto em processo (config muda raramente).
const { supabase } = require('../utils/supabase');

const TTL_MS = 5 * 60 * 1000;
const _cache = new Map(); // categoria -> { at, data }

// Lista as categorias que têm um fluxo ativo.
async function listCategoriasComFluxo() {
  const { data, error } = await supabase
    .from('solic_fluxos')
    .select('categoria, versao, nome, descricao')
    .eq('is_ativa', true)
    .is('deleted_at', null)
    .order('categoria', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Fluxo ATIVO de uma categoria, com etapas (+ responsáveis) e transições.
async function getFluxoAtivo(categoria) {
  const hit = _cache.get(categoria);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const { data: fluxo, error: fErr } = await supabase
    .from('solic_fluxos')
    .select('*')
    .eq('categoria', categoria)
    .eq('is_ativa', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (fErr) throw fErr;
  if (!fluxo) { _cache.set(categoria, { at: Date.now(), data: null }); return null; }

  const [etapasRes, transRes] = await Promise.all([
    supabase.from('solic_fluxo_etapas').select('*')
      .eq('fluxo_id', fluxo.id).is('deleted_at', null).order('ordem', { ascending: true }),
    supabase.from('solic_fluxo_transicoes').select('*')
      .eq('fluxo_id', fluxo.id).is('deleted_at', null).order('ordem', { ascending: true }),
  ]);
  if (etapasRes.error) throw etapasRes.error;
  if (transRes.error) throw transRes.error;
  const etapas = etapasRes.data || [];
  const transicoes = transRes.data || [];

  // Responsáveis por etapa (com nome/e-mail do profile).
  const etapaIds = etapas.map(e => e.id);
  const respByEtapa = {};
  if (etapaIds.length) {
    const { data: resp } = await supabase
      .from('solic_fluxo_etapa_responsaveis')
      .select('etapa_id, profile_id, profiles(name, email)')
      .in('etapa_id', etapaIds)
      .is('deleted_at', null);
    (resp || []).forEach(r => {
      (respByEtapa[r.etapa_id] ||= []).push({
        profile_id: r.profile_id,
        nome: r.profiles?.name || null,
        email: r.profiles?.email || null,
      });
    });
  }

  const data = {
    id: fluxo.id,
    categoria: fluxo.categoria,
    versao: fluxo.versao,
    nome: fluxo.nome,
    descricao: fluxo.descricao,
    etapas: etapas.map(e => ({ ...e, responsaveis: respByEtapa[e.id] || [] })),
    transicoes,
  };
  _cache.set(categoria, { at: Date.now(), data });
  return data;
}

function bustCache(categoria) {
  if (categoria) _cache.delete(categoria); else _cache.clear();
}

module.exports = { listCategoriasComFluxo, getFluxoAtivo, bustCache };
