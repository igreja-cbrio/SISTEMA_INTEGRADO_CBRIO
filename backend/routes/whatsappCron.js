// Crons de disparo WhatsApp pra membros (eventos por tempo · CRON_SECRET).
// Plug-and-play: só envia quando o env do template está setado (no-op gracioso).
const router = require('express').Router();
const { supabase } = require('../utils/supabase');
const { requireCron } = require('../utils/cronAuth');
const wpp = require('../services/whatsappService');

// GET /api/whatsapp-cron/aniversarios — parabeniza quem faz aniversário hoje.
// Marketing → respeita opt-in (notificarMembro já exige). Roda 1x/dia.
router.get('/aniversarios', requireCron, async (_req, res) => {
  try {
    const hoje = new Date(Date.now() - 3 * 3600 * 1000); // BRT
    const mmdd = `${String(hoje.getUTCMonth() + 1).padStart(2, '0')}-${String(hoje.getUTCDate()).padStart(2, '0')}`;
    let alvo = 0, enviados = 0, offset = 0;
    while (true) {
      const { data, error } = await supabase.from('mem_membros')
        .select('id, nome, data_nascimento, telefone, whatsapp_optin')
        .is('deleted_at', null).eq('whatsapp_optin', true)
        .not('data_nascimento', 'is', null).not('telefone', 'is', null)
        .range(offset, offset + 999);
      if (error) throw error;
      if (!data || !data.length) break;
      for (const m of data) {
        if (String(m.data_nascimento).slice(5, 10) !== mmdd) continue;
        alvo++;
        const primeiroNome = (m.nome || '').trim().split(/\s+/)[0] || m.nome;
        const r = await wpp.notificarMembro(m.id, 'aniversario', [primeiroNome]);
        if (r?.sent) enviados++;
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
    res.json({ ok: true, aniversariantes: alvo, enviados });
  } catch (e) {
    console.error('[wpp-cron] aniversarios:', e.message);
    res.status(500).json({ error: 'Erro no cron de aniversários' });
  }
});

module.exports = router;
