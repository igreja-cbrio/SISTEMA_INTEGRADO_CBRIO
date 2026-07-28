// ============================================================================
// Webhook do PSP + crons de pagamento.
//
// POST /api/pagamentos-webhook/:provider   - entrega do PSP (público, sem auth)
// GET  /api/pagamentos-webhook/cron/expirar      - CRON_SECRET
// GET  /api/pagamentos-webhook/cron/reconciliar  - CRON_SECRET
// GET  /api/pagamentos-webhook/cron/replay       - CRON_SECRET
//
// ⚠️ MONTADO FORA DOS DOIS RATE LIMITERS. Por que isso é obrigatório:
//   · o `publicLimiter` é 30/15min — o PSP entrega em rajada de poucos IPs;
//   · o limiter GLOBAL é 500/15min por IP, e o PSP entrega de um punhado de
//     IPs fixos, então uma rajada de lançamento passa fácil desse teto.
// Um 429 aqui significa **pagamento aprovado com inscrição não confirmada** —
// e vários PSPs DESATIVAM o webhook depois de N falhas, o que transforma um
// problema de 15 minutos num problema silencioso e permanente.
// O caminho: montar fora de `/api/public` (escapa o publicLimiter) E adicionar
// o path ao `skip()` do limiter global em server.js. Precedente: o webhook do
// WhatsApp faz exatamente isso.
//
// Limiter próprio, generoso, só como anti-flood grosseiro.
// `req.rawBody` já é capturado globalmente (server.js) — a verificação de
// assinatura funciona sem parser dedicado.
// ============================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const pagamentos = require('../services/pagamentos');

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.PAG_WEBHOOK_RATE_LIMIT_MAX) || 600,
  message: { error: 'rate limit' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});

function cronAutorizado(req) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;          // fail-closed: sem env, ninguém roda
  const header = req.headers.authorization || '';
  return header === `Bearer ${segredo}` || req.query.secret === segredo;
}

// ── Entrega do PSP ─────────────────────────────────────────────────────────
// Responde 200 pra tudo, exceto assinatura inválida (401). 4xx/5xx viram
// reentrega eterna — o serviço já grava o payload bruto e o cron de
// reconciliação é a rede.
router.post('/:provider', limiter, async (req, res) => {
  try {
    const { http, corpo } = await pagamentos.processarWebhook({
      providerNome: req.params.provider,
      rawBody: req.rawBody,
      headers: req.headers,
      payload: req.body,
    });
    return res.status(http).json(corpo);
  } catch (e) {
    // Nem o serviço conseguiu registrar. Logar e devolver 200 mesmo assim:
    // reentrega não conserta bug nosso e ainda pode derrubar o webhook.
    console.error('[pagamentosWebhook] falha não tratada:', e.message);
    return res.status(200).json({ ok: true, erro_registrado: false });
  }
});

// ── Crons ──────────────────────────────────────────────────────────────────

// Expira cobrança vencida e dispara o handler do domínio (que libera a vaga).
// Nunca expira quem já pagou algo.
router.get('/cron/expirar', async (req, res) => {
  if (!cronAutorizado(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const r = await pagamentos.expirarVencidas({ limite: 200 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/expirar:', e.message);
    res.status(500).json({ error: 'erro ao expirar cobranças' });
  }
});

// A VERDADE do estado. O webhook é otimização de latência: se ele falhar, sumir
// ou for desativado pelo PSP, é este cron que fecha o ciclo.
router.get('/cron/reconciliar', async (req, res) => {
  if (!cronAutorizado(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const dias = Math.min(parseInt(req.query.dias) || 30, 180);
    const r = await pagamentos.reconciliar({ dias, limite: 200 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/reconciliar:', e.message);
    res.status(500).json({ error: 'erro ao reconciliar cobranças' });
  }
});

// Reprocessa eventos que ficaram como 'erro' (replay do payload guardado, sem
// depender de reentrega do PSP).
router.get('/cron/replay', async (req, res) => {
  if (!cronAutorizado(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const r = await pagamentos.reprocessarWebhooksPendentes({ limite: 50 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/replay:', e.message);
    res.status(500).json({ error: 'erro ao reprocessar eventos' });
  }
});

module.exports = router;
