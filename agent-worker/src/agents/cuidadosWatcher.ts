import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { cuidadosReadTools, cuidadosReadToolNames } from "../tools/cuidadosRead.js";
import { createCuidadosProposeTools } from "../tools/cuidadosPropose.js";

const AGENT_TYPE = "module_cuidados_watcher";
const MAX_TURNS = parseInt(process.env.AGENT_MAX_TURNS || "20", 10);
const MODEL = process.env.CUIDADOS_MODEL || "claude-sonnet-4-6";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.join(__dirname, "..", "skills", "cuidados", "SKILL.md");

function loadSkill(): string {
  try {
    return fs.readFileSync(SKILL_PATH, "utf8");
  } catch {
    return "Voce eh o watcher de Cuidados/Integracao. Monitora gaps pastorais.";
  }
}

const USER_PROMPT = `
Execute o ciclo de monitoramento de Cuidados/Integracao agora.

Roteiro:
1. listar_jornada180_parada (dias_minimo=30) · convertidos parados
2. listar_visitantes_sem_followup · visitantes 4-14d sem responsavel
3. listar_acompanhamentos_abertos (dias_minimo_aberto=30) · pastoral aberto

Pra cada caso, verificar_proposta_existente + propor_alertar_*.

Max 8 propostas. Prioridade: jornada180 critica > visitantes com decisao
> acompanhamentos estagnados.

Sumario: resumo do pipeline + propostas + recomendacoes pastorais.
`.trim();

interface CuidadosResult {
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
function estimateCost(model: string, ti: number, to: number): number {
  const p = PRICING[model] || PRICING["claude-sonnet-4-6"];
  return (ti * p.input + to * p.output) / 1_000_000;
}

export async function runCuidadosWatcher(opts: {
  triggeredBy?: string | null;
  config?: Record<string, unknown>;
} = {}): Promise<CuidadosResult> {
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
    const { tools: proposeTools, toolNames: proposeToolNames } = createCuidadosProposeTools(runId);
    const cuidadosServer = createSdkMcpServer({
      name: "cuidados",
      version: "0.1.0",
      tools: [...cuidadosReadTools, ...proposeTools],
    });
    const allowedTools = [...cuidadosReadToolNames, ...proposeToolNames];
    const skill = loadSkill();

    const stream = query({
      prompt: USER_PROMPT,
      options: {
        model: MODEL,
        mcpServers: { cuidados: cuidadosServer },
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
          if (typeof tu.name === "string" && tu.name.startsWith("mcp__cuidados__propor_")) {
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
