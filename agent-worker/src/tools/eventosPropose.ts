import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(p: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] }; }
function fail(m: string) { return { content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true }; }

const reasoning = z.string().min(20).describe("Por que esse alerta · numeros concretos.");
const label = z.string().min(8).max(140);

async function enfileirar(opts: {
  runId: string; action_type: string; action_label: string; reasoning: string; payload: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("agent_queue")
    .insert({
      run_id: opts.runId, agent_type: "module_eventos_watcher",
      action_type: opts.action_type, action_label: opts.action_label,
      description: opts.action_label, reasoning: opts.reasoning,
      payload: opts.payload, status: "pending",
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createEventosProposeTools(runId: string) {
  const proporAlertarTarefaAtrasada = tool(
    "propor_alertar_tarefa_atrasada",
    "Propoe notificar o responsavel da tarefa atrasada.",
    {
      tarefa_id: z.string().uuid(),
      tarefa_tipo: z.enum(["event_task", "cycle_phase_task"]),
      event_id: z.string().uuid().optional().nullable(),
      responsavel_profile_id: z.string().uuid().optional().nullable(),
      nome_tarefa: z.string(),
      dias_atrasada: z.number().int(),
      severidade: z.enum(["aviso", "alerta", "critico"]),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "eventos.alertar_tarefa_atrasada",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.tarefa_id,
            tarefa_id: args.tarefa_id,
            tarefa_tipo: args.tarefa_tipo,
            event_id: args.event_id || null,
            responsavel_profile_id: args.responsavel_profile_id || null,
            nome_tarefa: args.nome_tarefa,
            dias_atrasada: args.dias_atrasada,
            severidade: args.severidade,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporAlertarTarefaSemResponsavel = tool(
    "propor_alertar_tarefa_sem_responsavel",
    "Propoe alertar o responsavel da AREA pra atribuir alguem na tarefa orfa.",
    {
      tarefa_id: z.string().uuid(),
      tarefa_tipo: z.enum(["event_task", "cycle_phase_task"]),
      event_id: z.string().uuid().optional().nullable(),
      area: z.string(),
      nome_tarefa: z.string(),
      dias_ate_evento: z.number().int().optional().nullable(),
      is_critica: z.boolean().default(false),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "eventos.alertar_tarefa_sem_responsavel",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.tarefa_id,
            tarefa_id: args.tarefa_id,
            tarefa_tipo: args.tarefa_tipo,
            event_id: args.event_id || null,
            area: args.area,
            nome_tarefa: args.nome_tarefa,
            dias_ate_evento: args.dias_ate_evento || null,
            is_critica: args.is_critica,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporAlertarEventoAtrasado = tool(
    "propor_alertar_evento_atrasado",
    "Propoe alertar o responsible do evento com baixa preparacao (muitas tarefas pendentes).",
    {
      event_id: z.string().uuid(),
      nome_evento: z.string(),
      data_evento: z.string(),
      pct_concluido: z.number().int(),
      pendentes: z.number().int(),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "eventos.alertar_evento_atrasado",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.event_id,
            event_id: args.event_id,
            nome_evento: args.nome_evento,
            data_evento: args.data_evento,
            pct_concluido: args.pct_concluido,
            pendentes: args.pendentes,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const tools = [proporAlertarTarefaAtrasada, proporAlertarTarefaSemResponsavel, proporAlertarEventoAtrasado];
  return { tools, toolNames: tools.map((t) => `mcp__eventos__${t.name}`) };
}
