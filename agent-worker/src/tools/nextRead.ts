import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

const ok = (p: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true as const });

export const listarInscritosSemCheckin = tool(
  "listar_inscritos_sem_checkin",
  "Lista next_inscricoes com check_in_at NULL de eventos que ja aconteceram (next_eventos.data < hoje).",
  { limit: z.number().int().min(1).max(100).default(40) },
  async ({ limit }) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("next_inscricoes")
      .select("id, nome, sobrenome, telefone, evento_id, check_in_at, created_at, next_eventos!inner(titulo, data)")
      .is("check_in_at", null)
      .lt("next_eventos.data", hoje)
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarSemIndicacoes = tool(
  "listar_inscritos_sem_indicacoes",
  "Inscritos com check_in_at preenchido mas indicacao_marcada_em NULL ha N dias.",
  { dias_minimos: z.number().int().min(1).max(30).default(3), limit: z.number().int().min(1).max(50).default(30) },
  async ({ dias_minimos, limit }) => {
    const corte = new Date();
    corte.setDate(corte.getDate() - dias_minimos);
    const { data, error } = await supabase
      .from("next_inscricoes")
      .select("id, nome, sobrenome, telefone, evento_id, check_in_at, indicacao_marcada_em")
      .not("check_in_at", "is", null)
      .is("indicacao_marcada_em", null)
      .lt("check_in_at", corte.toISOString())
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const verificarPropostaExistente = tool(
  "verificar_proposta_existente",
  "Verifica idempotencia em agent_queue.",
  { action_type: z.string(), entity_id: z.string() },
  async ({ action_type, entity_id }) => {
    const { data, error } = await supabase
      .from("agent_queue").select("id").eq("action_type", action_type).eq("status", "pending").contains("payload", { entity_id }).limit(5);
    if (error) return fail(error.message);
    return ok({ existe: (data?.length || 0) > 0 });
  }
);

export const nextReadTools = [listarInscritosSemCheckin, listarSemIndicacoes, verificarPropostaExistente];
export const nextReadToolNames = nextReadTools.map((t) => `mcp__next__${t.name}`);
