const assert = require('node:assert/strict');
const {
  percentile,
  ratingFor,
  normalizedRoute,
  normalizeVital,
  SYNTHETIC_JOURNEYS,
} = require('./systemWebOps');
const { sanitizeSentryEvent } = require('../utils/sentry');

assert.equal(percentile([1, 2, 3, 4], 0.75), 3);
assert.equal(percentile([], 0.75), null);

assert.equal(ratingFor('LCP', 2500), 'good');
assert.equal(ratingFor('LCP', 2501), 'needs-improvement');
assert.equal(ratingFor('LCP', 4001), 'poor');
assert.equal(ratingFor('INP', 200), 'good');
assert.equal(ratingFor('CLS', 0.11), 'needs-improvement');

assert.equal(normalizedRoute('/pessoas/123456?cpf=123'), '/pessoas/:id');
assert.equal(
  normalizedRoute('/incidents/550e8400-e29b-41d4-a716-446655440000#timeline'),
  '/incidents/:id',
);
assert.equal(normalizedRoute('/teste/<script>'), '/teste/script');

assert.equal(normalizeVital({ metric: 'INVALID', value: 10 }), null);
assert.equal(normalizeVital({ metric: 'LCP', value: -1 }), null);
assert.deepEqual(
  normalizeVital({
    metric: 'cls',
    value: 0.123456,
    route: '/evento/123456?email=x@y.com',
    device_class: 'desktop',
  }),
  {
    metric: 'CLS',
    value: 0.1235,
    rating: 'needs-improvement',
    route: '/evento/:id',
    navigation_type: null,
    device_class: 'desktop',
    release: null,
    environment: 'development',
    request_id: null,
  },
);

assert.equal(SYNTHETIC_JOURNEYS.length, 3);
assert.ok(SYNTHETIC_JOURNEYS.every((journey) => journey.path.startsWith('/')));

const sanitized = sanitizeSentryEvent({
  user: { email: 'pessoa@cbrio.org' },
  request: {
    url: 'https://cbrio.org/api/teste?cpf=12345678901',
    data: { senha: 'segredo' },
    headers: { authorization: 'Bearer segredo', cookie: 'sid=x' },
  },
  exception: { values: [{ value: 'Falha para pessoa@cbrio.org CPF 123.456.789-01' }] },
  extra: { token: 'segredo' },
});
assert.equal(sanitized.user, undefined);
assert.equal(sanitized.extra, undefined);
assert.equal(sanitized.request.url, 'https://cbrio.org/api/teste');
assert.equal(sanitized.request.data, undefined);
assert.equal(sanitized.request.headers.authorization, undefined);
assert.equal(sanitized.exception.values[0].value, 'Falha para [EMAIL] CPF [CPF]');

console.log('systemWebOps: ok');
