const assert = require('node:assert/strict');
const { avaliarRelacaoFamiliar, sobrenomesEmComum, alertaMesmaPessoa } = require('./familiaPolicy');

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

// ── Acrescentado em 2026-08-14 ───────────────────────────────────────────────
assert.equal(avaliarRelacaoFamiliar(
  { cpf: '529.982.247-25' }, { cpf: '52998224725' }, { mesmoTelefone: true },
).destino, 'duplicidade', 'CPF igual é assunto de identidade, nunca de família');

assert.deepEqual(
  sobrenomesEmComum({ nome: 'Angela de Alvarenga Ribeiro' }, { nome: 'José Benício de Alvarenga' }),
  ['alvarenga'],
  'sobrenome em comum ignora o primeiro nome e tokens curtos (conectivos)',
);

// ── Alerta "pode ser a mesma pessoa" · caso Angela × "José Benício" (14/08) ──
// O cadastro "José Benício De alvarenga" tinha o NOME DO FILHO com o telefone,
// e-mail e nascimento da MÃE. Não era família, era a mesma pessoa — e caía na
// fila de famílias porque `nomesPodemSerMesmaPessoa` recusa "Angela" × "José" e
// os CPFs diferiam.
//
// ⚠️ MUTATION-TEST (2 mutantes RODADOS, os dois mortos): transformar o alerta em
// `destino: 'duplicidade'` deixa o penúltimo caso vermelho — e é exatamente a
// mudança que faria par de GÊMEOS desaparecer das DUAS filas (a
// duplicidadePolicy os vetaria por "Nomes incompatíveis"). Exigir só e-mail
// igual, sem nascimento, deixa vermelho o caso do e-mail da casa.
const mae = {
  nome: 'ANGELA DE ALVARENGA RIBEIRO', email: 'angeladealvarengar@gmail.com',
  data_nascimento: '1981-08-01', cpf: '09151006731',
};
const filhoNoNome = {
  nome: 'José Benício De alvarenga', email: 'angeladealvarengar@gmail.com',
  data_nascimento: '1981-08-01', cpf: '18967030703',
};

assert(alertaMesmaPessoa(mae, filhoNoNome),
  'e-mail E nascimento idênticos com CPF diferente levanta o alerta');
assert.equal(alertaMesmaPessoa(mae, { ...filhoNoNome, data_nascimento: '2015-10-06' }), null,
  'e-mail igual SOZINHO não levanta o alerta (a família compartilha a caixa)');
assert.equal(alertaMesmaPessoa({ ...mae, email: null }, filhoNoNome), null,
  'nascimento igual SOZINHO não levanta o alerta (coincidência é comum)');

const comAlerta = avaliarRelacaoFamiliar(mae, filhoNoNome, { mesmoTelefone: true });
assert.equal(comAlerta.destino, 'familia',
  'o par SEGUE em família — gêmeos têm a MESMA assinatura de sinais, e mandar pra duplicidade os faria sumir das 2 filas');
assert(comAlerta.alerta, 'e vai com o alerta pendurado, pra quem tria decidir');

console.log('familiaPolicy: cenários da fila de famílias aprovados');
