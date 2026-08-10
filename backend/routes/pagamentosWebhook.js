// ============================================================================
// Webhook do PSP + crons de pagamento.
//
// POST /api/pagamentos-webhook/:provider   - entrega do PSP (público, sem auth)
// GET  /api/pagamentos-webhook/cron/tick   - expirar + reconciliar + replay (CRON_SECRET)
// GET  /api/pagamentos-webhook/cron/expirar|reconciliar|replay - avulsos (CRON_SECRET)
//
// ⚠️ SÓ o `tick` está no vercel.json, de propósito: o projeto já tem 44 crons
// e o teto do plano Pro é 40 — cron a mais pode simplesmente não registrar, e
// "cron de expiração que nunca roda" = vaga paga que nunca é liberada, falha
// silenciosa. Os três avulsos ficam pra disparo manual/depuração.
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
const { AppError, ERROR_CODES } = require('../utils/appError');
const { captureHandledException } = require('../utils/sentry');

function paymentCronError(error, publicMessage) {
  return new AppError(error?.message || publicMessage, {
    code: ERROR_CODES.PAYMENT_CRON_FAILED,
    publicMessage,
    cause: error,
    isOperational: false,
  });
}
function paymentWebhookError(error) {
  return new AppError(error?.message || 'Falha no webhook de pagamento', {
    code: ERROR_CODES.PAYMENT_WEBHOOK_FAILED,
    publicMessage: 'Falha no processamento do webhook de pagamento.',
    cause: error,
    isOperational: false,
  });
}



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
      // O Mercado Pago assina um manifesto montado com o `data.id` do QUERY
      // STRING (não do corpo) — sem isto, toda entrega dele tomaria 401.
      query: req.query,
    });
    return res.status(http).json(corpo);
  } catch (e) {
    // Nem o serviço conseguiu registrar. Logar e devolver 200 mesmo assim:
    // reentrega não conserta bug nosso e ainda pode derrubar o webhook.
    console.error('[pagamentosWebhook] falha não tratada:', e.message);
    captureHandledException(paymentWebhookError(e), req, 'payments.webhook.accepted_with_failure');
    return res.status(200).json({ ok: true, erro_registrado: false });
  }
});

// ── Crons ──────────────────────────────────────────────────────────────────

// O ÚNICO agendado (*/10). Faz as três coisas numa passada; todas são
// idempotentes, então rodar junto não muda o resultado — só economiza slot de
// cron. Nenhuma etapa aborta as outras: expiração é DB puro e barata, enquanto
// a reconciliação depende do PSP e é a que pode falhar por rede.
router.get('/cron/tick', async (req, res) => {
  if (!cronAutorizado(req)) return res.status(401).json({ error: 'não autorizado' });
  const out = {};
  // Expirar primeiro: libera vaga o quanto antes, e não depende de rede.
  try {
    out.expirar = await pagamentos.expirarVencidas({ limite: 200 });
  } catch (e) {
    out.expirar = { erro: e.message };
    console.error('[pagamentosWebhook] tick/expirar:', e.message);
    captureHandledException(paymentCronError(e, 'Erro ao expirar cobranças.'), req, 'payments.tick.expire');
  }
  // Reconciliar com limite menor que o avulso: roda 6x por hora, então 50 por
  // passada dá 300 consultas/h ao PSP e rotaciona a fila inteira (a ordenação
  // por updated_at faz round-robin — ver cobrancas.listarParaReconciliar).
  try {
    out.reconciliar = await pagamentos.reconciliar({ dias: 30, limite: 50 });
  } catch (e) {
    out.reconciliar = { erro: e.message };
    console.error('[pagamentosWebhook] tick/reconciliar:', e.message);
    captureHandledException(paymentCronError(e, 'Erro ao reconciliar cobranças.'), req, 'payments.tick.reconcile');
  }
  try {
    out.replay = await pagamentos.reprocessarWebhooksPendentes({ limite: 20 });
  } catch (e) {
    out.replay = { erro: e.message };
    console.error('[pagamentosWebhook] tick/replay:', e.message);
    captureHandledException(paymentCronError(e, 'Erro ao reprocessar eventos de pagamento.'), req, 'payments.tick.replay');
  }
  // Sonda da CREDENCIAL — ela mesma se limita a 1x/dia (as outras 143 execuções
  // diárias saem em `pulado: verificado_recentemente`, sem tocar o PSP). Está
  // aqui, e não num cron novo, porque o projeto já tem 45 declarados. Nunca
  // notifica quando está tudo bem; ver services/pagamentos/saude.js.
  try {
    out.saude = await pagamentos.verificarSaude();
  } catch (e) {
    out.saude = { erro: e.message };
    console.error('[pagamentosWebhook] tick/saude:', e.message);
    captureHandledException(paymentCronError(e, 'Erro ao verificar a credencial de pagamento.'), req, 'payments.tick.credential_health');
  }
  res.json({ ok: true, ...out });
});

// Expira cobrança vencida e dispara o handler do domínio (que libera a vaga).
// Nunca expira quem já pagou algo. Avulso: use pra depurar/forçar.
router.get('/cron/expirar', async (req, res, next) => {
  if (!cronAutorizado(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const r = await pagamentos.expirarVencidas({ limite: 200 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/expirar:', e.message);
    next(paymentCronError(e, 'Erro ao expirar cobranças.'));
  }
});

// A VERDADE do estado. O webhook é otimização de latência: se ele falhar, sumir
// ou for desativado pelo PSP, é este cron que fecha o ciclo.
router.get('/cron/reconciliar', async (req, res, next) => {
  if (!cronAutorizado(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const dias = Math.min(parseInt(req.query.dias) || 30, 180);
    const r = await pagamentos.reconciliar({ dias, limite: 200 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/reconciliar:', e.message);
    next(paymentCronError(e, 'Erro ao reconciliar cobranças.'));
  }
});

// Reprocessa eventos que ficaram como 'erro' (replay do payload guardado, sem
// depender de reentrega do PSP).
router.get('/cron/replay', async (req, res, next) => {
  if (!cronAutorizado(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const r = await pagamentos.reprocessarWebhooksPendentes({ limite: 50 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/replay:', e.message);
    next(paymentCronError(e, 'Erro ao reprocessar eventos de pagamento.'));
  }
});

// Sonda de credencial FORÇADA (ignora o intervalo de 1x/dia). Avulso pra
// depurar e pra conferir antes de um lançamento de evento pago.
router.get('/cron/saude', async (req, res, next) => {
  if (!cronAutorizado(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const r = await pagamentos.verificarSaude({ forcar: true });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/saude:', e.message);
    next(paymentCronError(e, 'Erro ao verificar a credencial de pagamento.'));
  }
});

module.exports = router;
