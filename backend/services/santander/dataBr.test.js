// Regressão do incidente de 08/2026: o Santander manda transactionDate em
// DD/MM/YYYY. Passar essa string crua pro Postgres (DateStyle ISO,MDY) troca
// dia por mês em silêncio quando dia<=12, e estoura 22008 quando dia>12 —
// foi isso que zerou 8 sincronizações seguidas do /cron/sync.
const assert = require('node:assert/strict');
const { parseDateBR } = require('../pixExtratoParser');

// Caso real encontrado em produção (fin_lancamentos_brutos): "06/08/2026"
// (6 de agosto) tinha virado "2026-06-08" (8 de junho) no banco.
assert.equal(parseDateBR('06/08/2026'), '2026-08-06');

// Dia > 12 é o caso que hoje derruba o INSERT inteiro (22008) — tem que
// resolver pro dia certo, não só deixar de estourar.
assert.equal(parseDateBR('26/08/2026'), '2026-08-26');

// Dia único (sem zero à esquerda) — a API pode mandar assim.
assert.equal(parseDateBR('6/8/2026'), '2026-08-06');

// Já em ISO: mantém.
assert.equal(parseDateBR('2026-08-26'), '2026-08-26');

// Lixo: não inventa data.
assert.equal(parseDateBR('não é uma data'), null);
assert.equal(parseDateBR(''), null);
assert.equal(parseDateBR(null), null);

console.log('santander dataBr (parseDateBR): ok');
