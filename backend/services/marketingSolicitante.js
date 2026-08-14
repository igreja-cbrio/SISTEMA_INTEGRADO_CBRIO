// ============================================================================
// Resolve o SOLICITANTE de um card do Marketing lendo o banco.
// A régua de decisão é PURA e vive em `utils/marketingSolicitante.js` (no gate
// de deploy). Aqui só há consulta — não duplicar régua neste arquivo.
// ============================================================================
const { supabase } = require('../utils/supabase');
const { escolherVinculoSolicitante } = require('../utils/marketingSolicitante');

const CAMPOS_CARD = 'id, origem, estado, titulo, solicitacao_id, campanha_id';

// Devolve { solicitacao_id, solicitante_id, titulo_solicitacao, via } ou null.
//
// ⚠️ `solicitante_id` sai SEMPRE da tabela `solicitacoes`, nunca do atalho
// `marketing_campanhas.solicitante_id`: quem é o dono do pedido é decisão do
// módulo de Solicitações, e o atalho pode envelhecer. Este valor AUTORIZA
// download de arquivo — então vem da fonte.
//
// ⚠️ Falha de CONSULTA devolve `{ erro: true }`, nunca `null`. `null` significa
// "este card não tem solicitante" (ciclo criativo) e é resposta legítima; tratar
// instabilidade de banco como "não tem dono" faria o download liberar ou negar
// pelo motivo errado, em silêncio.
async function solicitanteDoCard(cardOuId) {
  let card = cardOuId;

  if (typeof cardOuId === 'string') {
    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .select(CAMPOS_CARD)
      .eq('id', cardOuId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return { erro: true, motivo: error.message };
    card = data;
  }
  if (!card) return null;

  let campanha = null;
  if (!card.solicitacao_id && card.campanha_id) {
    const { data, error } = await supabase
      .from('marketing_campanhas')
      .select('id, solicitacao_id, solicitante_id, deleted_at')
      .eq('id', card.campanha_id)
      .maybeSingle();
    if (error) return { erro: true, motivo: error.message };
    campanha = data;
  }

  const vinculo = escolherVinculoSolicitante({ card, campanha });
  if (!vinculo) return null;

  const { data: sol, error: eSol } = await supabase
    .from('solicitacoes')
    .select('id, solicitante_id, titulo')
    .eq('id', vinculo.solicitacao_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (eSol) return { erro: true, motivo: eSol.message };

  // Solicitação apagada = o pedido não existe mais. Não há a quem avisar nem
  // quem autorizar — e isso NÃO é erro.
  if (!sol) return null;

  return {
    solicitacao_id: sol.id,
    solicitante_id: sol.solicitante_id || null,
    titulo_solicitacao: sol.titulo || null,
    via: vinculo.via,
  };
}

// `true` quando este usuário é o solicitante do card. Usado para AUTORIZAR
// leitura/download — por isso é fail-closed: erro de consulta nega.
async function ehSolicitanteDoCard(cardOuId, userId) {
  if (!userId) return false;
  const r = await solicitanteDoCard(cardOuId);
  if (!r || r.erro) return false;
  return r.solicitante_id === userId;
}

module.exports = { solicitanteDoCard, ehSolicitanteDoCard };
