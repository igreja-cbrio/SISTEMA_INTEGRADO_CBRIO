const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { runWifiSync } = require('../services/wifiSync');

// ── Cron · ANTES de authenticate ──
router.get('/cron/sync', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const r = await runWifiSync();
    res.json(r);
  } catch (e) {
    console.error('[wifi/cron/sync]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.use(authenticate);

// Sincronizar agora (manual)
router.post('/sync', authorizeModule('wifi', 3), async (_req, res) => {
  try {
    const r = await runWifiSync();
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Status do último sync + contagens gerais
router.get('/resumo', authorizeModule('wifi', 1), async (_req, res) => {
  try {
    const { data: ultimoSync } = await supabase
      .from('wifi_sync_log').select('*')
      .order('iniciado_em', { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.rpc('fn_wifi_resumo');
    if (error) throw error;
    res.json({ ...(data || {}), ultimoSync: ultimoSync || null });
  } catch (e) {
    console.error('[wifi/resumo]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Lista de pessoas (agrupadas por CPF) · busca + filtro por culto/período
router.get('/pessoas', authorizeModule('wifi', 1), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const { data, error } = await supabase.rpc('fn_wifi_pessoas', {
      p_busca: req.query.busca || null,
      p_culto: req.query.culto_id || null,
      p_inicio: req.query.inicio || null,
      p_fim: req.query.fim || null,
      p_limit: limit,
      p_offset: (page - 1) * limit,
    });
    if (error) throw error;
    res.json({ total: data?.total || 0, page, limit, pessoas: data?.pessoas || [] });
  } catch (e) {
    console.error('[wifi/pessoas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Perfil 360º de uma pessoa (por CPF normalizado)
router.get('/pessoas/:cpf', authorizeModule('wifi', 1), async (req, res) => {
  try {
    const cpf = (req.params.cpf || '').replace(/\D/g, '');
    if (!cpf) return res.status(400).json({ error: 'CPF inválido' });
    const { data, error } = await supabase.rpc('fn_wifi_pessoa', { p_cpf: cpf });
    if (error) throw error;
    if (!data || !data.pessoa) return res.status(404).json({ error: 'Pessoa não encontrada' });
    res.json(data);
  } catch (e) {
    console.error('[wifi/pessoas/:cpf]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Conexões por faixa de culto (período)
router.get('/cultos', authorizeModule('wifi', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('fn_wifi_cultos', {
      p_inicio: req.query.inicio || null,
      p_fim: req.query.fim || null,
    });
    if (error) throw error;
    res.json({ cultos: data || [] });
  } catch (e) {
    console.error('[wifi/cultos]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
