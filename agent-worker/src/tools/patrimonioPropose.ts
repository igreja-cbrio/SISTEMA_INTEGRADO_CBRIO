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
      run_id: opts.runId, agent_type: "module_patrimonio_watcher",
      action_type: opts.action_type, action_label: opts.action_label,
      description: opts.action_label, reasoning: opts.reasoning,
      payload: opts.payload, status: "pending",
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createPatrimonioProposeTools(runId: string) {
  const proporManutencao = tool(
    "propor_alertar_bem_manutencao_longa",
    "Propoe alertar sobre bem em manutencao ha tempo demais.",
    {
      bem_id: z.string().uuid(),
      nome_bem: z.string(),
      dias_em_manutencao: z.number().int(),
      valor_aquisicao: z.number().nullable().optional(),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "pat.alertar_manutencao_longa",
          action_label: args.label, reasoning: args.reasoning,
          payload: {
            entity_id: args.bem_id, bem_id: args.bem_id,
            nome_bem: args.nome_bem, dias_em_manutencao: args.dias_em_manutencao,
            valor_aquisicao: args.valor_aquisicao || null,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporEmprestado = tool(
    "propor_alertar_bem_emprestado",
    "Propoe alertar sobre bem emprestado sem retorno.",
    {
      bem_id: z.string().uuid(),
      nome_bem: z.string(),
      dias_emprestado: z.number().int(),
      valor_aquisicao: z.number().nullable().optional(),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "pat.alertar_bem_emprestado",
          action_label: args.label, reasoning: args.reasoning,
          payload: {
            entity_id: args.bem_id, bem_id: args.bem_id,
            nome_bem: args.nome_bem, dias_emprestado: args.dias_emprestado,
            valor_aquisicao: args.valor_aquisicao || null,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporCadastroIncompleto = tool(
    "propor_alertar_bem_cadastro_incompleto",
    "Propoe alertar sobre bem valioso com cadastro incompleto.",
    {
      bem_id: z.string().uuid(),
      nome_bem: z.string(),
      valor_aquisicao: z.number(),
      campos_faltando: z.array(z.string()),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "pat.alertar_cadastro_incompleto",
          action_label: args.label, reasoning: args.reasoning,
          payload: {
            entity_id: args.bem_id, bem_id: args.bem_id,
            nome_bem: args.nome_bem, valor_aquisicao: args.valor_aquisicao,
            campos_faltando: args.campos_faltando,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const tools = [proporManutencao, proporEmprestado, proporCadastroIncompleto];
  return { tools, toolNames: tools.map((t) => `mcp__patrimonio__${t.name}`) };
}
