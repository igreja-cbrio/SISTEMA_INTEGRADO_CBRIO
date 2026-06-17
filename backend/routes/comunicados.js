// ============================================================
// Comunicados (Mural) · criados no Marketing → app + push segmentado
// ============================================================
const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const SEGMENTOS = ['todos', 'ami', 'bridge', 'online', 'sede', 'kids'];

// GET / — lista (equipe marketing)
router.get('/', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('comunicados')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[comunicados] list:', e.message);
    res.status(500).json({ error: 'Erro ao listar' });
  }
});

// POST /upload-foto — banner do comunicado (bucket público)
router.post('/upload-foto', authorizeModule('marketing', 3), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('comunicados').upload(path, req.file.buffer, {
      contentType: req.file.mimetype || 'image/jpeg',
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('comunicados').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[comunicados] upload:', e.message);
    res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});

// POST / — cria
router.post('/', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const { titulo, corpo, foto_url, segmento } = req.body || {};
    if (!titulo?.trim() || !corpo?.trim()) return res.status(400).json({ error: 'Título e corpo são obrigatórios' });
    const { data, error } = await supabase
      .from('comunicados')
      .insert({
        titulo: titulo.trim(),
        corpo: corpo.trim(),
        foto_url: foto_url || null,
        segmento: SEGMENTOS.includes(segmento) ? segmento : 'todos',
        criado_por: req.user?.id || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[comunicados] create:', e.message);
    res.status(500).json({ error: 'Erro ao criar' });
  }
});

// PUT /:id — edita (só rascunho/arquivado; publicado edita texto também)
router.put('/:id', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const { titulo, corpo, foto_url, segmento } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (titulo !== undefined) patch.titulo = String(titulo).trim();
    if (corpo !== undefined) patch.corpo = String(corpo).trim();
    if (foto_url !== undefined) patch.foto_url = foto_url || null;
    if (segmento !== undefined && SEGMENTOS.includes(segmento)) patch.segmento = segmento;
    const { data, error } = await supabase.from('comunicados').update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[comunicados] update:', e.message);
    res.status(500).json({ error: 'Erro ao editar' });
  }
});

// POST /:id/publicar — publica + dispara push segmentado (fan-out na Edge Function)
router.post('/:id/publicar', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('comunicados')
      .update({ status: 'publicado', publicado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Push segmentado · fan-out na Edge Function do app (não bloqueia a resposta).
    fetch('https://hhntwfawfnxvuobhdfkb.supabase.co/functions/v1/notify-comunicado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comunicado_id: data.id }),
    }).catch((e) => console.warn('[comunicados] push:', e.message));

    res.json(data);
  } catch (e) {
    console.error('[comunicados] publicar:', e.message);
    res.status(500).json({ error: 'Erro ao publicar' });
  }
});

// POST /:id/arquivar — tira do ar
router.post('/:id/arquivar', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('comunicados').update({ status: 'arquivado', updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[comunicados] arquivar:', e.message);
    res.status(500).json({ error: 'Erro ao arquivar' });
  }
});

// DELETE /:id — soft delete
router.delete('/:id', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('comunicados').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[comunicados] delete:', e.message);
    res.status(500).json({ error: 'Erro ao excluir' });
  }
});

module.exports = router;
