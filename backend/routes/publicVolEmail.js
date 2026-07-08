// ============================================================================
// Pixel de rastreamento de ABERTURA dos e-mails do voluntariado.
// GET /api/public/vol-email/px/:id.gif — :id = vol_email_disparo_destinatarios.id
// Registra a abertura (1ª vez + contador) e devolve um GIF 1x1 transparente.
// Sem auth (o e-mail é aberto fora do sistema). Montado ANTES do publicLimiter
// pra não barrar proxies (Gmail carrega o pixel por um IP só).
// ============================================================================
const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');

// GIF 1x1 transparente
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

router.get('/px/:id.gif', (req, res) => {
  const id = req.params.id;
  // Responde o pixel imediatamente (não bloqueia no banco).
  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Length': PIXEL.length,
  });
  res.end(PIXEL);

  // Registra a abertura em background (best-effort).
  (async () => {
    try {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return;
      const { data: row } = await supabase
        .from('vol_email_disparo_destinatarios')
        .select('aberto_em, aberturas')
        .eq('id', id)
        .maybeSingle();
      if (!row) return;
      await supabase
        .from('vol_email_disparo_destinatarios')
        .update({
          aberto_em: row.aberto_em || new Date().toISOString(),
          aberturas: (row.aberturas || 0) + 1,
        })
        .eq('id', id);
    } catch (e) {
      console.error('[publicVolEmail/px]', e.message);
    }
  })();
});

module.exports = router;
