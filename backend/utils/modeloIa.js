/**
 * Régua PURA de ESCOLHA DE MODELO da Anthropic.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (22/09/2026)
 * O assistente (Pedrinho) parou de responder e mostrava, numa bolha vermelha na
 * tela do usuário, o texto **`model: claude-sonnet-4-20250514`** — que é o corpo
 * cru de um `not_found_error` da Anthropic: o modelo foi descontinuado.
 *
 * Medido no mesmo dia: os agentes que usam **`claude-haiku-4-5-20251001`**
 * rodaram com SUCESSO às 14:30 (mesma chave, mesma conta). Ou seja não era
 * crédito nem autenticação — era só o ID do modelo.
 *
 * ⚠️⚠️ E a lição registrada da casa é que **o gate não fala com a API**:
 * typecheck, build e milhares de testes passam com um modelo que a Anthropic
 * recusa. Não dá para "consertar" trocando por outro ID de cabeça e declarar
 * resolvido — só a chamada REAL prova.
 *
 * ⇒ A saída é CADEIA: tenta o preferido e, quando a resposta é "esse modelo não
 * existe", cai para o próximo. O último degrau é sempre um modelo **provado
 * funcionando em produção hoje**, então o pior caso é uma resposta mais simples
 * — nunca uma bolha de erro.
 */

/**
 * ⚠️ A ORDEM é a decisão. O último elemento tem que ser o modelo de que se tem
 * EVIDÊNCIA DE USO recente e bem-sucedido — é ele que garante que a cadeia
 * termina em resposta, não em erro.
 */
const CADEIA_PADRAO = [
  'claude-sonnet-5',              // preferido (qualidade) · não verificável daqui
  'claude-haiku-4-5-20251001',    // ⚠️ PROVADO: agentes rodaram com ele em 22/09 14:30
];

/** Cadeia de modelos rápidos/baratos, para tarefa mecânica. */
const CADEIA_RAPIDA = [
  'claude-haiku-4-5-20251001',
];

/**
 * Monta a cadeia a partir de um preferido opcional (env ou parâmetro).
 *
 * ⚠️ O preferido entra NA FRENTE, nunca substitui a cadeia: uma env com nome
 * errado derrubaria a IA inteira do sistema se apagasse os degraus seguintes —
 * e env errada é exatamente o tipo de coisa que ninguém percebe até quebrar.
 */
function cadeiaDeModelos(preferido, base = CADEIA_PADRAO) {
  const p = String(preferido || '').trim();
  const resto = base.filter((m) => m !== p);
  return p ? [p, ...resto] : [...base];
}

/**
 * A resposta de erro da Anthropic é "este modelo não existe"?
 *
 * ⚠️⚠️ Só ESTE caso justifica tentar outro modelo. Erro de crédito, de
 * autenticação, de limite de taxa ou de conteúdo **não** melhoram trocando de
 * modelo — insistir neles seria gastar N chamadas para falhar N vezes, e num
 * 429 ainda piora o rate limit que já estourou.
 */
function ehModeloInexistente(erro) {
  if (!erro) return false;
  const tipo = String(erro.type || '').toLowerCase();
  const msg = String(erro.message || '').toLowerCase();
  if (tipo === 'not_found_error') return true;
  // ⚠️ Fallback por TEXTO só quando ele fala de modelo: `not_found` sozinho
  // pode ser outro recurso.
  return msg.includes('model') && (msg.includes('not found') || msg.includes('not_found') || msg.includes('does not exist'));
}

/**
 * Mensagem para a PESSOA quando a IA não respondeu.
 *
 * ⚠️⚠️ O erro cru da API NUNCA vai para a tela. `model: claude-sonnet-4-20250514`
 * não significa nada para quem só queria uma resposta — e, pior, expõe detalhe
 * de infraestrutura numa bolha que parece a fala do assistente. O detalhe
 * técnico vai para o LOG, onde serve para consertar.
 */
function mensagemParaUsuario(erro) {
  if (ehModeloInexistente(erro)) {
    return 'O assistente está temporariamente indisponível (atualização de modelo em andamento). A equipe já foi avisada.';
  }
  const tipo = String(erro && erro.type || '').toLowerCase();
  if (tipo === 'rate_limit_error') return 'Muitas perguntas ao mesmo tempo. Tente de novo em alguns segundos.';
  if (tipo === 'authentication_error') return 'O assistente está sem acesso à IA no momento. A equipe já foi avisada.';
  if (tipo === 'overloaded_error') return 'A IA está sobrecarregada agora. Tente de novo em instantes.';
  return 'Não consegui responder agora. Tente de novo em instantes.';
}

/**
 * O modelo de que se tem **evidência de uso bem-sucedido em produção**.
 *
 * ⚠️⚠️ Existe para os pontos que fazem UMA chamada e não têm laço de retry: ali
 * não dá para "tentar e cair", então o valor precisa ser o que funciona, não o
 * que se espera que funcione. Medido em 22/09/2026: agentes rodaram com ele às
 * 14:30, com a mesma chave e a mesma conta em que o Sonnet 4 devolvia
 * `not_found_error`.
 *
 * ⚠️ Quando um modelo melhor for CONFIRMADO por chamada real, o caminho é a env
 * (`ASSISTENTE_AI_MODEL` etc.) ou trocar o topo de CADEIA_PADRAO — nunca
 * apontar estes pontos para um ID que ninguém exercitou.
 */
function modeloProvado() {
  return CADEIA_PADRAO[CADEIA_PADRAO.length - 1];
}

module.exports = {
  modeloProvado,
  CADEIA_PADRAO,
  CADEIA_RAPIDA,
  cadeiaDeModelos,
  ehModeloInexistente,
  mensagemParaUsuario,
};
