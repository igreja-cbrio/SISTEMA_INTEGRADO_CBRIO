// ════════════════════════════════════════════════════════════════════════════
//  O que a tela de doar recebe quando a pessoa vem do app.
//
//  ⚠️⚠️ A REGRA CENTRAL: **O CPF COMPLETO NUNCA VAI PRO NAVEGADOR.**
//
//  A pessoa não precisa digitar o CPF (é o pedido), mas isso NÃO significa
//  devolvê-lo na resposta. O prefill chega numa página PÚBLICA, aberta a partir
//  de uma URL que vive no histórico do navegador, em print e no grupo quando
//  alguém compartilha a tela. CPF é dado que não se despublica.
//
//  ⇒ O navegador recebe o CPF **MASCARADO** (só pra pessoa reconhecer que é o
//  cadastro dela) e quem manda o CPF real ao provedor de pagamento é o SERVIDOR,
//  resolvendo o cadastro pelo TOKEN no momento do POST.
//
//  ⚠️ Efeito colateral BOM: a doação passa a ser vinculada pelo TOKEN, não pelo
//  CPF digitado. Ninguém doa por engano sob o CPF de outra pessoa da família —
//  que é exatamente o risco que o matcher de dado digitado carrega.
// ════════════════════════════════════════════════════════════════════════════

/** Só dígitos. */
function digitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

/**
 * CPF mascarado: `***.***.123-45`.
 *
 * ⚠️ Revela os 5 ÚLTIMOS dígitos — o suficiente pra a pessoa reconhecer o
 * próprio documento e insuficiente pra reconstruir o número (os 6 primeiros
 * ficam escondidos, e o DV não ajuda a adivinhá-los).
 * ⚠️ CPF que não tem 11 dígitos devolve `null`, nunca uma máscara torta: máscara
 * de lixo faria a tela afirmar que existe CPF no cadastro quando não existe.
 */
function cpfMascarado(cpf) {
  const d = digitos(cpf);
  if (d.length !== 11) return null;
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/** Telefone mascarado: `(21) *****-8249`. */
function telefoneMascarado(tel) {
  const d = digitos(tel);
  if (d.length < 10 || d.length > 11) return null;
  const ddd = d.slice(0, 2);
  return `(${ddd}) *****-${d.slice(-4)}`;
}

/**
 * O que a tela recebe.
 *
 * ⚠️ Nome e e-mail vão INTEIROS de propósito: são o que a pessoa precisa
 * conferir e corrigir (o recibo vai pro e-mail), e ela já os vê no app dela.
 * O que fica mascarado é o que ela NÃO precisa editar aqui: CPF e telefone.
 *
 * ⚠️ `tem_cpf` é um booleano PRÓPRIO, e não "a máscara veio?": a tela precisa
 * dizer "o CPF do seu cadastro será usado" × "seu cadastro não tem CPF, informe
 * um" — e essas duas frases pedem ações diferentes de quem está doando.
 */
function prefillDoCadastro(membro) {
  if (!membro || !membro.id) return null;
  const cpf = digitos(membro.cpf);
  return {
    nome: typeof membro.nome === 'string' ? membro.nome.trim() : null,
    email: typeof membro.email === 'string' ? membro.email.trim() || null : null,
    // ⚠️ MASCARADOS. O valor real fica no servidor.
    cpf_mascarado: cpfMascarado(cpf),
    telefone_mascarado: telefoneMascarado(membro.telefone),
    tem_cpf: cpf.length === 11,
    tem_telefone: (() => { const d = digitos(membro.telefone); return d.length >= 10 && d.length <= 11; })(),
  };
}

/**
 * Os dados do PAGADOR que vão pra cobrança, resolvidos no SERVIDOR.
 *
 * ⚠️⚠️ O CADASTRO VENCE O PAYLOAD nos campos de identidade (CPF), e o payload
 * só é usado no que a pessoa pode legitimamente corrigir na tela (nome, e-mail,
 * telefone). Aceitar CPF do corpo quando existe token seria reabrir justamente
 * o buraco que o token fecha: doar sob o CPF de outra pessoa.
 *
 * ⚠️ Cadastro SEM CPF cai no que a pessoa digitou — senão quem não tem CPF no
 * cadastro (são milhares nesta base) não conseguiria doar pelo app.
 */
function pagadorParaCobranca({ membro, corpo } = {}) {
  const doCorpo = corpo || {};
  const cpfCadastro = digitos(membro?.cpf);
  const cpfDigitado = digitos(doCorpo.cpf);
  return {
    nome: (typeof doCorpo.nome === 'string' && doCorpo.nome.trim())
      || (typeof membro?.nome === 'string' ? membro.nome.trim() : '') || null,
    email: (typeof doCorpo.email === 'string' && doCorpo.email.trim())
      || (typeof membro?.email === 'string' ? membro.email.trim() : '') || null,
    telefone: digitos(doCorpo.telefone) || digitos(membro?.telefone) || null,
    // ⚠️ Cadastro primeiro. Sempre.
    cpf: cpfCadastro.length === 11 ? cpfCadastro : (cpfDigitado.length === 11 ? cpfDigitado : null),
    cpf_veio_do_cadastro: cpfCadastro.length === 11,
  };
}

module.exports = {
  digitos,
  cpfMascarado,
  telefoneMascarado,
  prefillDoCadastro,
  pagadorParaCobranca,
};
