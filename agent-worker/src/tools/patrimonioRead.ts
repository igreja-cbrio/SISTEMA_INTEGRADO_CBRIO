import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(p: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] }; }
function fail(m: string) { return { content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true }; }

export const listarBensPorStatus = tool(
  "listar_bens_por_status",
  "Lista pat_bens filtrados por status (manutencao, emprestado, ativo etc).",
  {
    status: z.string(),
    dias_minimos_no_status: z.number().int().min(0).max(365).default(0).describe("Filtra bens com created_at ou movimentacao mais antiga que N dias."),
    limit: z.number().int().min(1).max(100).default(50),
  },
  async ({ status, dias_minimos_no_status, limit }) => {
    let q = supabase
      .from("pat_bens")
      .select("id, codigo_barras, nome, descricao, categoria_id, localizacao_id, marca, modelo, valor_aquisicao, data_aquisicao, status, foto_url, created_at, updated_at")
      .eq("status", status)
      .order("updated_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (dias_minimos_no_status > 0) {
      const corte = new Date();
      corte.setDate(corte.getDate() - dias_minimos_no_status);
      q = q.lt("updated_at", corte.toISOString());
    }
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarBensIncompletos = tool(
  "listar_bens_incompletos",
  "Lista pat_bens valiosos (>R$500) com qualidade de cadastro ruim · sem codigo_barras OU localizacao OU foto.",
  {
    valor_minimo: z.number().min(0).default(500),
    dias_min_cadastro: z.number().int().min(0).max(365).default(30),
    limit: z.number().int().min(1).max(50).default(30),
  },
  async ({ valor_minimo, dias_min_cadastro, limit }) => {
    const corte = new Date();
    corte.setDate(corte.getDate() - dias_min_cadastro);
    const { data, error } = await supabase
      .from("pat_bens")
      .select("id, codigo_barras, nome, valor_aquisicao, localizacao_id, foto_url, status, created_at")
      .gte("valor_aquisicao", valor_minimo)
      .lte("created_at", corte.toISOString())
      .not("status", "in", "(baixado,descartado)")
      .or("codigo_barras.is.null,localizacao_id.is.null,foto_url.is.null")
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const buscarUltimaMovimentacao = tool(
  "buscar_ultima_movimentacao",
  "Pra um bem_id, retorna a movimentacao mais recente em pat_movimentacoes.",
  { bem_id: z.string().uuid() },
  async ({ bem_id }) => {
    const { data, error } = await supabase
      .from("pat_movimentacoes")
      .select("*")
      .eq("bem_id", bem_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return fail(error.message);
    return ok({ ultima: (data && data[0]) || null });
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

export const patrimonioReadTools = [
  listarBensPorStatus,
  listarBensIncompletos,
  buscarUltimaMovimentacao,
  verificarPropostaExistente,
];
export const patrimonioReadToolNames = patrimonioReadTools.map((t) => `mcp__patrimonio__${t.name}`);
