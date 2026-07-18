const assert = require('assert');
const { cpfValido, pontuarPar } = require('./identidadeProgressiva');

const perfil = (id, dados = {}) => ({
  id,
  cpfs: new Set(dados.cpfs || []),
  telefones: new Set(dados.telefones || []),
  emails: new Set(dados.emails || []),
  nascimentos: new Set(dados.nascimentos || []),
  nomes: new Set(dados.nomes || []),
  fontes: new Set(dados.fontes || []),
});

assert.equal(cpfValido('529.982.247-25'), true, 'aceita CPF com DV válido');
assert.equal(cpfValido('529.982.247-24'), false, 'rejeita CPF com DV inválido');
assert.equal(cpfValido('111.111.111-11'), false, 'rejeita CPF repetido');

const a = perfil('a', { cpfs: ['52998224725'], telefones: ['21999999999'], nomes: ['ana carolina vieira'] });
const b = perfil('b', { telefones: ['21999999999'], nomes: ['ana carolina vieira'] });
const ponte = {
  cpf: '52998224725', telefone: '21999999999', email: null,
  data_nascimento: null, nome_normalizado: 'ana carolina vieira',
};
const promovido = pontuarPar(a, b, ponte);
assert(promovido.score >= 90, 'terceiro cadastro com CPF + telefone + nome promove o par');
assert.equal(promovido.prioridade, 'quase_confirmado');

const familiar = perfil('c', { telefones: ['21999999999'], nomes: ['bianca silva bernardo'] });
const contatoCompartilhado = pontuarPar(a, familiar, ponte);
assert(contatoCompartilhado.score < 70, 'telefone compartilhado com nome incompatível não vira alta confiança');

const cpfConflitante = perfil('d', { cpfs: ['11144477735'], telefones: ['21999999999'], nomes: ['ana carolina vieira'] });
const conflito = pontuarPar(a, cpfConflitante, ponte);
assert(conflito.score <= 25, 'CPFs válidos diferentes impedem promoção automática');
assert(conflito.contradicoes.includes('CPFs válidos diferentes'));

console.log('identidadeProgressiva: cenários cumulativos aprovados');
