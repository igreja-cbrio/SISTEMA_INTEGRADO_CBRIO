// Progresso de tutoriais (onboarding tours) por usuário.
//
// Antes o frontend lia/gravava direto no Supabase com a anon key + RLS, o que
// abria brechas: leitura podia voltar vazia (sessão não pronta no load) e o
// upsert dependia de uma policy de UPDATE que não existe — fazendo o tour
// reaparecer a cada entrada. Aqui o backend resolve com service role + o
// user_id vindo do JWT validado (req.user.userId), garantindo "1x por usuário
// e por tour" de forma confiável e cross-device.
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// Tours já vistos/pulados pelo usuário logado.
router.get('/progress', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_tutorial_progress')
      .select('tour_id, status')
      .eq('user_id', req.user.userId);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[tutorial] progress:', e.message);
    res.status(500).json({ error: 'Erro ao carregar progresso de tutoriais' });
  }
});

// Marca um tour como concluído/pulado · idempotente (1 linha por usuário+tour).
router.post('/complete', async (req, res) => {
  try {
    const { tour_id, status } = req.body || {};
    if (!tour_id) return res.status(400).json({ error: 'tour_id obrigatório' });
    const st = status === 'skipped' ? 'skipped' : 'completed';
    const { error } = await supabase
      .from('app_tutorial_progress')
      .upsert(
        { user_id: req.user.userId, tour_id, status: st, completed_at: new Date().toISOString() },
        { onConflict: 'user_id,tour_id' },
      );
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[tutorial] complete:', e.message);
    res.status(500).json({ error: 'Erro ao salvar progresso do tutorial' });
  }
});

// Refazer: apaga 1 tour (?tour_id=) ou todos os do usuário.
router.delete('/progress', async (req, res) => {
  try {
    const { tour_id } = req.query;
    let q = supabase.from('app_tutorial_progress').delete().eq('user_id', req.user.userId);
    if (tour_id) q = q.eq('tour_id', tour_id);
    const { error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[tutorial] reset:', e.message);
    res.status(500).json({ error: 'Erro ao resetar tutorial' });
  }
});

module.exports = router;
