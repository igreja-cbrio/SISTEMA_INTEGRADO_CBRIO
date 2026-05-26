import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function fail(msg: string) {
  return { content: [{ type: "text" as const, text: `ERRO: ${msg}` }], isError: true };
}

const reasoningSchema = z
  .string()
  .min(30)
  .describe(
    "Explicacao em portugues do porque alertar esse lider · DEVE incluir numeros concretos (valor atual vs meta, tendencia, dias desatualizado). Min 30 chars."
  );

const labelSchema = z
  .string()
  .min(10)
  .max(140)
  .describe("Titulo curto pra UI (ex: 'Alertar Mariane: KIDS-01 critico ha 21 dias'). Min 10, max 140.");

export function createKpisProposeTools(runId: string) {
  const proporAlertarLider = tool(
    "propor_alertar_lider",
    "Propoe enviar notificacao in-app pra um lider sobre um KPI/OKR critico ou abandonado. NAO envia direto · vira proposta em agent_queue pra humano aprovar.",
    {
      kpi_id: z.string(),
      lider_funcionario_id: z.string().uuid(),
      severidade: z.enum(["info", "aviso", "critico"]),
      titulo: z.string().min(5).max(100),
      mensagem: z.string().min(20).max(500),
      label: labelSchema,
      reasoning: reasoningSchema,
    },
    async ({ kpi_id, lider_funcionario_id, severidade, titulo, mensagem, label, reasoning }) => {
      try {
        const { data, error } = await supabase
          .from("agent_queue")
          .insert({
            run_id: runId,
            agent_type: "module_kpis_watcher",
            action_type: "kpis.alertar_lider",
            action_label: label,
            description: label,
            reasoning,
            payload: {
              entity_id: kpi_id,
              kpi_id,
              lider_funcionario_id,
              severidade,
              titulo,
              mensagem,
            },
            status: "pending",
          })
          .select("id")
          .single();
        if (error) return fail(error.message);
        return ok({ proposta_id: data.id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const tools = [proporAlertarLider];
  return {
    tools,
    toolNames: tools.map((t) => `mcp__kpis__${t.name}`),
  };
}
