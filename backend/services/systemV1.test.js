const assert = require('node:assert/strict');
const { JOBS } = require('../config/systemCatalog');
const { jobsByPath } = require('../middleware/systemJobTracking');
const { sanitizeText, sanitizeMetadata } = require('./systemJobRuns');
const { legacyRow } = require('./serverErrorTelemetry');
const { TRANSITIONS } = require('../routes/sistemaV1');

assert.equal(jobsByPath.size, 45);
for (const job of JOBS) {
  assert.ok(jobsByPath.has(job.path.split('?')[0]), `job sem tracking: ${job.path}`);
}

assert.equal(
  sanitizeText('Authorization: Bearer abc.def.ghi'),
  'Authorization: Bearer [REDACTED]',
);
assert.equal(
  sanitizeText('token=segredo123 resultado=ok'),
  'token=[REDACTED] resultado=ok',
);
assert.deepEqual(
  sanitizeMetadata({ route: '/api/teste', body: { cpf: '123' }, token: 'x', http_status: 500 }),
  { route: '/api/teste', http_status: 500 },
);

assert.deepEqual(
  legacyRow({
    rota: '/api/teste',
    mensagem: 'falhou',
    request_id: 'req-12345678',
    release: 'abc',
    environment: 'test',
  }),
  { rota: '/api/teste', mensagem: 'falhou' },
);

assert.ok(TRANSITIONS.novo.has('investigando'));
assert.ok(TRANSITIONS.investigando.has('mitigado'));
assert.ok(TRANSITIONS.mitigado.has('resolvido'));
assert.ok(TRANSITIONS.resolvido.has('monitorado'));
assert.ok(TRANSITIONS.resolvido.has('investigando'));
assert.equal(TRANSITIONS.risco_aceito.size, 0);

console.log('systemV1: ok');
