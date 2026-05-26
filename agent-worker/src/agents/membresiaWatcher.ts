import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { membresiaReadTools, membresiaReadToolNames } from "../tools/membresiaRead.js";
import { createMembresiaProposeTools } from "../tools/membresiaPropose.js";

const AGENT_TYPE = "module_membresia_watcher";
const MAX_TURNS = parseInt(process.env.AGENT_MAX_TURNS || "20", 10);
const MODEL = process.env.MEMBRESIA_MODEL || "claude-sonnet-4-6";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.join(__dirname, "..", "skills", "membresia", "SKILL.md");

function loadSkill(): string {
  try { return fs.readFileSync(SKILL_PATH, "utf8"); }
  catch { return "Watcher Membresia · duplicados detectados e cadastros pendentes."; }
}

const USER_PROMPT = `
Execute o ciclo de monitoramento de Membresia.

Roteiro:
1. listar_duplicados_detectados (confianca_minima=0.9)
2. listar_cadastros_pendentes (dias_minimo=7) · parados ha 7d+
3. listar_cadastros_pendentes (dias_minimo=0) · pra contagem geral

Max 10 propostas. Inclua nomes reais. Pra duplicados, foco em
cpf_igual/nome_e_nascimento (alta confianca).
`.trim();

interface Result {
  runId: string; status: "completed" | "failed";
  alertas_propostos: number; summary: string;
  tokens_input: number; tokens_output: number; cost_usd: number; error?: string;
}

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
};
function estimateCost(model: string, ti: number, to: number): number {
  const p = PRICING[model] || PRICING["claude-sonnet-4-6"];
  return (ti * p.input + to * p.output) / 1_000_000;
}

export async function runMembresiaWatcher(opts: {
  triggeredBy?: string | null; config?: Record<string, unknown>;
} = {}): Promise<Result> {
  const { triggeredBy, config = {} } = opts;
  const { data: run, error: runErr } = await supabase.from("agent_runs").insert({
    agent_type: AGENT_TYPE, status: "running", triggered_by: triggeredBy || null,
    config: { ...config, model: MODEL, max_turns: MAX_TURNS },
  }).select("id").single();
  if (runErr) throw new Error(`Falha agent_run: ${runErr.message}`);
  const runId = run.id;

  let alertasPropostos = 0, totalIn = 0, totalOut = 0, summary = "", step = 0;
  try {
    const { tools, toolNames } = createMembresiaProposeTools(runId);
    const server = createSdkMcpServer({ name: "membresia", version: "0.1.0", tools: [...membresiaReadTools, ...tools] });
    const stream = query({
      prompt: USER_PROMPT,
      options: {
        model: MODEL,
        mcpServers: { membresia: server },
        allowedTools: [...membresiaReadToolNames, ...toolNames],
        systemPrompt: loadSkill(),
        maxTurns: MAX_TURNS,
        permissionMode: "default",
      },
    });
    for await (const msg of stream) {
      if (msg.type === "assistant" && msg.message?.content) {
        const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
        const u = msg.message.usage;
        const ti = u?.input_tokens || 0, to = u?.output_tokens || 0;
        totalIn += ti; totalOut += to; step++;
        const textBlock = blocks.find((b: any) => b.type === "text") as { text?: string } | undefined;
        const toolUseBlocks = blocks.filter((b: any) => b.type === "tool_use") as Array<{ name: string; input: unknown; id: string }>;
        for (const tu of toolUseBlocks) {
          if (typeof tu.name === "string" && tu.name.startsWith("mcp__membresia__propor_")) alertasPropostos++;
        }
        await supabase.from("agent_steps").insert({
          run_id: runId, step_number: step, model: MODEL, role: "step",
          tokens_input: ti, tokens_output: to,
          cost_usd: estimateCost(MODEL, ti, to),
          response_text: textBlock?.text?.slice(0, 10000) || null,
          tool_calls: toolUseBlocks.length ? toolUseBlocks : [],
          duration_ms: null,
        });
      }
      if (msg.type === "result") summary = (msg as any).result || (msg as any).message || "";
    }
    if (!summary) summary = `${alertasPropostos} alertas propostos.`;
    const cost = estimateCost(MODEL, totalIn, totalOut);
    await supabase.from("agent_runs").update({
      status: "completed", summary,
      actions_taken: { alertas_propostos: alertasPropostos },
      tokens_input: totalIn, tokens_output: totalOut, cost_usd: cost,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return { runId, status: "completed", alertas_propostos: alertasPropostos, summary,
             tokens_input: totalIn, tokens_output: totalOut, cost_usd: cost };
  } catch (err) {
    const e = (err as Error).message || String(err);
    const cost = estimateCost(MODEL, totalIn, totalOut);
    await supabase.from("agent_runs").update({
      status: "failed", error: e, summary: summary || `Falha apos ${alertasPropostos}`,
      tokens_input: totalIn, tokens_output: totalOut, cost_usd: cost,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return { runId, status: "failed", alertas_propostos: alertasPropostos, summary: summary || "",
             tokens_input: totalIn, tokens_output: totalOut, cost_usd: cost, error: e };
  }
}
