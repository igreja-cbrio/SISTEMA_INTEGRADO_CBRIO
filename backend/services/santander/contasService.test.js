const assert = require('node:assert/strict');
const { statementCompatibilityPath, statementPath } = require('./contasService');

assert.equal(
  statementPath({ bankId: '90400888000142', agencia: '3957', conta: '130004222' }),
  '/bank_account_information/v1/banks/banks/90400888000142/statements/3957.000130004222',
);
assert.throws(() => statementPath({ bankId: '', agencia: '3957', conta: '130004222' }), /SANTANDER_BANK_ID/);
assert.equal(
  statementCompatibilityPath({ bankId: '90400888000142', agencia: '3957', conta: '130004222' }),
  '/bank_account_information/v1/banks/90400888000142/statements/3957.000130004222',
);

console.log('contasService: ok');
