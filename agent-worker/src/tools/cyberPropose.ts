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

export function createCyberProposeTools(runId: string) {
  const proporAchadoSeguranca = tool(
    "propor_achado_seguranca",
    "Propoe um achado de seguranca (findings) que vai pra fila de aprovacao humana. NAO aplica nada. Regras: descricao SEM PII (sem nomes/CPF/telefone/e-mail/valores); severidade obrigatoria; no maximo 8 por execucao.",
    {
      severidade: z.enum(["critica", "alta", "media", "baixa"]),
      titulo: z.string().min(8).max(120).describe("Titulo curto do achado, sem PII"),
      descricao_sem_pii: z.string().min(20).describe("Risco e onde esta (tabela/entidade por id). SEM dados pessoais."),
      recomendacao: z.string().min(10).describe("O que o time deveria fazer"),
      evidencia_ref: z.string().optional().describe("Referencia opcional (ex: run_id, tabela)"),
    },
    async ({ severidade, titulo, descricao_sem_pii, recomendacao, evidencia_ref }) => {
      try {
        const { data, error } = await supabase
          .from("agent_queue")
          .insert({
            run_id: runId,
            agent_type: "cyber_agent",
            action_type: "cyber.achado_seguranca",
            action_label: titulo,
            description: titulo,
            reasoning: descricao_sem_pii,
            payload: {
              severidade,
              descricao_sem_pii,
              recomendacao,
              evidencia_ref: evidencia_ref || null,
            },
            status: "pending",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return ok({ proposta_id: data.id, status: "enfileirada", severidade });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const tools = [proporAchadoSeguranca];
  return {
    tools,
    toolNames: tools.map((t) => `mcp__cyber__${t.name}`),
  };
}
