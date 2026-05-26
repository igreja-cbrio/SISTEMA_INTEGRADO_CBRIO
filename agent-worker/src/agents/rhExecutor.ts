import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { rhReadTools, rhReadToolNames } from "../tools/rhRead.js";
import { createRhProposeTools } from "../tools/rhPropose.js";

const AGENT_TYPE = "module_rh_executor";
const MAX_TURNS = parseInt(process.env.AGENT_MAX_TURNS || "20", 10);
const MODEL = process.env.RH_MODEL || "claude-sonnet-4-6";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.join(__dirname, "..", "skills", "rh", "SKILL.md");

function loadSkill(): string {
  try {
    return fs.readFileSync(SKILL_PATH, "utf8");
  } catch {
    return "Voce e o executor RH. Detecta documentos vencendo, treinamentos pendentes, ferias vencendo. Propoe alertas.";
  }
}

const USER_PROMPT = `
Execute o ciclo RH agora.

Roteiro:
1. listar_documentos_vencendo (dias=30) · identifica documentos por severidade
2. listar_treinamentos_pendentes · identifica funcionarios com cursos parados
3. listar_funcionarios_ferias_vencendo · identifica primeira ferias atrasada
4. Pra cada caso valido, verificar_proposta_existente + propor

Max 10 propostas. Foque em criticos (vencimento <= 7d primeiro).

Sumario final: documentos detectados por severidade, treinamentos pendentes,
ferias a vencer, total de alertas propostos.
`.trim();

interface RhResult {
  runId: string;
  status: "completed" | "failed";
  alertas_propostos: number;
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

function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING[model] || PRICING["claude-sonnet-4-6"];
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}

export async function runRhExecutor(opts: {
  triggeredBy?: string | null;
  config?: Record<string, unknown>;
} = {}): Promise<RhResult> {
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

  let alertasPropostos = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let summary = "";
  let stepNumber = 0;

  try {
    const { tools: proposeTools, toolNames: proposeToolNames } = createRhProposeTools(runId);
    const rhServer = createSdkMcpServer({
      name: "rh",
      version: "0.1.0",
      tools: [...rhReadTools, ...proposeTools],
    });
    const allowedTools = [...rhReadToolNames, ...proposeToolNames];
    const skill = loadSkill();

    const stream = query({
      prompt: USER_PROMPT,
      options: {
        model: MODEL,
        mcpServers: { rh: rhServer },
        allowedTools,
        systemPrompt: skill,
        maxTurns: MAX_TURNS,
        permissionMode: "default",
      },
    });

    for await (const msg of stream) {
      if (msg.type === "assistant" && msg.message?.content) {
        const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
        const usage = msg.message.usage;
        const tokensIn = usage?.input_tokens || 0;
        const tokensOut = usage?.output_tokens || 0;
        totalTokensIn += tokensIn;
        totalTokensOut += tokensOut;
        stepNumber++;
        const textBlock = blocks.find((b: any) => b.type === "text") as { text?: string } | undefined;
        const toolUseBlocks = blocks.filter((b: any) => b.type === "tool_use") as Array<{ name: string; input: unknown; id: string }>;
        for (const tu of toolUseBlocks) {
          if (typeof tu.name === "string" && tu.name.startsWith("mcp__rh__propor_")) {
            alertasPropostos++;
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

    if (!summary) summary = `${alertasPropostos} alertas propostos.`;
    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);

    await supabase.from("agent_runs").update({
      status: "completed",
      summary,
      actions_taken: { alertas_propostos: alertasPropostos },
      tokens_input: totalTokensIn,
      tokens_output: totalTokensOut,
      cost_usd: cost,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    return { runId, status: "completed", alertas_propostos: alertasPropostos, summary,
             tokens_input: totalTokensIn, tokens_output: totalTokensOut, cost_usd: cost };
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);
    await supabase.from("agent_runs").update({
      status: "failed", error: errorMsg, summary: summary || `Falha apos ${alertasPropostos}`,
      tokens_input: totalTokensIn, tokens_output: totalTokensOut, cost_usd: cost,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return { runId, status: "failed", alertas_propostos: alertasPropostos, summary: summary || "",
             tokens_input: totalTokensIn, tokens_output: totalTokensOut, cost_usd: cost, error: errorMsg };
  }
}
