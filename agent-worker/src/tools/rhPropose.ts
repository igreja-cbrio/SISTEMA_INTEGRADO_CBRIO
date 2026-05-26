import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function fail(msg: string) {
  return { content: [{ type: "text" as const, text: `ERRO: ${msg}` }], isError: true };
}

const reasoning = z.string().min(20).describe("Por que essa acao faz sentido. Min 20 chars.");
const label = z.string().min(8).max(140).describe("Titulo curto pra UI. 8-140 chars.");

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
      agent_type: "module_rh_executor",
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

export function createRhProposeTools(runId: string) {
  const proporAlertarDocumento = tool(
    "propor_alertar_documento",
    "Propoe notificar RH sobre documento de funcionario com data_expiracao proxima.",
    {
      documento_id: z.string().uuid(),
      funcionario_id: z.string().uuid(),
      tipo_documento: z.string(),
      data_expiracao: z.string().describe("YYYY-MM-DD"),
      severidade: z.enum(["aviso", "alerta", "critico"]),
      label,
      reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "rh.alertar_documento_vencendo",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.documento_id,
            documento_id: args.documento_id,
            funcionario_id: args.funcionario_id,
            tipo_documento: args.tipo_documento,
            data_expiracao: args.data_expiracao,
            severidade: args.severidade,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const proporAlertarTreinamento = tool(
    "propor_alertar_treinamento",
    "Propoe notificar funcionario + gestor sobre treinamento pendente.",
    {
      treinamento_funcionario_id: z.string().uuid(),
      funcionario_id: z.string().uuid(),
      label,
      reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "rh.alertar_treinamento_pendente",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.treinamento_funcionario_id,
            treinamento_funcionario_id: args.treinamento_funcionario_id,
            funcionario_id: args.funcionario_id,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const proporAlertarFerias = tool(
    "propor_alertar_ferias",
    "Propoe notificar RH e gestor sobre ferias a vencer (periodo aquisitivo de 12 meses).",
    {
      funcionario_id: z.string().uuid(),
      data_admissao: z.string().describe("YYYY-MM-DD"),
      label,
      reasoning,
    },
    async (args) => {
      try {
        const id = await enfileirar({
          runId,
          action_type: "rh.alertar_ferias_vencendo",
          action_label: args.label,
          reasoning: args.reasoning,
          payload: {
            entity_id: args.funcionario_id,
            funcionario_id: args.funcionario_id,
            data_admissao: args.data_admissao,
          },
        });
        return ok({ proposta_id: id, status: "enfileirada" });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const tools = [proporAlertarDocumento, proporAlertarTreinamento, proporAlertarFerias];
  return { tools, toolNames: tools.map((t) => `mcp__rh__${t.name}`) };
}
