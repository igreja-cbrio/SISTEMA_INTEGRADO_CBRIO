const assert = require('node:assert/strict');
const { ordenarPorPreferencia } = require('../utils/preferenciaRodizio');

const ana = { id: 'a', full_name: 'Ana', rodizio_semana: 2 };
const bia = { id: 'b', full_name: 'Bia', rodizio_semana: null };
const caio = { id: 'c', full_name: 'Caio', rodizio_semana: 1 };
const dora = { id: 'd', full_name: 'Dora', rodizio_semana: 1 };
const edu = { id: 'e', full_name: 'Édu', rodizio_semana: 3 };

const nomes = (l) => l.map((p) => p.full_name);

// Culto do 1º domingo: quem prefere o 1º vem primeiro, depois quem não disse, depois os outros.
assert.deepEqual(nomes(ordenarPorPreferencia([ana, bia, caio, dora, edu], 1)), ['Caio', 'Dora', 'Bia', 'Ana', 'Édu']);
// Culto do 2º: a Ana sobe; Caio e Dora descem pro fim, mas CONTINUAM na lista (ordena, não filtra).
assert.deepEqual(nomes(ordenarPorPreferencia([ana, bia, caio, dora, edu], 2)), ['Ana', 'Bia', 'Caio', 'Dora', 'Édu']);
// Marca quem prefere ESTE culto — e só esses.
const r1 = ordenarPorPreferencia([ana, bia, caio], 1);
assert.deepEqual(r1.map((p) => p.prefere_este_culto), [true, false, false]);
// Culto sem semana: alfabético puro, ninguém "prefere este".
const r0 = ordenarPorPreferencia([edu, ana, caio], null);
assert.deepEqual(nomes(r0), ['Ana', 'Caio', 'Édu']);
assert.equal(r0.some((p) => p.prefere_este_culto), false);
// Semana vem como string da URL.
assert.deepEqual(nomes(ordenarPorPreferencia([ana, caio], '2')), ['Ana', 'Caio']);
// Não muta a entrada e não perde ninguém.
const entrada = [ana, bia, caio];
const saida = ordenarPorPreferencia(entrada, 1);
assert.equal(entrada[0], ana, 'entrada intacta');
assert.equal(saida.length, 3);
// Acento não separa a ordem alfabética (Édu depois de Dora, não depois de tudo).
assert.deepEqual(nomes(ordenarPorPreferencia([edu, dora, { id: 'f', full_name: 'Fábio', rodizio_semana: null }], null)), ['Dora', 'Édu', 'Fábio']);
console.log('preferenciaRodizio.test.js OK');
