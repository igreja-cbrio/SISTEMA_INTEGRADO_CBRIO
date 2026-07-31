const assert = require('node:assert/strict');
const { CONTROL_STATUSES, normalizeEvidenceUrl } = require('./systemDataGovernance');

assert.equal(CONTROL_STATUSES.has('blocked'), true);
assert.equal(CONTROL_STATUSES.has('approved'), false);
assert.equal(normalizeEvidenceUrl('https://docs.cbrio.org/politica/face-v1'), 'https://docs.cbrio.org/politica/face-v1');
assert.equal(normalizeEvidenceUrl('http://inseguro.local/politica'), null);
assert.equal(normalizeEvidenceUrl('javascript:alert(1)'), null);
assert.equal(normalizeEvidenceUrl('não é URL'), null);

console.log('systemDataGovernance.test.js: ok');
