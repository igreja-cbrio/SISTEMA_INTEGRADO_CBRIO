// Agente do RELATÓRIO semanal de KPI/OKR.
//
// Diferente do kpis_watcher (que propõe alerta pro líder e olha o estado de
// AGORA), este julga o PERÍODO FECHADO e entrega um relatório de gestão por
// e-mail. Roda no scheduler de segunda 06:00 SP.
//
// ⚠️ Divisão de trabalho: o MODELO analisa e entrega dados estruturados
// (tool `entregar_relatorio`); o CÓDIGO renderiza o HTML e envia. LLM não
// escreve o e-mail — assim o formato não muda quando o modelo varia.
//
// ⚠️ O envio é feito pelo BACKEND (`/api/kpis/v2/cron/relatorio-email`), que é
// onde vivem as credenciais do Microsoft Graph. O worker não as tem, e
// duplicá-las aqui criaria um 2º lugar pra rotacionar segredo.

import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import {
  kpiRelatorioReadTools,
  kpiRelatorioReadToolNames,
  periodosFechados,
} from "../tools/kpiRelatorioRead.js";
import { createEntregaTool } from "../tools/kpiRelatorioEntrega.js";
import { htmlDoRelatorio, textoDoRelatorio, assuntoDoRelatorio } from "./kpiRelatorioHtml.js";

const AGENT_TYPE = "kpi_relatorio_semanal";
// Teto maior que os watchers: são ~10 leituras + série por KPI candidato.
const MAX_TURNS = parseInt(process.env.KPI_RELATORIO_MAX_TURNS || "60", 10);
const MODEL = process.env.KPI_RELATORIO_MODEL || "claude-sonnet-4-6";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.join(__dirname, "..", "skills", "kpi-relatorio", "SKILL.md");

function loadSkill(): string {
  try {
    return fs.readFileSync(SKILL_PATH, "utf8");
  } catch {
    // Fallback deliberadamente CONSERVADOR: sem a skill, o modelo não conhece
    // as armadilhas de período — é melhor ele saber disso do que improvisar.
    return [
      "Voce monta o relatorio semanal de KPI/OKR da CBRio, somente leitura.",
      "Chame obter_periodos_fechados primeiro e julgue SO o periodo FECHADO.",
      "status='pendente' quase sempre e apenas periodo em aberto — nao e achado.",
      "Todo numero sai com periodo; toda variacao com a base.",
      "Termine chamando entregar_relatorio uma unica vez.",
    ].join(" ");
  }
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

interface RelatorioResult {
  runId: string;
  status: "completed" | "failed";
  summary: string;
  enviado: boolean;
  destinatarios?: string[];
  achados: number;
  confiabilidade: number | null;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  error?: string;
}

async function enviarPeloBackend(assunto: string, html: string, texto: string) {
  const base = process.env.APP_BASE_URL || process.env.FRONTEND_URL;
  const segredo = process.env.CRON_SECRET;
  if (!base) return { ok: false, error: "APP_BASE_URL nao configurada" };
  if (!segredo) return { ok: false, error: "CRON_SECRET nao configurado" };

  const url = `${base.replace(/\/$/, "")}/api/kpis/v2/cron/relatorio-email`;
  const para = process.env.KPI_RELATORIO_EMAIL || undefined;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": segredo },
      body: JSON.stringify({ assunto, html, texto, para }),
      signal: ctrl.signal,
    });
    const txt = await res.text();
    let corpo: any = null;
    try {
      corpo = JSON.parse(txt);
    } catch {
      corpo = { raw: txt.slice(0, 500) };
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${corpo?.error || txt.slice(0, 200)}` };
    }
    return { ok: true, destinatarios: corpo?.destinatarios || [] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export async function runKpiRelatorioSemanal(
  opts: { triggeredBy?: string | null; config?: Record<string, unknown> } = {}
): Promise<RelatorioResult> {
  const { triggeredBy, config = {} } = opts;
  const periodos = periodosFechados();

  const { data: run, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      agent_type: AGENT_TYPE,
      status: "running",
      triggered_by: triggeredBy || null,
      config: { ...config, model: MODEL, max_turns: MAX_TURNS, periodos },
    })
    .select("id")
    .single();
  if (runErr) throw new Error(`Falha criando agent_run: ${runErr.message}`);
  const runId = run.id;

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let stepNumber = 0;
  let summary = "";

  try {
    const { entregar, capturado, toolName } = createEntregaTool();

    const server = createSdkMcpServer({
      name: "kpirel",
      version: "0.1.0",
      tools: [...kpiRelatorioReadTools, entregar],
    });

    const prompt = `
Monte o relatorio semanal de KPI/OKR da CBRio.

Periodos de FECHAMENTO a julgar (ja calculados a partir de hoje, ${periodos.hoje}):
- semanal: ${periodos.semanal}   (a semana corrente ${periodos.semanal_corrente} esta EM ABERTO — nao julgue)
- mensal: ${periodos.mensal}
- trimestral: ${periodos.trimestral}
- semestral: ${periodos.semestral}

Roteiro:
1. listar_farol e listar_trajetoria — o retrato geral.
2. cobertura_do_periodo e frescor_das_fontes — o painel merece confianca esta semana?
3. Para cada candidato a achado, serie_do_kpi ANTES de afirmar tendencia.
4. So entao procure a causa (pulso_semanal, consultar_view_financeira, nsm_panorama).
5. okr_panorama — defasagem contra o ciclo, e a BASE de cada score.
6. Tente derrubar cada achado. Na duvida, corte.
7. entregar_relatorio — uma vez, no fim.

Maximo 4 itens em decisoes, 5 em riscos, 4 em avancos. Priorize o que muda decisao.
Se a semana foi estavel, diga que foi estavel — nao invente problema.
`.trim();

    const stream = query({
      prompt,
      options: {
        model: MODEL,
        mcpServers: { kpirel: server },
        allowedTools: [...kpiRelatorioReadToolNames, toolName],
        systemPrompt: loadSkill(),
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
        const toolUseBlocks = blocks.filter((b: any) => b.type === "tool_use") as Array<{
          name: string;
          input: unknown;
          id: string;
        }>;
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

    const payload = capturado.payload;
    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);

    if (!payload) {
      // ⚠️ Falha REAL, não sucesso silencioso: sem payload não há relatório, e
      // marcar "completed" faria a segunda-feira passar sem ninguém notar.
      const erro = "o agente terminou sem chamar entregar_relatorio";
      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          error: erro,
          summary: summary || erro,
          tokens_input: totalTokensIn,
          tokens_output: totalTokensOut,
          cost_usd: cost,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return {
        runId,
        status: "failed",
        summary: summary || "",
        enviado: false,
        achados: 0,
        confiabilidade: null,
        tokens_input: totalTokensIn,
        tokens_output: totalTokensOut,
        cost_usd: cost,
        error: erro,
      };
    }

    const assunto = assuntoDoRelatorio(payload);
    const html = htmlDoRelatorio(payload);
    const texto = textoDoRelatorio(payload);
    const envio = await enviarPeloBackend(assunto, html, texto);

    const achados =
      (payload.decisoes?.length || 0) +
      (payload.riscos?.length || 0) +
      (payload.avancos?.length || 0);

    const resumo = [
      `${payload.periodo_semanal}: ${achados} achados`,
      `(${payload.decisoes?.length || 0} decisao, ${payload.riscos?.length || 0} risco, ${payload.avancos?.length || 0} avanco)`,
      `· confiabilidade ${payload.confiabilidade_indice}/100`,
      envio.ok ? `· enviado a ${(envio.destinatarios || []).join(", ")}` : `· ENVIO FALHOU: ${envio.error}`,
    ].join(" ");

    await supabase
      .from("agent_runs")
      .update({
        // Analisou mas não entregou é FALHA — o produto deste agente é o
        // relatório na caixa de entrada, não o raciocínio.
        status: envio.ok ? "completed" : "failed",
        error: envio.ok ? null : envio.error,
        summary: resumo,
        actions_taken: {
          achados,
          confiabilidade: payload.confiabilidade_indice,
          enviado: envio.ok,
          destinatarios: envio.destinatarios || [],
          periodo: payload.periodo_semanal,
        },
        tokens_input: totalTokensIn,
        tokens_output: totalTokensOut,
        cost_usd: cost,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      runId,
      status: envio.ok ? "completed" : "failed",
      summary: resumo,
      enviado: envio.ok,
      destinatarios: envio.destinatarios,
      achados,
      confiabilidade: payload.confiabilidade_indice,
      tokens_input: totalTokensIn,
      tokens_output: totalTokensOut,
      cost_usd: cost,
      error: envio.ok ? undefined : envio.error,
    };
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    console.error(`[kpiRelatorioSemanal] run ${runId} falhou:`, errorMsg);
    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error: errorMsg,
        summary: summary || "Falha antes de entregar o relatorio",
        tokens_input: totalTokensIn,
        tokens_output: totalTokensOut,
        cost_usd: cost,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      runId,
      status: "failed",
      summary: summary || "",
      enviado: false,
      achados: 0,
      confiabilidade: null,
      tokens_input: totalTokensIn,
      tokens_output: totalTokensOut,
      cost_usd: cost,
      error: errorMsg,
    };
  }
}
