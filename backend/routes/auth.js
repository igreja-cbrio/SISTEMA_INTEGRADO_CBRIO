const router = require('express').Router();
const { supabase } = require('../utils/supabase');
const { authenticate, getMyPermissions } = require('../middleware/auth');

// GET /api/auth/me — retorna perfil do usuário autenticado
router.get('/me', authenticate, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, area, kpi_areas, avatar_url')
      .eq('id', req.user.userId)
      .single();

    if (error || !profile) return res.status(404).json({ error: 'Perfil não encontrado' });
    res.json(profile);
  } catch (err) {
    console.error('[AUTH] Erro em /me:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /api/auth/profile — atualiza perfil (apenas o proprio, sem mexer em kpi_areas)
router.patch('/profile', authenticate, async (req, res) => {
  try {
    const { name, area, avatar_url } = req.body;
    const { data, error } = await supabase
      .from('profiles')
      .update({ name, area, avatar_url, updated_at: new Date().toISOString() })
      .eq('id', req.user.userId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/auth/profiles/:id/kpi-areas — admin/diretor gerencia areas de KPI do usuario
router.put('/profiles/:id/kpi-areas', authenticate, async (req, res) => {
  try {
    if (!['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Apenas admin/diretor podem alterar kpi_areas' });
    }
    const { kpi_areas } = req.body;
    if (!Array.isArray(kpi_areas)) {
      return res.status(400).json({ error: 'kpi_areas deve ser array de strings' });
    }
    const normalized = kpi_areas
      .map(a => String(a || '').trim().toLowerCase())
      .filter(Boolean);

    const { data, error } = await supabase
      .from('profiles')
      .update({ kpi_areas: normalized, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, name, email, role, kpi_areas')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('[AUTH] Erro em PUT kpi-areas:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/auth/users — lista todos os usuários ativos (para selects de responsável)
router.get('/users', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('active', true)
      .order('name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/auth/my-permissions — retorna permissões granulares do usuário
router.get('/my-permissions', authenticate, getMyPermissions);

// Nota: login, registro, OAuth (Google/Microsoft) são tratados
// diretamente pelo Supabase Auth no frontend — sem passar pelo backend.

module.exports = router;
