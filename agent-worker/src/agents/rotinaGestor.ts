// Agente da ROTINA DE GESTÃO DE PROJETOS (3 dias · 3 pilares).
//
// Roda no scheduler seg/qua/sex 07:00 SP e manda por e-mail o bloco do dia:
// o que fazer, o estado dos 3 pilares (Eventos · Reuniões · Compromissos) e as
// mensagens de cobrança PRONTAS pro gestor copiar.
//
// ⚠️ Divisão de trabalho: o MODELO lê e julga (tool `entregar_rotina`); o CÓDIGO
// renderiza o HTML e envia. LLM não escreve o e-mail — assim o formato não muda
// quando o modelo varia, e regressão de layout aparece em diff.
//
// ⚠️ SOMENTE LEITURA, e isso é decisão: o agente não dispara cobrança pra
// ninguém. Cobrança é ato de gente, e mandar do número da igreja é outra
// decisão com outro custo (teto de tier da Meta, nota de qualidade). Ele entrega
// o texto; quem aperta enviar é o Marcos.
//
// ⚠️ Também de propósito NÃO chama `notificar()`: 38 dos 51 módulos não têm
// regra em `notificacao_regras`, então o aviso cairia no fallback de TODOS os
// admin/diretor — 16 pessoas recebendo a rotina de UMA, 3× por semana. O sino
// já tem 16 mil não lidas por causa exatamente disso.

import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { loadInstrucoes } from "../instrucoes.js";
import {
  rotinaGestorReadTools,
  rotinaGestorReadToolNames,
  hojeBRT,
  diaDaSemanaBRT,
  blocoDoDia,
} from "../tools/rotinaGestorRead.js";
import { createEntregaRotinaTool } from "../tools/rotinaGestorEntrega.js";
import { htmlDaRotina, textoDaRotina, assuntoDaRotina } from "./rotinaGestorHtml.js";

const AGENT_TYPE = "rotina_gestor";
const AGENT_KEY = "rotina_gestor";
const MAX_TURNS = parseInt(process.env.ROTINA_GESTOR_MAX_TURNS || "40", 10);
const MODEL = process.env.ROTINA_GESTOR_MODEL || "claude-sonnet-4-6";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.join(__dirname, "..", "skills", "rotina-gestor", "SKILL.md");

function loadSkill(): string {
  try {
    return fs.readFileSync(SKILL_PATH, "utf8");
  } catch {
    // Fallback CONSERVADOR: sem a skill o modelo não conhece as armadilhas, e é
    // melhor ele saber que existem do que improvisar cobrança.
    return [
      "Voce monta o bloco do dia da rotina de gestao de projetos da CBRio, somente leitura.",
      "Pilares: Eventos, Reunioes, Compromissos. Qualidade e checagem DENTRO deles, nao um 4o pilar.",
      "Chame obter_dia_da_rotina primeiro.",
      "Todo numero sai com a JANELA na mesma frase.",
      "NUNCA inventar nome de pessoa: sem responsavel cadastrado, o item vai em sem_a_quem_cobrar com a AREA.",
      "Leitura incompleta vira ressalva, nunca cobranca.",
      "'Calcula nulo' NAO se cobra por preenchimento: falta a fonte do dado.",
      "Dia limpo e resposta legitima: marque nada_a_fazer.",
      "Termine chamando entregar_rotina uma unica vez.",
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

interface RotinaResult {
  runId: string;
  status: "completed" | "failed" | "skipped";
  summary: string;
  enviado: boolean;
  destinatarios?: string[];
  bloco: string;
  itens: number;
  mensagens: number;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  error?: string;
}

async function enviarPeloBackend(assunto: string, html: string, texto: string) {
  // ⚠️ O envio é feito pelo BACKEND (`/api/governanca/cron/rotina-email`), que é
  // onde vivem as credenciais do Microsoft Graph. O worker não as tem, e
  // duplicá-las aqui criaria um 2º lugar pra rotacionar segredo.
  const base = process.env.APP_BASE_URL || process.env.FRONTEND_URL;
  const segredo = process.env.CRON_SECRET;
  if (!base) return { ok: false as const, error: "APP_BASE_URL nao configurada" };
  if (!segredo) return { ok: false as const, error: "CRON_SECRET nao configurado" };

  const url = `${base.replace(/\/$/, "")}/api/governanca/cron/rotina-email`;
  const para = process.env.ROTINA_GESTOR_EMAIL || undefined;

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
      return { ok: false as const, error: `HTTP ${res.status}: ${corpo?.error || txt.slice(0, 200)}` };
    }
    return { ok: true as const, destinatarios: (corpo?.destinatarios || []) as string[] };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export async function runRotinaGestor(
  opts: { triggeredBy?: string | null; config?: Record<string, unknown> } = {}
): Promise<RotinaResult> {
  const { triggeredBy, config = {} } = opts;
  const hoje = hojeBRT();
  const bloco = blocoDoDia(diaDaSemanaBRT());

  // ⚠️ O scheduler já dispara só seg/qua/sex, mas o disparo MANUAL (via
  // /run/rotina_gestor) pode cair em qualquer dia — e aí o dia certo é o de
  // hoje, decidido aqui, nunca "finge que é segunda".
  // `forcar: true` no config roda mesmo fora dos 3 dias (ensaio).
  const forcar = config.forcar === true;
  if (bloco === "fora" && !forcar) {
    const { data: run } = await supabase
      .from("agent_runs")
      .insert({
        agent_type: AGENT_TYPE,
        status: "completed",
        triggered_by: triggeredBy || null,
        config: { ...config, model: MODEL, bloco, hoje },
        summary: `Hoje (${hoje}) não é dia de rotina (seg/qua/sex). Nada montado.`,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    return {
      runId: run?.id || "",
      status: "skipped",
      summary: `Hoje (${hoje}) não é dia de rotina.`,
      enviado: false,
      bloco,
      itens: 0,
      mensagens: 0,
      tokens_input: 0,
      tokens_output: 0,
      cost_usd: 0,
    };
  }

  const { data: run, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      agent_type: AGENT_TYPE,
      status: "running",
      triggered_by: triggeredBy || null,
      config: { ...config, model: MODEL, max_turns: MAX_TURNS, bloco, hoje },
    })
    .select("id")
    .single();
  if (runErr) throw new Error(`Falha criando agent_run: ${runErr.message}`);
  const runId = run.id;

  let tokensIn = 0;
  let tokensOut = 0;
  let stepNumber = 0;
  let summary = "";

  try {
    const { entregar, capturado, toolName } = createEntregaRotinaTool();

    const server = createSdkMcpServer({
      name: "rotina",
      version: "0.1.0",
      tools: [...rotinaGestorReadTools, entregar],
    });

    const prompt = [
      `Monte o bloco do dia da rotina de gestão de projetos da CBRio.`,
      ``,
      `Hoje é ${hoje} e o bloco é "${bloco}". Confirme chamando obter_dia_da_rotina.`,
      ``,
      `Passos:`,
      `1. obter_dia_da_rotina`,
      `2. listar_eventos_pendentes`,
      `3. listar_reunioes_pendentes`,
      `4. listar_compromissos`,
      `5. listar_saude_indicadores`,
      `6. entregar_rotina (uma única vez)`,
      ``,
      `Só o que é do bloco de hoje entra em "agora". As duas pautas só na SEGUNDA.`,
      `O fechamento mensal só na última sexta do mês.`,
      `Se não houver pendência, marque nada_a_fazer e não invente item.`,
    ].join("\n");

    // Job description versionada (Fase 0 do time de agentes) entra DEPOIS da
    // skill: regra dura vem antes e nunca é sobrescrita.
    const instrucoes = await loadInstrucoes(AGENT_KEY);
    const systemPrompt = [loadSkill(), instrucoes].filter(Boolean).join("\n\n");

    const stream = query({
      prompt,
      options: {
        model: MODEL,
        mcpServers: { rotina: server },
        allowedTools: [...rotinaGestorReadToolNames, toolName],
        systemPrompt,
        maxTurns: MAX_TURNS,
        permissionMode: "default",
      },
    });

    for await (const msg of stream) {
      if (msg.type === "assistant" && (msg as any).message?.content) {
        const m = (msg as any).message;
        const blocks = Array.isArray(m.content) ? m.content : [];
        const a = m.usage?.input_tokens || 0;
        const b = m.usage?.output_tokens || 0;
        tokensIn += a;
        tokensOut += b;
        stepNumber++;
        const tx = blocks.find((x: any) => x.type === "text") as { text?: string } | undefined;
        const tu = blocks.filter((x: any) => x.type === "tool_use") as Array<{ name: string; input: unknown; id: string }>;
        await supabase.from("agent_steps").insert({
          run_id: runId,
          step_number: stepNumber,
          model: MODEL,
          role: "step",
          tokens_input: a,
          tokens_output: b,
          cost_usd: estimateCost(MODEL, a, b),
          response_text: tx?.text?.slice(0, 10000) || null,
          tool_calls: tu.length ? tu : [],
          duration_ms: null,
        });
      }
      if (msg.type === "result") summary = (msg as any).result || (msg as any).message || "";
    }

    const payload = capturado.payload;
    if (!payload) {
      // ⚠️ Sem payload NÃO se manda e-mail improvisado do texto do modelo: o
      // formato varia e um e-mail malformado se lê como sistema quebrado. A
      // rodada falha, e a falha abre incidente pelo systemCatalog.
      throw new Error("O agente terminou sem chamar entregar_rotina — nada foi enviado.");
    }

    const assunto = assuntoDaRotina(payload);
    const html = htmlDaRotina(payload);
    const texto = textoDaRotina(payload);
    const envio = await enviarPeloBackend(assunto, html, texto);

    const itens =
      (payload.agora?.length || 0) +
      (payload.eventos?.length || 0) +
      (payload.reunioes?.length || 0) +
      (payload.compromissos?.length || 0);
    const nMsg = payload.mensagens?.length || 0;

    const resumo = envio.ok
      ? `${payload.bloco_titulo} · ${itens} item(ns), ${nMsg} mensagem(ns). E-mail enviado.`
      : `${payload.bloco_titulo} · ${itens} item(ns), ${nMsg} mensagem(ns). ⚠️ E-MAIL NÃO ENVIADO: ${envio.error}`;

    // ⚠️ Falha de envio marca a rodada como FAILED: se ficasse "completed", o
    // bloco não teria chegado e ninguém saberia do silêncio — é a régua do
    // relatório de KPI (503 quando não há canal, em vez de fingir entrega).
    await supabase
      .from("agent_runs")
      .update({
        status: envio.ok ? "completed" : "failed",
        summary: resumo,
        error: envio.ok ? null : envio.error,
        actions_taken: {
          bloco: payload.bloco,
          itens,
          mensagens: nMsg,
          nada_a_fazer: !!payload.nada_a_fazer,
          enviado: envio.ok,
        },
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        cost_usd: estimateCost(MODEL, tokensIn, tokensOut),
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      runId,
      status: envio.ok ? "completed" : "failed",
      summary: resumo,
      enviado: envio.ok,
      destinatarios: envio.ok ? envio.destinatarios : undefined,
      bloco: payload.bloco,
      itens,
      mensagens: nMsg,
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      cost_usd: estimateCost(MODEL, tokensIn, tokensOut),
      error: envio.ok ? undefined : envio.error,
    };
  } catch (err) {
    const e = (err as Error).message || String(err);
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error: e,
        summary,
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        cost_usd: estimateCost(MODEL, tokensIn, tokensOut),
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return {
      runId,
      status: "failed",
      summary,
      enviado: false,
      bloco,
      itens: 0,
      mensagens: 0,
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      cost_usd: estimateCost(MODEL, tokensIn, tokensOut),
      error: e,
    };
  }
}
