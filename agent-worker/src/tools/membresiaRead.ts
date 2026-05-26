import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(p: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] }; }
function fail(m: string) { return { content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true }; }

export const listarDuplicadosDetectados = tool(
  "listar_duplicados_detectados",
  "Lista pares duplicados em vw_membros_duplicados.",
  {
    confianca_minima: z.number().min(0).max(1).default(0.8),
    limit: z.number().int().min(1).max(100).default(40),
  },
  async ({ confianca_minima, limit }) => {
    const { data, error } = await supabase
      .from("vw_membros_duplicados")
      .select("*")
      .gte("score", confianca_minima)
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarCadastrosPendentes = tool(
  "listar_cadastros_pendentes",
  "Lista mem_cadastros_pendentes com status='pendente' filtrando por idade minima.",
  {
    dias_minimo: z.number().int().min(0).max(365).default(0),
    limit: z.number().int().min(1).max(100).default(50),
  },
  async ({ dias_minimo, limit }) => {
    let q = supabase
      .from("mem_cadastros_pendentes")
      .select("id, nome, email, telefone, cpf, data_nascimento, origem, status, duplicado_de_id, created_at")
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (dias_minimo > 0) {
      const corte = new Date();
      corte.setDate(corte.getDate() - dias_minimo);
      q = q.lt("created_at", corte.toISOString());
    }
    const { data, error } = await q;
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

export const membresiaReadTools = [
  listarDuplicadosDetectados,
  listarCadastrosPendentes,
  verificarPropostaExistente,
];
export const membresiaReadToolNames = membresiaReadTools.map((t) => `mcp__membresia__${t.name}`);
