// Autenticacao de endpoints de cron (sem login de usuario).
//
// SEGURANCA: a versao antiga aceitava `User-Agent: vercel-cron` como prova de
// origem. O header User-Agent e 100% controlado pelo cliente, entao qualquer
// atacante podia disparar os crons (LLM do Cerebro, recalculos pesados, sync
// financeiro, etc.) simplesmente mandando esse User-Agent — bypass de auth +
// amplificacao de DoS/custo. NUNCA confiar em User-Agent aqui.
//
// Como os crons legitimos se autenticam:
//   - Vercel Cron  → injeta `Authorization: Bearer <CRON_SECRET>` automaticamente
//                    quando a env CRON_SECRET existe no projeto.
//   - GitHub Actions → manda `x-cron-secret: <CRON_SECRET>` (ver .github/workflows).
//
// Fail-CLOSED: sem CRON_SECRET configurado, nenhuma chamada passa.

const crypto = require('crypto');

// Comparacao de strings em tempo (quase) constante · evita timing side-channel
// na recuperacao do secret. Buffers de tamanhos diferentes -> false sem vazar.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// Retorna true se a request carrega um CRON_SECRET valido.
function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed

  const xcron = req.headers['x-cron-secret'];
  if (xcron && safeEqual(xcron, secret)) return true;

  const authz = req.headers['authorization'];
  if (authz && (safeEqual(authz, secret) || safeEqual(authz, `Bearer ${secret}`))) return true;

  return false;
}

// Middleware pronto pra uso: `router.get('/cron/x', requireCron, handler)`
function requireCron(req, res, next) {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

module.exports = { isAuthorizedCron, requireCron, safeEqual };
