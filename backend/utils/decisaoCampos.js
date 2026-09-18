// O que a porta de DECISÃO aceita · régua PURA (entra no gate de deploy).
//
// ⚠️ Vive em `utils/` e não no handler porque handler carrega o cliente do
// Supabase e não entra no gate — a mesma razão de `camposContato.js` ter saído
// de `inscricaoContrato.js` em 17/08/2026.
//
// ⚠️⚠️ O QUE ESTA RÉGUA PROTEGE. Esta é a única porta em que a pessoa está
// declarando uma DECISÃO DE FÉ — dado sensível (LGPD art. 11) e, do lado
// pastoral, o começo de um acompanhamento. Então ela tem uma assimetria de
// propósito:
//   · o que permite ALCANÇAR a pessoa é obrigatório (nome, telefone);
//   · o que é ANÁLISE é opcional e nunca derruba o registro (CEP).
// Perder uma decisão porque um campo de estatística estava pela metade seria
// trocar uma pessoa por um número.

const { validarNascimento } = require('./camposContato');

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * Valida e normaliza o payload da decisão.
 * Devolve `{ ok: true, valores }` ou `{ ok: false, campo, erro }`.
 *
 * ⚠️ Devolve objeto, NUNCA lança: a régua de negócio decide o texto, e quem
 * decide o status HTTP é o handler. É o padrão do `fn_insc_inscrever`.
 */
function validarDecisao(body, { hoje, nascimentoObrigatorio = true } = {}) {
  const nome = String(body?.nome ?? '').trim();
  if (nome.length < 2) {
    return { ok: false, campo: 'nome', erro: 'Informe seu nome.' };
  }

  // ⚠️ Nascimento passa pela régua ÚNICA do Contrato de porta: ela recusa
  // 31/02, ano < 1900 e data no futuro. Uma segunda régua de nascimento aqui
  // divergiria da das outras 10 portas.
  //
  // ⚠️ `nascimentoObrigatorio: false` é do TOTEM de novo convertido (pedido do
  // Marcos · 01/09: "deixar a data de nascimento como opcional nesse fluxo").
  // A porta ONLINE continua exigindo (default true · mutante rodado) — flag
  // explícita, nunca afrouxar o default. Opcional segue a política do CEP:
  // valor inválido ou pela metade vira null em vez de recusar — ninguém perde
  // a decisão por um campo que o fluxo declarou opcional.
  const dataNascimento = validarNascimento(body?.data_nascimento, hoje);
  if (!dataNascimento && nascimentoObrigatorio) {
    return {
      ok: false,
      campo: 'data_nascimento',
      erro: 'Informe sua data de nascimento (dia, mês e ano).',
    };
  }

  // ⚠️ Telefone OBRIGATÓRIO: o módulo de Cuidados existe para fazer o 1º
  // contato em até 3 dias. Decisão sem contato é um número no painel e uma
  // pessoa que ninguém alcança.
  const telefone = soDigitos(body?.telefone);
  if (telefone.length < 10 || telefone.length > 11) {
    return {
      ok: false,
      campo: 'telefone',
      erro: 'Informe seu WhatsApp com DDD (10 ou 11 dígitos) para a equipe falar com você.',
    };
  }

  // ⚠️ CEP é OPCIONAL e serve à ANÁLISE de onde o público online assiste.
  // Vazio passa. Pela metade também passa — vira `null` em vez de recusar,
  // porque ninguém pode perder a decisão por causa de um dado de estatística.
  const cepDigitos = soDigitos(body?.cep);
  const cep = cepDigitos.length === 8 ? cepDigitos : null;

  // ⚠️ Convicção religiosa é dado SENSÍVEL e a base é consentimento
  // ESPECÍFICO (LGPD art. 11) — legítimo interesse não alcança. Aqui é a
  // própria pessoa declarando sobre si, então a caixa é dela e NUNCA vem
  // marcada. `=== true` e não truthy: string "false" não pode virar aceite.
  if (body?.aceite_lgpd !== true) {
    return {
      ok: false,
      campo: 'aceite_lgpd',
      erro: 'Para registrar, é preciso aceitar o tratamento dos seus dados.',
    };
  }

  const email = String(body?.email ?? '').trim() || null;

  return { ok: true, valores: { nome, dataNascimento, telefone, cep, email } };
}

module.exports = { validarDecisao, soDigitos };
