import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(p: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] }; }
function fail(m: string) { return { content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true }; }

export const listarSlaAtrasadas = tool(
  "listar_solicitacoes_sla_atrasadas",
  "Lista solicitacoes com SLA estourado (vw_solicitacoes_sla com sla_resposta_status ou sla_resolucao_status = atrasado).",
  {
    limit: z.number().int().min(1).max(100).default(50),
  },
  async ({ limit }) => {
    const { data, error } = await supabase
      .from("vw_solicitacoes_sla")
      .select("*")
      .or("sla_resposta_status.eq.atrasado,sla_resolucao_status.eq.atrasado")
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarUrgentesAbertas = tool(
  "listar_solicitacoes_urgentes_abertas",
  "Lista solicitacoes eh_urgente=true em status pendente ha mais de N horas.",
  {
    horas_minimo: z.number().int().min(1).max(168).default(24),
    limit: z.number().int().min(1).max(50).default(30),
  },
  async ({ horas_minimo, limit }) => {
    const corte = new Date();
    corte.setHours(corte.getHours() - horas_minimo);
    const { data, error } = await supabase
      .from("solicitacoes")
      .select(
        "id, titulo, categoria, area_responsavel, area_solicitante, status, eh_urgente, justificativa_urgencia, solicitante_id, responsavel_id, sla_resposta_deadline, created_at"
      )
      .eq("eh_urgente", true)
      .eq("status", "pendente")
      .is("deleted_at", null)
      .lt("created_at", corte.toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarMlRastreioParado = tool(
  "listar_ml_rastreio_parado",
  "Lista vw_solicitacoes_ml_pendentes com ml_last_status nao final e sem update ha mais de N dias.",
  {
    dias_minimo: z.number().int().min(1).max(60).default(5),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ dias_minimo, limit }) => {
    const corte = new Date();
    corte.setDate(corte.getDate() - dias_minimo);
    const { data, error } = await supabase
      .from("vw_solicitacoes_ml_pendentes")
      .select("*")
      .lt("ml_last_status_changed_at", corte.toISOString())
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const verificarPropostaExistente = tool(
  "verificar_proposta_existente",
  "Verifica se ja existe proposta pending em agent_queue.",
  { action_type: z.string(), entity_id: z.string() },
  async ({ action_type, entity_id }) => {
    const { data, error } = await supabase
      .from("agent_queue")
      .select("id, action_label, status, created_at")
      .eq("action_type", action_type)
      .eq("status", "pending")
      .contains("payload", { entity_id })
      .limit(5);
    if (error) return fail(error.message);
    return ok({ existe: (data?.length || 0) > 0, propostas: data || [] });
  }
);

export const logisticaReadTools = [
  listarSlaAtrasadas,
  listarUrgentesAbertas,
  listarMlRastreioParado,
  verificarPropostaExistente,
];
export const logisticaReadToolNames = logisticaReadTools.map((t) => `mcp__logistica__${t.name}`);
