const assert = require('node:assert/strict');
const { transactionsPath } = require('./contasService');

assert.equal(
  transactionsPath({ agencia: '3957', conta: '130004222' }),
  '/bank_account_information/v1/transactions/3957.000130004222',
);
assert.throws(() => transactionsPath({ agencia: '', conta: '130004222' }), /SANTANDER_AGENCIA/);

console.log('contasService: ok');
