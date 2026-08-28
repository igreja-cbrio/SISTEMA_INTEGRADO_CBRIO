const assert = require('node:assert/strict');
const {
  normalizeSignal,
  safeRoute,
  serverErrorFingerprint,
  groupServerErrors,
  severityForErrors,
  severityForFeedback,
  feedbackNeedsIncident,
} = require('./systemIncidentTriage');

assert.equal(
  normalizeSignal('Falha 123456 para 98e8fc82-381a-4f08-9258-026b4f76f958'),
  'falha :number para :uuid',
);
assert.equal(safeRoute('/api/membros/98e8fc82-381a-4f08-9258-026b4f76f958?token=segredo'), '/api/membros/:id');
assert.equal(safeRoute('/api/pedidos/123456'), '/api/pedidos/:id');

const base = { metodo: 'GET', rota: '/api/teste?x=1', mensagem: 'Registro 123456 falhou' };
const repeated = { metodo: 'GET', rota: '/api/teste?x=2', mensagem: 'Registro 987654 falhou' };
const other = { metodo: 'POST', rota: '/api/teste', mensagem: 'Registro 987654 falhou' };
assert.equal(serverErrorFingerprint(base), serverErrorFingerprint(repeated));
assert.notEqual(serverErrorFingerprint(base), serverErrorFingerprint(other));
assert.equal(groupServerErrors([base, repeated, other]).length, 2);

assert.equal(severityForErrors(Array.from({ length: 9 })), 'error');
assert.equal(severityForErrors(Array.from({ length: 10 })), 'critical');
assert.equal(severityForFeedback('critica'), 'critical');
assert.equal(severityForFeedback('media'), 'warning');
assert.equal(feedbackNeedsIncident({ tipo: 'bug' }), true);
assert.equal(feedbackNeedsIncident({ tipo: 'confusao' }), true);
assert.equal(feedbackNeedsIncident({ tipo: 'sugestao' }), false);

console.log('systemIncidentTriage.test.js: ok');
