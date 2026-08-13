const assert = require('node:assert/strict');
const { outcomeFromSteps, resolveHttpOutcome, setSystemJobOutcome } = require('./systemJobOutcome');

const success = outcomeFromSteps({ expire: { total: 2 }, reconcile: { total: 3 } });
assert.equal(success.status, 'success');
assert.equal(success.effectStatus, 'confirmed');
assert.equal(success.outputCount, 2);

const partial = outcomeFromSteps({ expire: { total: 2 }, reconcile: { erro: 'timeout' } }, { errorCode: 'PAYMENT_CRON_FAILED' });
assert.equal(partial.status, 'warning');
assert.equal(partial.effectStatus, 'failed');
assert.equal(partial.errorCode, 'PAYMENT_CRON_FAILED');
assert.equal(partial.discardedCount, 1);

const failed = outcomeFromSteps({ expire: { erro: 'db' }, reconcile: { error: 'network' } });
assert.equal(failed.status, 'failed');
assert.equal(failed.outputCount, 0);

const forcedHttpFailure = resolveHttpOutcome(500, { status: 'success' });
assert.equal(forcedHttpFailure.status, 'failed');
assert.equal(forcedHttpFailure.effectStatus, 'failed');
assert.equal(forcedHttpFailure.errorCode, 'HTTP_500');

const skipped = resolveHttpOutcome(200, { status: 'skipped' });
assert.equal(skipped.effectStatus, 'not_applicable');

const res = { locals: { systemJobOutcome: { inputCount: 4 } } };
setSystemJobOutcome(res, { status: 'success', outputCount: 4 });
assert.deepEqual(res.locals.systemJobOutcome, { inputCount: 4, status: 'success', outputCount: 4 });

console.log('systemJobOutcome.test.js: ok');
