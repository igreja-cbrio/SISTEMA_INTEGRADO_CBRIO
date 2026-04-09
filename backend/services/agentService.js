const { supabase } = require('../utils/supabase');

// Preços por milhão de tokens (USD)
const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
};

const DEFAULT_BUDGET = parseInt(process.env.AI_DEFAULT_TOKEN_BUDGET || '50000');
const MAX_BUDGET = parseInt(process.env.AI_MAX_TOKEN_BUDGET || '200000');

const GUARDRAILS = `
REGRAS OBRIGATÓRIAS — GUARDRAILS:
1. NUNCA invente, fabrique ou suponha dados. Use APENAS dados reais fornecidos no contexto ou retornados pelas APIs.
2. Se não tiver certeza sobre algo, diga explicitamente "não tenho informação suficiente".
3. Todas as análises devem ser baseadas em evidências concretas dos dados.
4. Ao sugerir ações de escrita, SEMPRE marque com _agent_generated: true.
5. Respostas em português brasileiro.
6. Seja conciso e objetivo.
`.trim();

class AgentService {
  constructor(runId, agentType, config = {}) {
    this.runId = runId;
    this.agentType = agentType;
    this.config = config;
    this.tokenBudget = Math.min(config.tokenBudget || DEFAULT_BUDGET, MAX_BUDGET);
    this.totalTokensIn = 0;
    this.totalTokensOut = 0;
    this.totalCost = 0;
    this.stepCount = 0;
  }

  /** Cria um run no banco e retorna a instância */
  static async createRun(agentType, triggeredBy, config = {}) {
    const { data, error } = await supabase.from('agent_runs').insert({
      agent_type: agentType,
      status: 'running',
      triggered_by: triggeredBy,
      config,
    }).select().single();
    if (error) throw new Error(`Erro ao criar run: ${error.message}`);
    return new AgentService(data.id, agentType, config);
  }

  /** Verifica se ainda tem budget */
  checkBudget() {
    const total = this.totalTokensIn + this.totalTokensOut;
    if (total >= this.tokenBudget) {
      throw new Error(`Budget de tokens excedido: ${total}/${this.tokenBudget}`);
    }
    return this.tokenBudget - total;
  }

  /** Chamada principal ao Claude API */
  async call({ model = 'claude-haiku-4-5-20251001', system, messages, tools, role = 'step', maxTokens = 2048 }) {
    this.checkBudget();
    this.stepCount++;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada');

    const systemWithGuardrails = `${GUARDRAILS}\n\n${system || ''}`;

    const body = {
      model,
      max_tokens: maxTokens,
      system: systemWithGuardrails,
      messages,
    };
    if (tools?.length) body.tools = tools;

    const start = Date.now();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const duration = Date.now() - start;

    // Token tracking
    const tokensIn = data.usage?.input_tokens || 0;
    const tokensOut = data.usage?.output_tokens || 0;
    const pricing = PRICING[model] || PRICING['claude-haiku-4-5-20251001'];
    const cost = (tokensIn * pricing.input + tokensOut * pricing.output) / 1_000_000;

    this.totalTokensIn += tokensIn;
    this.totalTokensOut += tokensOut;
    this.totalCost += cost;

    // Extract response
    const textBlock = data.content?.find(b => b.type === 'text');
    const toolCalls = data.content?.filter(b => b.type === 'tool_use') || [];

    // Log step
    await supabase.from('agent_steps').insert({
      run_id: this.runId,
      step_number: this.stepCount,
      model,
      role,
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      cost_usd: cost,
      response_text: textBlock?.text?.slice(0, 10000),
      tool_calls: toolCalls.length ? toolCalls : [],
      duration_ms: duration,
    });

    // Atualizar totais no run
    await supabase.from('agent_runs').update({
      tokens_input: this.totalTokensIn,
      tokens_output: this.totalTokensOut,
      cost_usd: this.totalCost,
    }).eq('id', this.runId);

    return {
      text: textBlock?.text || '',
      toolCalls,
      usage: { input: tokensIn, output: tokensOut, cost },
      stopReason: data.stop_reason,
    };
  }

  /** Atalho para Haiku (barato, rápido) */
  async callHaiku(system, userMessage, role = 'step') {
    return this.call({
      model: 'claude-haiku-4-5-20251001',
      system,
      messages: [{ role: 'user', content: userMessage }],
      role,
      maxTokens: 1024,
    });
  }

  /** Atalho para Sonnet (análise profunda) */
  async callSonnet(system, userMessage, role = 'analysis') {
    return this.call({
      model: 'claude-sonnet-4-20250514',
      system,
      messages: [{ role: 'user', content: userMessage }],
      role,
      maxTokens: 4096,
    });
  }

  /** Finaliza run com sucesso */
  async complete(summary, findings = [], actionsTaken = []) {
    await supabase.from('agent_runs').update({
      status: 'completed',
      summary,
      findings,
      actions_taken: actionsTaken,
      tokens_input: this.totalTokensIn,
      tokens_output: this.totalTokensOut,
      cost_usd: this.totalCost,
      completed_at: new Date().toISOString(),
    }).eq('id', this.runId);
  }

  /** Finaliza run com erro */
  async fail(errorMsg) {
    await supabase.from('agent_runs').update({
      status: 'failed',
      error: errorMsg,
      tokens_input: this.totalTokensIn,
      tokens_output: this.totalTokensOut,
      cost_usd: this.totalCost,
      completed_at: new Date().toISOString(),
    }).eq('id', this.runId);
  }

  /** Cancela run */
  async cancel() {
    await supabase.from('agent_runs').update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    }).eq('id', this.runId);
  }

  // ── Memory System ───────────────────────────────────────

  /** Lê todas as memórias do agente */
  async getMemories(module = null) {
    let query = supabase.from('agent_memory')
      .select('key, value, updated_at')
      .eq('agent_type', this.agentType);
    if (module) query = query.eq('module', module);
    const { data } = await query.order('updated_at', { ascending: false });
    return data || [];
  }

  /** Salva/atualiza uma memória */
  async remember(key, value, module = null) {
    const { error } = await supabase.from('agent_memory')
      .upsert({
        agent_type: this.agentType,
        module: module || this.agentType.replace('module_', ''),
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agent_type,module,key' });
    if (error) console.error('[AgentMemory] Erro ao salvar:', error.message);
  }

  /** Formata memórias para incluir no prompt */
  formatMemories(memories) {
    if (!memories.length) return 'Nenhuma memória anterior.';
    return memories.map(m => `- ${m.key}: ${m.value}`).join('\n');
  }

  /** Lê o histórico de scores das últimas runs */
  async getScoreHistory(module = null, limit = 10) {
    let query = supabase.from('agent_runs')
      .select('created_at, config, findings, summary')
      .eq('agent_type', this.agentType)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);
    const { data } = await query;
    return (data || []).map(r => ({
      date: r.created_at,
      score: r.config?.score || null,
      findingsCount: r.findings?.length || 0,
    }));
  }
}

module.exports = { AgentService, GUARDRAILS };
