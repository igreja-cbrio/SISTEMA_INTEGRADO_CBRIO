import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

const ok = (p: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true as const });

async function enfileirar(opts: { runId: string; action_type: string; action_label: string; reasoning: string; payload: Record<string, unknown> }) {
  const { data, error } = await supabase.from("agent_queue").insert({
    run_id: opts.runId, agent_type: "module_projetos_watcher",
    action_type: opts.action_type, action_label: opts.action_label,
    description: opts.action_label, reasoning: opts.reasoning,
    payload: opts.payload, status: "pending",
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createProjetosProposeTools(runId: string) {
  const proporAtrasado = tool(
    "propor_alertar_projeto_atrasado",
    "Alerta lider/responsavel sobre projeto atrasado.",
    {
      projeto_id: z.string().uuid(), nome_projeto: z.string(),
      dias_atrasado: z.number().int(),
      leader_id: z.string().uuid().optional().nullable(),
      responsible_id: z.string().uuid().optional().nullable(),
      label: z.string().min(8).max(140), reasoning: z.string().min(20),
    },
    async (a) => {
      try {
        const id = await enfileirar({ runId, action_type: "proj.alertar_atrasado", action_label: a.label, reasoning: a.reasoning,
          payload: { entity_id: a.projeto_id, projeto_id: a.projeto_id, nome_projeto: a.nome_projeto, dias_atrasado: a.dias_atrasado, leader_id: a.leader_id || null, responsible_id: a.responsible_id || null } });
        return ok({ proposta_id: id });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporSemLider = tool(
    "propor_alertar_projeto_sem_lider",
    "Alerta admin sobre projeto sem leader/responsible.",
    {
      projeto_id: z.string().uuid(), nome_projeto: z.string(),
      label: z.string().min(8).max(140), reasoning: z.string().min(20),
    },
    async (a) => {
      try {
        const id = await enfileirar({ runId, action_type: "proj.alertar_sem_lider", action_label: a.label, reasoning: a.reasoning,
          payload: { entity_id: a.projeto_id, projeto_id: a.projeto_id, nome_projeto: a.nome_projeto } });
        return ok({ proposta_id: id });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporSemUpdate = tool(
    "propor_alertar_projeto_sem_update",
    "Alerta lider sobre projeto em andamento sem update.",
    {
      projeto_id: z.string().uuid(), nome_projeto: z.string(),
      dias_sem_update: z.number().int(),
      leader_id: z.string().uuid().optional().nullable(),
      label: z.string().min(8).max(140), reasoning: z.string().min(20),
    },
    async (a) => {
      try {
        const id = await enfileirar({ runId, action_type: "proj.alertar_sem_update", action_label: a.label, reasoning: a.reasoning,
          payload: { entity_id: a.projeto_id, projeto_id: a.projeto_id, nome_projeto: a.nome_projeto, dias_sem_update: a.dias_sem_update, leader_id: a.leader_id || null } });
        return ok({ proposta_id: id });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const tools = [proporAtrasado, proporSemLider, proporSemUpdate];
  return { tools, toolNames: tools.map((t) => `mcp__projetos__${t.name}`) };
}
