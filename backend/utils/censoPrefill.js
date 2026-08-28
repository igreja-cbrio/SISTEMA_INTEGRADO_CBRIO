// ============================================================================
//  CENSO · o que o /prefill PÚBLICO pode devolver, e sob qual prova
//
//  Régua PURA (sem banco, sem rede) para entrar no gate de deploy. Quem lê o
//  banco é `routes/publicCenso.js`; quem decide o que sai é este arquivo.
//
//  ⚠️⚠️ POR QUE ISTO EXISTE (17/08/2026 · decisão do Matheus)
//
//  O QR impresso do culto aponta para `/censo/p/censo-cbrio-2026`, que é uma
//  página PÚBLICA — link curto adivinhável, projetado no telão. Não existe
//  nada entre um estranho e este endpoint. Ele tinha dois níveis de vazamento:
//
//    1. CPF SOZINHO devolvia `encontrado: true` + nome mascarado. Isso responde
//       "esta pessoa está na base da CBRio?" — e estar na base de uma igreja
//       revela CONVICÇÃO RELIGIOSA, que é dado sensível (LGPD art. 5º, II) e
//       exige base legal do art. 11. Alcance medido: 1.678 CPFs.
//    2. CPF + NASCIMENTO devolvia nome completo, TELEFONE, E-MAIL, estado
//       civil, cidade e bairro. Alcance medido: 1.010 pessoas, 1.002 com
//       telefone e 996 com e-mail.
//
//  ⚠️⚠️ E CPF + NASCIMENTO NÃO SÃO DOIS FATORES — SÃO UM. Os dois viajam
//  juntos em toda base vazada (o vazamento de 2021 expôs ~223 milhões de CPFs
//  com nome e data de nascimento). Quem tem um tem o outro. Pior: numa igreja
//  a data de nascimento é publicada pela PRÓPRIA organização — a CBRio manda
//  parabéns por WhatsApp e imprime lista de aniversariantes do Kids. O sistema
//  pedia como prova exatamente o dado que ele divulga.
//
//  É a lei que o projeto já tem escrita para o app, aplicada aqui:
//  **CPF IDENTIFICA, NÃO AUTENTICA.**
//
//  ⚠️ O QUE **NÃO** MUDA: o caminho do TOKEN (`?t=` do link pessoal e o token
//  que o app emite para a sessão autenticada). Ali a prova é o link ter
//  chegado no contato DELA — é o desenho correto e continua devolvendo tudo.
// ============================================================================

/**
 * Prefill com prova de POSSE (token assinado que chegou no contato da pessoa,
 * ou sessão autenticada do app). Devolve o cadastro.
 */
const CAMPOS_COM_TOKEN = Object.freeze([
  'cpf', 'nome', 'data_nascimento', 'telefone', 'email',
  'estado_civil', 'cidade', 'bairro', 'profissao',
]);

/**
 * Prefill a partir de CPF + nascimento DIGITADOS numa página pública.
 *
 * ⚠️⚠️ CONTATO FICA DE FORA (`telefone`, `email`). Pré-preencher nome e cidade
 * é conveniência; devolver contato transforma uma página pública num consultor
 * de telefone e e-mail a partir de um par que se compra pronto. A pessoa digita
 * os dois — e num RECADASTRAMENTO isso não é perda: conferir o contato atual é
 * um dos objetivos do censo, e o que ela digitar é mais novo que o que está no
 * banco.
 *
 * ⚠️ Nem mesmo MASCARADO: "(21) ****-8249" ainda entrega DDD e os 4 últimos
 * dígitos a quem só tinha o CPF. E máscara dentro de `valores` seria pior
 * ainda — ela viraria a RESPOSTA gravada, e o censo registraria o telefone da
 * pessoa como literalmente "(21) ****-8249".
 */
const CAMPOS_SEM_TOKEN = Object.freeze([
  'cpf', 'nome', 'data_nascimento', 'estado_civil', 'cidade', 'bairro', 'profissao',
]);

/**
 * Decide se o par digitado é suficiente para identificar.
 *
 * ⚠️⚠️ EXIGE OS DOIS. Não existe mais o estágio "só o CPF" — era ele o oráculo
 * de filiação religiosa. Sem nascimento, a resposta é a MESMA de CPF que não
 * existe, então o endpoint deixa de discriminar quem está na base.
 */
function podeIdentificarPorCpf({ cpfValido, temNascimento }) {
  return cpfValido === true && temNascimento === true;
}

/**
 * Monta o objeto de campos do cadastro que o prefill pode usar, já recortado
 * pela prova apresentada.
 *
 * ⚠️ Recorta por ALLOWLIST, nunca por `delete`: campo novo em `mem_membros`
 * (ou no `select` da rota) nasce FORA do que sai numa página pública, e entrar
 * passa a exigir uma linha aqui — que é onde o motivo está escrito.
 */
function camposDoCadastro(membro, { viaToken } = {}) {
  const permitidos = viaToken ? CAMPOS_COM_TOKEN : CAMPOS_SEM_TOKEN;
  const fonte = membro || {};
  const saida = {};
  for (const campo of permitidos) {
    const v = fonte[campo];
    saida[campo] = v === undefined ? null : v;
  }
  // CPF sai digits-only: é o formato que o formulário espera, e é o mesmo que
  // a pessoa acabou de digitar (não acrescenta informação nenhuma).
  if (saida.cpf) saida.cpf = String(saida.cpf).replace(/\D/g, '') || null;
  return saida;
}

module.exports = {
  CAMPOS_COM_TOKEN,
  CAMPOS_SEM_TOKEN,
  podeIdentificarPorCpf,
  camposDoCadastro,
};
