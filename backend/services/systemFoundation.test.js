const assert = require('node:assert/strict');
const { normalizeRequestId } = require('../middleware/requestContext');
const {
  SERVICES,
  JOBS,
  WORKFLOWS,
  INTEGRATIONS,
  getReleaseInfo,
  getFoundationPayload,
} = require('../config/systemCatalog');

assert.equal(JOBS.length, 46, 'o catálogo deve cobrir todos os crons do vercel.json');
assert.equal(WORKFLOWS.length, 10, 'o catálogo deve cobrir os workflows inventariados');
assert.equal(new Set(JOBS.map((job) => job.id)).size, JOBS.length, 'IDs de jobs devem ser únicos');
assert.equal(new Set(INTEGRATIONS.map((item) => item.id)).size, INTEGRATIONS.length, 'IDs de integrações devem ser únicos');
assert.ok(SERVICES.length > 0, 'o catálogo precisa expor serviços');

assert.equal(normalizeRequestId('a1b2c3d4'), 'a1b2c3d4');
assert.equal(normalizeRequestId('  request:12345678  '), 'request:12345678');
assert.equal(normalizeRequestId('curto'), null);
assert.equal(normalizeRequestId('inválido com espaço'), null);

const release = getReleaseInfo({
  VERCEL_GIT_COMMIT_SHA: '1234567890abcdef',
  VERCEL_GIT_COMMIT_REF: 'main',
  VERCEL_ENV: 'production',
});
assert.equal(release.shortCommit, '12345678');
assert.equal(release.branch, 'main');
assert.equal(release.environment, 'production');

const payload = getFoundationPayload({ NODE_ENV: 'test' });
assert.equal(payload.contractVersion, 1);
assert.equal(payload.counts.jobs, 46);
assert.equal(payload.boundaries.executionRegistry, 'migration_required');

console.log('systemFoundation: ok');
