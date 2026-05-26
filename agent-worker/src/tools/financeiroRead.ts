import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

// Helper · formata resposta em texto JSON estavel pra LLM
function ok(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function fail(msg: string) {
  return {
    content: [{ type: "text" as const, text: `ERRO: ${msg}` }],
    isError: true,
  };
}

export const listarFilaClassificacao = tool(
  "listar_fila_classificacao",
  "Lista lancamentos brutos na fila de classificacao financeira (fin_fila_classificacao) com status pendente. Retorna ate `limit` itens mais antigos primeiro. Inclui valor, memo, contraparte, sugestao_centavo se houver.",
  {
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ limit }) => {
    const { data, error } = await supabase
      .from("fin_fila_classificacao")
      .select(
        "id, lancamento_bruto_id, status, sugestao_origem, sugestao_confianca, sugestao_explicacao, sugestao_plano_contas_id, sugestao_centro_custo_id, identificador_centavo, created_at, fin_lancamentos_brutos!inner(valor, tipo_trn, memo, documento_contraparte, nome_contraparte, banco_origem, data_lancamento)"
      )
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarContasPagarPendentes = tool(
  "listar_contas_pagar_pendentes",
  "Lista contas a pagar com status=pendente, ordenadas por data_vencimento ascendente. Filtra por dias_para_vencer (negativo = ja vencidas). Use pra encontrar contas que podem ja ter sido pagas no extrato.",
  {
    dias_para_vencer: z.number().int().default(30),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ dias_para_vencer, limit }) => {
    const limite = new Date();
    limite.setDate(limite.getDate() + dias_para_vencer);
    const { data, error } = await supabase
      .from("fin_contas_pagar")
      .select(
        "id, descricao, valor, data_vencimento, status, fornecedor, categoria_id, data_pagamento, created_at"
      )
      .eq("status", "pendente")
      .lte("data_vencimento", limite.toISOString().slice(0, 10))
      .order("data_vencimento", { ascending: true })
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarAlertasAbertos = tool(
  "listar_alertas_abertos",
  "Lista alertas financeiros abertos (vw_fin_alertas_abertos), ordenados por severidade desc. Severidades: critico, alerta, aviso, info.",
  {
    severidade_minima: z
      .enum(["info", "aviso", "alerta", "critico"])
      .default("aviso"),
    limit: z.number().int().min(1).max(50).default(30),
  },
  async ({ severidade_minima, limit }) => {
    const ordem = { info: 1, aviso: 2, alerta: 3, critico: 4 };
    const min = ordem[severidade_minima];
    const severidades = (
      Object.entries(ordem) as [keyof typeof ordem, number][]
    )
      .filter(([_, v]) => v >= min)
      .map(([k]) => k);
    const { data, error } = await supabase
      .from("vw_fin_alertas_abertos")
      .select("*")
      .in("severidade", severidades)
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarReembolsosPendentes = tool(
  "listar_reembolsos_pendentes",
  "Lista reembolsos em fin_reembolsos com status=pendente. Inclui solicitante, valor, motivo, comprovante.",
  {
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ limit }) => {
    const { data, error } = await supabase
      .from("fin_reembolsos")
      .select("*")
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const buscarHistoricoPagador = tool(
  "buscar_historico_pagador",
  "Busca historico de classificacoes anteriores do mesmo pagador (por nome_contraparte OU documento_contraparte). Retorna ate 10 classificacoes recentes e a moda (categoria mais usada).",
  {
    nome: z.string().optional(),
    documento: z.string().optional(),
  },
  async ({ nome, documento }) => {
    if (!nome && !documento) {
      return fail("Informe ao menos um de: nome, documento");
    }
    let query = supabase
      .from("fin_transacoes")
      .select(
        "id, valor, data_competencia, plano_contas_id, centro_custo_id, descricao, nome_contraparte, documento_contraparte"
      )
      .order("data_competencia", { ascending: false })
      .limit(10);
    if (documento) {
      query = query.eq("documento_contraparte", documento);
    } else if (nome) {
      query = query.ilike("nome_contraparte", `%${nome}%`);
    }
    const { data, error } = await query;
    if (error) return fail(error.message);
    const itens = data || [];
    const planos = itens
      .filter((t) => t.plano_contas_id)
      .map((t) => t.plano_contas_id);
    const moda =
      planos.length > 0
        ? Object.entries(
            planos.reduce(
              (acc, p) => ({ ...acc, [p]: (acc[p] || 0) + 1 }),
              {} as Record<string, number>
            )
          ).sort((a, b) => b[1] - a[1])[0]
        : null;
    return ok({
      total: itens.length,
      moda_plano_contas: moda ? { plano_contas_id: moda[0], freq: moda[1] } : null,
      historico: itens,
    });
  }
);

export const buscarTransacaoMatch = tool(
  "buscar_transacao_match",
  "Busca em fin_transacoes uma transacao que possa ser o pagamento de uma conta a pagar. Match por valor (+/-0.50) e data_competencia em janela de N dias do vencimento.",
  {
    valor: z.number(),
    data_vencimento: z.string().describe("YYYY-MM-DD"),
    janela_dias: z.number().int().min(0).max(30).default(7),
    fornecedor: z.string().optional(),
  },
  async ({ valor, data_vencimento, janela_dias, fornecedor }) => {
    const venc = new Date(data_vencimento);
    const inicio = new Date(venc);
    inicio.setDate(venc.getDate() - janela_dias);
    const fim = new Date(venc);
    fim.setDate(venc.getDate() + janela_dias);
    let query = supabase
      .from("fin_transacoes")
      .select(
        "id, valor, data_competencia, descricao, nome_contraparte, plano_contas_id, conta_id, status"
      )
      .gte("valor", valor - 0.5)
      .lte("valor", valor + 0.5)
      .gte("data_competencia", inicio.toISOString().slice(0, 10))
      .lte("data_competencia", fim.toISOString().slice(0, 10))
      .neq("status", "cancelado")
      .limit(10);
    if (fornecedor) query = query.ilike("nome_contraparte", `%${fornecedor}%`);
    const { data, error } = await query;
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, candidatos: data || [] });
  }
);

export const verificarMesFechado = tool(
  "verificar_mes_fechado",
  "Verifica se um mes esta fechado em fin_closing_mensal (e nao reaberto). Mes fechado bloqueia INSERT/UPDATE/DELETE em fin_transacoes desse periodo.",
  {
    data: z.string().describe("YYYY-MM-DD"),
  },
  async ({ data }) => {
    const d = new Date(data);
    const ano = d.getFullYear();
    const mes = d.getMonth() + 1;
    const { data: rows, error } = await supabase
      .from("fin_closing_mensal")
      .select("ano, mes, fechado_em, reaberto_em")
      .eq("ano", ano)
      .eq("mes", mes)
      .limit(1);
    if (error) return fail(error.message);
    const row = rows?.[0];
    const fechado = !!row && !row.reaberto_em;
    return ok({ ano, mes, fechado, detalhe: row || null });
  }
);

export const verificarPropostaExistente = tool(
  "verificar_proposta_existente",
  "Verifica se ja existe proposta pending em agent_queue pra mesma entidade (mesmo action_type + payload.entity_id). Use ANTES de propor pra evitar duplicacao.",
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
    return ok({
      existe: (data?.length || 0) > 0,
      propostas: data || [],
    });
  }
);

export const listarPadroesClassificacao = tool(
  "listar_padroes_classificacao",
  "Lista regras de classificacao ativas (fin_regras_classificacao) + identificadores de centavo (fin_identificadores_centavo). Use no inicio de cada execucao pra carregar contexto.",
  {},
  async () => {
    const [regras, centavos] = await Promise.all([
      supabase
        .from("fin_regras_classificacao")
        .select("*")
        .eq("ativa", true)
        .limit(100),
      supabase
        .from("fin_identificadores_centavo")
        .select("*")
        .eq("ativo", true)
        .limit(100),
    ]);
    if (regras.error) return fail(regras.error.message);
    if (centavos.error) return fail(centavos.error.message);
    return ok({
      regras: regras.data || [],
      identificadores_centavo: centavos.data || [],
    });
  }
);

export const financeiroReadTools = [
  listarFilaClassificacao,
  listarContasPagarPendentes,
  listarAlertasAbertos,
  listarReembolsosPendentes,
  buscarHistoricoPagador,
  buscarTransacaoMatch,
  verificarMesFechado,
  verificarPropostaExistente,
  listarPadroesClassificacao,
];

export const financeiroReadToolNames = financeiroReadTools.map(
  (t) => `mcp__financeiro__${t.name}`
);
