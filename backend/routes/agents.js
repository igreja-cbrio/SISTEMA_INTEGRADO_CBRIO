const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../utils/db');
const { sanitizeObj, isValidUUID } = require('../utils/sanitize');
const { ENVIRONMENT_ID, getAgentId, listModules } = require('../config/managedAgents');
const { buildContext, serializeContext } = require('../services/agentContext');

router.use(authenticate, authorize('diretor'));

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT_MAX) || 10,
  message: { error: 'Limite de uso da IA atingido. Aguarde 15 minutos.' }
});

const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: 'Muitas mensagens. Aguarde um momento.' }
});

// ─── MANAGED AGENTS: Chat via Sessions API ─────────────────────────────

// GET /api/agents/modules — lista módulos disponíveis
router.get('/modules', (req, res) => {
  res.json(listModules());
});

// POST /api/agents/chat — SSE streaming via Anthropic Sessions API
router.post('/chat', chatLimiter, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'API da Anthropic não configurada' });

  const { message, module, sessionId } = sanitizeObj(req.body);
  if (!message) return res.status(400).json({ error: 'Mensagem obrigatória' });

  const agentModule = module || 'supervisor';
  const agentId = getAgentId(agentModule);

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    let activeSessionId = sessionId;

    // 1. Create session if needed
    if (!activeSessionId) {
      const createRes = await fetch('https://api.anthropic.com/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'managed-agents-2026-04-01',
        },
        body: JSON.stringify({
          agent: agentId,          // short form (not agent_id)
          environment_id: ENVIRONMENT_ID, // API requires environment_id (not environment)
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        console.error('[AGENTS] Session create error:', err);
        sendEvent('error', { text: err.error?.message || 'Erro ao criar sessão' });
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      const session = await createRes.json();
      activeSessionId = session.id;

      // Persist in DB
      try {
        await db.query(
          `INSERT INTO agent_sessions (user_id, anthropic_session_id, agent_module, title)
           VALUES ($1, $2, $3, $4)`,
          [req.user.userId, activeSessionId, agentModule, message.slice(0, 80)]
        );
      } catch (dbErr) {
        console.warn('[AGENTS] Failed to persist session:', dbErr.message);
      }

      sendEvent('session', { sessionId: activeSessionId, module: agentModule });
    } else {
      // Update last_message_at
      try {
        await db.query(
          `UPDATE agent_sessions SET last_message_at = NOW(), title = COALESCE(title, $1) WHERE anthropic_session_id = $2`,
          [message.slice(0, 80), activeSessionId]
        );
      } catch (e) { /* ignore */ }
    }

    // 2. Build context from DB
    let contextStr = '';
    try {
      const ctx = await buildContext([agentModule === 'supervisor' ? 'all' : agentModule]);
      contextStr = serializeContext(ctx, 4000);
    } catch (e) {
      console.warn('[AGENTS] Context build failed:', e.message);
    }

    const userContent = contextStr
      ? `[CONTEXTO DO SISTEMA]\n${contextStr}\n\n[PERGUNTA DO USUÁRIO]\n${message}`
      : message;

    // 3. Send event to session and stream response
    const streamRes = await fetch(`https://api.anthropic.com/v1/sessions/${activeSessionId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'managed-agents-2026-04-01',
      },
      body: JSON.stringify({
        events: [{
          type: 'user.message',
          content: [{ type: 'text', text: userContent }],
        }],
        stream: true,
      }),
    });

    if (!streamRes.ok) {
      const err = await streamRes.json().catch(() => ({}));
      console.error('[AGENTS] Stream error:', err);
      sendEvent('error', { text: err.error?.message || 'Erro ao enviar mensagem' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // 4. Parse SSE stream from Anthropic
    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);

          // Extract text deltas from content_block_delta
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const text = event.delta.text;
            fullText += text;
            sendEvent('delta', { text });
          }
          // Also handle assistant message complete
          else if (event.type === 'message_stop') {
            // done
          }
        } catch (e) {
          // Skip unparseable lines
        }
      }
    }

    // 5. Log usage
    try {
      await db.query(
        'INSERT INTO agent_log (agent, action, details) VALUES ($1,$2,$3)',
        [agentModule, `Chat: ${message.slice(0, 80)}`, JSON.stringify({ session: activeSessionId, response_length: fullText.length })]
      );
    } catch (e) { /* ignore */ }

    sendEvent('done', { sessionId: activeSessionId });
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (e) {
    console.error('[AGENTS] Chat error:', e.message);
    sendEvent('error', { text: 'Erro interno ao processar chat' });
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// GET /api/agents/sessions — lista sessões do usuário
router.get('/sessions', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, anthropic_session_id, agent_module, title, created_at, last_message_at
       FROM agent_sessions WHERE user_id = $1 ORDER BY last_message_at DESC LIMIT 30`,
      [req.user.userId]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[AGENTS] Sessions list error:', e.message);
    res.status(500).json({ error: 'Erro ao listar sessões' });
  }
});

// DELETE /api/agents/sessions/:id — remove sessão
router.delete('/sessions/:id', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM agent_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover sessão' });
  }
});

// ─── LEGACY: Anthropic Messages API (auditorias) ──────────────────────

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
