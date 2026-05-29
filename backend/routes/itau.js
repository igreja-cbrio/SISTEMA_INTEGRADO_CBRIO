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

module.exports = router;
