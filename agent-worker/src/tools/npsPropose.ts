import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

const ok = (p: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true as const });

async function enfileirar(opts: { runId: string; action_type: string; action_label: string; reasoning: string; payload: Record<string, unknown> }) {
  const { data, error } = await supabase.from("agent_queue").insert({
    run_id: opts.runId, agent_type: "module_nps_watcher",
    action_type: opts.action_type, action_label: opts.action_label,
    description: opts.action_label, reasoning: opts.reasoning,
    payload: opts.payload, status: "pending",
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export function createNpsProposeTools(runId: string) {
  const proporBaixaResposta = tool(
    "propor_alertar_baixa_resposta",
    "Alerta criador da pesquisa pra divulgar mais.",
    {
      pesquisa_id: z.string().uuid(), titulo: z.string(),
      respostas_atuais: z.number().int(), dias_ativa: z.number().int(),
      criado_por: z.string().uuid().optional().nullable(),
      label: z.string().min(8).max(140), reasoning: z.string().min(20),
    },
    async (a) => {
      try {
        const id = await enfileirar({ runId, action_type: "nps.alertar_baixa_resposta", action_label: a.label, reasoning: a.reasoning,
          payload: { entity_id: a.pesquisa_id, pesquisa_id: a.pesquisa_id, titulo: a.titulo, respostas_atuais: a.respostas_atuais, dias_ativa: a.dias_ativa, criado_por: a.criado_por || null } });
        return ok({ proposta_id: id });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporAnalisePendente = tool(
    "propor_alertar_analise_pendente",
    "Alerta criador sobre pesquisa vencida sem analise IA.",
    {
      pesquisa_id: z.string().uuid(), titulo: z.string(),
      criado_por: z.string().uuid().optional().nullable(),
      label: z.string().min(8).max(140), reasoning: z.string().min(20),
    },
    async (a) => {
      try {
        const id = await enfileirar({ runId, action_type: "nps.alertar_analise_pendente", action_label: a.label, reasoning: a.reasoning,
          payload: { entity_id: a.pesquisa_id, pesquisa_id: a.pesquisa_id, titulo: a.titulo, criado_por: a.criado_por || null } });
        return ok({ proposta_id: id });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const proporDetrator = tool(
    "propor_alertar_detrator",
    "Alerta lider de area sobre detrator recente (score <= 6).",
    {
      resposta_id: z.string().uuid(), pesquisa_id: z.string().uuid(),
      score: z.number().int(), comentario: z.string().optional().nullable(),
      area: z.string().optional().nullable(),
      label: z.string().min(8).max(140), reasoning: z.string().min(20),
    },
    async (a) => {
      try {
        const id = await enfileirar({ runId, action_type: "nps.alertar_detrator", action_label: a.label, reasoning: a.reasoning,
          payload: { entity_id: a.resposta_id, resposta_id: a.resposta_id, pesquisa_id: a.pesquisa_id, score: a.score, comentario: a.comentario || null, area: a.area || null } });
        return ok({ proposta_id: id });
      } catch (e) { return fail((e as Error).message); }
    }
  );

  const tools = [proporBaixaResposta, proporAnalisePendente, proporDetrator];
  return { tools, toolNames: tools.map((t) => `mcp__nps__${t.name}`) };
}
