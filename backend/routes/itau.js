// Rotas REST da integracao com o Itau for Developers.
//
// FUNDACAO · por enquanto so health + log. Os endpoints operacionais
// (extrato, pix, boletos, pagamentos) entram conforme cada produto for
// liberado/contratado no portal Itau e testado em homologacao.
// Espelha o padrao de routes/santander.js.
const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const {
  AMBIENTE, BASE_URL, TOKEN_URL, AGENCIA, CONTA, CNPJ_TITULAR,
  isConfigured, missingEnv, getAccessToken,
} = require('../services/itau/httpClient');

// Mapeado em ROUTE_MODULE_MAP -> ['financeiro']. Leitura exige financeiro>=1.
router.use(authenticate, authorizeModule('itau'));

function userId(req) { return req.user?.id || null; }

// ── Health · checa config e tenta o handshake OAuth (mTLS) ──────────────────
router.get('/health', async (req, res) => {
  const miss = missingEnv();
  if (miss.length) {
    return res.json({
      ok: false,
      configured: false,
      missing_env: miss,
      ambiente: AMBIENTE,
      base_url: BASE_URL,
      token_url: TOKEN_URL,
      hint: 'Gere a credencial (Client ID/Secret) e o certificado no portal Itau, '
        + 'depois preencha as envs ITAU_* no Vercel.',
    });
  }
  try {
    const token = await getAccessToken();
    res.json({
      ok: true,
      configured: true,
      ambiente: AMBIENTE,
      base_url: BASE_URL,
      agencia: AGENCIA || null,
      conta: CONTA || null,
      cnpj_titular: CNPJ_TITULAR || null,
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

// ── Sync log (debug) ─────────────────────────────────────────────────────────
router.get('/log', authorizeModule('itau', 3), async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from('itau_sync_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PIX COBRANCA · gera QR Code de cobranca imediata (PIX Recebimentos v2)
// Desligado por padrao (ITAU_PIX_COB_ENABLED) · espelha o fluxo Santander.
// ════════════════════════════════════════════════════════════════════════════
const pixCob = require('../services/itau/pixCobrancaService');

// Health · checa toggle e chave
router.get('/pix-cob/health', async (req, res) => {
  res.json({
    habilitado: pixCob.isEnabled(),
    chave_configurada: !!pixCob.getChave(),
    chave_preview: pixCob.getChave() ? pixCob.getChave().slice(0, 4) + '***' : null,
    paths_testados: pixCob.getPathsTestados ? pixCob.getPathsTestados() : null,
    path_funcionando: pixCob.getPathFuncionando ? pixCob.getPathFuncionando() : null,
    env_value_raw: process.env.ITAU_PIX_COB_ENABLED || '<unset>',
    hint: pixCob.isEnabled() ? null
      : 'Setar ITAU_PIX_COB_ENABLED=true + ITAU_PIX_COB_CHAVE no Vercel (Production) + redeploy',
  });
});

// POST · cria cobranca + salva no banco
router.post('/pix-cob', authorizeModule('financeiro', 3), async (req, res) => {
  try {
    const { valor, devedor, solicitacao, expiracao, origem, metadata } = req.body || {};
    if (!valor || Number(valor) <= 0) {
      return res.status(400).json({ error: 'valor obrigatorio (> 0)' });
    }

    const txid = pixCob.gerarTxid('cbrio');
    let api;
    try {
      api = await pixCob.criarCobranca({
        txid, valor: Number(valor), devedor, solicitacao,
        expiracao: expiracao ? Number(expiracao) : 3600,
      });
    } catch (e) {
      // Persiste tentativa com status ERRO pra rastrear
      await supabase.from('itau_pix_cob').insert({
        txid, valor: Number(valor),
        devedor_nome: devedor?.nome || null,
        devedor_cpf_cnpj: (devedor?.cpf || devedor?.cnpj || '').replace(/\D/g, '') || null,
        solicitacao_pagador: solicitacao || null,
        expira_em_segundos: expiracao || 3600,
        status: 'ERRO',
        chave_pix: pixCob.getChave(),
        origem: origem || 'manual_admin',
        metadata: { ...(metadata || {}), erro: e.message?.slice(0, 500) },
        criado_por: userId(req),
      });
      return res.status(502).json({ error: e.message, txid });
    }

    const { data, error } = await supabase.from('itau_pix_cob').insert({
      txid,
      valor: Number(valor),
      devedor_nome: devedor?.nome || null,
      devedor_cpf_cnpj: (devedor?.cpf || devedor?.cnpj || '').replace(/\D/g, '') || null,
      solicitacao_pagador: solicitacao || null,
      expira_em_segundos: expiracao || 3600,
      status: api?.status || 'ATIVA',
      qrcode_payload: api?.pixCopiaECola || null,
      location_url: api?.location || null,
      loc_id: api?.loc?.id ? String(api.loc.id) : null,
      chave_pix: pixCob.getChave(),
      revisao: api?.revisao || 0,
      origem: origem || 'manual_admin',
      metadata: metadata || null,
      criado_por: userId(req),
    }).select().single();

    if (error) return res.status(500).json({ error: error.message, api });
    res.json({ cob: data, api });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET · lista cobrancas do banco (com filtros)
router.get('/pix-cob', async (req, res) => {
  try {
    const { status, limit = 50, origem } = req.query;
    let q = supabase
      .from('itau_pix_cob')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(200, Number(limit) || 50));
    if (status) q = q.eq('status', status);
    if (origem) q = q.eq('origem', origem);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data, total: data?.length || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET · detalhe + refresh status via API
router.get('/pix-cob/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    const { data: local } = await supabase
      .from('itau_pix_cob').select('*').eq('txid', txid).single();
    if (!local) return res.status(404).json({ error: 'Cobranca nao encontrada' });

    // Se ainda esta ATIVA, atualiza status via API
    if (local.status === 'ATIVA' && pixCob.isEnabled()) {
      try {
        const api = await pixCob.consultarCobranca(txid);
        if (api && api.status !== local.status) {
          const patch = { status: api.status, revisao: api.revisao || local.revisao };
          if (api.status === 'CONCLUIDA' && api.pix && api.pix.length > 0) {
            const ult = api.pix[api.pix.length - 1];
            patch.pago_em = ult.horario || new Date().toISOString();
            patch.pago_valor = Number(ult.valor || 0);
            patch.pago_e2e_id = ult.endToEndId || null;
          }
          await supabase.from('itau_pix_cob').update(patch).eq('txid', txid);
          return res.json({ ...local, ...patch });
        }
      } catch (_) { /* falha silenciosa · retorna local */ }
    }
    res.json(local);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH · cancela cobranca
router.patch('/pix-cob/:txid/cancelar', authorizeModule('financeiro', 3), async (req, res) => {
  try {
    const { txid } = req.params;
    if (pixCob.isEnabled()) {
      try {
        await pixCob.cancelarCobranca(txid);
      } catch (e) {
        console.warn('[itau/pix-cob/cancelar] API falhou:', e.message);
      }
    }
    const { data, error } = await supabase
      .from('itau_pix_cob')
      .update({ status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' })
      .eq('txid', txid).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
