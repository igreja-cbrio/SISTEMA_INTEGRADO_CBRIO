import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { supabase } from "../supabase.js";
import { montarSystemPrompt } from "../instrucoes.js";
import { createDevBoardTools, buscarTarefa, claimTarefa, atualizarTarefa, registrarEventoTarefa, comentarTarefa, orcamentoDisponivel } from "../tools/devBoard.js";
import { createDevFileTools } from "../tools/devFiles.js";
import { prepararWorkspace, commitar, push, abrirPr, aguardarChecks, diffNomeArquivos, diffConteudo, slugDaTarefa } from "../tools/devGit.js";

// Agente Dev · FASE 2 · runner completo (Bloco 1).
// Tarefa do board → branch `Codex/<desc>` → implementação (loop SDK Sonnet) →
// validação G1 local (cheap) → commit+push → PR → poll CI → reporta no board.
// Regras duras em src/skills/dev/AGENTS.md (nunca mergeia, nunca migration em
// prod, orçamento fail-closed). Portões de ativação: DEV_AGENT_ENABLED=1,
// GITHUB_TOKEN, DEV_BUDGET_MENSAL_USD (SANDBOX_DATABASE_URL é opcional — só
// tarefas com migration precisam dele).

const AGENT_TYPE = "developer_agent";
const MODEL = process.env.DEV_MODEL || "claude-sonnet-4-6";
const MAX_TURNS = parseInt(process.env.DEV_MAX_TURNS || "60", 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_PATH = path.join(__dirname, "..", "skills", "dev", "AGENTS.md");

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
};

interface DevResult {
  runId: string | null;
  status: "completed" | "failed" | "cancelled";
  summary: string;
  pr_url?: string | null;
  branch?: string | null;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  error?: string;
}

function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING[model] || PRICING["claude-sonnet-4-6"];
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}

function loadSkill(): string {
  try {
    return fs.readFileSync(SKILL_PATH, "utf8");
  } catch (e) {
    console.error("[devAgent] AGENTS.md nao encontrado em", SKILL_PATH);
    return "Voce e o agente desenvolvedor da CBRio. Implementa em branch + PR, nunca mergeia, nunca aplica migration em producao.";
  }
}

const SECRET_PATTERNS: Array<{ nome: string; re: RegExp }> = [
  { nome: "chave Anthropic", re: /sk-ant-[A-Za-z0-9_-]{10,}/ },
  { nome: "token GitHub", re: /ghp_[A-Za-z0-9]{30,}/ },
  { nome: "service role JWT", re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.*/ },
  { nome: "AWS key", re: /AKIA[0-9A-Z]{16}/ },
  { nome: "chave privada", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

function detectarSegredos(texto: string): string[] {
  return SECRET_PATTERNS.filter((p) => p.re.test(texto)).map((p) => p.nome);
}

function nodeCheck(caminho: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("node", ["--check", caminho], { timeout: 30_000 }, (err) => {
      resolve(err ? err.message : null);
    });
  });
}

function parseFinal(result: string): { commit: string; testPlan: string } {
  const commit = /COMMIT:\s*([^\n]+)/i.exec(result)?.[1]?.trim() || "";
  const testPlan =
    /TEST_PLAN:\s*([\s\S]*?)(?=\n[A-Z][A-Z_]+:|$)/i.exec(result)?.[1]?.trim() || "";
  return { commit, testPlan };
}

function montarPrompt(tarefa: { titulo: string; descricao: string; prioridade: string; orcamento_usd: number | null }, workspaceDir: string): string {
  return `
Voce esta implementando UMA tarefa de codigo no repositorio SISTEMA_INTEGRADO_CBRIO.

## TAREFA ATUAL
Titulo: ${tarefa.titulo}
Prioridade: ${tarefa.prioridade}
Orcamento da tarefa (USD): ${tarefa.orcamento_usd ?? "sem teto especifico"}
Descricao:
${tarefa.descricao}

## WORKSPACE
O repositorio ja esta clonado e em uma branch de feature. Use as tools
dev_* com caminhos RELATIVOS a raiz do repositorio (ex: backend/routes/x.js).
ANTES de mexer em qualquer modulo, leia o AGENTS.md na raiz do repositorio
e a secao do modulo afetado. Nao invente escopo fora da tarefa.

## REGRAS DE CODIGO (resumo — leia o AGENTS.md completo)
- Acentuacao correta do portugues em TODO texto visivel (nao acentuar slugs/ids).
- Seguir as convencoes do modulo afetado (reusar libs existentes, padrao de arquivos).
- NUNCA criar/mexer em arquivos de segredo (.env*). NUNCA tocar schema/RLS/auth.
- Migration nova: permitida criar o ARQUIVO em supabase/migrations/, mas o SQL
  NAO pode ser aplicado por voce — anote no PR que o humano precisa aplicar.
- Nao adicionar comentarios de codigo sem necessidade. Sem emojis em codigo.
- Implemente de verdade (qualidade > velocidade): o CI e o gate final.

## FORMATO FINAL (OBRIGATORIO — a ultima resposta deve terminar com)
COMMIT: <mensagem de commit no padrao do repo: feat(<modulo>): descricao curta>
TEST_PLAN: <descricao do que testar/validar>
`.trim();
}

export async function runDevAgent(opts: { triggeredBy?: string | null; config?: Record<string, unknown> } = {}): Promise<DevResult> {
  const { triggeredBy, config = {} } = opts;
  const taskId = String(config.taskId || "").trim();
  const trigger = config.trigger === "cron" ? "cron" : "manual";

  // 1 · gates de env (fail-closed)
  const gatesAbertos: Array<{ env: string; motivo: string }> = [];
  if (process.env.DEV_AGENT_ENABLED !== "1") gatesAbertos.push({ env: "DEV_AGENT_ENABLED", motivo: "kill-switch deve ser '1'" });
  if (!process.env.GITHUB_TOKEN) gatesAbertos.push({ env: "GITHUB_TOKEN", motivo: "credencial GitHub ausente" });
  if (!process.env.DEV_BUDGET_MENSAL_USD) gatesAbertos.push({ env: "DEV_BUDGET_MENSAL_USD", motivo: "orcamento mensal nao definido" });
  if (gatesAbertos.length) {
    const motivo = `Portoes pendentes: ${gatesAbertos.map((g) => g.env).join(", ")}. Nenhuma acao executada.`;
    console.warn(`[devAgent] ${motivo}`);
    return { runId: null, status: "cancelled", summary: motivo, tokens_input: 0, tokens_output: 0, cost_usd: 0 };
  }

  // 2 · tarefa
  if (!taskId) {
    return { runId: null, status: "cancelled", summary: "config.taskId obrigatorio", tokens_input: 0, tokens_output: 0, cost_usd: 0 };
  }
  let tarefa;
  try {
    tarefa = await buscarTarefa(taskId);
  } catch (e) {
    return { runId: null, status: "failed", summary: `Falha buscando tarefa: ${(e as Error).message}`, tokens_input: 0, tokens_output: 0, cost_usd: 0, error: (e as Error).message };
  }
  if (!tarefa) {
    return { runId: null, status: "cancelled", summary: `Tarefa ${taskId} nao encontrada ou removida`, tokens_input: 0, tokens_output: 0, cost_usd: 0 };
  }
  if (tarefa.status !== "agendada") {
    return { runId: null, status: "cancelled", summary: `Tarefa ${taskId} em status '${tarefa.status}' (esperado agendada)`, tokens_input: 0, tokens_output: 0, cost_usd: 0 };
  }

  // 3 · roster ativo
  const { data: membro } = await supabase.from("agent_team").select("ativo, orcamento_tarefa_usd").eq("agent_key", AGENT_TYPE).maybeSingle();
  if (!membro?.ativo) {
    return { runId: null, status: "cancelled", summary: "Membro developer_agent inativo no roster", tokens_input: 0, tokens_output: 0, cost_usd: 0 };
  }

  // 4 · orçamento mensal (antes do claim)
  let orcamento;
  try {
    orcamento = await orcamentoDisponivel();
  } catch (e) {
    return { runId: null, status: "failed", summary: `Falha checando orçamento: ${(e as Error).message}`, tokens_input: 0, tokens_output: 0, cost_usd: 0, error: (e as Error).message };
  }
  if (!orcamento.ok) {
    return { runId: null, status: "cancelled", summary: `Orçamento indisponível: ${orcamento.motivo}`, tokens_input: 0, tokens_output: 0, cost_usd: 0 };
  }
  const orcamentoTarefa = Number(tarefa.orcamento_usd || 0) || Number(membro.orcamento_tarefa_usd || 5);
  const tetoExecucao = Math.min(orcamento.disponivel ?? orcamentoTarefa, orcamentoTarefa);

  // 5 · claim atômico
  const claimed = await claimTarefa(taskId);
  if (!claimed) {
    return { runId: null, status: "cancelled", summary: `Tarefa ${taskId} já foi pega por outra execução`, tokens_input: 0, tokens_output: 0, cost_usd: 0 };
  }

  // 6 · cria run
  const { data: run, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      agent_type: AGENT_TYPE,
      status: "running",
      triggered_by: triggeredBy || null,
      task_id: taskId,
      config: { ...config, model: MODEL, max_turns: MAX_TURNS, trigger },
    })
    .select("id")
    .single();
  if (runErr) {
    await registrarEventoTarefa(taskId, "falhou", { de: "em_andamento", para: "falhou", motivo: `Falha criando agent_run: ${runErr.message}` }).catch(() => {});
    await atualizarTarefa(taskId, { status: "falhou" }).catch(() => {});
    return { runId: null, status: "failed", summary: `Falha criando agent_run: ${runErr.message}`, tokens_input: 0, tokens_output: 0, cost_usd: 0, error: runErr.message };
  }
  const runId = run.id;
  await atualizarTarefa(taskId, { run_ids: [...(tarefa.run_ids || []), runId] }).catch(() => {});

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let summary = "";
  let stepNumber = 0;
  let workspaceDir = "";

  const finalizar = async (r: DevResult): Promise<DevResult> => {
    try {
      await supabase
        .from("agent_runs")
        .update({
          status: r.status === "cancelled" ? "failed" : r.status,
          summary: r.summary,
          error: r.error || null,
          tokens_input: r.tokens_input,
          tokens_output: r.tokens_output,
          cost_usd: r.cost_usd,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    } catch (e) {
      console.warn("[devAgent] falha atualizando run:", (e as Error).message);
    }
    return r;
  };

  try {
    // 7 · workspace (clone + branch)
    const branch = `Codex/${slugDaTarefa(tarefa.titulo)}`;
    workspaceDir = await prepararWorkspace(branch);
    await registrarEventoTarefa(taskId, "em_andamento", { branch, run_id: runId, modelo: MODEL }).catch(() => {});

    // 8 · tools + system prompt
    const { tools: boardTools, toolNames: boardToolNames } = createDevBoardTools(taskId);
    const { tools: fileTools, toolNames: fileToolNames, getTocados } = createDevFileTools(workspaceDir);
    const devServer = createSdkMcpServer({ name: "dev", version: "0.1.0", tools: [...fileTools, ...boardTools] });

    const skill = loadSkill();
    const systemPrompt = await montarSystemPrompt(AGENT_TYPE, skill);
    const userPrompt = montarPrompt(tarefa, workspaceDir);
    const allowedTools = [...fileToolNames, ...boardToolNames];

    const stream = query({
      prompt: userPrompt,
      options: {
        model: MODEL,
        mcpServers: { dev: devServer },
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

        // orçamento fail-closed a cada step
        const custo = estimateCost(MODEL, totalTokensIn, totalTokensOut);
        if (custo >= tetoExecucao) {
          throw new Error(`Orçamento atingido durante a execução ($${custo.toFixed(4)} ≥ teto $${tetoExecucao.toFixed(2)})`);
        }
      }
      if (msg.type === "result") {
        summary = (msg as any).result || (msg as any).message || "";
      }
    }
    if (!summary) summary = "Concluído sem resposta final do modelo.";

    // 9 · G1 local (filtros baratos; CI é o gate autoritativo)
    const tocados = getTocados();
    const jsTocados = tocados.filter((f) => /\.(js|cjs|mjs)$/.test(f));
    for (const f of jsTocados) {
      const erro = await nodeCheck(path.join(workspaceDir, f));
      if (erro) throw new Error(`G1: sintaxe inválida em ${f}: ${erro.split("\n")[0]}`);
    }
    const diff = await diffConteudo(workspaceDir);
    const segredos = detectarSegredos(diff);
    if (segredos.length) throw new Error(`G1: segredo detectado no diff (${segredos.join(", ")}) — abortado`);
    const nomes = await diffNomeArquivos(workspaceDir);
    const proibidos = nomes.filter((f) => /(^|\/)\.env($|\.)/.test(f) || f.includes("node_modules"));
    if (proibidos.length) throw new Error(`G1: arquivos proibidos no diff: ${proibidos.join(", ")}`);
    const temMigration = nomes.some((f) => f.startsWith("supabase/migrations/"));
    if (!tocados.length) throw new Error("Nenhum arquivo foi alterado — nada para commitar");

    // 10 · commit + push + PR
    const { commit, testPlan } = parseFinal(summary);
    const msgCommit = commit || `feat(dev): ${tarefa.titulo.slice(0, 60)}`;
    await commitar(workspaceDir, msgCommit.slice(0, 200));
    await push(workspaceDir, branch);

    const tituloPr = msgCommit.split("\n")[0].slice(0, 70);
    const corpoPr = [
      `## Contexto`,
      tarefa.descricao,
      ``,
      `## O que mudou`,
      summary.slice(0, 3000),
      ``,
      `## Test plan`,
      testPlan || "CI (qualidade + preview Vercel) verde é o gate final.",
      temMigration ? `\n> ⚠️ **Migration nova em supabase/migrations/** — o SQL deve ser aplicado pelo humano no SQL Editor do Supabase antes do merge (nunca aplicada pelo agente).` : "",
      ``,
      `_Gerado pelo Agente Dev (task ${taskId})_`,
    ]
      .filter((l) => l !== "")
      .join("\n");

    const pr = await abrirPr({ head: branch, title: tituloPr, body: corpoPr });
    await atualizarTarefa(taskId, { pull_request_url: pr.url, branch, gate: "G2", status: "aguardando_revisao" });
    await registrarEventoTarefa(taskId, "status_aguardando_revisao", { pr_url: pr.url, branch, gate: "G2" }).catch(() => {});
    await comentarTarefa(taskId, `PR aberto: ${pr.url} (branch ${branch}). Aguardando CI verde para revisão humana.`).catch(() => {});

    // 11 · poll CI
    const checks = await aguardarChecks(pr.number);
    if (checks.veredito === "falhas") {
      await registrarEventoTarefa(taskId, "ci_falhou", { pr_url: pr.url, falhas: checks.falhas }).catch(() => {});
      await comentarTarefa(taskId, `CI reportou ${checks.falhas} check(s) com falha no PR ${pr.url}.`).catch(() => {});
    }
    if (checks.falhas >= 3) {
      await atualizarTarefa(taskId, { status: "bloqueada" });
      await registrarEventoTarefa(taskId, "status_bloqueada", { motivo: `CI vermelho ${checks.falhas}× consecutivas`, pr_url: pr.url }).catch(() => {});
      await comentarTarefa(taskId, "Tarefa bloqueada: CI falhou 3× consecutivas (regra do skill). Parar e não repetir o mesmo caminho.").catch(() => {});
      const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);
      return await finalizar({ runId, status: "failed", summary: `CI falhou ${checks.falhas}× — tarefa bloqueada`, pr_url: pr.url, branch, tokens_input: totalTokensIn, tokens_output: totalTokensOut, cost_usd: cost, error: "CI 3× vermelho" });
    }

    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);
    const finalSummary = `PR ${pr.url} aberto e CI ${checks.veredito === "ok" ? "verde" : checks.veredito === "timeout" ? "ainda em execução (timeout de espera)" : `com ${checks.falhas} falha(s)`} — aguardando revisão humana.`;
    await comentarTarefa(taskId, finalSummary).catch(() => {});
    return await finalizar({ runId, status: "completed", summary: finalSummary, pr_url: pr.url, branch, tokens_input: totalTokensIn, tokens_output: totalTokensOut, cost_usd: cost });
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    console.error(`[devAgent] run ${runId} falhou:`, errorMsg);
    await registrarEventoTarefa(taskId, "falhou", { motivo: errorMsg.slice(0, 500) }).catch(() => {});
    await atualizarTarefa(taskId, { status: "falhou" }).catch(() => {});
    await comentarTarefa(taskId, `Falhou: ${errorMsg.slice(0, 500)}`).catch(() => {});
    const cost = estimateCost(MODEL, totalTokensIn, totalTokensOut);
    return await finalizar({ runId, status: "failed", summary: summary || `Falhou: ${errorMsg}`, tokens_input: totalTokensIn, tokens_output: totalTokensOut, cost_usd: cost, error: errorMsg });
  }
}
