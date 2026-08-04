// Contrato de `ehNomeDerivadoDeEmail` (services/membroMatch.js).
// Determinístico: sem banco, sem rede, sem depender da hora.
//
// Por que este teste é crítico: a função autoriza REESCREVER o nome de uma
// pessoa (em `profiles` e em `mem_membros`) e disparar aviso pra equipe. Falso
// positivo = sobrescrever nome legítimo. Falso negativo = o cadastro-fantasma
// segue crescendo em silêncio, que é o defeito que ela existe pra expor.
const assert = require('assert');
const { ehNomeDerivadoDeEmail, ehNomePlaceholder } = require('./membroMatch');

// ── 1. Os casos REAIS medidos em produção (04/08) ───────────────────────────
const REAIS = [
  ['juloora', 'juloora@hotmail.com'],
  ['catiassgullo', 'catiassgullo@icloud.com'],
  ['toscano.milton', 'toscano.milton@icloud.com'],
  ['karlosaragao', 'karlosaragao@souunisuam.com.br'],
  ['andre.texeira', 'andre.texeira@cbrio.org'],
  ['kevyn.ricardo', 'kevyn.ricardo@cbrio.org'],
  // Apple Sign-In com "Ocultar meu e-mail": o prefixo é identificador aleatório
  ['sy9p84mryx', 'sy9p84mryx@privaterelay.appleid.com'],
  ['5rr9697fp4', '5rr9697fp4@privaterelay.appleid.com'],
  // contas de quiosque (mesmo mecanismo · não devem ser apagadas, só sinalizadas)
  ['totem1', 'totem1@cbrio.org'],
  ['totem.kids4', 'totem.kids4@cbrio.org'],
];
for (const [nome, email] of REAIS) {
  assert.equal(ehNomeDerivadoDeEmail(nome, email), true,
    `deveria detectar: ${nome} / ${email}`);
}

// ── 2. Tolera pontuação e caixa (o prefixo vem com ponto, o nome sem) ───────
assert.equal(ehNomeDerivadoDeEmail('Toscano Milton', 'toscano.milton@icloud.com'), true,
  'ponto do prefixo virando espaço no nome ainda é derivado do e-mail');
assert.equal(ehNomeDerivadoDeEmail('ANDRE.TEXEIRA', 'andre.texeira@cbrio.org'), true,
  'comparação é insensível a caixa');
assert.equal(ehNomeDerivadoDeEmail('andre_texeira', 'andre.texeira@cbrio.org'), true,
  '_ e . e - são equivalentes pra esta comparação');

// ── 3. ⚠️ FALSO POSITIVO é o erro grave: nome real NUNCA é reescrito ────────
// Mutation-test: trocar a comparação por "o prefixo CONTÉM o nome" (ou o
// inverso) faz estes casos passarem a ser detectados e a função vira uma
// máquina de sobrescrever nome de gente.
const LEGITIMOS = [
  ['Amanda Dady', 'amanda.dady05@gmail.com'],          // prefixo tem o 05
  ['Victória Lannes', 'mavilannes@gmail.com'],          // prefixo abreviado
  ['Diego Assis', 'alemaodl10@gmail.com'],              // prefixo é apelido
  ['Marcelo Soares', 'marcelosoares@cbrio.com.br'],     // ⚠️ prefixo = nome SEM espaço
  ['Thiago Nogueira', 'thiago@cbrio.com.br'],           // prefixo é só o 1º nome
  ['Ana', 'ana.paula.souza@gmail.com'],                 // nome curto ≠ prefixo
  ['Julia Mendes', 'juliafuncionalfight@gmail.com'],
];
for (const [nome, email] of LEGITIMOS) {
  if (nome === 'Marcelo Soares') continue; // tratado à parte abaixo
  assert.equal(ehNomeDerivadoDeEmail(nome, email), false,
    `NÃO pode detectar nome legítimo: ${nome} / ${email}`);
}
// ⚠️ Caso-limite consciente: "Marcelo Soares" × "marcelosoares@..." — ao ignorar
// espaço/pontuação, nome real IGUAL ao prefixo é indistinguível de nome gerado
// a partir dele. A função devolve true. É aceitável porque o efeito é reescrever
// pelo nome que a PRÓPRIA PESSOA acabou de digitar no formulário (mesmo valor,
// ou mais completo) e gerar um aviso pra revisão humana — nunca apagar. Se algum
// dia isso for usado pra decidir algo destrutivo, esta linha precisa mudar.
assert.equal(ehNomeDerivadoDeEmail('Marcelo Soares', 'marcelosoares@cbrio.com.br'), true,
  'caso-limite documentado: nome real idêntico ao prefixo dá true');

// ── 4. Sem e-mail não decide nada (não é heurística de "nome estranho") ─────
for (const [nome, email] of [
  ['5rr9697fp4', null], ['5rr9697fp4', ''], ['5rr9697fp4', 'sem-arroba'],
  ['', 'x@y.com'], [null, 'x@y.com'], ['   ', 'x@y.com'],
]) {
  assert.equal(ehNomeDerivadoDeEmail(nome, email), false,
    `sem e-mail válido ou sem nome deve devolver false: ${JSON.stringify([nome, email])}`);
}

// ── 5. Não confundir com o placeholder do financeiro (guarda irmã) ──────────
assert.equal(ehNomePlaceholder('Contribuinte 059412'), true);
assert.equal(ehNomePlaceholder('Ana Contribuinte'), false, 'só o PREFIXO conta');
assert.equal(ehNomeDerivadoDeEmail('Contribuinte 059412', 'ana@x.com'), false,
  'placeholder do financeiro é outro problema, com outra guarda');

console.log('nomeDerivadoEmail: OK');
