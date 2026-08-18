const assert = require('node:assert/strict');
const { fitidForTransaction, reconcileTransactions, summarizeInsertErrors } = require('./reconciliation');

function fakeSupabase(existing) {
  return {
    from(table) {
      return {
        select(column) {
          return {
            async in(_column, values) {
              return { data: values.filter((value) => existing[table]?.has(value)).map((value) => ({ [column]: value })), error: null };
            },
          };
        },
      };
    },
  };
}

assert.equal(fitidForTransaction({ id: 'bank-1' }), 'bank-1');
assert.equal(
  fitidForTransaction({ data: '2026-08-06', valor: 10, raw: { a: 1 } }),
  fitidForTransaction({ data: '2026-08-06', valor: 10, raw: { a: 1 } }),
);
assert.equal(
  summarizeInsertErrors([
    { code: '23502', constraint: 'fin_lancamentos_fitid' },
    { code: '23502', constraint: 'fin_lancamentos_fitid' },
    { code: '22007', constraint: 'data_lancamento' },
  ]),
  '22007:data_lancamento=1, 23502:fin_lancamentos_fitid=2',
);

(async () => {
  const result = await reconcileTransactions(fakeSupabase({
    fin_lancamentos_brutos: new Set(['raw-1']),
    fin_transacoes: new Set(['final-1']),
  }), [
    { id: 'raw-1', data: '2026-08-05' },
    { id: 'final-1', data: '2026-08-05' },
    { id: 'new-1', data: '2026-08-06' },
    { id: 'new-1', data: '2026-08-06' },
  ]);
  assert.deepEqual(result.candidates.map((item) => item.fitid), ['new-1']);
  assert.equal(result.duplicateInOrigin, 1);
  assert.deepEqual(result.byDate['2026-08-05'], { origem: 2, ja_existentes: 2, candidatos: 0 });
  console.log('santander reconciliation: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
