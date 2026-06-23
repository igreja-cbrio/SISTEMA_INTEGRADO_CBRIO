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

// GET /api/whatsapp-cron/batismos-lembrete — lembra quem se batiza AMANHÃ.
// {{1}} data · {{2}} hora (não há horário no banco → env WHATSAPP_BATISMO_HORA).
router.get('/batismos-lembrete', requireCron, async (_req, res) => {
  try {
    const base = new Date(Date.now() - 3 * 3600 * 1000); // BRT
    base.setDate(base.getDate() + 1);
    const amanhaISO = base.toISOString().slice(0, 10);
    const hora = process.env.WHATSAPP_BATISMO_HORA || '19h';
    const { data, error } = await supabase.from('batismo_inscricoes')
      .select('id, membro_id, data_batismo, status')
      .is('deleted_at', null).eq('data_batismo', amanhaISO)
      .not('membro_id', 'is', null)
      .neq('status', 'realizado').neq('status', 'cancelado');
    if (error) throw error;
    let enviados = 0;
    for (const b of data || []) {
      const dataFmt = new Date(b.data_batismo + 'T12:00:00').toLocaleDateString('pt-BR');
      const r = await wpp.notificarMembro(b.membro_id, 'batismo_lembrete', [dataFmt, hora]);
      if (r?.sent) enviados++;
    }
    res.json({ ok: true, alvo: (data || []).length, enviados });
  } catch (e) {
    console.error('[wpp-cron] batismos-lembrete:', e.message);
    res.status(500).json({ error: 'Erro no cron de batismos' });
  }
});

module.exports = router;
