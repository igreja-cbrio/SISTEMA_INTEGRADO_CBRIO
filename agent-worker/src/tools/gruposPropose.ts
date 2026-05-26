import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

const ok = (p: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true as const });

async function enfileirar(opts: { runId: string; action_type: string; action_label: string; reasoning: string; payload: Record<string, unknown> }) {
  const { data, error } = await supabase.from("agent_queue").insert({
    run_id: opts.runId, agent_type: "module_grupos_watcher",
    action_type: opts.action_type, action_label: opts.action_label,
    description: opts.action_label, reasoning: opts.reasoning,
    payload: opts.payload, status: "pending",
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createGruposProposeTools(runId: string) {
  const proporSemEncontro = tool(
    "propor_alertar_grupo_sem_encontro",
    "Alerta supervisor sobre grupo sem encontro recente.",
    {
      grupo_id: z.string().uuid(), nome_grupo: z.string(),
      lider_id: z.string().uuid().optional().nullable(),
      supervisor_id: z.string().uuid().optional().nullable(),
      dias_sem_encontro: z.number().int(),
      label: z.string().min(8).max(140), reasoning: z.string().min(20),
    },
    async (a) => {
      try {
        const id = await enfileirar({ runId, action_type: "grupos.alertar_sem_encontro", action_label: a.label, reasoning: a.reasoning,
          payload: { entity_id: a.grupo_id, grupo_id: a.grupo_id, nome_grupo: a.nome_grupo, lider_id: a.lider_id || null, supervisor_id: a.supervisor_id || null, dias_sem_encontro: a.dias_sem_encontro } });
        return ok({ proposta_id: id });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporSemLider = tool(
    "propor_alertar_grupo_sem_lider",
    "Alerta admin de grupos sobre grupo sem lider atribuido.",
    {
      grupo_id: z.string().uuid(), nome_grupo: z.string(),
      label: z.string().min(8).max(140), reasoning: z.string().min(20),
    },
    async (a) => {
      try {
        const id = await enfileirar({ runId, action_type: "grupos.alertar_sem_lider", action_label: a.label, reasoning: a.reasoning,
          payload: { entity_id: a.grupo_id, grupo_id: a.grupo_id, nome_grupo: a.nome_grupo } });
        return ok({ proposta_id: id });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const tools = [proporSemEncontro, proporSemLider];
  return { tools, toolNames: tools.map((t) => `mcp__grupos__${t.name}`) };
}
