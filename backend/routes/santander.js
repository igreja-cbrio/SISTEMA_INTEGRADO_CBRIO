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

// ── Culto ao Vivo · stats + ultimas transacoes ─────────────────────────────
router.get('/pix/culto-atual', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);

    // 1. Stats do culto/dia/semana (view consolidada)
    const { data: stats, error: errStats } = await supabase
      .from('vw_fin_culto_ao_vivo')
      .select('*')
      .maybeSingle();
    if (errStats) console.warn('[culto-atual] view stats:', errStats.message);

    // 2. Ultimas transacoes (creditos · dizimos/ofertas)
    const { data: transacoes, error: errTrans } = await supabase
      .from('fin_lancamentos_brutos')
      .select('id, data_lancamento, hora_lancamento, valor, memo, documento_contraparte, nome_contraparte, created_at')
      .eq('tipo_trn', 'CREDIT')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (errTrans) return res.status(500).json({ error: errTrans.message });

    // 3. Soma do dia (fallback se nao ha culto ativo · stats fica null)
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: doDia } = await supabase
      .from('fin_lancamentos_brutos')
      .select('valor')
      .eq('tipo_trn', 'CREDIT')
      .gte('created_at', `${hoje}T00:00:00`);
    const totalDia = (doDia || []).reduce((s, t) => s + Number(t.valor), 0);
    const qtdDia = (doDia || []).length;

    res.json({
      culto_ativo: stats ? {
        slot_id: stats.culto_slot_id,
        nome: stats.culto_nome,
        service_type_slug: stats.service_type_slug,
        janela_inicio: stats.janela_inicio,
        janela_fim: stats.janela_fim,
        total: Number(stats.total_culto || 0),
        qtd: Number(stats.qtd_culto || 0),
      } : null,
      total_dia: stats ? Number(stats.total_dia || 0) : totalDia,
      qtd_dia: stats ? Number(stats.qtd_dia || 0) : qtdDia,
      total_semana: stats ? Number(stats.total_semana || 0) : 0,
      qtd_semana: stats ? Number(stats.qtd_semana || 0) : 0,
      transacoes: transacoes || [],
    });
  } catch (e) {
    console.error('[culto-atual]', e);
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

// ── PIX API · diagnostico do produto PIX (descobre se Santander libera) ────
const pixApi = require('../services/santander/pixApiService');

router.get('/pix-api/diagnostico', async (req, res) => {
  try {
    if (!pixApi.isEnabled()) {
      return res.json({
        habilitado: false,
        hint: 'Defina env SANTANDER_PIX_API_ENABLED=true pra ativar tentativa de descobrir endpoint PIX',
        paths_que_serao_testados: pixApi.PIX_API_PATHS,
      });
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const result = await pixApi.buscarPixRecebidos({ inicio: ontem, fim: hoje });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
