import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

// Tools do Agente Dev sobre o board (agent_tarefas) + helpers usados pelo runner.
// O board é o contrato da tarefa: claim atômico (agendada → em_andamento, ou
// nova → em_diagnostico no fluxo de bug), gates, orçamento e relatório de PR.
// Escrita só via service_role. ⚠️ O agente NUNCA mergeia no fluxo comum; no
// fluxo de BUG aprovado (decisão do Marcos 2026-08-14) o merge é automático.

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
  reportado_por: string | null;
  diagnostico: string | null;
  diagnostico_em: string | null;
  // ⚠️ AUTORIZAÇÃO de merge, escrita só pela régua da aba Diagnósticos
  // (backend/utils/diagnosticoAutonomia.js · faixa "auto"). Default false no
  // banco = fail-closed: tarefa de qualquer outra origem PARA no PR.
  merge_automatico: boolean | null;
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

export async function isSystemIncidentCorrection(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("system_incidents")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return Boolean(data?.id);
}

// Claim atômico: só transiciona se ainda estiver no status `de` (nenhum outro
// runner/worker pega a mesma tarefa). Retorna null se alguém venceu a corrida.
// Default: agendada → em_andamento (execução). Para o diagnóstico de bug o
// runner chama com (de='nova', para='em_diagnostico').
export async function claimTarefa(
  id: string,
  de = "agendada",
  para = "em_andamento"
): Promise<DevTarefa | null> {
  const { data, error } = await supabase
    .from("agent_tarefas")
    .update({ status: para, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", de)
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

// Notificação no sino do app para quem reportou o bug (colaborador do Staff).
// ⚠️ Só o histórico in-app (app_notificacoes) — o push Expo/escrita passam pelo
// endpoint /decidir e /transicao do backend (notificarApp), que é a régua.
// Dedup igual à do backend (`agent_task_concluida_<id>`) pra nunca duplicar.
export async function notificarBugCorrigidoNoApp(tarefa: {
  id: string;
  titulo: string;
  reportado_por: string | null;
}): Promise<void> {
  if (!tarefa.reportado_por) return;
  const { error } = await supabase.from("app_notificacoes").upsert(
    [
      {
        user_id: tarefa.reportado_por,
        tipo: "bug_corrigido",
        titulo: "Bug corrigido",
        body: `O bug que você reportou foi corrigido: ${tarefa.titulo}`,
        data: { tarefa_id: tarefa.id, link: "/assistente-ia" },
        chave_dedup: `agent_task_concluida_${tarefa.id}`,
      },
    ],
    { onConflict: "user_id,chave_dedup", ignoreDuplicates: true }
  );
  if (error && error.code !== "42P10" && error.code !== "PGRST204") {
    console.warn("[devBoard] falha ao notificar reporter do bug:", error.message);
  }
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
          classe: t.classe,
          diagnostico: t.diagnostico,
          diagnostico_em: t.diagnostico_em,
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
