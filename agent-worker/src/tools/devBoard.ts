import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

// Tools do Agente Dev sobre o board (agent_tarefas) + helpers usados pelo runner.
// O board é o contrato da tarefa: claim atômico (agendada → em_andamento), gates,
// orçamento e relatório de PR. Escrita só via service_role; o agente NUNCA mergeia.

function ok(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function fail(msg: string) {
  return {
    content: [{ type: "text" as const, text: `ERRO: ${msg}` }],
    isError: true,
  };
}

export interface DevTarefa {
  id: string;
  titulo: string;
  descricao: string;
  classe: string;
  agente_key: string | null;
  status: string;
  prioridade: string;
  origem: string;
  orcamento_usd: number | null;
  gate: string | null;
  pull_request_url: string | null;
  branch: string | null;
  queue_ids: string[] | null;
  run_ids: string[] | null;
  aprovada_por: string | null;
  aprovada_em: string | null;
  created_at: string;
  updated_at: string;
}

// ─── helpers (usados pelo runner) ────────────────────────────────────────────

export async function buscarTarefa(id: string): Promise<DevTarefa | null> {
  const { data, error } = await supabase
    .from("agent_tarefas")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DevTarefa) || null;
}

// Claim atômico: só transiciona se ainda estiver `agendada` (nenhum outro
// runner/worker pega a mesma tarefa). Retorna null se alguém venceu a corrida.
export async function claimTarefa(id: string): Promise<DevTarefa | null> {
  const { data, error } = await supabase
    .from("agent_tarefas")
    .update({ status: "em_andamento", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "agendada")
    .is("deleted_at", null)
    .select()
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return (data as DevTarefa) || null;
}

export async function atualizarTarefa(
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("agent_tarefas")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function registrarEventoTarefa(
  id: string,
  evento: string,
  detalhe: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabase.from("agent_task_events").insert({
    tarefa_id: id,
    evento,
    detalhe,
    criado_por: null,
  });
  if (error) throw new Error(error.message);
}

export async function comentarTarefa(id: string, texto: string): Promise<void> {
  const { error } = await supabase.from("agent_task_comments").insert({
    tarefa_id: id,
    autor_id: null,
    texto: texto.slice(0, 3000),
  });
  if (error) throw new Error(error.message);
}

// Orçamento mensal: teto DEV_BUDGET_MENSAL_USD − SUM(cost_usd) dos runs do
// dev agent no mês corrente. Fail-closed: env inválida ⇒ indisponível.
export async function orcamentoDisponivel(): Promise<{
  ok: boolean;
  motivo?: string;
  teto?: number;
  usado?: number;
  disponivel?: number;
}> {
  const teto = parseFloat(process.env.DEV_BUDGET_MENSAL_USD || "");
  if (!Number.isFinite(teto) || teto <= 0) {
    return { ok: false, motivo: "DEV_BUDGET_MENSAL_USD inválido ou não definido" };
  }
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("agent_runs")
    .select("cost_usd")
    .eq("agent_type", "developer_agent")
    .gte("created_at", inicioMes.toISOString());
  if (error) throw new Error(error.message);
  const usado = (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  return { ok: true, teto, usado, disponivel: Math.max(0, teto - usado) };
}

// ─── tools expostas ao LLM ───────────────────────────────────────────────────

export function createDevBoardTools(tarefaId: string) {
  const lerTarefa = tool(
    "dev_ler_tarefa",
    "Le os detalhes da tarefa atual do board: título, descrição (escopo), prioridade, gate e orçamento da tarefa. Sempre comece por aqui para entender o que implementar. A descrição nunca contém PII (LGPD).",
    {},
    async () => {
      try {
        const t = await buscarTarefa(tarefaId);
        if (!t) return fail("tarefa não encontrada ou removida");
        return ok({
          id: t.id,
          titulo: t.titulo,
          descricao: t.descricao,
          prioridade: t.prioridade,
          origem: t.origem,
          gate: t.gate,
          orcamento_usd: t.orcamento_usd,
          status: t.status,
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const comentar = tool(
    "dev_comentar",
    "Adiciona um comentário no board da tarefa (visível aos humanos no hub). Use para registrar progresso, decisões, impedimentos ou resumos parciais.",
    { texto: z.string().min(3).max(3000).describe("Conteúdo do comentário") },
    async ({ texto }) => {
      try {
        await comentarTarefa(tarefaId, texto);
        return ok({ comentario: "adicionado" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const tools = [lerTarefa, comentar];
  return {
    tools,
    toolNames: tools.map((t) => `mcp__dev__${t.name}`),
  };
}
