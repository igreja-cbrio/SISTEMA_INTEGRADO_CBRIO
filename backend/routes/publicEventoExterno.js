// ============================================================================
// Rotas públicas · Eventos Externos (confirmação de presença + número da sorte)
// GET  /api/public/evento/:slug        - dados do evento (se form ativo)
// POST /api/public/evento/:slug/inscrever - confirma presença → número da sorte
// ============================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');

const limiter = rateLimit({ windowMs: 60 * 1000, max: 15, message: { error: 'Muitas requisições. Aguarde um minuto.' } });
router.use(limiter);

function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
function ehEmailValido(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }

async function eventoPorSlug(slug) {
  const { data } = await supabase.from('ext_eventos')
    .select('id, nome, slug, data, hora, local, descricao, form_ativo')
    .eq('slug', slug).is('deleted_at', null).maybeSingle();
  return data || null;
}

// GET /:slug — dados públicos do evento
router.get('/:slug', async (req, res) => {
  const ev = await eventoPorSlug(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
  res.json({
    nome: ev.nome, slug: ev.slug, data: ev.data, hora: ev.hora, local: ev.local,
    descricao: ev.descricao, form_ativo: ev.form_ativo,
  });
});

// POST /:slug/inscrever — confirma presença e devolve o número da sorte (aleatório e único)
router.post('/:slug/inscrever', async (req, res) => {
  try {
    const { nome, telefone, email, website } = req.body || {};
    if (website) return res.status(200).json({ ok: true }); // honeypot

    const ev = await eventoPorSlug(req.params.slug);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!ev.form_ativo) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });

    if (!nome || nome.trim().length < 2) return res.status(400).json({ error: 'Informe seu nome.' });
    if (!telefone || soDigitos(telefone).length < 10) return res.status(400).json({ error: 'Telefone inválido.' });
    if (email && !ehEmailValido(email)) return res.status(400).json({ error: 'E-mail inválido.' });

    const tel = soDigitos(telefone);
    const cleanEmail = email ? String(email).toLowerCase().trim() : null;

    // Dedup: mesmo telefone já confirmado nesse evento → devolve o número existente.
    const { data: ja } = await supabase.from('ext_inscricoes')
      .select('numero_sorte').eq('evento_id', ev.id).eq('telefone', tel).is('deleted_at', null).maybeSingle();
    if (ja) return res.json({ ok: true, ja_inscrito: true, numero_sorte: ja.numero_sorte });

    // Número da sorte aleatório e único por evento (retenta em colisão).
    let numero = null;
    for (let tentativa = 0; tentativa < 25; tentativa++) {
      const cand = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
      const { data: existe } = await supabase.from('ext_inscricoes')
        .select('id').eq('evento_id', ev.id).eq('numero_sorte', cand).maybeSingle();
      if (!existe) { numero = cand; break; }
    }
    if (numero == null) return res.status(503).json({ error: 'Não foi possível gerar o número agora. Tente de novo.' });

    const { data: ins, error } = await supabase.from('ext_inscricoes').insert({
      evento_id: ev.id, nome: nome.trim(), telefone: tel, email: cleanEmail, numero_sorte: numero,
    }).select('numero_sorte').single();
    if (error) {
      if (error.code === '23505') { // colisão de corrida no número → 1 retry simples
        return res.status(409).json({ error: 'Tente enviar de novo.' });
      }
      throw error;
    }
    res.status(201).json({ ok: true, numero_sorte: ins.numero_sorte });
  } catch (e) {
    console.error('[publicEventoExterno] inscrever:', e.message);
    res.status(500).json({ error: 'Erro ao confirmar presença.' });
  }
});

module.exports = router;
