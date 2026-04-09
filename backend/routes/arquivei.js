const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate, authorize('admin', 'diretor'));

// ── Helpers ───────────────────────────────────────────────
async function getArquiveiConfig() {
  const { data } = await supabase
    .from('arquivei_config')
    .select('*')
    .limit(1)
    .maybeSingle();
  return data;
}

// ── STATUS ────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const config = await getArquiveiConfig();
    res.json({ connected: !!(config?.api_id && config?.api_key) });
  } catch (e) {
    console.error('[ARQUIVEI] Status error:', e.message);
    res.json({ connected: false });
  }
});

// ── CONFIG ────────────────────────────────────────────────
router.post('/config', async (req, res) => {
  try {
    const { api_id, api_key } = req.body;
    if (!api_id || !api_key) {
      return res.status(400).json({ error: 'API ID e API Key são obrigatórios' });
    }

    const existing = await getArquiveiConfig();
    if (existing) {
      await supabase.from('arquivei_config').update({ api_id, api_key }).eq('id', existing.id);
    } else {
      await supabase.from('arquivei_config').insert({ api_id, api_key });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[ARQUIVEI] Config error:', e.message);
    res.status(500).json({ error: 'Erro ao configurar Arquivei' });
  }
});

// ── DISCONNECT ────────────────────────────────────────────
router.post('/disconnect', async (req, res) => {
  try {
    const config = await getArquiveiConfig();
    if (config) {
      await supabase.from('arquivei_config').delete().eq('id', config.id);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[ARQUIVEI] Disconnect error:', e.message);
    res.status(500).json({ error: 'Erro ao desconectar Arquivei' });
  }
});

// ── SYNC ──────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const config = await getArquiveiConfig();
    if (!config?.api_id || !config?.api_key) {
      return res.status(400).json({ error: 'Arquivei não configurado' });
    }
    // TODO: Implement actual Arquivei API sync
    res.json({ success: true, message: 'Sincronização iniciada' });
  } catch (e) {
    console.error('[ARQUIVEI] Sync error:', e.message);
    res.status(500).json({ error: 'Erro ao sincronizar notas' });
  }
});

module.exports = router;
