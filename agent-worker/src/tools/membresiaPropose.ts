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
      run_id: opts.runId, agent_type: "module_membresia_watcher",
      action_type: opts.action_type, action_label: opts.action_label,
      description: opts.action_label, reasoning: opts.reasoning,
      payload: opts.payload, status: "pending",
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createMembresiaProposeTools(runId: string) {
  const proporAlertarDuplicado = tool(
    "propor_alertar_duplicado",
    "Propoe alertar admin de membresia sobre par duplicado detectado.",
    {
      membro_a_id: z.string().uuid(),
      membro_b_id: z.string().uuid(),
      nome_a: z.string(),
      nome_b: z.string(),
      score: z.number().min(0).max(1),
      motivos: z.array(z.string()),
      label, reasoning,
    },
    async (args) => {
      try {
        // entity_id agrega os 2 ids ordenados pra idempotencia
        const [aId, bId] = [args.membro_a_id, args.membro_b_id].sort();
        const entityId = `${aId}_${bId}`;
        const id = await enfileirar({
          runId,
          action_type: "mem.alertar_duplicado",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: entityId,
            membro_a_id: args.membro_a_id,
            membro_b_id: args.membro_b_id,
            nome_a: args.nome_a,
            nome_b: args.nome_b,
            score: args.score,
            motivos: args.motivos,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporAlertarCadastroParado = tool(
    "propor_alertar_cadastro_parado",
    "Propoe alertar equipe sobre cadastro pendente parado ha mais de 7 dias.",
    {
      cadastro_id: z.string().uuid(),
      nome: z.string(),
      origem: z.string().optional().nullable(),
      dias_parado: z.number().int(),
      severidade: z.enum(["alerta", "critico"]),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "mem.alertar_cadastro_parado",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.cadastro_id,
            cadastro_id: args.cadastro_id,
            nome: args.nome,
            origem: args.origem || null,
            dias_parado: args.dias_parado,
            severidade: args.severidade,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const tools = [proporAlertarDuplicado, proporAlertarCadastroParado];
  return { tools, toolNames: tools.map((t) => `mcp__membresia__${t.name}`) };
}
