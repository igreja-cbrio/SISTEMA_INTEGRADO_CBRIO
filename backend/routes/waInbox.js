// Inbox de WhatsApp · módulo Conversas. Lista conversas (escopo por ÁREA:
// Entrada não-triada + a área do usuário + as suas), thread, responde (texto
// livre <24h · template fora), triagem por área, atribuição e nova conversa.
const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const wpp = require('../services/whatsappService');
const waInbox = require('../services/waInbox');

router.use(authenticate);

function uid(req) { return req.user?.userId || req.user?.id || null; }
function ehAdmin(req) { return ['admin', 'diretor'].includes(req.user?.role); }
function minhasAreas(req) { return (req.user?.granular?.areas || []).filter(Boolean); }
function comJanela(c) {
  return {
    ...c,
    dentro_janela: waInbox.dentroJanela24h(c.last_inbound_at),
    janela_expira_em: c.last_inbound_at
      ? new Date(new Date(c.last_inbound_at).getTime() + waInbox.JANELA_24H_MS).toISOString() : null,
  };
}
// lista de valores p/ filtro PostgREST `in.(...)` com aspas (áreas têm acento/barra/espaço)
function inList(vals) { return `(${vals.map(v => `"${String(v).replace(/"/g, '')}"`).join(',')})`; }

const SEL = 'id, telefone, nome, membro_id, area, nao_lidas, resolvida, atribuido_a, ultima_previa, last_message_at, last_inbound_at';

// Templates aprovados p/ INICIAR conversa (fora da janela de 24h). Só entram os
// que têm env configurado. Cadastrar novos = mais uma linha + env na Vercel.
const TEMPLATES_ABERTURA = [
  { key: 'next_convite', rotulo: 'Convite NEXT', nome: process.env.WHATSAPP_TEMPLATE_NEXT_CONVITE, params: [{ label: 'Primeiro nome' }] },
  { key: 'aniversario', rotulo: 'Aniversário', nome: process.env.WHATSAPP_TEMPLATE_ANIVERSARIO2 || process.env.WHATSAPP_TEMPLATE_ANIVERSARIO, params: [{ label: 'Nome' }] },
  { key: 'batismo_lembrete', rotulo: 'Lembrete de batismo', nome: process.env.WHATSAPP_TEMPLATE_BATISMO, params: [{ label: 'Data' }, { label: 'Hora' }] },
].filter(t => t.nome);

// GET /templates — templates de abertura disponíveis p/ nova conversa
router.get('/templates', authorizeModule('conversas', 1), (req, res) => {
  res.json({ templates: TEMPLATES_ABERTURA });
});

// GET /areas — áreas ativas p/ triagem (dropdown) e chips do admin
router.get('/areas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { data } = await supabase.from('areas')
      .select('nome, setores(nome)').neq('ativo', false).order('nome');
    const areas = (data || []).map(a => ({ nome: a.nome, setor: a.setores?.nome || null }));
    res.json({ areas });
  } catch (e) {
    console.error('[wa-inbox] areas:', e.message);
    res.status(500).json({ error: 'Erro ao listar áreas' });
  }
});

// GET /conversas?status=abertas|todas&q=&area=entrada|minhas|<nome>|todas
router.get('/conversas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const status = req.query.status || 'abertas';
    const q = (req.query.q || '').trim();
    const areaParam = (req.query.area || 'todas').trim();
    const userId = uid(req);

    let query = supabase.from('wa_conversas').select(SEL)
      .is('deleted_at', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (status === 'abertas') query = query.eq('resolvida', false);
    if (q) query = query.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%`);

    // Visibilidade (não-admin): Entrada (área nula) OU área do usuário OU atribuída a ele.
    if (!ehAdmin(req)) {
      const vis = ['area.is.null', `atribuido_a.eq.${userId}`];
      const areas = minhasAreas(req);
      if (areas.length) vis.push(`area.in.${inList(areas)}`);
      query = query.or(vis.join(','));
    }

    // Chip selecionado (afunila dentro do que é visível).
    if (areaParam === 'entrada') query = query.is('area', null);
    else if (areaParam === 'minhas') query = query.eq('atribuido_a', userId);
    else if (areaParam && areaParam !== 'todas') query = query.eq('area', areaParam);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []).map(comJanela);
    res.json({ conversas: rows, nao_lidas_total: rows.reduce((a, c) => a + (c.nao_lidas || 0), 0) });
  } catch (e) {
    console.error('[wa-inbox] conversas:', e.message);
    res.status(500).json({ error: 'Erro ao listar conversas' });
  }
});

// GET /conversas/:id/mensagens — thread + marca lida
router.get('/conversas/:id/mensagens', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { data: conv } = await supabase.from('wa_conversas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    const { data: msgs } = await supabase.from('wa_mensagens')
      .select('id, direcao, tipo, texto, autor_id, criado_em')
      .eq('conversa_id', conv.id).order('criado_em', { ascending: true }).limit(500);
    if (conv.nao_lidas > 0) await supabase.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', conv.id);
    res.json({ conversa: comJanela({ ...conv, nao_lidas: 0 }), mensagens: msgs || [] });
  } catch (e) {
    console.error('[wa-inbox] mensagens:', e.message);
    res.status(500).json({ error: 'Erro ao carregar conversa' });
  }
});

// POST /conversas/nova { telefone, area?, texto? , template_name?, template_params? }
router.post('/conversas/nova', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const { telefone, area, texto, template_name, template_params } = req.body || {};
    if (!telefone || !String(telefone).replace(/\D+/g, '')) {
      return res.status(400).json({ error: 'Informe o telefone.' });
    }
    const conv = await waInbox.acharOuCriarConversa(telefone);
    if (!conv) return res.status(400).json({ error: 'Telefone inválido.' });

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
        error: 'Este número não tem conversa aberta nas últimas 24h — escolha um template aprovado para iniciar.',
        code: 'precisa_template',
      });
    }
    if (!r?.sent) return res.status(502).json({ error: 'O WhatsApp não aceitou o envio.', detail: r?.reason || r?.detail || null });

    await waInbox.registrarOutbound({ telefone: conv.telefone, texto: textoLog, tipo, autorId: uid(req) });
    if (area && String(area).trim()) await supabase.from('wa_conversas').update({ area: String(area).trim() }).eq('id', conv.id);

    const { data: fresh } = await supabase.from('wa_conversas').select('*').eq('id', conv.id).maybeSingle();
    res.json({ ok: true, conversa: comJanela(fresh || conv), messageId: r.messageId || null });
  } catch (e) {
    console.error('[wa-inbox] nova:', e.message);
    res.status(500).json({ error: 'Erro ao iniciar conversa' });
  }
});

// POST /conversas/:id/responder { texto } (dentro de 24h) OU { template_name, template_params }
router.post('/conversas/:id/responder', authorizeModule('conversas', 2), async (req, res) => {
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
    if (!r?.sent) return res.status(502).json({ error: 'O WhatsApp não aceitou o envio.', detail: r?.reason || r?.detail || null });
    await waInbox.registrarOutbound({ telefone: conv.telefone, texto: textoLog, tipo, autorId: uid(req) });
    res.json({ ok: true, messageId: r.messageId || null });
  } catch (e) {
    console.error('[wa-inbox] responder:', e.message);
    res.status(500).json({ error: 'Erro ao enviar resposta' });
  }
});

// POST /conversas/:id/ler — zera não-lidas
router.post('/conversas/:id/ler', authorizeModule('conversas', 1), async (req, res) => {
  try {
    await supabase.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao marcar lida' });
  }
});

// PATCH /conversas/:id — resolver/reabrir, atribuir, triar (área)
router.patch('/conversas/:id', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const patch = {};
    if (typeof req.body?.resolvida === 'boolean') patch.resolvida = req.body.resolvida;
    if ('atribuido_a' in (req.body || {})) patch.atribuido_a = req.body.atribuido_a || null;
    if ('area' in (req.body || {})) patch.area = req.body.area ? String(req.body.area).trim() : null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    const { data, error } = await supabase.from('wa_conversas').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(comJanela(data));
  } catch (e) {
    console.error('[wa-inbox] patch:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar conversa' });
  }
});

module.exports = router;
