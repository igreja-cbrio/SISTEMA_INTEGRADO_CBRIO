import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(p: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] }; }
function fail(m: string) { return { content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true }; }

const reasoning = z.string().min(20);
const label = z.string().min(8).max(140);

async function enfileirar(opts: { runId: string; action_type: string; action_label: string; reasoning: string; payload: Record<string, unknown>; }) {
  const { data, error } = await supabase.from("agent_queue").insert({
    run_id: opts.runId, agent_type: "module_cerebro_watcher",
    action_type: opts.action_type, action_label: opts.action_label,
    description: opts.action_label, reasoning: opts.reasoning,
    payload: opts.payload, status: "pending",
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createCerebroProposeTools(runId: string) {
  const proporErros = tool(
    "propor_alertar_erros_processamento",
    "Propoe alertar admin sobre acumulo de erros no Cerebro.",
    {
      qtd_erros: z.number().int(),
      periodo_horas: z.number().int(),
      amostra_arquivos: z.array(z.string()).max(10),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "cerebro.alertar_erros",
          action_label: args.label, reasoning: args.reasoning,
          payload: {
            entity_id: `cerebro_erros_${new Date().toISOString().slice(0, 10)}`,
            qtd_erros: args.qtd_erros,
            periodo_horas: args.periodo_horas,
            amostra_arquivos: args.amostra_arquivos,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporFilaTravada = tool(
    "propor_alertar_fila_travada",
    "Propoe alertar admin sobre fila travada (pendentes antigos).",
    {
      qtd_pendentes: z.number().int(),
      horas_minimo: z.number().int(),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "cerebro.alertar_fila_travada",
          action_label: args.label, reasoning: args.reasoning,
          payload: {
            entity_id: `cerebro_fila_${new Date().toISOString().slice(0, 10)}`,
            qtd_pendentes: args.qtd_pendentes,
            horas_minimo: args.horas_minimo,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporCusto = tool(
    "propor_alertar_custo_crescente",
    "Propoe alertar admin sobre custo de tokens crescente.",
    {
      tokens_periodo: z.number(),
      dias: z.number().int(),
      itens_processados: z.number().int(),
      label, reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "cerebro.alertar_custo",
          action_label: args.label, reasoning: args.reasoning,
          payload: {
            entity_id: `cerebro_custo_${new Date().toISOString().slice(0, 10)}`,
            tokens_periodo: args.tokens_periodo,
            dias: args.dias,
            itens_processados: args.itens_processados,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const tools = [proporErros, proporFilaTravada, proporCusto];
  return { tools, toolNames: tools.map((t) => `mcp__cerebro__${t.name}`) };
}
