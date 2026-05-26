import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { financeiroReadTools, financeiroReadToolNames } from "../tools/financeiroRead.js";
import { createFinanceiroProposeTools } from "../tools/financeiroPropose.js";

const AGENT_TYPE = "module_financeiro_executor";
const MAX_TURNS = parseInt(process.env.AGENT_MAX_TURNS || "20", 10);
const MODEL = process.env.FINANCEIRO_MODEL || "claude-sonnet-4-6";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.join(__dirname, "..", "skills", "financeiro", "SKILL.md");

function loadSkill(): string {
  try {
    return fs.readFileSync(SKILL_PATH, "utf8");
  } catch (e) {
    console.error("[financeiroExecutor] SKILL.md nao encontrado em", SKILL_PATH);
    return "Voce e o executor financeiro da CBRio. Propoe acoes pra fila pra humano aprovar.";
  }
}

const USER_PROMPT = `
Execute o ciclo financeiro agora.

Roteiro sugerido:
1. Chame listar_padroes_classificacao pra carregar regras + identificadores
2. Chame listar_alertas_abertos (severidade_minima='alerta') — priorize criticos
3. Chame listar_contas_pagar_pendentes (dias_para_vencer=15) — procure matches
4. Chame listar_fila_classificacao (limit=20)
5. Chame listar_reembolsos_pendentes (limit=10)

Pra cada item promissor, verifique idempotencia com verificar_proposta_existente
antes de propor.

Maximo 20 propostas no total. Foque em qualidade > quantidade.

Ao terminar, responda com um sumario em portugues:
- N propostas geradas
- Breakdown por tipo (categorize/pagar/reembolso/alerta)
- Motivos pra nao propor onde aplicavel
`.trim();

interface ExecutorResult {
  runId: string;
  status: "completed" | "failed";
  propostas_geradas: number;
  summary: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  error?: string;
}

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
};

export async function runFinanceiroExecutor(opts: {
  triggeredBy?: string | null;
  config?: Record<string, unknown>;
} = {}): Promise<ExecutorResult> {
  const { triggeredBy, config = {} } = opts;

  // 1. Cria agent_run
  const { data: run, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      agent_type: AGENT_TYPE,
      status: "running",
      triggered_by: triggeredBy || null,
      config: { ...config, model: MODEL, max_turns: MAX_TURNS },
    })
    .select("id")
    .single();

  if (runErr) throw new Error(`Falha criando agent_run: ${runErr.message}`);
  const runId = run.id;

  let propostasGeradas = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let summary = "";
  let stepNumber = 0;

  try {
    const { tools: proposeTools, toolNames: proposeToolNames } =
      createFinanceiroProposeTools(runId);

    const financeiroServer = createSdkMcpServer({
      name: "financeiro",
      version: "0.1.0",
      tools: [...financeiroReadTools, ...proposeTools],
    });

    const allowedTools = [...financeiroReadToolNames, ...proposeToolNames];

    const skill = loadSkill();

    const stream = query({
      prompt: USER_PROMPT,
      options: {
        model: MODEL,
        mcpServers: { financeiro: financeiroServer },
        allowedTools,
        systemPrompt: skill,
        maxTurns: MAX_TURNS,
        // permitir somente as tools MCP listadas · sem filesystem/bash
        permissionMode: "default",
      },
    });

    for await (const msg of stream) {
      // assistant messages com tool_use viram propostas quando uma propose_* eh chamada
      if (msg.type === "assistant" && msg.message?.content) {
        const blocks = Array.isArray(msg.message.content)
          ? msg.message.content
          : [];
        const usage = msg.message.usage;
        const tokensIn = usage?.input_tokens || 0;
        const tokensOut = usage?.output_tokens || 0;
        totalTokensIn += tokensIn;
        totalTokensOut += tokensOut;

        // Persist step
        stepNumber++;
        const textBlock = blocks.find((b: any) => b.type === "text");
        const toolUseBlocks = blocks.filter((b: any) => b.type === "tool_use");
        for (const tu of toolUseBlocks) {
          if (
            typeof tu.name === "string" &&
            tu.name.startsWith("mcp__financeiro__propor_")
          ) {
            propostasGeradas++;
          }
        }
        await supabase.from("agent_steps").insert({
          run_id: runId,
          step_number: stepNumber,
          model: MODEL,
          role: "step",
          tokens_input: tokensIn,
          tokens_output: tokensOut,
          cost_usd: estimateCost(MODEL, tokensIn, tokensOut),
          response_text: textBlock?.text?.slice(0, 10000) || null,
          tool_calls: toolUseBlocks.length ? toolUseBlocks : [],
          duration_ms: null,
        });
      }
      if (msg.type === "result") {
        summary = (msg as any).result || (msg as any).message || "";
      }
    }

    if (!summary) summary = `${propostasGeradas} propostas enfileiradas.`;

    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);

    await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        summary,
        actions_taken: { propostas_geradas: propostasGeradas },
        tokens_input: totalTokensIn,
        tokens_output: totalTokensOut,
        cost_usd: cost,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      runId,
      status: "completed",
      propostas_geradas: propostasGeradas,
      summary,
      tokens_input: totalTokensIn,
      tokens_output: totalTokensOut,
      cost_usd: cost,
    };
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    console.error(`[financeiroExecutor] run ${runId} falhou:`, errorMsg);
    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error: errorMsg,
        summary: summary || `Falha apos ${propostasGeradas} propostas`,
        tokens_input: totalTokensIn,
        tokens_output: totalTokensOut,
        cost_usd: cost,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      runId,
      status: "failed",
      propostas_geradas: propostasGeradas,
      summary: summary || "",
      tokens_input: totalTokensIn,
      tokens_output: totalTokensOut,
      cost_usd: cost,
      error: errorMsg,
    };
  }
}

function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING[model] || PRICING["claude-sonnet-4-6"];
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}
