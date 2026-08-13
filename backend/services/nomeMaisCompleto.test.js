// Contrato de `nomeMaisCompleto` (services/identidadeProgressiva.js).
// Determinístico: sem banco, sem rede, sem depender da hora.
//
// Por que este teste é crítico: a função autoriza REESCREVER o nome de uma
// pessoa em `mem_membros` (e sincronizar `profiles.name`) a cada observação de
// identidade. Falso positivo = sobrescrever nome legítimo com o de outra
// pessoa. Falso negativo = o caso Thiago (10/08: pedido de líder exibindo
// "Thiago dos Santos Nogueira" e cadastro preso em "Thiago Nogueira") volta.
const assert = require('assert');
const { nomeMaisCompleto } = require('./identidadeProgressiva');

// ── 1. Os casos REAIS de produção ───────────────────────────────────────────
assert.equal(
  nomeMaisCompleto('Thiago Nogueira', 'Thiago dos Santos Nogueira'),
  'Thiago dos Santos Nogueira',
  'caso Thiago (10/08): declarado estende o atual com sobrenomes do meio');
assert.equal(
  nomeMaisCompleto('Victória Lannes', 'Maria Victória Lannes Campos'),
  'Maria Victória Lannes Campos',
  'caso Maria Victória (02/08): nome abreviado do provedor vira o legal completo');
assert.equal(
  nomeMaisCompleto('THIAGO DOS SANTOS NOGUEIRA', 'Thiago dos Santos Nogueira'),
  null,
  'mesmo nome em caixa diferente NÃO gera churn de escrita');

// ── 2. Nunca encurta, nunca troca, nunca reordena ───────────────────────────
assert.equal(nomeMaisCompleto('Thiago dos Santos Nogueira', 'Thiago Nogueira'), null,
  'declarado mais curto nunca vence');
assert.equal(nomeMaisCompleto('Maria Silva', 'Maria Souza'), null,
  'token trocado não é abreviação — pode ser outra pessoa');
// Mutation-test: trocar a subsequência por containment de CONJUNTO deixa este
// caso passar — e reordenação de nome não é evidência de mesma pessoa.
assert.equal(nomeMaisCompleto('Thiago Nogueira', 'Nogueira Thiago dos Santos'), null,
  'tokens fora de ordem não casam');
// Mutation-test: aceitar containment PARCIAL (75%) descartaria o "da" — e
// derrubar token do nome atual é reescrever, não completar.
assert.equal(nomeMaisCompleto('Maria da Silva', 'Maria Silva Santos'), null,
  'todo token do atual precisa estar no declarado');
assert.equal(nomeMaisCompleto('Ana Souza Lima', 'João Souza Lima Pereira'), null,
  'primeiro nome diferente (cônjuges no mesmo e-mail) nunca promove');

// ── 3. O que o declarado precisa ser pra valer como nome ────────────────────
assert.equal(nomeMaisCompleto('Thiago Nogueira', 'Thiago'), null,
  '1 token não é nome completo');
assert.equal(nomeMaisCompleto('Thiago Nogueira', ''), null, 'vazio não promove');
assert.equal(nomeMaisCompleto('Thiago Nogueira', null), null, 'null não promove');
assert.equal(nomeMaisCompleto('Ana Silva', 'Contribuinte 059412 Ana Silva'), null,
  'placeholder do financeiro nunca vira nome');
assert.equal(nomeMaisCompleto('Ana Silva', 'ana.silva@gmail.com'), null,
  'e-mail no campo de nome não é nome');

// ── 4. Cadastro sem nome real adota o declarado ─────────────────────────────
assert.equal(nomeMaisCompleto('Sem nome', 'Ana Paula Souza'), 'Ana Paula Souza');
assert.equal(nomeMaisCompleto('', 'Ana Paula Souza'), 'Ana Paula Souza');
assert.equal(nomeMaisCompleto(null, 'Ana Paula Souza'), 'Ana Paula Souza');

// ── 5. Inicial expande ("Ana P" → "Ana Paula") ──────────────────────────────
assert.equal(nomeMaisCompleto('Ana P', 'Ana Paula'), 'Ana Paula',
  'token de 1 letra casa com token que começa por ela');
assert.equal(nomeMaisCompleto('Ana P Souza', 'Ana Paula Souza'), 'Ana Paula Souza');
assert.equal(nomeMaisCompleto('Ana Paula', 'Ana Pereira'), null,
  'a expansão só vale pra token de UMA letra — prefixo maior não casa');

// ── 5b. Concatenação suja de formulário nunca vence (caso real de 11/08) ────
assert.equal(
  nomeMaisCompleto('Carlos Goncalves Junior', 'Carlos Goncalves Silva Junior Carlos Junior'),
  null,
  'token repetido fora de conectivo = nome sujo, não nome mais completo');
assert.equal(
  nomeMaisCompleto('Ana Souza', 'Ana Souza de Oliveira e de Castro'),
  'Ana Souza de Oliveira e de Castro',
  'conectivo repetido (de/e) é normal em nome de gente');

// ── 5c. Declarado todo em minúsculas ganha capitalização simples ────────────
assert.equal(
  nomeMaisCompleto('Thayna Neto Caetano', 'thayna neto caetano escobar'),
  'Thayna Neto Caetano Escobar');
assert.equal(
  nomeMaisCompleto('Ana Silva', 'ana silva de souza'),
  'Ana Silva de Souza',
  'conectivo fica minúsculo na capitalização');
assert.equal(
  nomeMaisCompleto('Ana Silva', 'ANA SILVA DE SOUZA'),
  'ANA SILVA DE SOUZA',
  'CAIXA ALTA fica como digitado — metade da base é assim');

// ── 6. Acento e espaçamento não atrapalham a comparação ─────────────────────
assert.equal(
  nomeMaisCompleto('Antonio Marco Pereira', 'Antônio  Marco   Pereira da Silva'),
  'Antônio Marco Pereira da Silva',
  'comparação sem acento; o gravado preserva o que a pessoa digitou (espaços colapsados)');

console.log('nomeMaisCompleto.test.js: todos os casos passaram');
