import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { montarSystemPrompt } from "../instrucoes.js";
import { createCyberReadTools } from "../tools/cyberRead.js";
import { createCyberProposeTools } from "../tools/cyberPropose.js";

const AGENT_TYPE = "cyber_agent";
const MAX_TURNS = parseInt(process.env.CYBER_MAX_TURNS || "8", 10);
const MODEL = process.env.CYBER_MODEL || "claude-haiku-4-5-20251001";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.join(__dirname, "..", "skills", "cyber", "SKILL.md");

function loadSkill(): string {
  try {
    return fs.readFileSync(SKILL_PATH, "utf8");
  } catch (e) {
    console.error("[cyberAgent] SKILL.md nao encontrado em", SKILL_PATH);
    return "Voce e o agente de seguranca da CBRio. Auditoria read-only, achados SEM PII, propostas em agent_queue.";
  }
}

const USER_PROMPT = `
Execute a auditoria semanal de seguranca.
Roteiro:
1. auditar_super_admins
2. auditar_audit_sensivel (janela 14 dias)
3. auditar_soft_deletados
4. auditar_estado_agentes

Analise os retornos procurando riscos acionaveis (acesso amplo demais, volume
anormal de mudancas em dados sensiveis/permissoes, limpeza inadequada, agentes
quebrados). Para cada achado que mereca olhar humano, chame
propor_achado_seguranca (SEM PII · severidade honesta · maximo 8).

Ao terminar, responda com um sumario em portugues:
- N achados e breakdown por severidade
- O que voce observou e NAO virou proposta (e por que)
`.trim();

interface CyberResult {
  runId: string;
  status: "completed" | "failed";
  achados: number;
  summary: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  error?: string;
}

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
};

export async function runCyberAgent(opts: { triggeredBy?: string | null; config?: Record<string, unknown> } = {}): Promise<CyberResult> {
  const { triggeredBy, config = {} } = opts;

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

  let achados = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let summary = "";
  let stepNumber = 0;

  try {
    const { tools: proposeTools, toolNames: proposeToolNames } = createCyberProposeTools(runId);
    const { tools: readTools, toolNames: readToolNames } = createCyberReadTools();

    const cyberServer = createSdkMcpServer({
      name: "cyber",
      version: "0.1.0",
      tools: [...readTools, ...proposeTools],
    });

    const allowedTools = [...readToolNames, ...proposeToolNames];
    const skill = loadSkill();
    const systemPrompt = await montarSystemPrompt(AGENT_TYPE, skill);

    const stream = query({
      prompt: USER_PROMPT,
      options: {
        model: MODEL,
        mcpServers: { cyber: cyberServer },
        allowedTools,
        systemPrompt,
        maxTurns: MAX_TURNS,
        permissionMode: "default",
      },
    });

    for await (const msg of stream) {
      if (msg.type === "assistant" && msg.message?.content) {
        const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
        const usage = msg.message.usage;
        totalTokensIn += usage?.input_tokens || 0;
        totalTokensOut += usage?.output_tokens || 0;
        stepNumber++;
        const textBlock = blocks.find((b: any) => b.type === "text") as { text?: string } | undefined;
        const toolUseBlocks = blocks.filter((b: any) => b.type === "tool_use") as Array<{ name: string; input: unknown; id: string }>;
        for (const tu of toolUseBlocks) {
          if (typeof tu.name === "string" && tu.name.startsWith("mcp__cyber__propor_")) achados++;
        }
        await supabase.from("agent_steps").insert({
          run_id: runId,
          step_number: stepNumber,
          model: MODEL,
          role: "step",
          tokens_input: usage?.input_tokens || 0,
          tokens_output: usage?.output_tokens || 0,
          cost_usd: estimateCost(MODEL, usage?.input_tokens || 0, usage?.output_tokens || 0),
          response_text: textBlock?.text?.slice(0, 10000) || null,
          tool_calls: toolUseBlocks.length ? toolUseBlocks : [],
          duration_ms: null,
        });
      }
      if (msg.type === "result") {
        summary = (msg as any).result || (msg as any).message || "";
      }
    }

    if (!summary) summary = `${achados} achados enfileirados.`;
    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);

    await supabase.from("agent_runs").update({
      status: "completed",
      summary,
      actions_taken: { achados },
      tokens_input: totalTokensIn,
      tokens_output: totalTokensOut,
      cost_usd: cost,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    return { runId, status: "completed", achados, summary, tokens_input: totalTokensIn, tokens_output: totalTokensOut, cost_usd: cost };
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    console.error(`[cyberAgent] run ${runId} falhou:`, errorMsg);
    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);
    await supabase.from("agent_runs").update({
      status: "failed",
      error: errorMsg,
      summary: summary || `Falha apos ${achados} achados`,
      tokens_input: totalTokensIn,
      tokens_output: totalTokensOut,
      cost_usd: cost,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return { runId, status: "failed", achados, summary: summary || "", tokens_input: totalTokensIn, tokens_output: totalTokensOut, cost_usd: cost, error: errorMsg };
  }
}

function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING[model] || PRICING["claude-haiku-4-5-20251001"];
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}
