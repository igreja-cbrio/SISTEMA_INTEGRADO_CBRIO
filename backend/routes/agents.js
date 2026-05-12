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

// ─── AUDITORES (system, module_*, design) ───────────────────────────────
// Os agentes rodam em background ("fire and forget"). O frontend faz polling
// em /runs/:id para acompanhar progresso e ler os findings quando completar.

const { runSystemAudit } = require('../agents/systemAuditor');
const { runModuleAudit } = require('../agents/moduleAuditor');
const { runDesignAudit } = require('../agents/designAuditor');
const { AgentService } = require('../services/agentService');

function executarAgente(agentType, triggeredBy, config) {
  if (agentType === 'system_auditor') return runSystemAudit(triggeredBy, config);
  if (agentType === 'design_auditor') return runDesignAudit(triggeredBy, config);
  if (agentType.startsWith('module_')) return runModuleAudit(agentType, triggeredBy, config);
  throw new Error(`Tipo de agente desconhecido: ${agentType}`);
}

// POST /api/agents/run — dispara auditoria em background, retorna runId
router.post('/run', authorize('admin', 'diretor'), aiLimiter, async (req, res) => {
  try {
    const { agentType, config } = sanitizeObj(req.body || {});
    if (!agentType) return res.status(400).json({ error: 'agentType obrigatório' });

    const userConfig = config || {};

    // Cria o run imediatamente para o frontend já ter um ID para polling.
    // O config gravado no banco é só o que veio do usuário (sem flags internas).
    const agent = await AgentService.createRun(agentType, req.user.userId, userConfig);

    // Dispara a auditoria em background. Erros são capturados pelo próprio
    // auditor (chamam agent.fail) — qualquer escape vira agent_runs.status='failed'.
    const runtimeConfig = { ...userConfig, _existingRunId: agent.runId };
    setImmediate(async () => {
      try {
        await executarAgente(agentType, req.user.userId, runtimeConfig);
      } catch (err) {
        console.error(`[AGENTS] run ${agent.runId} crashed:`, err.message);
        try {
          await supabase.from('agent_runs').update({
            status: 'failed',
            error: err.message,
            completed_at: new Date().toISOString(),
          }).eq('id', agent.runId);
        } catch { /* ignore */ }
      }
    });

    res.status(202).json({ runId: agent.runId, status: 'running' });
  } catch (e) {
    console.error('[AGENTS] /run error:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao iniciar agente' });
  }
});

// GET /api/agents/runs — lista runs (filtros: agentType, status, limit)
router.get('/runs', async (req, res) => {
  try {
    const { agentType, status, limit } = req.query;
    let q = supabase
      .from('agent_runs')
      .select('id, agent_type, status, summary, findings, config, tokens_input, tokens_output, cost_usd, created_at, completed_at, error')
      .order('created_at', { ascending: false })
      .limit(Math.min(parseInt(limit) || 30, 100));
    if (agentType) q = q.eq('agent_type', agentType);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[AGENTS] /runs error:', e.message);
    res.status(500).json({ error: 'Erro ao listar runs' });
  }
});

// GET /api/agents/runs/:id — detalhe de uma run
router.get('/runs/:id', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { data, error } = await supabase
      .from('agent_runs').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Run não encontrada' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar run' });
  }
});

// GET /api/agents/runs/:id/steps — passos de uma run
router.get('/runs/:id/steps', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { data, error } = await supabase
      .from('agent_steps')
      .select('id, step_number, model, role, tokens_input, tokens_output, cost_usd, response_text, duration_ms, created_at')
      .eq('run_id', req.params.id)
      .order('step_number', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar steps' });
  }
});

// POST /api/agents/runs/:id/cancel — marca como cancelada
router.post('/runs/:id/cancel', authorize('admin', 'diretor'), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { error } = await supabase
      .from('agent_runs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('status', 'running');
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao cancelar' });
  }
});

// GET /api/agents/stats — totais agregados (execuções, tokens, custo)
router.get('/stats', async (req, res) => {
  try {
    const sinceDays = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    const { data, error } = await supabase
      .from('agent_runs')
      .select('tokens_input, tokens_output, cost_usd, status')
      .gte('created_at', since);
    if (error) throw error;
    const rows = data || [];
    const totalRuns = rows.length;
    const completed = rows.filter(r => r.status === 'completed').length;
    const failed = rows.filter(r => r.status === 'failed').length;
    const totalTokens = rows.reduce((s, r) => s + (r.tokens_input || 0) + (r.tokens_output || 0), 0);
    const totalCost = rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    res.json({ totalRuns, completed, failed, totalTokens, totalCost, sinceDays });
  } catch (e) {
    console.error('[AGENTS] /stats error:', e.message);
    res.status(500).json({ error: 'Erro ao calcular estatísticas' });
  }
});

// GET /api/agents/scores — histórico de score por agent_type
router.get('/scores', async (req, res) => {
  try {
    const sinceDays = parseInt(req.query.days) || 90;
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    const { data, error } = await supabase
      .from('agent_runs')
      .select('agent_type, config, findings, created_at')
      .eq('status', 'completed')
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const byType = {};
    for (const r of data || []) {
      const score = r.config?.score;
      if (score == null) continue;
      if (!byType[r.agent_type]) byType[r.agent_type] = [];
      byType[r.agent_type].push({
        date: r.created_at,
        score: Number(score),
        findingsCount: Array.isArray(r.findings) ? r.findings.length : 0,
      });
    }
    res.json(byType);
  } catch (e) {
    console.error('[AGENTS] /scores error:', e.message);
    res.status(500).json({ error: 'Erro ao buscar scores' });
  }
});

// GET /api/agents/memory/:module — memórias persistidas de um módulo
router.get('/memory/:module', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('agent_memory')
      .select('agent_type, module, key, value, updated_at')
      .eq('module', req.params.module)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar memória' });
  }
});

module.exports = router;
