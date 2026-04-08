const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../utils/db');
const { sanitizeObj, isValidUUID } = require('../utils/sanitize');

router.use(authenticate, authorize('diretor'));

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT_MAX) || 10,
  message: { error: 'Limite de uso da IA atingido. Aguarde 15 minutos.' }
});

// POST /api/agents/generate — proxy para Anthropic API
router.post('/generate', aiLimiter, async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'API da Anthropic não configurada' });

    const { prompt, agent, context } = sanitizeObj(req.body);
    if (!prompt) return res.status(400).json({ error: 'Prompt obrigatório' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `Você é um assistente do PMO da CBRio (igreja). Responda em português. Contexto: ${context || 'gestão de projetos e eventos'}`,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || 'Sem resposta';

    // Log da ação
    await db.query(
      'INSERT INTO agent_log (agent, action, details) VALUES ($1,$2,$3)',
      [agent || 'general', `Gerou resposta: ${prompt.slice(0, 100)}`, JSON.stringify({ prompt_length: prompt.length })]
    );

    res.json({ text, usage: data.usage });
  } catch (e) {
    console.error('[AGENTS] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao chamar IA' });
  }
});

// GET /api/agents/queue
router.get('/queue', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM agent_queue WHERE status = $1 ORDER BY created_at DESC LIMIT 20', ['pending']);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// PATCH /api/agents/queue/:id/approve
router.patch('/queue/:id/approve', async (req, res) => {
  try {
    await db.query(
      'UPDATE agent_queue SET status=$1, reviewed_by=$2, reviewed_at=NOW() WHERE id=$3',
      ['approved', req.user.userId, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// PATCH /api/agents/queue/:id/reject
router.patch('/queue/:id/reject', async (req, res) => {
  try {
    await db.query(
      'UPDATE agent_queue SET status=$1, reviewed_by=$2, reviewed_at=NOW() WHERE id=$3',
      ['rejected', req.user.userId, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/agents/log
router.get('/log', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM agent_log ORDER BY created_at DESC LIMIT 50');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
