const assert = require('node:assert/strict');
const {
  isConfirmedFailure,
  isConfirmedRecovery,
  countConsecutiveFailures,
  countConsecutiveRecoveries,
  decideJobAlert,
} = require('./systemJobAlerts');

const policy = { enabled: true, threshold: 3, recoveryThreshold: 2 };
const failed = { status: 'failed', effect_status: 'failed' };
const partial = { status: 'warning', effect_status: 'failed' };
const success = { status: 'success', effect_status: 'confirmed' };
const unknown = { status: 'warning', effect_status: 'unknown' };

assert.equal(isConfirmedFailure(failed), true);
assert.equal(isConfirmedFailure(partial), true);
assert.equal(isConfirmedFailure(unknown), false);
assert.equal(isConfirmedRecovery(success), true);
assert.equal(countConsecutiveFailures([failed, partial, failed, success]), 3);
assert.equal(countConsecutiveFailures([failed, unknown, failed]), 1);
assert.equal(countConsecutiveRecoveries([success, success, failed]), 2);

assert.deepEqual(
  decideJobAlert({ currentRun: failed, recentRuns: [failed, failed], activeIncident: null, policy }),
  { action: 'none', reason: 'below_threshold', failures: 2 },
);
assert.deepEqual(
  decideJobAlert({ currentRun: failed, recentRuns: [failed, partial, failed], activeIncident: null, policy }),
  { action: 'open', failures: 3 },
);
assert.equal(
  decideJobAlert({ currentRun: failed, recentRuns: [failed, failed, failed], activeIncident: { id: 'inc-1' }, policy }).reason,
  'already_open',
);
assert.equal(
  decideJobAlert({ currentRun: success, recentRuns: [success], activeIncident: { id: 'inc-1' }, policy }).reason,
  'recovery_observation',
);
assert.equal(
  decideJobAlert({ currentRun: success, recentRuns: [success, success], activeIncident: { id: 'inc-1' }, policy }).action,
  'resolve',
);
assert.equal(
  decideJobAlert({ currentRun: unknown, recentRuns: [], activeIncident: null, policy }).reason,
  'not_confirmed_failure',
);

console.log('systemJobAlerts.test.js: ok');
