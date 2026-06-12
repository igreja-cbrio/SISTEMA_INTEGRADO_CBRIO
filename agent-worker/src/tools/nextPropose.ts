import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

const ok = (p: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true as const });

async function enfileirar(opts: { runId: string; action_type: string; action_label: string; reasoning: string; payload: Record<string, unknown> }) {
  const { data, error } = await supabase.from("agent_queue").insert({
    run_id: opts.runId, agent_type: "module_next_watcher",
    action_type: opts.action_type, action_label: opts.action_label,
    description: opts.action_label, reasoning: opts.reasoning,
    payload: opts.payload, status: "pending",
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createNextProposeTools(runId: string) {
  const proporFollowupSemCheckin = tool(
    "propor_alertar_sem_checkin",
    "Propoe alertar time NEXT pra contatar inscrito que nao apareceu.",
    {
      inscricao_id: z.string().uuid(),
      nome: z.string(),
      telefone: z.string().optional().nullable(),
      label: z.string().min(8).max(140),
      reasoning: z.string().min(20),
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId, action_type: "next.alertar_sem_checkin",
          action_label: args.label, reasoning: args.reasoning,
          payload: { entity_id: args.inscricao_id, inscricao_id: args.inscricao_id, nome: args.nome, telefone: args.telefone || null },
        });
        return ok({ proposta_id: id });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporIndicacaoPendente = tool(
    "propor_alertar_indicacao_pendente",
    "Propoe alertar time NEXT pra preencher indicacoes (batismo/servir/grupo).",
    {
      inscricao_id: z.string().uuid(),
      nome: z.string(),
      dias_sem_indicacao: z.number().int(),
      label: z.string().min(8).max(140),
      reasoning: z.string().min(20),
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId, action_type: "next.alertar_indicacao_pendente",
          action_label: args.label, reasoning: args.reasoning,
          payload: { entity_id: args.inscricao_id, inscricao_id: args.inscricao_id, nome: args.nome, dias_sem_indicacao: args.dias_sem_indicacao },
        });
        return ok({ proposta_id: id });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const tools = [proporFollowupSemCheckin, proporIndicacaoPendente];
  return { tools, toolNames: tools.map((t) => `mcp__next__${t.name}`) };
}
