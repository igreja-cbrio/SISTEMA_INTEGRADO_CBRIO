import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(p: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] }; }
function fail(m: string) { return { content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true }; }

const reasoning = z.string().min(20);
const label = z.string().min(8).max(140);

async function enfileirar(opts: {
  runId: string; action_type: string; action_label: string; reasoning: string; payload: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("agent_queue")
    .insert({
      run_id: opts.runId, agent_type: "module_logistica_watcher",
      action_type: opts.action_type, action_label: opts.action_label,
      description: opts.action_label, reasoning: opts.reasoning,
      payload: opts.payload, status: "pending",
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createLogisticaProposeTools(runId: string) {
  const proporAlertarSla = tool(
    "propor_alertar_sla_resposta",
    "Propoe alertar responsavel sobre SLA de resposta estourado.",
    {
      solicitacao_id: z.string().uuid(),
      titulo: z.string(),
      area_responsavel: z.string(),
      responsavel_id: z.string().uuid().optional().nullable(),
      horas_atrasada: z.number().int(),
      severidade: z.enum(["aviso", "alerta", "critico"]),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "log.alertar_sla_resposta",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.solicitacao_id,
            solicitacao_id: args.solicitacao_id,
            titulo: args.titulo,
            area_responsavel: args.area_responsavel,
            responsavel_id: args.responsavel_id || null,
            horas_atrasada: args.horas_atrasada,
            severidade: args.severidade,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporAlertarUrgente = tool(
    "propor_alertar_urgente",
    "Propoe alertar responsavel sobre solicitacao urgente nao atendida.",
    {
      solicitacao_id: z.string().uuid(),
      titulo: z.string(),
      area_responsavel: z.string(),
      responsavel_id: z.string().uuid().optional().nullable(),
      horas_aberta: z.number().int(),
      justificativa: z.string().optional().nullable(),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "log.alertar_urgente",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.solicitacao_id,
            solicitacao_id: args.solicitacao_id,
            titulo: args.titulo,
            area_responsavel: args.area_responsavel,
            responsavel_id: args.responsavel_id || null,
            horas_aberta: args.horas_aberta,
            justificativa: args.justificativa || null,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporAlertarMlParado = tool(
    "propor_alertar_ml_parado",
    "Propoe alertar solicitante sobre rastreio ML sem update.",
    {
      solicitacao_id: z.string().uuid(),
      titulo: z.string(),
      solicitante_id: z.string().uuid().optional().nullable(),
      ml_last_status: z.string(),
      dias_sem_update: z.number().int(),
      tracking_url: z.string().optional().nullable(),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "log.alertar_ml_parado",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.solicitacao_id,
            solicitacao_id: args.solicitacao_id,
            titulo: args.titulo,
            solicitante_id: args.solicitante_id || null,
            ml_last_status: args.ml_last_status,
            dias_sem_update: args.dias_sem_update,
            tracking_url: args.tracking_url || null,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const tools = [proporAlertarSla, proporAlertarUrgente, proporAlertarMlParado];
  return { tools, toolNames: tools.map((t) => `mcp__logistica__${t.name}`) };
}
