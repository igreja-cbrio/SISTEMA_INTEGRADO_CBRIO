// Inbox de WhatsApp · Cuidados → Conversas. Lista conversas, thread, responde
// (texto livre dentro da janela de 24h · template fora dela) e marca lida.
const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const wpp = require('../services/whatsappService');
const waInbox = require('../services/waInbox');

router.use(authenticate);

function uid(req) { return req.user?.userId || req.user?.id || null; }

// GET /conversas?status=abertas|todas&q= — lista (mais recente primeiro)
router.get('/conversas', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const status = req.query.status || 'abertas';
    const q = (req.query.q || '').trim();
    let query = supabase.from('wa_conversas')
      .select('id, telefone, nome, membro_id, nao_lidas, resolvida, atribuido_a, ultima_previa, last_message_at, last_inbound_at')
      .is('deleted_at', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (status === 'abertas') query = query.eq('resolvida', false);
    if (q) query = query.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []).map(c => ({
      ...c,
      dentro_janela: waInbox.dentroJanela24h(c.last_inbound_at),
      janela_expira_em: c.last_inbound_at ? new Date(new Date(c.last_inbound_at).getTime() + waInbox.JANELA_24H_MS).toISOString() : null,
    }));
    res.json({ conversas: rows, nao_lidas_total: rows.reduce((a, c) => a + (c.nao_lidas || 0), 0) });
  } catch (e) {
    console.error('[wa-inbox] conversas:', e.message);
    res.status(500).json({ error: 'Erro ao listar conversas' });
  }
});

// GET /conversas/:id/mensagens — thread + marca lida
router.get('/conversas/:id/mensagens', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const { data: conv } = await supabase.from('wa_conversas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    const { data: msgs } = await supabase.from('wa_mensagens')
      .select('id, direcao, tipo, texto, autor_id, criado_em')
      .eq('conversa_id', conv.id).order('criado_em', { ascending: true }).limit(500);
    // marca lida
    if (conv.nao_lidas > 0) await supabase.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', conv.id);
    res.json({
      conversa: {
        ...conv, nao_lidas: 0,
        dentro_janela: waInbox.dentroJanela24h(conv.last_inbound_at),
        janela_expira_em: conv.last_inbound_at ? new Date(new Date(conv.last_inbound_at).getTime() + waInbox.JANELA_24H_MS).toISOString() : null,
      },
      mensagens: msgs || [],
    });
  } catch (e) {
    console.error('[wa-inbox] mensagens:', e.message);
    res.status(500).json({ error: 'Erro ao carregar conversa' });
  }
});

// POST /conversas/:id/responder { texto } (dentro de 24h) OU { template_name, template_params }
router.post('/conversas/:id/responder', authorizeModule('cuidados', 2), async (req, res) => {
  try {
    const { texto, template_name, template_params } = req.body || {};
    const { data: conv } = await supabase.from('wa_conversas')
      .select('id, telefone, last_inbound_at').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    const dentro = waInbox.dentroJanela24h(conv.last_inbound_at);
    let r, tipo, textoLog;

    if (dentro && texto && String(texto).trim()) {
      r = await wpp.sendText(conv.telefone, String(texto).trim());
      tipo = 'text'; textoLog = String(texto).trim();
    } else if (template_name) {
      r = await wpp.sendTemplate(conv.telefone, template_name, 'pt_BR', Array.isArray(template_params) ? template_params : []);
      tipo = 'template'; textoLog = `[template: ${template_name}]`;
    } else {
      return res.status(400).json({
        error: dentro ? 'Escreva uma mensagem.' : 'Fora da janela de 24h — só é possível enviar um template aprovado.',
        code: dentro ? 'texto_vazio' : 'fora_janela',
      });
    }

    if (!r?.sent) {
      return res.status(502).json({ error: 'O WhatsApp não aceitou o envio.', detail: r?.reason || r?.detail || null });
    }
    await waInbox.registrarOutbound({ telefone: conv.telefone, texto: textoLog, tipo, autorId: uid(req) });
    res.json({ ok: true, messageId: r.messageId || null });
  } catch (e) {
    console.error('[wa-inbox] responder:', e.message);
    res.status(500).json({ error: 'Erro ao enviar resposta' });
  }
});

// POST /conversas/:id/ler — zera não-lidas
router.post('/conversas/:id/ler', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    await supabase.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao marcar lida' });
  }
});

// PATCH /conversas/:id — resolver/reabrir, atribuir
router.patch('/conversas/:id', authorizeModule('cuidados', 2), async (req, res) => {
  try {
    const patch = {};
    if (typeof req.body?.resolvida === 'boolean') patch.resolvida = req.body.resolvida;
    if ('atribuido_a' in (req.body || {})) patch.atribuido_a = req.body.atribuido_a || null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    const { data, error } = await supabase.from('wa_conversas').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[wa-inbox] patch:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar conversa' });
  }
});

module.exports = router;
