// ============================================================================
// Escritor ÚNICO de status de `vol_inscricoes`.
//
// Existe pra garantir um invariante em TODOS os caminhos que mudam o status:
// sair de 'integrado' limpa o carimbo `integrado_em`. São três hoje — a
// triagem do Voluntariado (PATCH /inscricoes/:id), a desistência
// (POST /inscricoes/:id/desistiu) e o PATCH do Kids
// (/totem-kids/voluntariado-inscricoes/:id). Três cópias da mesma decisão
// divergiriam no primeiro caminho novo.
//
// A régua de decisão é pura e mora em `utils/volIntegradoEm.js` (no gate).
// ============================================================================

const { supabase } = require('../utils/supabase');
const { deveLimparCarimbo } = require('../utils/volIntegradoEm');

/**
 * Aplica o patch preservando o invariante do carimbo.
 *
 * ⚠️ O UPDATE é condicionado ao estado de ORIGEM (`.eq('status','integrado')`),
 * que é o padrão da casa pra efeito colateral amarrado a uma transição — e não
 * um SELECT-depois-UPDATE. Dois coordenadores na mesma ficha ao mesmo tempo
 * fariam o SELECT ler o estado errado e o carimbo ficaria órfão; e o erro do
 * SELECT (descartado) faria o guard concluir "não era integrado" em silêncio.
 *
 * @param {string} id     id da inscrição
 * @param {object} patch  colunas a gravar (inclui `status` quando há transição)
 * @returns {Promise<object>} a linha atualizada
 */
async function atualizarStatusInscricao(id, patch) {
  const statusNovo = patch?.status;

  // Quem já passa `integrado_em` explícito manda nele — não sobrescrevemos.
  const podeLimpar = deveLimparCarimbo('integrado', statusNovo)
    && !Object.prototype.hasOwnProperty.call(patch, 'integrado_em');

  if (podeLimpar) {
    const { data, error } = await supabase.from('vol_inscricoes')
      .update({ ...patch, integrado_em: null })
      .eq('id', id)
      .eq('status', 'integrado')   // só a transição REAL limpa
      .select();
    if (error) throw error;
    if (data && data.length) return data[0];
    // 0 linhas = a linha não estava 'integrado'. Segue pro update normal, que
    // preserva o texto legado da planilha em `integrado_em`.
  }

  const { data, error } = await supabase.from('vol_inscricoes')
    .update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

module.exports = { atualizarStatusInscricao };
