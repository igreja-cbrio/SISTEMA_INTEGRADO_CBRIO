import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { cerebroReadTools, cerebroReadToolNames } from "../tools/cerebroRead.js";
import { createCerebroProposeTools } from "../tools/cerebroPropose.js";

const AGENT_TYPE = "module_cerebro_watcher";
const MAX_TURNS = parseInt(process.env.AGENT_MAX_TURNS || "20", 10);
const MODEL = process.env.CEREBRO_MODEL || "claude-sonnet-4-6";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.join(__dirname, "..", "skills", "cerebro", "SKILL.md");

function loadSkill(): string {
  try { return fs.readFileSync(SKILL_PATH, "utf8"); }
  catch { return "Watcher Cerebro · saude do pipeline."; }
}

const USER_PROMPT = `
Execute o ciclo de monitoramento do Cerebro CBRio.

Roteiro:
1. listar_erros_processamento (dias=2) · acumulo de erros recente
2. listar_fila_pendente_antiga (horas=24) · fila travada
3. resumir_custo_ultimo_periodo (dias=7) · gasto

Max 5 propostas. So alertar quando ha problema real (qtd_erros >= 5,
pendentes >= 10, ou tokens > 50k).
`.trim();

interface R { runId: string; status: "completed" | "failed"; alertas_propostos: number; summary: string; tokens_input: number; tokens_output: number; cost_usd: number; error?: string; }

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
};
function cost(m: string, ti: number, to: number) { const p = PRICING[m] || PRICING["claude-sonnet-4-6"]; return (ti * p.input + to * p.output) / 1_000_000; }

export async function runCerebroWatcher(opts: { triggeredBy?: string | null; config?: Record<string, unknown> } = {}): Promise<R> {
  const { triggeredBy, config = {} } = opts;
  const { data: run, error: e0 } = await supabase.from("agent_runs").insert({ agent_type: AGENT_TYPE, status: "running", triggered_by: triggeredBy || null, config: { ...config, model: MODEL, max_turns: MAX_TURNS } }).select("id").single();
  if (e0) throw new Error(e0.message);
  const runId = run.id;
  let n = 0, ti = 0, to = 0, summary = "", step = 0;
  try {
    const { tools, toolNames } = createCerebroProposeTools(runId);
    const server = createSdkMcpServer({ name: "cerebro", version: "0.1.0", tools: [...cerebroReadTools, ...tools] });
    const stream = query({
      prompt: USER_PROMPT,
      options: { model: MODEL, mcpServers: { cerebro: server }, allowedTools: [...cerebroReadToolNames, ...toolNames], systemPrompt: loadSkill(), maxTurns: MAX_TURNS, permissionMode: "default" },
    });
    for await (const msg of stream) {
      if (msg.type === "assistant" && msg.message?.content) {
        const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
        const u = msg.message.usage; const a = u?.input_tokens || 0, b = u?.output_tokens || 0;
        ti += a; to += b; step++;
        const tx = blocks.find((x: any) => x.type === "text") as { text?: string } | undefined;
        const tu = blocks.filter((x: any) => x.type === "tool_use") as Array<{ name: string; input: unknown; id: string }>;
        for (const t of tu) { if (typeof t.name === "string" && t.name.startsWith("mcp__cerebro__propor_")) n++; }
        await supabase.from("agent_steps").insert({ run_id: runId, step_number: step, model: MODEL, role: "step", tokens_input: a, tokens_output: b, cost_usd: cost(MODEL, a, b), response_text: tx?.text?.slice(0, 10000) || null, tool_calls: tu.length ? tu : [], duration_ms: null });
      }
      if (msg.type === "result") summary = (msg as any).result || (msg as any).message || "";
    }
    if (!summary) summary = `${n} alertas propostos.`;
    const c = cost(MODEL, ti, to);
    await supabase.from("agent_runs").update({ status: "completed", summary, actions_taken: { alertas_propostos: n }, tokens_input: ti, tokens_output: to, cost_usd: c, completed_at: new Date().toISOString() }).eq("id", runId);
    return { runId, status: "completed", alertas_propostos: n, summary, tokens_input: ti, tokens_output: to, cost_usd: c };
  } catch (err) {
    const e = (err as Error).message || String(err);
    const c = cost(MODEL, ti, to);
    await supabase.from("agent_runs").update({ status: "failed", error: e, summary: summary || `Falha apos ${n}`, tokens_input: ti, tokens_output: to, cost_usd: c, completed_at: new Date().toISOString() }).eq("id", runId);
    return { runId, status: "failed", alertas_propostos: n, summary: summary || "", tokens_input: ti, tokens_output: to, cost_usd: c, error: e };
  }
}
