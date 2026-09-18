// ============================================================================
// Elegibilidade do voluntário por TIPO DE CULTO (2026-09-04)
//
// Régua PURA (no gate · `src/test/elegibilidadeVol.test.ts`) do pedido do Marcos:
// *"pessoas podem querer apenas servir no time da banda quarta-feira, mas não
// quererem ou poderem ser escalados no domingo"*.
//
// ⚠️⚠️ FAIL-OPEN É A LEI AQUI, e por um motivo concreto: o efeito de um falso
// negativo é a pessoa **desaparecer da lista de quem pode ser escalado**, sem
// erro e sem aviso. O supervisor não vai procurar quem ele não sabe que faltou —
// ele simplesmente escala outra pessoa, ou deixa a vaga aberta. Então tudo que
// for desconhecido, ausente ou ilegível conta como "serve".
//
//   · `service_type_ids` NULL      ⇒ serve (ninguém declarou restrição);
//   · array VAZIO                  ⇒ serve (esvaziado por acidente na tela não
//                                    pode significar "não serve em nada");
//   · tipo de culto do serviço nulo ⇒ serve (não há como decidir);
//   · valor que não é array        ⇒ serve.
//
// Só NÃO serve quando há uma lista de verdade e o tipo do culto está fora dela.
//
// ⚠️ O consumidor ANOTA, não filtra (ver `/services/:id/contexto-montagem`).
// Sumir com a pessoa da lista é o comportamento que esta régua existe pra
// evitar; a tela mostra e marca, e quem decide é o supervisor.
// ============================================================================
'use strict';

/**
 * Este vínculo aceita ser escalado neste tipo de culto?
 *
 * @param {{service_type_ids?: Array<string>|null}|null} vinculo linha de `vol_team_members`
 * @param {string|null|undefined} serviceTypeId tipo do culto sendo montado
 * @returns {boolean}
 */
function podeServirNoTipo(vinculo, serviceTypeId) {
  if (!vinculo) return true;
  const lista = vinculo.service_type_ids;
  if (!Array.isArray(lista) || lista.length === 0) return true;
  if (!serviceTypeId) return true;
  return lista.some((id) => id != null && String(id) === String(serviceTypeId));
}

/**
 * A pessoa serve neste tipo por ALGUM dos vínculos dela?
 *
 * ⚠️ `some`, não `every`: quem toca baixo só na quarta e canta no domingo tem
 * dois vínculos com listas diferentes, e continua sendo alguém que serve no
 * domingo. Exigir que TODOS os vínculos aceitem excluiria justamente a pessoa
 * mais versátil da equipe.
 * ⚠️ Sem vínculo nenhum ⇒ true, pela lei do fail-open: a ausência de vínculo é
 * assunto de OUTRA régua (quem é do time), não desta.
 */
function pessoaServeNoTipo(vinculos, serviceTypeId) {
  const lista = Array.isArray(vinculos) ? vinculos : [];
  if (!lista.length) return true;
  return lista.some((v) => podeServirNoTipo(v, serviceTypeId));
}

/**
 * Como o `service_type_ids` deve ser GRAVADO a partir da escolha da tela.
 *
 * ⚠️ Marcar TODOS os tipos existentes grava **NULL**, não a lista inteira. Dois
 * motivos: (1) NULL é "sem restrição" e sobrevive à criação de um tipo de culto
 * novo — a lista inteira congelaria a pessoa nos tipos de hoje e ela ficaria
 * fora do próximo culto que a igreja criar; (2) mantém o dado limpo, sem 1.050
 * arrays repetindo o catálogo.
 * ⚠️ Desmarcar tudo também grava NULL (= todos), nunca `{}` — é a mesma lei do
 * fail-open, e a tela deve dizer isso em vez de fingir que salvou "nenhum".
 *
 * @param {Array<string>} escolhidos ids marcados na tela
 * @param {Array<string>} todosOsTipos catálogo de tipos ativos
 * @returns {Array<string>|null} o que gravar na coluna
 */
function normalizarEscolha(escolhidos, todosOsTipos) {
  const sel = [...new Set((Array.isArray(escolhidos) ? escolhidos : []).filter(Boolean).map(String))];
  const todos = [...new Set((Array.isArray(todosOsTipos) ? todosOsTipos : []).filter(Boolean).map(String))];
  if (!sel.length) return null;
  if (todos.length && todos.every((t) => sel.includes(t))) return null;
  return sel;
}

module.exports = { podeServirNoTipo, pessoaServeNoTipo, normalizarEscolha };
