const assert = require('node:assert/strict');
const { AppError, ERROR_CODES, normalizeError } = require('../utils/appError');
const { createCorsOriginValidator, isAllowedOrigin } = require('../utils/corsPolicy');
const { shouldCaptureException } = require('../utils/sentry');
const {
  createErrorHandler,
  normalizeRoutePath,
  requestRoute,
  responsePayload,
  serializeErrorStack,
} = require('./errorHandler');

function mockResponse() {
  return {
    locals: {}, statusCode: null, body: null, headersSent: false,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

const rootCause = new Error('Banco falhou para pessoa@cbrio.org CPF 123.456.789-09');
const wrapped = new AppError('Falha ao sincronizar Wi-Fi', {
  code: ERROR_CODES.WIFI_SYNC_FAILED,
  cause: rootCause,
});
assert.equal(wrapped.status, 500);
assert.equal(wrapped.cause, rootCause);
assert.match(serializeErrorStack(wrapped), /Caused by:/);
assert.doesNotMatch(serializeErrorStack(wrapped), /pessoa@cbrio\.org|123\.456\.789-09/);

const unknown = normalizeError(new Error('quebrou'));
assert.equal(unknown.code, ERROR_CODES.UNEXPECTED_ERROR);
assert.equal(unknown.status, 500);
assert.equal(responsePayload(unknown, 'req-12345678').error, 'Erro interno do servidor.');

assert.equal(isAllowedOrigin('https://cbrio.org', {}), true);
assert.equal(isAllowedOrigin('https://admin.cbrio.org', {}), true);
assert.equal(isAllowedOrigin('https://evil.example', {}), false);
let corsError;
createCorsOriginValidator({ env: {}, logger: { warn() {} } })('https://evil.example', (error) => {
  corsError = error;
});
assert.equal(corsError.code, ERROR_CODES.ORIGIN_NOT_ALLOWED);
assert.equal(corsError.status, 403);
assert.equal(shouldCaptureException(corsError), false);
assert.equal(shouldCaptureException(Object.assign(new SyntaxError('JSON ruim'), { type: 'entity.parse.failed' })), false);
assert.equal(shouldCaptureException(new Error('bug inesperado')), true);


const recorded = [];
const handler = createErrorHandler({
  recordError: async (row) => { recorded.push(row); },
  logger: { error() {}, warn() {} },
});
const res500 = mockResponse();
handler(wrapped, {
  method: 'POST', baseUrl: '/api/wifi', route: { path: '/sync' },
  originalUrl: '/api/wifi/sync?token=segredo', requestId: 'request-500-test',
  user: { id: 'user-id', email: 'admin@cbrio.org' },
}, res500, () => {});
assert.equal(res500.statusCode, 500);
assert.equal(res500.body.code, ERROR_CODES.WIFI_SYNC_FAILED);
assert.equal(res500.body.error, 'Erro interno do servidor.');
assert.equal(res500.locals._erro500Registrado, true);
assert.equal(recorded.length, 1);
assert.equal(recorded[0].rota, '/api/wifi/sync');
assert.match(recorded[0].mensagem, /^\[WIFI_SYNC_FAILED\]/);
assert.match(recorded[0].stack, /Caused by:/);

const res403 = mockResponse();
handler(corsError, {
  method: 'OPTIONS', originalUrl: '/api/telemetry/web-vitals', requestId: 'request-403-test',
}, res403, () => {});
assert.equal(res403.statusCode, 403);
assert.equal(res403.body.code, ERROR_CODES.ORIGIN_NOT_ALLOWED);
assert.equal(res403.body.error, 'Origem não permitida.');
assert.equal(recorded.length, 1, 'erros operacionais 4xx não devem poluir app_erros_servidor');

assert.equal(normalizeRoutePath('/api/pessoas/12345678901?cpf=123'), '/api/pessoas/:id');
assert.equal(normalizeRoutePath('/api/item/123e4567-e89b-12d3-a456-426614174000'), '/api/item/:id');
assert.equal(normalizeRoutePath('/api/pessoas/marcos%40cbrio.org'), '/api/pessoas/:value');
assert.equal(requestRoute({ route: { path: '/sync' }, originalUrl: '/api/wifi/sync?token=x' }), '/api/wifi/sync');
console.log('errorHandler.test.js: ok');
