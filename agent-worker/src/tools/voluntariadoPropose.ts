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
      run_id: opts.runId, agent_type: "module_voluntariado_watcher",
      action_type: opts.action_type, action_label: opts.action_label,
      description: opts.action_label, reasoning: opts.reasoning,
      payload: opts.payload, status: "pending",
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createVoluntariadoProposeTools(runId: string) {
  const proporAlertarInativo = tool(
    "propor_alertar_voluntario_inativo",
    "Propoe alertar lider do ministerio sobre voluntario sem check-in ha 60d+.",
    {
      voluntario_id: z.string().uuid(),
      membro_id: z.string().uuid(),
      ministerio_id: z.string().uuid().optional().nullable(),
      nome_voluntario: z.string(),
      dias_sem_checkin: z.number().int(),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "vol.alertar_inativo",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.voluntario_id,
            voluntario_id: args.voluntario_id,
            membro_id: args.membro_id,
            ministerio_id: args.ministerio_id || null,
            nome_voluntario: args.nome_voluntario,
            dias_sem_checkin: args.dias_sem_checkin,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporAlertarPausa = tool(
    "propor_alertar_voluntario_pausa",
    "Propoe alertar lider sobre voluntario em pausa recente (30-60d sem check-in).",
    {
      voluntario_id: z.string().uuid(),
      membro_id: z.string().uuid(),
      ministerio_id: z.string().uuid().optional().nullable(),
      nome_voluntario: z.string(),
      dias_sem_checkin: z.number().int(),
      checkins_antes: z.number().int(),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "vol.alertar_pausa",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.voluntario_id,
            voluntario_id: args.voluntario_id,
            membro_id: args.membro_id,
            ministerio_id: args.ministerio_id || null,
            nome_voluntario: args.nome_voluntario,
            dias_sem_checkin: args.dias_sem_checkin,
            checkins_antes: args.checkins_antes,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const tools = [proporAlertarInativo, proporAlertarPausa];
  return { tools, toolNames: tools.map((t) => `mcp__voluntariado__${t.name}`) };
}
