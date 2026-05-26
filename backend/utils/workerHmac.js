// HMAC outbound pra autenticar requisicoes do Vercel → Worker Railway.
// O Worker valida o header `X-Agent-Signature` contra o mesmo secret.

const crypto = require('crypto');

function sign(body) {
  const secret = process.env.AGENT_WORKER_HMAC_SECRET || '';
  if (!secret) throw new Error('AGENT_WORKER_HMAC_SECRET nao configurado');
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

module.exports = { sign };
