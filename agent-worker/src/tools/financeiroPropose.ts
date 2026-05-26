import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function fail(msg: string) {
  return {
    content: [{ type: "text" as const, text: `ERRO: ${msg}` }],
    isError: true,
  };
}

const reasoningSchema = z
  .string()
  .min(20)
  .describe(
    "Explicacao em portugues do porque essa acao faz sentido. Sera lida pelo aprovador humano. Min 20 chars."
  );

const labelSchema = z
  .string()
  .min(8)
  .max(140)
  .describe(
    "Titulo curto da acao pra UI (ex: 'Categorizar PIX R$ 50 de Maria Silva'). Min 8 chars, max 140."
  );

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
      agent_type: "module_financeiro_executor",
      action_type: opts.action_type,
      action_label: opts.action_label,
      description: opts.action_label, // mantem compat com coluna NOT NULL antiga
      reasoning: opts.reasoning,
      payload: opts.payload,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createFinanceiroProposeTools(runId: string) {
  const proporCategorizarTransacao = tool(
    "propor_categorizar_transacao",
    "Propoe uma classificacao pra lancamento em fin_fila_classificacao. NAO aplica · so coloca em agent_queue pra humano aprovar. Idempotencia: chame verificar_proposta_existente antes.",
    {
      fila_id: z.string().uuid(),
      plano_contas_id: z.string().uuid().optional().nullable(),
      centro_custo_id: z.string().uuid().optional().nullable(),
      identificador_centavo: z.string().optional().nullable(),
      label: labelSchema,
      reasoning: reasoningSchema,
    },
    async ({ fila_id, plano_contas_id, centro_custo_id, identificador_centavo, label, reasoning }) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "fin.categorize_transaction",
          action_label: label,
          reasoning,
          payload: {
            entity_id: fila_id,
            fila_id,
            plano_contas_id: plano_contas_id || null,
            centro_custo_id: centro_custo_id || null,
            identificador_centavo: identificador_centavo || null,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const proporPagarConta = tool(
    "propor_pagar_conta",
    "Propoe marcar uma conta_pagar como paga, vinculando opcionalmente a uma transacao existente. NAO aplica · so coloca em agent_queue. Use APENAS se buscar_transacao_match retornou candidato confiavel.",
    {
      conta_pagar_id: z.string().uuid(),
      data_pagamento: z.string().describe("YYYY-MM-DD"),
      transacao_id: z.string().uuid().optional().nullable(),
      conta_id: z.string().uuid().optional().nullable(),
      label: labelSchema,
      reasoning: reasoningSchema,
    },
    async ({ conta_pagar_id, data_pagamento, transacao_id, conta_id, label, reasoning }) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "fin.mark_payable_paid",
          action_label: label,
          reasoning,
          payload: {
            entity_id: conta_pagar_id,
            conta_pagar_id,
            data_pagamento,
            transacao_id: transacao_id || null,
            conta_id: conta_id || null,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const proporDecidirReembolso = tool(
    "propor_decidir_reembolso",
    "Propoe aprovar ou rejeitar um reembolso (fin_reembolsos). NAO aplica · so coloca em agent_queue. Decisao DEVE ser 'aprovar' ou 'rejeitar'.",
    {
      reembolso_id: z.string().uuid(),
      decisao: z.enum(["aprovar", "rejeitar"]),
      label: labelSchema,
      reasoning: reasoningSchema,
    },
    async ({ reembolso_id, decisao, label, reasoning }) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "fin.reimbursement_decision",
          action_label: label,
          reasoning,
          payload: {
            entity_id: reembolso_id,
            reembolso_id,
            decisao,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const proporAtenderAlerta = tool(
    "propor_atender_alerta",
    "Propoe marcar um alerta financeiro como atendido (fin_alertas.atendido_em). NAO aplica · so coloca em agent_queue.",
    {
      alerta_id: z.string().uuid(),
      label: labelSchema,
      reasoning: reasoningSchema,
    },
    async ({ alerta_id, label, reasoning }) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "fin.atender_alerta",
          action_label: label,
          reasoning,
          payload: { entity_id: alerta_id, alerta_id },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const tools = [
    proporCategorizarTransacao,
    proporPagarConta,
    proporDecidirReembolso,
    proporAtenderAlerta,
  ];

  return {
    tools,
    toolNames: tools.map((t) => `mcp__financeiro__${t.name}`),
  };
}
