import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function fail(msg: string) {
  return { content: [{ type: "text" as const, text: `ERRO: ${msg}` }], isError: true };
}

export const listarKpisStatus = tool(
  "listar_kpis_status",
  "Lista KPIs taticos (vw_kpi_taticos_status) filtrados por status. Use 'critico'/'atrasado' pra ver problemas, 'no_alvo' pra confirmar conquistas.",
  {
    status: z.enum(["critico", "atrasado", "no_alvo", "sem_dado"]).optional(),
    area: z.string().optional(),
    is_okr: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  },
  async ({ status, area, is_okr, limit }) => {
    let q = supabase
      .from("vw_kpi_taticos_status")
      .select(
        "id, area, indicador, periodicidade, status, ultimo_valor, ultima_data, meta_efetiva, lider_nome, lider_funcionario_id, is_okr, pilar, valores"
      )
      .eq("ativo", true)
      .order("status", { ascending: true })
      .limit(limit);
    if (status) q = q.eq("status", status);
    if (area) q = q.ilike("area", area);
    if (is_okr !== undefined) q = q.eq("is_okr", is_okr);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarKpisSemDado = tool(
  "listar_kpis_sem_dado",
  "Lista KPIs sem coleta recente. Default: mensais ha 60d+, semanais ha 30d+. Indica KPI abandonado ou lider ausente.",
  {
    dias_mensais: z.number().int().min(7).max(365).default(60),
    dias_semanais: z.number().int().min(7).max(180).default(30),
    limit: z.number().int().min(1).max(100).default(50),
  },
  async ({ dias_mensais, dias_semanais, limit }) => {
    const cutoffMensal = new Date();
    cutoffMensal.setDate(cutoffMensal.getDate() - dias_mensais);
    const cutoffSemanal = new Date();
    cutoffSemanal.setDate(cutoffSemanal.getDate() - dias_semanais);

    const { data, error } = await supabase
      .from("vw_kpi_taticos_status")
      .select(
        "id, area, indicador, periodicidade, ultima_data, lider_nome, lider_funcionario_id"
      )
      .eq("ativo", true)
      .limit(limit * 3);
    if (error) return fail(error.message);
    const abandonados = (data || []).filter((k: any) => {
      if (!k.ultima_data) return true;
      const d = new Date(k.ultima_data);
      if (k.periodicidade === "mensal") return d < cutoffMensal;
      if (k.periodicidade === "semanal") return d < cutoffSemanal;
      return false;
    }).slice(0, limit);
    return ok({ total: abandonados.length, itens: abandonados });
  }
);

export const listarOkrRevisoesAbertas = tool(
  "listar_okr_revisoes_abertas",
  "Lista revisoes de OKR abertas (vw_okr_revisoes_abertas). Revisao aberta ha 7d+ vale alertar o lider.",
  {
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ limit }) => {
    const { data, error } = await supabase
      .from("vw_okr_revisoes_abertas")
      .select("*")
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const buscarKpiDetalhe = tool(
  "buscar_kpi_detalhe",
  "Busca detalhe completo de 1 KPI: definicao + ultimas 6 medicoes (kpi_registros) pra ver tendencia.",
  {
    kpi_id: z.string(),
  },
  async ({ kpi_id }) => {
    const [def, registros] = await Promise.all([
      supabase
        .from("kpi_indicadores_taticos")
        .select("*")
        .eq("id", kpi_id)
        .maybeSingle(),
      supabase
        .from("kpi_registros")
        .select("periodo, valor, registrado_em, observacao")
        .eq("kpi_id", kpi_id)
        .order("periodo", { ascending: false })
        .limit(6),
    ]);
    if (def.error) return fail(def.error.message);
    if (registros.error) return fail(registros.error.message);
    if (!def.data) return fail(`KPI ${kpi_id} nao encontrado`);
    return ok({
      kpi: def.data,
      historico: registros.data || [],
    });
  }
);

export const listarAreasResumo = tool(
  "listar_areas_resumo",
  "Lista areas com contagem de KPIs por status. Use pra detectar areas inteiras com problemas sistemicos.",
  {},
  async () => {
    const { data, error } = await supabase
      .from("vw_kpi_taticos_status")
      .select("area, status")
      .eq("ativo", true)
      .limit(500);
    if (error) return fail(error.message);
    const agg: Record<string, Record<string, number>> = {};
    for (const r of (data || []) as Array<{ area: string; status: string }>) {
      if (!agg[r.area]) agg[r.area] = {};
      agg[r.area][r.status || "sem_status"] =
        (agg[r.area][r.status || "sem_status"] || 0) + 1;
    }
    return ok({
      total_areas: Object.keys(agg).length,
      por_area: agg,
    });
  }
);

export const verificarPropostaExistente = tool(
  "verificar_proposta_existente",
  "Verifica se ja existe proposta pending em agent_queue pra mesmo action_type + entity_id. Use ANTES de propor.",
  {
    action_type: z.string(),
    entity_id: z.string(),
  },
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

export const kpisReadTools = [
  listarKpisStatus,
  listarKpisSemDado,
  listarOkrRevisoesAbertas,
  buscarKpiDetalhe,
  listarAreasResumo,
  verificarPropostaExistente,
];

export const kpisReadToolNames = kpisReadTools.map(
  (t) => `mcp__kpis__${t.name}`
);
