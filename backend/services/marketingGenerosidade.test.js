const assert = require('assert');
const {
  META_CAMPUS,
  META_MENSAL,
  agruparArrecadacaoMensal,
  calcularGenerosidade,
} = require('./marketingGenerosidade');

const agora = new Date('2026-07-28T12:00:00-03:00');

const base = calcularGenerosidade([
  { mes: '2026-01', arrecadado: 900_000, qtd_lancamentos: 10 },
  { mes: '2026-02', arrecadado: 1_200_000, qtd_lancamentos: 12 },
  { mes: '2026-03', arrecadado: 700_000, qtd_lancamentos: 8 },
  { mes: '2026-04', arrecadado: 1_500_000, qtd_lancamentos: 15 },
  { mes: '2026-05', arrecadado: 1_000_000, qtd_lancamentos: 9 },
], 2026, agora);

assert.equal(base.configuracao.meta_mensal, META_MENSAL);
assert.equal(base.configuracao.meta_campus, META_CAMPUS);
assert.equal(base.meses[0].percentual_mensal, 90);
assert.equal(base.meses[0].excedente_campus, 0);
assert.equal(base.meses[1].percentual_mensal, 120);
assert.equal(base.meses[1].excedente_campus, 200_000);
assert.equal(base.meses[1].campus_acumulado, 200_000);
assert.equal(base.meses[2].campus_acumulado, 200_000, 'mês abaixo da meta não reduz o campus');
assert.equal(base.meses[3].campus_acumulado, 700_000);
assert.equal(base.meses[4].excedente_campus, 0, 'valor igual à meta não gera excedente');
assert.equal(base.meses[5].tem_dados, false, 'mês sem balanço é distinguido de zero conhecido');
assert.equal(base.meses[6].parcial, true);
assert.equal(base.meses[7].futuro, true);

const acimaDaMetaCampus = calcularGenerosidade([
  { mes: '2026-01', arrecadado: 9_300_000, qtd_lancamentos: 1 },
], 2026, agora);
assert.equal(acimaDaMetaCampus.meses[0].campus_acumulado, 8_300_000);
assert.equal(acimaDaMetaCampus.meses[0].percentual_campus, 103.75);
assert.equal(acimaDaMetaCampus.meses[0].falta_meta_campus, 0);

const agregado = agruparArrecadacaoMensal([
  { data_competencia: '2026-01-03', valor: '400000.25' },
  { data_competencia: '2026-01-28', valor: '600000.25' },
  { data_competencia: '2026-02-01', valor: 250000 },
  { data_competencia: null, valor: 999999 },
]);
assert.deepEqual(agregado, [
  { mes: '2026-01', arrecadado: 1_000_000.50, qtd_lancamentos: 2 },
  { mes: '2026-02', arrecadado: 250_000, qtd_lancamentos: 1 },
]);

console.log('marketingGenerosidade: regra mensal e acumulado do campus aprovados');
