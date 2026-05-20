const router = require('express').Router();
const multer = require('multer');
const { supabase } = require('../utils/supabase');
const { authenticate, getMyPermissions } = require('../middleware/auth');

const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// GET /api/auth/me — retorna perfil do usuário autenticado
router.get('/me', authenticate, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, area, kpi_areas, kpi_valores, avatar_url, ministerio_id, ministerio_papel, is_diretoria_geral, funcao_diretoria')
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

// POST /api/auth/profile/foto — upload foto de perfil do proprio usuario (multipart 'foto')
router.post('/profile/foto', authenticate, uploadMw.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo "foto" obrigatorio' });
    if (!req.file.mimetype?.startsWith('image/')) {
      return res.status(400).json({ error: 'Arquivo precisa ser uma imagem' });
    }

    const ext = (req.file.originalname?.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
    const path = `${req.user.userId}/avatar-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) return res.status(500).json({ error: 'Falha ao salvar imagem: ' + upErr.message });

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatar_url = urlData.publicUrl;

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url, updated_at: new Date().toISOString() })
      .eq('id', req.user.userId);
    if (updErr) return res.status(400).json({ error: updErr.message });

    res.json({ avatar_url });
  } catch (e) {
    console.error('[AUTH] Upload foto:', e.message);
    res.status(500).json({ error: 'Erro ao enviar foto' });
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
