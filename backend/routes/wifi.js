const router = require('express').Router();
const { authenticate, authorizeModule, requireSuperAdmin } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { runWifiSync } = require('../services/wifiSync');
const { AppError, ERROR_CODES } = require('../utils/appError');

// ── Cron · ANTES de authenticate ──
router.get('/cron/sync', async (req, res, next) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const r = await runWifiSync();
    res.json(r);
  } catch (e) {
    next(new AppError('Falha na sincronização automática do Wi-Fi', {
      code: ERROR_CODES.WIFI_SYNC_FAILED,
      cause: e,
    }));
  }
});

// Wi-Fi foi consolidado no command center Sistema. O cron mantém CRON_SECRET;
// toda operação humana abaixo exige superadmin estrito.
router.use(authenticate, requireSuperAdmin);

// Sincronizar agora (manual)
router.post('/sync', authorizeModule('wifi', 3), async (_req, res, next) => {
  try {
    const r = await runWifiSync();
    res.json(r);
  } catch (e) {
    next(new AppError('Falha na sincronização manual do Wi-Fi', {
      code: ERROR_CODES.WIFI_SYNC_FAILED,
      cause: e,
    }));
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
    const flag = (v) => v === '1' || v === 'true';
    const { data, error } = await supabase.rpc('fn_wifi_pessoas', {
      p_busca: req.query.busca || null,
      p_culto: req.query.culto_id || null,
      p_inicio: req.query.inicio || null,
      p_fim: req.query.fim || null,
      p_limit: limit,
      p_offset: (page - 1) * limit,
      p_membro: flag(req.query.membro),
      p_serve: flag(req.query.serve),
      p_grupo: flag(req.query.grupo),
      p_dizima: flag(req.query.dizima),
      p_batismo: flag(req.query.batismo),
      p_next: flag(req.query.next),
      p_decisao: flag(req.query.decisao),
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

// Tipos de culto (faixas de horário) para o dropdown de filtro
router.get('/servicos', authorizeModule('wifi', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_service_types')
      .select('id,name,recurrence_day,recurrence_time')
      .eq('is_active', true)
      .order('recurrence_day', { ascending: true })
      .order('recurrence_time', { ascending: true });
    if (error) throw error;
    res.json({ servicos: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Conexões por faixa de culto · filtros: período/data + serviço + dia da semana
router.get('/cultos', authorizeModule('wifi', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('fn_wifi_cultos', {
      p_inicio: req.query.inicio || null,
      p_fim: req.query.fim || null,
      p_service_type: req.query.service_type || null,
      p_dow: req.query.dow != null && req.query.dow !== '' ? parseInt(req.query.dow) : null,
    });
    if (error) throw error;
    res.json({ cultos: data || [] });
  } catch (e) {
    console.error('[wifi/cultos]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Comparação por semana (presença lançada × WiFi)
router.get('/semanas', authorizeModule('wifi', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('fn_wifi_semanas', {
      p_inicio: req.query.inicio || null,
      p_fim: req.query.fim || null,
      p_service_type: req.query.service_type || null,
      p_dow: req.query.dow != null && req.query.dow !== '' ? parseInt(req.query.dow) : null,
    });
    if (error) throw error;
    res.json({ semanas: data || [] });
  } catch (e) {
    console.error('[wifi/semanas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Alertas de frequência (regras): afastando / em risco / voltou / novo / fiel
router.get('/alertas', authorizeModule('wifi', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.rpc('fn_wifi_alertas');
    if (error) throw error;
    res.json({ alertas: data || [] });
  } catch (e) {
    console.error('[wifi/alertas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
