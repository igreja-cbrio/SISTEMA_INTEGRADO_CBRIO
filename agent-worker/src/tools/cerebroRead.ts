import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(p: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] }; }
function fail(m: string) { return { content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true }; }

export const listarErrosProcessamento = tool(
  "listar_erros_processamento",
  "Lista cerebro_fila com status='erro' nos ultimos N dias. Retorna amostra com erro_mensagem.",
  {
    dias: z.number().int().min(1).max(30).default(2),
    limit: z.number().int().min(1).max(50).default(30),
  },
  async ({ dias, limit }) => {
    const corte = new Date();
    corte.setDate(corte.getDate() - dias);
    const { data, error } = await supabase
      .from("cerebro_fila")
      .select("id, nome_arquivo, biblioteca, status, erro_mensagem, detectado_em, processado_em")
      .eq("status", "erro")
      .gte("detectado_em", corte.toISOString())
      .order("detectado_em", { ascending: false })
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarFilaPendenteAntiga = tool(
  "listar_fila_pendente_antiga",
  "Lista cerebro_fila com status='pendente' detectado ha mais de N horas (default 24h).",
  {
    horas: z.number().int().min(1).max(168).default(24),
    limit: z.number().int().min(1).max(100).default(40),
  },
  async ({ horas, limit }) => {
    const corte = new Date();
    corte.setHours(corte.getHours() - horas);
    const { data, error } = await supabase
      .from("cerebro_fila")
      .select("id, nome_arquivo, biblioteca, status, detectado_em, tamanho_bytes")
      .eq("status", "pendente")
      .lt("detectado_em", corte.toISOString())
      .order("detectado_em", { ascending: true })
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const resumirCustoUltimoPeriodo = tool(
  "resumir_custo_ultimo_periodo",
  "Soma tokens_usados em cerebro_fila no ultimo periodo. Retorna total e quantidade de itens processados.",
  {
    dias: z.number().int().min(1).max(60).default(7),
  },
  async ({ dias }) => {
    const corte = new Date();
    corte.setDate(corte.getDate() - dias);
    const { data, error } = await supabase
      .from("cerebro_fila")
      .select("tokens_usados, status")
      .gte("processado_em", corte.toISOString())
      .not("tokens_usados", "is", null)
      .limit(2000);
    if (error) return fail(error.message);
    const rows = (data || []) as Array<{ tokens_usados: number | null; status: string }>;
    const totalTokens = rows.reduce((s, r) => s + (Number(r.tokens_usados) || 0), 0);
    const sucesso = rows.filter((r) => r.status === "processado").length;
    const erros = rows.filter((r) => r.status === "erro").length;
    return ok({
      dias,
      total_tokens: totalTokens,
      total_itens: rows.length,
      processados_ok: sucesso,
      erros,
    });
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

export const cerebroReadTools = [
  listarErrosProcessamento,
  listarFilaPendenteAntiga,
  resumirCustoUltimoPeriodo,
  verificarPropostaExistente,
];
export const cerebroReadToolNames = cerebroReadTools.map((t) => `mcp__cerebro__${t.name}`);
