// Rotas REST de integracao com Santander Open APIs
// Saldo + extrato (bank_account_information v1) + comprovantes (consult_payment_receipts v2)
const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const {
  AMBIENTE, BANK_ID, AGENCIA, CONTA, CNPJ_TITULAR,
  isConfigured, missingEnv, getAccessToken,
} = require('../services/santander/httpClient');
const contas = require('../services/santander/contasService');
const comprovantes = require('../services/santander/comprovantesService');

router.use(authenticate, authorizeModule('santander'));

function userId(req) { return req.user?.id || null; }

// ── Health · checa config e tenta OAuth ────────────────────────────────────
router.get('/health', async (req, res) => {
  const miss = missingEnv();
  if (miss.length) {
    return res.json({
      ok: false,
      configured: false,
      missing_env: miss,
      ambiente: AMBIENTE,
    });
  }
  try {
    const token = await getAccessToken();
    res.json({
      ok: true,
      configured: true,
      ambiente: AMBIENTE,
      bank_id: BANK_ID,
      agencia: AGENCIA,
      conta: CONTA,
      cnpj_titular: CNPJ_TITULAR,
      token_obtained: Boolean(token),
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      configured: true,
      ambiente: AMBIENTE,
      error: e.message,
    });
  }
});

// ── Saldo ──────────────────────────────────────────────────────────────────
router.get('/saldo', async (req, res) => {
  try {
    const saldo = await contas.snapshotSaldoDoDia({ userId: userId(req) });
    res.json(saldo);
  } catch (e) {
    console.error('[Santander] saldo:', e.message);
    res.status(e.status || 500).json({ error: e.message, traceId: e.traceId });
  }
});

router.get('/saldo/historico', async (req, res) => {
  try {
    const dias = Math.min(Math.max(Number(req.query.dias) || 30, 1), 365);
    const data = await contas.historicoSaldo({ dias });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Contas (lista contas do CNPJ na API) ───────────────────────────────────
router.get('/contas', async (req, res) => {
  try {
    const data = await contas.listarContas({ userId: userId(req) });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ── Extrato ────────────────────────────────────────────────────────────────
router.get('/extrato', async (req, res) => {
  try {
    const inicio = req.query.inicio;
    const fim = req.query.fim;
    if (!inicio || !fim) return res.status(400).json({ error: 'Parametros inicio e fim sao obrigatorios (YYYY-MM-DD)' });
    const usarCache = req.query.refresh !== '1';
    const data = await contas.consultarExtrato({ inicio, fim, usarCache, userId: userId(req) });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, traceId: e.traceId });
  }
});

// ── Comprovantes · listagem ────────────────────────────────────────────────
router.get('/comprovantes', async (req, res) => {
  try {
    const { inicio, fim, categoria, beneficiario, limit, offset } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'inicio e fim sao obrigatorios' });

    const data = await comprovantes.listReceipts({
      startDate: inicio,
      endDate: fim,
      category: categoria,
      beneficiaryDocument: beneficiario,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
      accountAgency: AGENCIA,
      accountNumber: CONTA,
      userId: userId(req),
    });

    // Enriquece com status local (se ja foi baixado)
    const ids = (data?.paymentsReceipts || [])
      .map((p) => p?.payment?.paymentId)
      .filter(Boolean);
    let locais = {};
    if (ids.length && supabase) {
      const { data: rows } = await supabase
        .from('santander_comprovantes')
        .select('payment_id, status, storage_path, vinculo_transacao_id, vinculo_pagar_id')
        .in('payment_id', ids);
      (rows || []).forEach((r) => { locais[r.payment_id] = r; });
    }
    data.localStatus = locais;
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, traceId: e.traceId });
  }
});

// ── Comprovante · baixar PDF (fluxo assincrono completo) ───────────────────
router.post('/comprovantes/:paymentId/baixar', authorizeModule('santander', 3), async (req, res) => {
  try {
    const { paymentId } = req.params;
    const metadata = req.body?.metadata || {};
    const row = await comprovantes.baixarComprovante(paymentId, {
      userId: userId(req),
      metadata,
    });
    res.json(row);
  } catch (e) {
    console.error('[Santander] baixar comprovante:', e.message);
    res.status(e.status || 500).json({
      error: e.message,
      santanderStatus: e.santanderStatus,
      traceId: e.traceId,
    });
  }
});

router.get('/comprovantes/:paymentId/pdf-url', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const url = await comprovantes.getSignedUrl(paymentId);
    if (!url) return res.status(404).json({ error: 'Comprovante nao baixado ou nao encontrado' });
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Comprovante · vincular a transacao ou conta a pagar ────────────────────
router.post('/comprovantes/:paymentId/vincular', authorizeModule('santander', 3), async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { transacao_id, pagar_id } = req.body || {};
    if (!transacao_id && !pagar_id) return res.status(400).json({ error: 'Informe transacao_id ou pagar_id' });

    const update = {
      vinculo_transacao_id: transacao_id || null,
      vinculo_pagar_id: pagar_id || null,
      vinculado_em: new Date().toISOString(),
      vinculado_por: userId(req),
    };
    const { data, error } = await supabase
      .from('santander_comprovantes')
      .update(update)
      .eq('payment_id', paymentId)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/comprovantes/:paymentId/vincular', authorizeModule('santander', 3), async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { data, error } = await supabase
      .from('santander_comprovantes')
      .update({
        vinculo_transacao_id: null,
        vinculo_pagar_id: null,
        vinculado_em: null,
        vinculado_por: null,
      })
      .eq('payment_id', paymentId)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listagem local (ja baixados / com vinculo)
router.get('/comprovantes-local', async (req, res) => {
  try {
    const { vinculados, transacao_id, pagar_id } = req.query;
    let q = supabase
      .from('santander_comprovantes')
      .select('*')
      .order('payment_date', { ascending: false, nullsFirst: false })
      .limit(200);
    if (vinculados === '1') q = q.or('vinculo_transacao_id.not.is.null,vinculo_pagar_id.not.is.null');
    if (vinculados === '0') q = q.is('vinculo_transacao_id', null).is('vinculo_pagar_id', null);
    if (transacao_id) q = q.eq('vinculo_transacao_id', transacao_id);
    if (pagar_id) q = q.eq('vinculo_pagar_id', pagar_id);

    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bulk receipts ──────────────────────────────────────────────────────────
router.post('/bulk', authorizeModule('santander', 3), async (req, res) => {
  try {
    const { alias, inicio, fim, categorias, beneficiario } = req.body || {};
    if (!alias || !inicio || !fim) return res.status(400).json({ error: 'alias, inicio e fim obrigatorios' });
    const resp = await comprovantes.createBulkOrder({
      alias,
      startDate: inicio,
      endDate: fim,
      categoryCodes: Array.isArray(categorias) ? categorias : (categorias ? [categorias] : null),
      payeeDocument: beneficiario,
      userId: userId(req),
    });
    res.json(resp);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, traceId: e.traceId });
  }
});

router.get('/bulk', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from('santander_bulk_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/bulk/:orderId', async (req, res) => {
  try {
    const resp = await comprovantes.getBulkOrder(req.params.orderId, { userId: userId(req) });
    res.json(resp);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, traceId: e.traceId });
  }
});

// ── Sync log (debug) ───────────────────────────────────────────────────────
router.get('/log', authorizeModule('santander', 3), async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from('santander_sync_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
