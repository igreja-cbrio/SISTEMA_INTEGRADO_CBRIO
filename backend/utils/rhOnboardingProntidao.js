// Régua PURA: o que falta no cadastro pessoal de um colaborador do RH.
//
// ⚠️ O critério fica restrito ao que `publicRhOnboarding.js` (o formulário
// público que o colaborador preenche) de fato coleta: telefone, CPF, data de
// nascimento e endereço (texto livre). NÃO exige e-mail, sexo nem os campos de
// endereço estruturado (cep/numero/bairro/cidade/uf) — nenhuma porta pública
// os preenche hoje, e exigir mais do que a porta pede é o bug documentado no
// Contrato de Inscrição: o cadastro entraria na fila e nunca sairia.
'use strict';

function vazio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function avaliarProntidaoFuncionario(func) {
  const faltando = [];
  if (vazio(func?.telefone)) faltando.push('telefone');
  if (vazio(func?.cpf)) faltando.push('cpf');
  if (vazio(func?.data_nascimento)) faltando.push('data_nascimento');
  if (vazio(func?.endereco)) faltando.push('endereco');
  return { completo: faltando.length === 0, faltando };
}

module.exports = { avaliarProntidaoFuncionario };
