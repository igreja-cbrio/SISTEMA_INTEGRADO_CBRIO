// ============================================================================
// "Adicionar pessoa" no grupo · o que é POLÍTICA DESTA PORTA (Marcos · 25/08/2026)
//
// ⚠️⚠️ A VALIDAÇÃO DOS CAMPOS NÃO MORA AQUI, e é decisão: ela é
// `inscricaoContrato.validarCamposPadrao`, a MESMA que o formulário público de
// grupos usa. A lei do Contrato de Inscrição é explícita — *"Usar SEMPRE
// `backend/services/inscricaoContrato.js`... NÃO recriar cópias locais de
// máscara/CPF — era assim que divergia."*
//
// A 1ª versão desta porta (25/08, antes do ajuste do Marcos) tinha validação
// própria e mais frouxa (só nome + telefone). Ele corrigiu: *"queremos cadastro
// completo, os mesmos campos que solicitam a inscrição de grupos."* Então a
// porta passou a exigir nome completo sem abreviação, telefone, nascimento,
// sexo, CPF com DV e e-mail — endereço fixo-opcional —, tudo pelo validador
// canônico.
//
// O que sobra aqui é o que é SÓ desta porta e não existe no contrato: qual
// `funcao` do roster ela pode gravar. Fica em `utils/` porque `services/`
// carrega o cliente do Supabase e o gate de deploy roda sem as dependências de
// `backend/` instaladas.
// ============================================================================

/**
 * A função no roster que esta porta pode gravar.
 *
 * ⚠️⚠️ WHITELIST FECHADA, e o motivo é de AUTORIZAÇÃO: desde 25/08/2026
 * `lider` e `lider_treinamento` decidem quem GERENCIA o grupo. Aceitar `funcao`
 * cru do corpo daria a qualquer líder o poder de promover alguém a gestor do
 * grupo por uma tela de cadastro — e a supervisor/coordenador, que são papéis
 * da hierarquia de supervisão.
 *
 * ⚠️ O default é `frequentador`: adicionar alguém DE PROPÓSITO é PARTICIPAÇÃO,
 * não visita (régua de 13/08). `visitante` só quando quem preenche DECLARA —
 * lei de 14/08: *"quem o líder realmente identifica como visitante, deve ser
 * visitante."*
 */
function funcaoDoRoster(body = {}) {
  return String(body.funcao || '') === 'visitante' ? 'visitante' : 'frequentador';
}

module.exports = { funcaoDoRoster };
