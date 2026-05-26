import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

const ok = (p: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true as const });

export const listarPesquisasBaixaResposta = tool(
  "listar_pesquisas_baixa_resposta",
  "Lista nps_pesquisas ativas ha N dias+ com poucas respostas.",
  { dias_minimos: z.number().int().min(1).max(60).default(7), max_respostas: z.number().int().min(0).max(50).default(2), limit: z.number().int().min(1).max(30).default(20) },
  async ({ dias_minimos, max_respostas, limit }) => {
    const corte = new Date();
    corte.setDate(corte.getDate() - dias_minimos);
    const { data: pesquisas, error } = await supabase
      .from("nps_pesquisas").select("id, titulo, area, valor, data_inicio, data_fim, status, created_at")
      .eq("status", "ativa").lt("data_inicio", corte.toISOString().slice(0, 10)).limit(limit * 2);
    if (error) return fail(error.message);
    if (!pesquisas?.length) return ok({ total: 0, itens: [] });

    const ids = pesquisas.map((p) => p.id);
    const { data: respostas } = await supabase.from("nps_respostas").select("pesquisa_id").in("pesquisa_id", ids).limit(5000);
    const counts: Record<string, number> = {};
    for (const r of (respostas || []) as Array<{ pesquisa_id: string }>) counts[r.pesquisa_id] = (counts[r.pesquisa_id] || 0) + 1;

    const baixa = pesquisas.filter((p: any) => (counts[p.id] || 0) <= max_respostas).slice(0, limit);
    return ok({ total: baixa.length, itens: baixa.map((p: any) => ({ ...p, respostas: counts[p.id] || 0 })) });
  }
);

export const listarPesquisasVencidasSemAnalise = tool(
  "listar_pesquisas_vencidas_sem_analise",
  "nps_pesquisas com data_fim passada e analise_ia ainda NULL.",
  { limit: z.number().int().min(1).max(30).default(15) },
  async ({ limit }) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("nps_pesquisas").select("id, titulo, area, valor, data_fim, status, analise_ia, criado_por")
      .lt("data_fim", hoje).is("analise_ia", null).limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarDetratoresRecentes = tool(
  "listar_detratores_recentes",
  "Respostas com score <= 6 nas ultimas 24h.",
  { limit: z.number().int().min(1).max(30).default(15) },
  async ({ limit }) => {
    const corte = new Date();
    corte.setHours(corte.getHours() - 24);
    const { data, error } = await supabase
      .from("nps_respostas").select("id, pesquisa_id, score, comentario, nome_publico, created_at")
      .lte("score", 6).gte("created_at", corte.toISOString())
      .order("created_at", { ascending: false }).limit(limit);
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

export const npsReadTools = [listarPesquisasBaixaResposta, listarPesquisasVencidasSemAnalise, listarDetratoresRecentes, verificarPropostaExistente];
export const npsReadToolNames = npsReadTools.map((t) => `mcp__nps__${t.name}`);
