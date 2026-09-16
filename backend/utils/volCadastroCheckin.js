// ============================================================================
// COMPLETAR CADASTRO NO CHECK-IN · régua ÚNICA (16/09/2026)
//
// Pedido do Marcos: *"alguns voluntários que fazem check-in regularmente têm
// dados incompletos, porque quando fizemos o check-in de voluntários ainda não
// usávamos o CPF e os dados de entrada base. Criar um modal que apareça na hora
// do check-in, apenas com os campos que não temos dele."*
//
// Medido em 16/09/2026 (516 voluntários com check-in nos 6 meses anteriores):
// **220 (42,6%) com pelo menos 1 campo base faltando** — sexo 207, nascimento
// 158, CPF 156, telefone 137, e-mail 22, nome 0.
//
// ⚠️⚠️ O DADO NÃO MORA NO `vol_profiles`. Na mesma medição, dos 516 perfis só
// 4 tinham telefone e 16 tinham CPF na tabela do voluntariado — contra 379 e
// 357 no `mem_membros` vinculado. `vol_profiles` é casca; a fonte única é a
// MEMBRESIA. Por isso "falta" aqui é a UNIÃO das duas tabelas: perguntar de
// novo um telefone que o cadastro de membro já tem seria fazer a pessoa digitar
// o que a igreja já sabe — exatamente o que `utils/dadosDoCadastro.js` existe
// pra evitar. E `data_nascimento`/`genero` **só existem no membro**: perfil sem
// `membresia_id` falta os dois por construção (eram 101 dos 516).
//
// Os 6 campos são os do Contrato de Inscrição (`services/inscricaoContrato.js`),
// não uma lista nova: nome · telefone · CPF · nascimento · e-mail · sexo.
// ============================================================================

const { cpfValido, normalizarCpf } = require('./cpf');
const {
  soDigitos, tirarCodigoPaisTelefone, emailValido, validarNascimento, temAbreviacaoNome,
} = require('./camposContato');
const { sexoPara } = require('./dadosDoCadastro');

// Ordem = a que o formulário mostra (mesma do Contrato).
const CAMPOS_BASE = ['nome', 'telefone', 'cpf', 'data_nascimento', 'email', 'sexo'];

const SEXOS = ['masculino', 'feminino']; // D8 — nunca "outro"

const vazio = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * Quais campos base a igreja ainda NÃO tem desta pessoa.
 *
 * @param perfil  linha de `vol_profiles` (full_name, phone, cpf, email)
 * @param membro  linha de `mem_membros` vinculada, ou null quando o perfil não
 *                tem `membresia_id` — nesse caso nascimento e sexo faltam
 *                sempre, porque não há onde eles pudessem estar.
 * @returns array com um subconjunto de CAMPOS_BASE, na ordem de CAMPOS_BASE.
 */
function faltandoNoCadastro(perfil, membro) {
  if (!perfil) return [];
  const p = perfil || {};
  const m = membro || {};
  const falta = [];
  if (vazio(p.full_name) && vazio(m.nome)) falta.push('nome');
  if (vazio(p.phone) && vazio(m.telefone)) falta.push('telefone');
  if (vazio(p.cpf) && vazio(m.cpf)) falta.push('cpf');
  if (vazio(m.data_nascimento)) falta.push('data_nascimento');
  if (vazio(p.email) && vazio(m.email)) falta.push('email');
  if (vazio(m.genero)) falta.push('sexo');
  return falta;
}

/**
 * Valida o que veio do modal. TUDO é opcional de propósito: o botão "Agora não"
 * é lei (a pessoa está chegando pro culto, não pode ser barrada), e quem
 * preenche 2 dos 4 campos grava os 2 — o resto volta a ser perguntado no
 * próximo check-in.
 *
 * ⚠️ Campo ENVIADO é validado; campo ausente/vazio é simplesmente ignorado.
 * A diferença importa: "não quis responder" não pode virar 400 e fazer a
 * pessoa perder também o que ela digitou certo.
 *
 * @returns { erros: { campo: mensagem }, valores: { nome, telefone, cpf,
 *            dataNascimento, email, genero } } — valores traz só o preenchido.
 */
function validarParcialCadastro(body = {}) {
  const erros = {};
  const valores = {};

  const bruto = {
    nome: body.full_name ?? body.nome ?? body.nome_completo,
    telefone: body.phone ?? body.telefone,
    cpf: body.cpf,
    nascimento: body.birth_date ?? body.data_nascimento,
    email: body.email,
    sexo: body.gender ?? body.sexo ?? body.genero,
  };

  if (!vazio(bruto.nome)) {
    const n = String(bruto.nome).trim().replace(/\s+/g, ' ');
    if (n.length < 5 || n.split(' ').length < 2) erros.nome = 'Informe o nome completo.';
    else if (temAbreviacaoNome(n)) erros.nome = 'Escreva o nome completo, sem abreviações.';
    else valores.nome = n;
  }

  if (!vazio(bruto.telefone)) {
    // ⚠️ tirar o código do país ANTES de medir/truncar — colar "+55 21 99999-8888"
    // dos contatos do celular vira `55219999988` e come 2 dígitos (lei de 31/07).
    const tel = tirarCodigoPaisTelefone(soDigitos(bruto.telefone));
    if (tel.length < 10 || tel.length > 11) erros.telefone = 'Informe um telefone válido com DDD.';
    else valores.telefone = tel;
  }

  if (!vazio(bruto.cpf)) {
    const dig = soDigitos(bruto.cpf);
    if (dig.length !== 11 || !cpfValido(dig)) erros.cpf = 'CPF inválido — confira os dígitos.';
    else valores.cpf = normalizarCpf(dig);
  }

  if (!vazio(bruto.nascimento)) {
    const nasc = validarNascimento(bruto.nascimento);
    if (!nasc) erros.data_nascimento = 'Informe uma data de nascimento válida.';
    else valores.dataNascimento = nasc;
  }

  if (!vazio(bruto.email)) {
    const e = String(bruto.email).trim().toLowerCase();
    if (!emailValido(e)) erros.email = 'E-mail inválido.';
    else valores.email = e;
  }

  if (!vazio(bruto.sexo)) {
    // `sexoPara` aceita M/F e masculino/feminino e devolve o vocabulário de
    // `mem_membros`. Valor irreconhecível vira erro, nunca um chute gravado.
    const g = sexoPara('membro', bruto.sexo);
    if (!g || !SEXOS.includes(g)) erros.sexo = 'Selecione masculino ou feminino.';
    else valores.genero = g;
  }

  return { erros, valores };
}

module.exports = { CAMPOS_BASE, SEXOS, faltandoNoCadastro, validarParcialCadastro };
