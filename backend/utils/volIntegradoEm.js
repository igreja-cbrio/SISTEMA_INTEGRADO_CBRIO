// ============================================================================
// vol_inscricoes.integrado_em · o carimbo de QUANDO a pessoa foi integrada
//
// Régua PURA (fica em utils/ pra entrar no gate de deploy). Quem lê o banco é
// `services/volInscricaoStatus.js` — não duplicar a decisão lá.
//
// ⚠️ A coluna é TEXT e carrega TRÊS gerações de dado (medido em produção em
// 2026-08-17): data ISO carimbada pelo sistema (~67 linhas), o boolean
// "True"/"False" que veio da planilha do Google (625 linhas — NÃO é data) e
// texto livre da equipe ("Integrada 19/01"). Por isso o carimbo legado nunca é
// reescrito por automação: só a transição de status mexe nele.
// ============================================================================

const { diaBRT } = require('./volDisponibilidade');

/**
 * O dia do carimbo, no fuso da igreja.
 *
 * ⚠️ NÃO usar `new Date().toISOString().slice(0,10)`: às 22h BRT o dia UTC já
 * virou, e integrar alguém no culto de domingo à noite gravaria a segunda —
 * um dia em que a pessoa não foi integrada. Com a coluna "Integrado em" na
 * lista e no relatório impresso, esse erro passou a ser visível e impresso.
 */
function diaIntegracaoBRT(agora = Date.now()) {
  return diaBRT(new Date(agora));
}

/**
 * Sair de 'integrado' limpa o carimbo?
 *
 * ⚠️ Só quando o status ATUAL é 'integrado'. Linha que nunca foi integrada
 * pode ter texto legado da planilha em `integrado_em` — e um "voltar pra
 * triagem" qualquer não pode apagar registro histórico da equipe.
 *
 * ⚠️ Vale para TODOS os caminhos que tiram a linha de 'integrado' (triagem do
 * Voluntariado, desistência e o PATCH do Kids) — a lição de 06/08: ligar uma
 * exigência exige cobrir todos os caminhos que a satisfazem. Senão a ficha diz
 * "Inscrito (triagem)" ao lado de "Integrado em 15/08".
 */
function deveLimparCarimbo(statusAtual, statusNovo) {
  if (!statusNovo) return false;               // patch que não mexe em status
  if (statusNovo === 'integrado') return false;
  return statusAtual === 'integrado';
}

module.exports = { diaIntegracaoBRT, deveLimparCarimbo };
