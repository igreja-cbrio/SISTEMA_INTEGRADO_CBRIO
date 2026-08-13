const assert = require('node:assert/strict');
const { avaliarRelacaoFamiliar } = require('./familiaPolicy');

assert.equal(avaliarRelacaoFamiliar(
  { nome: 'Ana Carolina Pereira Vieira Ferreira' },
  { nome: 'Ana Carolina Vieira' },
  { mesmoTelefone: true },
).destino, 'duplicidade', 'nome civil completo e versão curta não podem virar família');

assert.equal(avaliarRelacaoFamiliar(
  { nome: 'Carlos Eduardo Vieira' },
  { nome: 'Mariana Lopes Vieira' },
  { mesmoTelefone: true },
).destino, 'familia', 'pessoas distintas com telefone e sobrenome compartilhados devem ser revisadas como família');

assert.equal(avaliarRelacaoFamiliar(
  { nome: 'Carlos Eduardo Lima' },
  { nome: 'Mariana Lopes Vieira' },
  { mesmoTelefone: true },
).destino, 'ignorar', 'telefone sozinho não deve sugerir vínculo familiar');

assert.equal(avaliarRelacaoFamiliar(
  { nome: 'Carlos Eduardo Lima' },
  { nome: 'Mariana Lopes Vieira' },
  { mesmoEndereco: true },
).destino, 'familia', 'endereço completo e CEP permitem revisar famílias com sobrenomes diferentes');

console.log('familiaPolicy: 4 cenários aprovados');
