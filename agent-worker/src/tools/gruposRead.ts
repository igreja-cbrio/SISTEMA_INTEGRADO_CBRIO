import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

const ok = (p: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true as const });

export const listarGruposAtivosSemEncontro = tool(
  "listar_grupos_sem_encontro",
  "Lista mem_grupos ativos sem encontro registrado nos ultimos N dias.",
  { dias: z.number().int().min(7).max(180).default(30), limit: z.number().int().min(1).max(100).default(40) },
  async ({ dias, limit }) => {
    const corte = new Date();
    corte.setDate(corte.getDate() - dias);
    // Pega encontros recentes
    const { data: encontros } = await supabase.from("mem_grupo_encontros").select("grupo_id").gte("data", corte.toISOString().slice(0, 10)).is("deleted_at", null).limit(1000);
    const comEncontro = new Set((encontros || []).map((e: any) => e.grupo_id));
    const { data: grupos, error } = await supabase
      .from("mem_grupos")
      .select("id, nome, lider_id, dia_semana, horario, bairro, status_temporada")
      .eq("ativo", true).is("deleted_at", null).limit(limit * 5);
    if (error) return fail(error.message);
    const semEncontro = (grupos || []).filter((g: any) => !comEncontro.has(g.id)).slice(0, limit);
    return ok({ total: semEncontro.length, dias_corte: dias, itens: semEncontro });
  }
);

export const listarGruposSemLider = tool(
  "listar_grupos_sem_lider",
  "Lista grupos ativos sem lider_id atribuido.",
  { limit: z.number().int().min(1).max(50).default(30) },
  async ({ limit }) => {
    const { data, error } = await supabase
      .from("mem_grupos").select("id, nome, lider_id, supervisor_id, bairro, dia_semana, horario")
      .eq("ativo", true).is("lider_id", null).is("deleted_at", null).limit(limit);
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

export const gruposReadTools = [listarGruposAtivosSemEncontro, listarGruposSemLider, verificarPropostaExistente];
export const gruposReadToolNames = gruposReadTools.map((t) => `mcp__grupos__${t.name}`);
