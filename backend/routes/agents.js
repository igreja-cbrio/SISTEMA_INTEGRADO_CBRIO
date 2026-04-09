const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../utils/db');
const { supabase } = require('../utils/supabase');
const { sanitizeObj, isValidUUID } = require('../utils/sanitize');
const { ENVIRONMENT_ID, getAgentId, listModules } = require('../config/managedAgents');
const { buildContext, serializeContext } = require('../services/agentContext');

// Helper: persist to DB with supabase fallback
async function dbInsert(table, data) {
  try {
    const cols = Object.keys(data);
    const vals = Object.values(data);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const result = await db.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    return result.rows[0];
  } catch (pgErr) {
    console.warn(`[AGENTS] pg INSERT into ${table} failed:`, pgErr.message);
    // Fallback to supabase client
    if (supabase) {
      const { data: row, error } = await supabase.from(table).insert(data).select().single();
      if (error) throw new Error(`Supabase fallback failed: ${error.message}`);
      return row;
    }
    throw pgErr;
  }
}

async function dbQuery(text, params) {
  try {
    return await db.query(text, params);
  } catch (pgErr) {
    console.warn('[AGENTS] pg query failed:', pgErr.message);
    throw pgErr;
  }
}

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

      // Persist in DB — must complete before sending session event
      let dbSessionId = null;
      try {
        const insertResult = await db.query(
          `INSERT INTO agent_sessions (user_id, anthropic_session_id, agent_module, title)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [req.user.userId, activeSessionId, agentModule, message.slice(0, 80)]
        );
        dbSessionId = insertResult.rows[0]?.id;
      } catch (dbErr) {
        console.error('[AGENTS] Failed to persist session:', dbErr.message);
      }

      sendEvent('session', { sessionId: activeSessionId, dbSessionId, module: agentModule });
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
        'Accept': 'text/event-stream',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'managed-agents-2026-04-01',
      },
      body: JSON.stringify({
        events: [{
          type: 'user.message',
          content: [{ type: 'text', text: userContent }],
        }],
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

    const emitText = (value) => {
      if (typeof value !== 'string') return;
      const candidate = value.replace(/\r/g, '');
      if (!candidate.trim()) return;

      let delta = candidate;
      if (fullText && candidate === fullText) return;
      if (fullText && candidate.startsWith(fullText)) {
        delta = candidate.slice(fullText.length);
      }
      if (!delta) return;

      fullText += delta;
      sendEvent('delta', { text: delta });
    };

    const extractTextCandidates = (payload) => {
      const candidates = [];
      const push = (value) => {
        if (typeof value === 'string' && value.trim()) {
          candidates.push(value);
        }
      };
      const pushContent = (content) => {
        const blocks = Array.isArray(content) ? content : [content];
        for (const block of blocks) {
          if (!block || typeof block !== 'object') continue;
          push(block.text);
          push(block?.delta?.text);
          if (block.content) pushContent(block.content);
        }
      };

      push(payload?.delta?.text);
      push(payload?.text);
      push(payload?.message?.text);
      push(payload?.message_delta?.text);
      push(payload?.agent_response_event?.agent_response);
      push(payload?.agent_response_correction_event?.corrected_agent_response);
      push(payload?.output_text);
      push(payload?.result?.text);
      pushContent(payload?.content);
      pushContent(payload?.delta?.content);
      pushContent(payload?.message?.content);
      pushContent(payload?.message_delta?.content);
      pushContent(payload?.result?.content);

      return [...new Set(candidates)];
    };

    const handleSsePayload = (jsonStr) => {
      if (!jsonStr || jsonStr === '[DONE]') return;

      // Send raw payload to frontend for debugging
      sendEvent('raw', { payload: jsonStr.slice(0, 500) });

      try {
        const event = JSON.parse(jsonStr);
        console.log('[AGENTS] SSE event:', JSON.stringify(event).slice(0, 300));

        const payloads = [event];
        if (event.event && typeof event.event === 'object') payloads.push(event.event);
        if (event.data && typeof event.data === 'object') payloads.push(event.data);

        for (const payload of payloads) {
          for (const text of extractTextCandidates(payload)) {
            emitText(text);
          }
        }
      } catch (e) {
        // Skip unparseable payloads
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const dataLines = chunk
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('data: '))
          .map(line => line.slice(6).trim());

        for (const dl of dataLines) {
          handleSsePayload(dl);
        }
      }
    }

    const tailChunk = buffer.trim();
    if (tailChunk) {
      const dataLines = tailChunk
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('data: '))
        .map(line => line.slice(6).trim());

      for (const dl of dataLines) {
        handleSsePayload(dl);
      }
    }

    // 5. Fallback: if stream produced no text, use Messages API directly
    if (!fullText) {
      console.warn('[AGENTS] Stream produced no text, falling back to Messages API');
      try {
        const systemPrompt = `Você é o assistente ${agentModule} do PMO da CBRio (igreja). Responda em português de forma clara e útil. ${contextStr ? `Contexto do sistema:\n${contextStr}` : ''}`;
        const fallbackRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: 'user', content: message }],
          }),
        });
        const fallbackData = await fallbackRes.json();
        const fallbackText = fallbackData.content?.[0]?.text;
        if (fallbackText) {
          fullText = fallbackText;
          sendEvent('delta', { text: fallbackText });
        } else {
          console.error('[AGENTS] Fallback also empty:', JSON.stringify(fallbackData).slice(0, 300));
        }
      } catch (fbErr) {
        console.error('[AGENTS] Fallback error:', fbErr.message);
      }
    }

    // 6. Persist messages in DB
    try {
      // Get the DB session id
      const sessRow = await db.query(
        `SELECT id FROM agent_sessions WHERE anthropic_session_id = $1 LIMIT 1`,
        [activeSessionId]
      );
      const dbSessId = sessRow.rows[0]?.id;
      if (dbSessId) {
        await db.query(
          `INSERT INTO agent_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
          [dbSessId, message]
        );
        if (fullText) {
          await db.query(
            `INSERT INTO agent_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
            [dbSessId, fullText]
          );
        }
      }
    } catch (e) {
      console.warn('[AGENTS] Failed to persist messages:', e.message);
    }

    // 7. Log usage
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

// GET /api/agents/sessions/:id/messages — histórico de mensagens
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, role, content, created_at FROM agent_messages
       WHERE session_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[AGENTS] Messages list error:', e.message);
    res.status(500).json({ error: 'Erro ao listar mensagens' });
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
