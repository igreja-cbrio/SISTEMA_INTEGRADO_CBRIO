const assert = require('node:assert/strict');
const { avaliarPossivelDuplicidade, nomesPodemSerMesmaPessoa } = require('./duplicidadePolicy');

const davi = { nome: 'Davi Lucas Bernardo Conceição', telefone: '21999999999', cpf: '11111111111', email: 'davi@teste.com', genero: 'masculino' };
const bianca = { nome: 'Bianca Silva Bernardo', telefone: '21999999999', cpf: '22222222222', email: 'bianca@teste.com', genero: 'feminino' };
assert.equal(avaliarPossivelDuplicidade(davi, bianca).incluir, false, 'telefone compartilhado com identidade divergente não pode entrar');

assert.equal(avaliarPossivelDuplicidade(
  { nome: 'João da Silva', telefone: '21988887777' },
  { nome: 'Joao da Silva', telefone: '(21) 98888-7777' },
).incluir, true, 'telefone + nome compatível deve ir para revisão');

assert.equal(avaliarPossivelDuplicidade(
  { nome: 'Maria Souza', cpf: '33333333333' },
  { nome: 'M. Souza', cpf: '333.333.333-33' },
).prioridade, 'alta', 'CPF igual deve ser evidência forte');

assert.equal(avaliarPossivelDuplicidade(
  { nome: 'Ana Lima', telefone: '21977776666' },
  { nome: 'Carlos Pereira', telefone: '21977776666' },
).incluir, false, 'telefone sozinho nunca basta');

assert.equal(nomesPodemSerMesmaPessoa(
  'Ana Carolina Pereira Vieira Ferreira',
  'Ana Carolina Vieira',
), true, 'nome abreviado contido no nome completo deve ser tratado como possível duplicidade');

assert.equal(avaliarPossivelDuplicidade(
  { nome: 'Ana Carolina Pereira Vieira Ferreira', telefone: '21966665555' },
  { nome: 'Ana Carolina Vieira', telefone: '21966665555' },
).incluir, true, 'nome abreviado + mesmo telefone deve ir para duplicidades');

assert.equal(nomesPodemSerMesmaPessoa(
  'Carlos Eduardo Vieira',
  'Mariana Lopes Vieira',
), false, 'pessoas com primeiro nome diferente e sobrenome familiar igual continuam distintas');

console.log('duplicidadePolicy: 7 cenários aprovados');

