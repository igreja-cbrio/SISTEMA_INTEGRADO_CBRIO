const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');

// Rate limit para link público: 20 acessos / 15 min por IP.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 32);
}

// GET /api/public/nps/:token  → dados da pesquisa pelo token
router.get('/:token', publicLimiter, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('nps_pesquisas')
      .select('id, titulo, valor, objetivo, perguntas, status, permite_publico, data_fim')
      .eq('link_publico_token', req.params.token)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (!data.permite_publico) return res.status(403).json({ error: 'Link público desativado' });
    if (data.status !== 'ativa') return res.status(400).json({ error: 'Pesquisa não está ativa' });
    if (data.data_fim && new Date(data.data_fim) < new Date()) {
      return res.status(400).json({ error: 'Pesquisa encerrada' });
    }
    res.json(data);
  } catch (e) {
    console.error('[publicNps] get:', e.message);
    res.status(500).json({ error: 'Erro ao buscar pesquisa' });
  }
});

// POST /api/public/nps/:token/responder
router.post('/:token/responder', publicLimiter, async (req, res) => {
  try {
    const { nome, email, score, respostas, comentario } = req.body || {};
    if (!nome || !email) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (score === undefined || score < 0 || score > 10) {
      return res.status(400).json({ error: 'score deve estar entre 0 e 10' });
    }

    const { data: pesquisa, error: pErr } = await supabase
      .from('nps_pesquisas')
      .select('id, status, permite_publico, data_fim')
      .eq('link_publico_token', req.params.token)
      .single();
    if (pErr || !pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (!pesquisa.permite_publico) return res.status(403).json({ error: 'Link público desativado' });
    if (pesquisa.status !== 'ativa') return res.status(400).json({ error: 'Pesquisa não está ativa' });
    if (pesquisa.data_fim && new Date(pesquisa.data_fim) < new Date()) {
      return res.status(400).json({ error: 'Pesquisa encerrada' });
    }

    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || '').trim();

    const { error } = await supabase
      .from('nps_respostas')
      .insert({
        pesquisa_id: pesquisa.id,
        profile_id: null,
        nome_publico: String(nome).slice(0, 120),
        email_publico: String(email).toLowerCase().slice(0, 200),
        score: Math.round(score),
        respostas: respostas || {},
        comentario: comentario || null,
        origem: 'publico',
        ip_hash: hashIp(ip),
        user_agent: (req.headers['user-agent'] || '').slice(0, 200),
      });
    if (error) throw error;

    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('[publicNps] responder:', e.message);
    res.status(500).json({ error: 'Erro ao registrar resposta' });
  }
});

module.exports = router;
