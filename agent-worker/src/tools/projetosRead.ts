import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

const ok = (p: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true as const });

export const listarProjetosAtrasados = tool(
  "listar_projetos_atrasados",
  "Lista projects com date_end < hoje e status != concluido.",
  { limit: z.number().int().min(1).max(50).default(30) },
  async ({ limit }) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("projects").select("id, name, status, date_end, area, leader_id, responsible_id, leader, responsible")
      .lt("date_end", hoje).neq("status", "concluido").is("deleted_at", null).limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarProjetosSemLider = tool(
  "listar_projetos_sem_lider",
  "Projetos ativos sem leader_id e sem responsible_id.",
  { limit: z.number().int().min(1).max(50).default(20) },
  async ({ limit }) => {
    const { data, error } = await supabase
      .from("projects").select("id, name, status, area, date_end, created_at")
      .is("leader_id", null).is("responsible_id", null).is("deleted_at", null)
      .neq("status", "concluido").limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarProjetosSemUpdate = tool(
  "listar_projetos_sem_update",
  "Projetos em status 'em_andamento' sem updated_at nos ultimos N dias.",
  { dias: z.number().int().min(7).max(180).default(30), limit: z.number().int().min(1).max(50).default(20) },
  async ({ dias, limit }) => {
    const corte = new Date(); corte.setDate(corte.getDate() - dias);
    const { data, error } = await supabase
      .from("projects").select("id, name, status, area, leader_id, responsible_id, updated_at, date_end")
      .eq("status", "em_andamento").lt("updated_at", corte.toISOString()).is("deleted_at", null).limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const verificarPropostaExistente = tool(
  "verificar_proposta_existente", "Idempotencia.",
  { action_type: z.string(), entity_id: z.string() },
  async ({ action_type, entity_id }) => {
    const { data } = await supabase.from("agent_queue").select("id").eq("action_type", action_type).eq("status", "pending").contains("payload", { entity_id }).limit(5);
    return ok({ existe: (data?.length || 0) > 0 });
  }
);

export const projetosReadTools = [listarProjetosAtrasados, listarProjetosSemLider, listarProjetosSemUpdate, verificarPropostaExistente];
export const projetosReadToolNames = projetosReadTools.map((t) => `mcp__projetos__${t.name}`);
