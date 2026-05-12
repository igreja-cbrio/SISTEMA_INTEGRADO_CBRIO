const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { gerarTodasNotificacoes } = require('../services/notificacaoGenerator');

// Endpoint de cron (sem auth, protegido por secret header)
router.get('/cron', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET não configurado' });
  }
  const provided = req.headers.authorization || '';
  const expected = `Bearer ${cronSecret}`;
  if (provided.length !== expected.length ||
      !require('crypto').timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const total = await gerarTodasNotificacoes();
    res.json({ success: true, geradas: total });
  } catch (e) {
    console.error('[Cron] Erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.use(authenticate);

// GET /api/notificacoes — listar notificações do usuário logado
router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('notificacoes')
      .select('*')
      .eq('usuario_id', req.user.userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (req.query.modulo) query = query.eq('modulo', req.query.modulo);
    if (req.query.severidade) query = query.eq('severidade', req.query.severidade);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
});

// GET /api/notificacoes/count — contar não lidas
router.get('/count', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('notificacoes')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', req.user.userId)
      .eq('lida', false);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ count: count || 0 });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao contar notificações' });
  }
});

// POST /api/notificacoes/_test — cria 1 notificação de teste para o usuário logado
// (admin/diretor apenas — usado para debugar entrega)
router.post('/_test', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error, data } = await supabase.from('notificacoes').insert({
      usuario_id: req.user.userId,
      titulo: 'Teste de notificação',
      mensagem: `Disparado em ${new Date().toLocaleString('pt-BR')} por ${req.user.email}. Se você está vendo isso, o sino funciona.`,
      tipo: 'teste',
      modulo: 'sistema',
      severidade: 'info',
      lida: false,
    }).select().single();
    if (error) {
      console.error('[notif _test] erro insert:', error.message);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true, notificacaoId: data.id, usuarioId: req.user.userId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/notificacoes/gerar — gerar notificações automáticas (admin/diretor)
router.post('/gerar', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const total = await gerarTodasNotificacoes();
    res.json({ success: true, geradas: total });
  } catch (e) {
    console.error('[Notificações] Erro ao gerar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/notificacoes/:id/ler — marcar como lida
router.patch('/:id/ler', async (req, res) => {
  try {
    const { error } = await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('id', req.params.id)
      .eq('usuario_id', req.user.userId);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao marcar notificação' });
  }
});

// PATCH /api/notificacoes/ler-todas
router.patch('/ler-todas', async (req, res) => {
  try {
    const { error } = await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('usuario_id', req.user.userId)
      .eq('lida', false);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao marcar notificações' });
  }
});

// ── Regras de notificação ────────────────────────────────

// GET /api/notificacoes/regras — listar regras
router.get('/regras', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notificacao_regras')
      .select('*, profiles(name, email)')
      .order('modulo');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar regras' });
  }
});

// POST /api/notificacoes/regras — criar regra
router.post('/regras', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { modulo, profile_id } = req.body;
    const { data, error } = await supabase
      .from('notificacao_regras')
      .upsert({ modulo, profile_id, ativo: true }, { onConflict: 'modulo,profile_id' })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar regra' });
  }
});

// DELETE /api/notificacoes/regras/:id
router.delete('/regras/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('notificacao_regras')
      .delete()
      .eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover regra' });
  }
});

// ── Web Push (PWA) ──────────────────────────────────────────────────
const webpushService = require('../services/webpush');

// GET /api/notificacoes/push/vapid-key — retorna a chave publica VAPID
// para o browser usar no PushManager.subscribe(). Retorna 204 se push
// nao estiver configurado (sem VAPID_PUBLIC_KEY).
router.get('/push/vapid-key', (req, res) => {
  const key = webpushService.getVapidPublicKey();
  if (!key) return res.status(204).end();
  res.json({ key });
});

// POST /api/notificacoes/push/subscribe — body: { endpoint, keys: { p256dh, auth } }
router.post('/push/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'subscription invalida' });
    }
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
    const { error } = await supabase.from('push_subscriptions').upsert({
      auth_user_id: req.user.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: userAgent,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[push subscribe]', e.message);
    res.status(500).json({ error: 'Erro ao registrar subscription' });
  }
});

// POST /api/notificacoes/push/unsubscribe — body: { endpoint }
router.post('/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint obrigatorio' });
    await supabase.from('push_subscriptions')
      .delete().eq('endpoint', endpoint).eq('auth_user_id', req.user.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover subscription' });
  }
});

module.exports = router;
