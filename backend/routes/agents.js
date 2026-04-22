const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate, authorize, getEffectiveLevel } = require('../middleware/auth');
const db = require('../utils/db');
const { supabase } = require('../utils/supabase');
const { sanitizeObj, isValidUUID } = require('../utils/sanitize');
const { ENVIRONMENT_ID, getAgentId, listModulesForUser, canUseAgent } = require('../config/managedAgents');
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

// Autenticação é obrigatória em todas as rotas.
// Authorization (admin/diretor) é aplicada por rota onde necessário — o acesso ao
// chat é filtrado pelo agente (cada usuário só vê/usa agentes dos módulos que pode ler).
router.use(authenticate);

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

// GET /api/agents/modules — lista módulos disponíveis para o usuário atual
router.get('/modules', (req, res) => {
  res.json(listModulesForUser(req, getEffectiveLevel));
});

// POST /api/agents/chat — SSE streaming via Anthropic Sessions API
router.post('/chat', chatLimiter, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'API da Anthropic não configurada' });

  const { message, module, sessionId } = sanitizeObj(req.body);
  if (!message) return res.status(400).json({ error: 'Mensagem obrigatória' });

  const agentModule = module || 'supervisor';

  // Bloquear se o usuário não tem permissão para esse agente
  if (!canUseAgent(req, agentModule, getEffectiveLevel)) {
    return res.status(403).json({ error: 'Sem permissão para usar este agente' });
  }

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
        const row = await dbInsert('agent_sessions', {
          user_id: req.user.userId,
          anthropic_session_id: activeSessionId,
          agent_module: agentModule,
          title: message.slice(0, 80),
        });
        dbSessionId = row?.id;
      } catch (dbErr) {
        console.error('[AGENTS] Failed to persist session:', dbErr.message);
        sendEvent('persist_error', { text: 'Sessão não foi salva no banco de dados.' });
      }

      sendEvent('session', { sessionId: activeSessionId, dbSessionId, module: agentModule });
    } else {
      // Update last_message_at
      try {
        await dbQuery(
          `UPDATE agent_sessions SET last_message_at = NOW(), title = COALESCE(title, $1) WHERE anthropic_session_id = $2`,
          [message.slice(0, 80), activeSessionId]
        );
      } catch (e) { console.warn('[AGENTS] Failed to update session timestamp:', e.message); }
    }

    // 2. Build context from DB (filtrado pela permissão do usuário)
    //    + busca relevante no Cérebro (vault Obsidian)
    let contextStr = '';
    try {
      const ctx = await buildContext(
        [agentModule === 'supervisor' ? 'all' : agentModule],
        req,
        { query: message, vaultLimit: 5 },
      );
      contextStr = serializeContext(ctx, 24000);
    } catch (e) {
      console.warn('[AGENTS] Context build failed:', e.message);
    }

    const antiHallucination = 'REGRA ABSOLUTA: Responda SOMENTE com dados presentes no contexto abaixo. Se a informação não estiver disponível no contexto, diga claramente que não encontrou. NUNCA invente, estime ou adivinhe dados. Use os registros reais fornecidos.';
    const userContent = contextStr
      ? `[INSTRUÇÃO]\n${antiHallucination}\n\n[CONTEXTO DO SISTEMA — DADOS REAIS DO BANCO DE DADOS]\n${contextStr}\n\n[PERGUNTA DO USUÁRIO]\n${message}`
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
        const systemPrompt = `Você é o assistente ${agentModule} do ERP da CBRio (igreja). Responda em português de forma clara e útil. REGRA ABSOLUTA: Responda SOMENTE com dados presentes no contexto. NUNCA invente dados. Se não encontrar a informação, diga claramente. ${contextStr ? `\n\nDados reais do banco de dados:\n${contextStr}` : ''}`;
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
      const sessRow = await dbQuery(
        `SELECT id FROM agent_sessions WHERE anthropic_session_id = $1 LIMIT 1`,
        [activeSessionId]
      );
      const dbSessId = sessRow.rows[0]?.id;
      if (dbSessId) {
        await dbInsert('agent_messages', { session_id: dbSessId, role: 'user', content: message });
        if (fullText) {
          await dbInsert('agent_messages', { session_id: dbSessId, role: 'assistant', content: fullText });
        }
      }
    } catch (e) {
      console.warn('[AGENTS] Failed to persist messages:', e.message);
      sendEvent('persist_error', { text: 'Mensagens não foram salvas no banco.' });
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
    const r = await dbQuery(
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

// GET /api/agents/sessions/:id/messages — histórico de mensagens (com validação de ownership)
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    // Validate session belongs to user
    const sessCheck = await dbQuery(
      `SELECT id FROM agent_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [req.params.id, req.user.userId]
    );
    if (!sessCheck.rows.length) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const r = await dbQuery(
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

// POST /api/agents/generate — proxy para Anthropic API (auditorias, restrito)
router.post('/generate', authorize('admin', 'diretor'), aiLimiter, async (req, res) => {
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
router.get('/queue', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM agent_queue WHERE status = $1 ORDER BY created_at DESC LIMIT 20', ['pending']);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// PATCH /api/agents/queue/:id/approve
router.patch('/queue/:id/approve', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await db.query(
      'UPDATE agent_queue SET status=$1, reviewed_by=$2, reviewed_at=NOW() WHERE id=$3',
      ['approved', req.user.userId, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// PATCH /api/agents/queue/:id/reject
router.patch('/queue/:id/reject', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await db.query(
      'UPDATE agent_queue SET status=$1, reviewed_by=$2, reviewed_at=NOW() WHERE id=$3',
      ['rejected', req.user.userId, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// GET /api/agents/log
router.get('/log', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM agent_log ORDER BY created_at DESC LIMIT 50');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
