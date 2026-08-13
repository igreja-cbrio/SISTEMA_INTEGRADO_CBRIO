const assert = require('node:assert/strict');
const {
  normalizePlatform,
  sanitizeProps,
  normalizeMobileEvent,
  normalizeMobileTelemetryBatch,
} = require('./systemMobileOps');

assert.equal(normalizePlatform('Android'), 'android');
assert.equal(normalizePlatform('ios'), 'ios');
assert.equal(normalizePlatform('web'), null);

assert.deepEqual(sanitizeProps({
  message: 'Falha controlada',
  fatal: 'true',
  endpoint: 'https://www.cbrio.org/api/membros?email=segredo@cbrio.org',
  status_code: '503',
  token: 'nunca-deve-persistir',
  email: 'pessoa@example.com',
}), {
  message: 'Falha controlada',
  fatal: true,
  endpoint: '/api/membros',
  status_code: 503,
});

const normalized = normalizeMobileEvent({
  tipo: 'erro',
  nome: 'network_error',
  plataforma: 'IOS',
  app_version: '1.2.0',
  build_number: '42',
  duration_ms: 321,
  is_offline: false,
  event_id: '1d6feac4-85a1-4d07-a686-09344f13f4bc',
  props: { reason: 'timeout', password: 'não' },
}, 'user-id');
assert.equal(normalized.plataforma, 'ios');
assert.equal(normalized.duration_ms, 321);
assert.equal(normalized.props.reason, 'timeout');
assert.equal(normalized.props.password, undefined);
assert.equal(normalized.user_id, 'user-id');

assert.equal(normalizeMobileTelemetryBatch(new Array(70).fill({ nome: 'acao' })).length, 50);
assert.equal(normalizeMobileEvent({ duration_ms: 900000 }).duration_ms, null);
assert.equal(normalizeMobileEvent({ occurred_at: 'inválido' }).occurred_at, null);

console.log('systemMobileOps.test.js: ok');
