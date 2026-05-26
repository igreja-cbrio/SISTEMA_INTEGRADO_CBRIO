import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { kpisReadTools, kpisReadToolNames } from "../tools/kpisRead.js";
import { createKpisProposeTools } from "../tools/kpisPropose.js";

const AGENT_TYPE = "module_kpis_watcher";
const MAX_TURNS = parseInt(process.env.AGENT_MAX_TURNS || "20", 10);
const MODEL = process.env.KPIS_MODEL || "claude-sonnet-4-6";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.join(__dirname, "..", "skills", "kpis", "SKILL.md");

function loadSkill(): string {
  try {
    return fs.readFileSync(SKILL_PATH, "utf8");
  } catch {
    return "Voce e o watcher de KPIs/OKRs da CBRio. Monitora, relata, propoe alertas pros lideres.";
  }
}

const USER_PROMPT = `
Execute o ciclo de monitoramento de KPIs/OKRs agora.

Roteiro:
1. Chame listar_areas_resumo pra ter overview macro
2. Chame listar_kpis_status (status=critico) e (status=atrasado)
3. Chame listar_kpis_sem_dado pra detectar KPIs abandonados
4. Chame listar_okr_revisoes_abertas pra revisoes pendentes
5. Pra os 3-5 casos mais graves, propor_alertar_lider (apos
   verificar_proposta_existente pra evitar duplicacao)

Ao terminar, responda com SUMARIO conforme template do SKILL.md:
SAUDE GERAL · CRITICOS · ATRASADOS COM REGRESSAO · SEM DADO · ALERTAS PROPOSTOS · TENDENCIA.
Maximo 5 alertas propostos. Foque no acionavel.
`.trim();

interface WatcherResult {
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

export async function runKpisWatcher(opts: {
  triggeredBy?: string | null;
  config?: Record<string, unknown>;
} = {}): Promise<WatcherResult> {
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
    const { tools: proposeTools, toolNames: proposeToolNames } =
      createKpisProposeTools(runId);

    const kpisServer = createSdkMcpServer({
      name: "kpis",
      version: "0.1.0",
      tools: [...kpisReadTools, ...proposeTools],
    });

    const allowedTools = [...kpisReadToolNames, ...proposeToolNames];
    const skill = loadSkill();

    const stream = query({
      prompt: USER_PROMPT,
      options: {
        model: MODEL,
        mcpServers: { kpis: kpisServer },
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
          if (typeof tu.name === "string" && tu.name === "mcp__kpis__propor_alertar_lider") {
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

    await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        summary,
        actions_taken: { alertas_propostos: alertasPropostos },
        tokens_input: totalTokensIn,
        tokens_output: totalTokensOut,
        cost_usd: cost,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      runId,
      status: "completed",
      alertas_propostos: alertasPropostos,
      summary,
      tokens_input: totalTokensIn,
      tokens_output: totalTokensOut,
      cost_usd: cost,
    };
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    console.error(`[kpisWatcher] run ${runId} falhou:`, errorMsg);
    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error: errorMsg,
        summary: summary || `Falha apos ${alertasPropostos} alertas`,
        tokens_input: totalTokensIn,
        tokens_output: totalTokensOut,
        cost_usd: cost,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      runId,
      status: "failed",
      alertas_propostos: alertasPropostos,
      summary: summary || "",
      tokens_input: totalTokensIn,
      tokens_output: totalTokensOut,
      cost_usd: cost,
      error: errorMsg,
    };
  }
}
