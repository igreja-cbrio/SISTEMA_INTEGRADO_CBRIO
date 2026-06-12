import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function fail(msg: string) {
  return { content: [{ type: "text" as const, text: `ERRO: ${msg}` }], isError: true };
}

const reasoning = z.string().min(20).describe("Por que esse alerta · min 20 chars.");
const label = z.string().min(8).max(140).describe("Titulo curto pra UI.");

async function enfileirar(opts: {
  runId: string;
  action_type: string;
  action_label: string;
  reasoning: string;
  payload: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("agent_queue")
    .insert({
      run_id: opts.runId,
      agent_type: "module_cuidados_watcher",
      action_type: opts.action_type,
      action_label: opts.action_label,
      description: opts.action_label,
      reasoning: opts.reasoning,
      payload: opts.payload,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createCuidadosProposeTools(runId: string) {
  const proporAlertarJornada180 = tool(
    "propor_alertar_jornada180",
    "Propoe alertar o responsavel de cuidados sobre convertido com Jornada 180 parada.",
    {
      jornada_id: z.string().uuid(),
      responsavel_id: z.string().uuid().optional().nullable(),
      nome_convertido: z.string(),
      dias_parado: z.number().int(),
      severidade: z.enum(["aviso", "alerta", "critico"]),
      label,
      reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "cui.alertar_jornada180",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.jornada_id,
            jornada_id: args.jornada_id,
            responsavel_id: args.responsavel_id || null,
            nome_convertido: args.nome_convertido,
            dias_parado: args.dias_parado,
            severidade: args.severidade,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const proporAlertarVisitanteSemFollowup = tool(
    "propor_alertar_visitante",
    "Propoe alertar o time de integracao sobre visitante sem follow-up.",
    {
      visitante_id: z.string().uuid(),
      nome_visitante: z.string(),
      dias_desde_visita: z.number().int(),
      fez_decisao: z.boolean(),
      label,
      reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "cui.alertar_visitante",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.visitante_id,
            visitante_id: args.visitante_id,
            nome_visitante: args.nome_visitante,
            dias_desde_visita: args.dias_desde_visita,
            fez_decisao: args.fez_decisao,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const proporAlertarAcompanhamentoEstagnado = tool(
    "propor_alertar_acompanhamento",
    "Propoe alertar o responsavel sobre acompanhamento pastoral sem update ha tempos.",
    {
      acompanhamento_id: z.string().uuid(),
      responsavel_id: z.string().uuid().optional().nullable(),
      nome_acompanhado: z.string(),
      dias_aberto: z.number().int(),
      label,
      reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "cui.alertar_acompanhamento",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.acompanhamento_id,
            acompanhamento_id: args.acompanhamento_id,
            responsavel_id: args.responsavel_id || null,
            nome_acompanhado: args.nome_acompanhado,
            dias_aberto: args.dias_aberto,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const tools = [proporAlertarJornada180, proporAlertarVisitanteSemFollowup, proporAlertarAcompanhamentoEstagnado];
  return { tools, toolNames: tools.map((t) => `mcp__cuidados__${t.name}`) };
}
