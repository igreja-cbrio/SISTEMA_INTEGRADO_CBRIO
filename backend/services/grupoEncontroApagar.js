// ============================================================================
// APAGAR UMA CHAMADA de grupo · o único caminho (25/08/2026)
//
// ⚠️⚠️ POR QUE ISTO É UM SERVIÇO: nasceu dentro de
// `DELETE /api/grupos/encontros/:encontroId` e passou a ser necessário no fluxo
// de *"registrar que o encontro não aconteceu"* (Marcos · 25/08), que antes era
// um BECO SEM SAÍDA — o servidor recusava quando o dia tinha chamada e mandava
// o líder falar com a coordenação.
//
// ⚠️⚠️ APAGAR CHAMADA NÃO É APAGAR UMA LINHA. `registrar_encontro_grupo`
// INCREMENTA `mem_grupo_membros.presencas` de cada presente, e esse contador
// alimenta a régua de visitante→frequentador (lei de 14/08: "vira frequentador
// na 1ª presença") e a média de presença das telas. Um `delete` cru deixaria o
// contador inflado PRA SEMPRE, sem erro nenhum — e ninguém descobriria, porque
// contador errado parece dado. Por isso o decremento vem ANTES e é por pessoa.
//
// ⚠️ HARD delete, e é o comportamento que já existia: `mem_grupo_encontros` está
// na whitelist de soft-delete, mas o CLAUDE.md registra que a conversão daquela
// família está PENDENTE justamente porque soft-delete ingênuo deixaria a linha
// CONTINUANDO A CONTAR nos KPIs. Mudar isso aqui, de carona, seria trocar um
// problema visível por um invisível. Fica como está, agora com o porquê escrito.
// ============================================================================
const { supabase } = require('../utils/supabase');

/**
 * Devolve `{ ok, presentes }` — quantas presenças foram revertidas.
 * `null` de encontro inexistente NÃO é erro: apagar duas vezes é idempotente.
 */
async function apagarEncontroGrupo(encontroId) {
  const { data: presencas, error: eP } = await supabase.from('mem_grupo_encontro_presencas')
    .select('membro_id, mem_grupo_encontros!inner(grupo_id)')
    .eq('encontro_id', encontroId);
  if (eP) throw eP;

  const grupoId = presencas?.[0]?.mem_grupo_encontros?.grupo_id;

  // O DELETE cascateia as presenças; ANTES disso, devolve o contador de cada um.
  if (grupoId && presencas?.length) {
    for (const p of presencas) {
      if (!p.membro_id) continue;
      await supabase.rpc('decrementar_presenca_grupo_membro', {
        p_grupo_id: grupoId, p_membro_id: p.membro_id,
      }).catch((e) => console.warn('[grupoEncontroApagar] decremento:', e.message));
    }
  }

  const { error } = await supabase.from('mem_grupo_encontros').delete().eq('id', encontroId);
  if (error) throw error;
  return { ok: true, presentes: (presencas || []).length };
}

module.exports = { apagarEncontroGrupo };
