const { randomUUID } = require('crypto');
const { comContextoDeFalha } = require('../utils/contextoFalha');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function normalizeRequestId(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return REQUEST_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function requestContext(req, res, next) {
  const requestId = normalizeRequestId(req.headers['x-request-id']) || randomUUID();

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  // ⚠️ Abre o contexto de falha DAQUI, que é o 1º middleware da cadeia: é ele
  // que permite ao cliente do Supabase anotar o motivo real de um erro de banco
  // sem receber o `res` (ver `utils/contextoFalha.js`). `next` roda DENTRO do
  // contexto — chamá-lo fora deixaria o store vazio no resto da requisição.
  comContextoDeFalha(() => next());
}

module.exports = {
  normalizeRequestId,
  requestContext,
};
