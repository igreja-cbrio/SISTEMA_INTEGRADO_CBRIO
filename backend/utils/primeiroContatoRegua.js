/**
 * A régua do 1º contato dos Próximos passos — ÚNICA no backend (16/09/2026).
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE
 * A mesma lista estava copiada em `routes/cuidados.js`, `routes/painel.js`,
 * `routes/nextConvite.js` e `services/agentePrimeiroContato.js` — e as cópias
 * DIVERGIAM: três incluíam `numero_errado` em "contato feito" e uma não.
 * Medido em 16/09 sobre as 461 linhas vivas: **98% pela régua do front × 100%
 * pela do backend**, sobre o mesmo dado.
 *
 * ⚠️⚠️ E a divergência não era descuido: era UM SET RESPONDENDO DUAS PERGUNTAS.
 *
 *   1. "A mensagem chegou na pessoa?"  → indicador, jornada, percentual.
 *   2. "Ainda preciso contatar essa pessoa?" → FILA do agente.
 *
 * Para quem tem número errado as respostas são OPOSTAS: a mensagem não chegou
 * (1 = não), e não adianta insistir (2 = não). Quem usava o Set pra fila
 * precisava de `numero_errado` dentro; quem usava pro indicador precisava dele
 * fora. Com um nome só, cada arquivo escolheu um lado.
 *
 * Aqui são DOIS conceitos, com nomes que dizem qual pergunta respondem.
 */

/**
 * A mensagem CHEGOU na pessoa — respondida ou não.
 *
 * ⚠️ `numero_errado` e `contato_impossivel` NÃO entram: em nenhum dos dois a
 * mensagem alcançou alguém. Contá-los aqui infla o indicador de contato com
 * contato que não aconteceu.
 */
const CONTATO_FEITO = new Set([
  'contactada', 'respondeu', 'atendido_respondido', 'nao_respondeu',
  'nao_compareceu', 'nao_atendido',
]);

/**
 * A equipe NÃO TINHA COMO alcançar a pessoa.
 *
 * Decisão do Marcos (16/09): *"essas pessoas não são possíveis de contatar,
 * elas devem sair do número total, pois são pessoas que não erramos o processo,
 * elas simplesmente não podem ser alcançadas."*
 *
 * ⚠️⚠️ Saem do DENOMINADOR — não entram no numerador. Somar ao numerador (o
 * jeito antigo) e tirar do denominador ao mesmo tempo daria percentual **acima
 * de 100%**.
 * - `numero_errado`: existe um número, e ele é de outra pessoa.
 * - `contato_impossivel`: não existe número nenhum — é converso do online de
 *   quem só temos o id do YouTube.
 */
const INALCANCAVEL = new Set(['numero_errado', 'contato_impossivel']);

/** Já resolvido, de um jeito ou de outro ⇒ NÃO volta pra fila de contatar. */
const ENCERRADO = new Set([...CONTATO_FEITO, ...INALCANCAVEL]);

/** A mensagem chegou nesta pessoa? (indicador · jornada · percentual) */
function contatoFoiFeito(c) {
  return !!(c && c.primeiro_contato_em) || CONTATO_FEITO.has(c && c.primeiro_contato_status);
}

/** Não dá pra alcançar esta pessoa ⇒ sai do total. */
function ehInalcancavel(c) {
  return INALCANCAVEL.has(c && c.primeiro_contato_status);
}

/**
 * Ainda precisa entrar na fila de 1º contato?
 * ⚠️ Número errado e contato impossível respondem NÃO — insistir é fazer o
 * agente cobrar todo dia um contato que não tem como acontecer.
 */
function precisaDeContato(c) {
  if (!c) return false;
  if (c.primeiro_contato_em) return false;
  return !ENCERRADO.has(c.primeiro_contato_status);
}

/**
 * Denominador honesto: o total menos quem não dava pra alcançar.
 * ⚠️ Nunca devolve negativo, e devolve 0 quando a lista inteira é inalcançável
 * (quem chama trata 0 como "não há percentual", nunca como divisão).
 */
function totalAlcancavel(lista) {
  const arr = Array.isArray(lista) ? lista : [];
  return Math.max(0, arr.length - arr.filter(ehInalcancavel).length);
}

/** Percentual sobre o total alcançável. `null` quando não há o que medir. */
function pctAlcancavel(n, totalBruto, inalcancaveis) {
  const d = Math.max(0, Number(totalBruto || 0) - Number(inalcancaveis || 0));
  if (!d) return null;
  return Math.round((Number(n || 0) / d) * 100);
}

module.exports = {
  CONTATO_FEITO, INALCANCAVEL, ENCERRADO,
  contatoFoiFeito, ehInalcancavel, precisaDeContato,
  totalAlcancavel, pctAlcancavel,
};
