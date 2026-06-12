import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function fail(msg: string) {
  return { content: [{ type: "text" as const, text: `ERRO: ${msg}` }], isError: true };
}

export const listarFuncionariosAtivos = tool(
  "listar_funcionarios_ativos",
  "Lista funcionarios ativos (status='ativo' AND deleted_at IS NULL).",
  {
    area: z.string().optional(),
    limit: z.number().int().min(1).max(200).default(100),
  },
  async ({ area, limit }) => {
    let q = supabase
      .from("rh_funcionarios")
      .select("id, nome, email, cargo, area, tipo_contrato, data_admissao, status, gestor_id")
      .eq("status", "ativo")
      .is("deleted_at", null)
      .limit(limit);
    if (area) q = q.ilike("area", `%${area}%`);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarDocumentosVencendo = tool(
  "listar_documentos_vencendo",
  "Lista documentos com data_expiracao entre hoje e hoje+dias (default 30). Inclui dados do funcionario.",
  {
    dias: z.number().int().min(1).max(180).default(30),
    limit: z.number().int().min(1).max(100).default(50),
  },
  async ({ dias, limit }) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const limite = new Date();
    limite.setDate(limite.getDate() + dias);
    const limiteStr = limite.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("rh_documentos")
      .select(
        "id, funcionario_id, tipo, nome, data_expiracao, rh_funcionarios!inner(nome, email, status, gestor_id)"
      )
      .not("data_expiracao", "is", null)
      .gte("data_expiracao", hoje)
      .lte("data_expiracao", limiteStr)
      .is("deleted_at", null)
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarTreinamentosPendentes = tool(
  "listar_treinamentos_pendentes",
  "Lista treinamentos pendentes (status='pendente' e sem data_conclusao).",
  {
    limit: z.number().int().min(1).max(100).default(50),
  },
  async ({ limit }) => {
    const { data, error } = await supabase
      .from("rh_treinamentos_funcionarios")
      .select(
        "id, treinamento_id, funcionario_id, status, data_conclusao, rh_funcionarios!inner(nome, email, status, gestor_id, area)"
      )
      .eq("status", "pendente")
      .is("data_conclusao", null)
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarFuncionariosFeriasVencendo = tool(
  "listar_funcionarios_ferias_vencendo",
  "Lista funcionarios CLT cujo periodo aquisitivo de ferias esta a vencer (admissao ha 11+ meses sem ferias registradas no ultimo ano).",
  {
    limit: z.number().int().min(1).max(50).default(30),
  },
  async ({ limit }) => {
    const corte = new Date();
    corte.setMonth(corte.getMonth() - 11);
    const corteStr = corte.toISOString().slice(0, 10);
    const umAnoAtras = new Date();
    umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
    const umAnoAtrasStr = umAnoAtras.toISOString().slice(0, 10);

    // Funcionarios com 11+ meses de casa
    const { data: funcionarios, error: errF } = await supabase
      .from("rh_funcionarios")
      .select("id, nome, email, cargo, data_admissao, tipo_contrato, gestor_id")
      .eq("status", "ativo")
      .is("deleted_at", null)
      .lte("data_admissao", corteStr)
      .ilike("tipo_contrato", "%clt%")
      .limit(limit * 3);
    if (errF) return fail(errF.message);

    // Pra cada, verifica se teve ferias no ultimo ano
    const fids = (funcionarios || []).map((f: any) => f.id);
    if (fids.length === 0) return ok({ total: 0, itens: [] });

    const { data: ferias, error: errFer } = await supabase
      .from("rh_ferias_licencas")
      .select("funcionario_id, data_inicio, tipo, status")
      .in("funcionario_id", fids)
      .gte("data_inicio", umAnoAtrasStr)
      .neq("status", "cancelado");
    if (errFer) return fail(errFer.message);

    const comFerias = new Set((ferias || []).map((x: any) => x.funcionario_id));
    const vencendo = (funcionarios || [])
      .filter((f: any) => !comFerias.has(f.id))
      .slice(0, limit);

    return ok({ total: vencendo.length, itens: vencendo });
  }
);

export const verificarPropostaExistente = tool(
  "verificar_proposta_existente",
  "Verifica se ja existe proposta pending em agent_queue pra mesma entidade. Use ANTES de propor.",
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

export const rhReadTools = [
  listarFuncionariosAtivos,
  listarDocumentosVencendo,
  listarTreinamentosPendentes,
  listarFuncionariosFeriasVencendo,
  verificarPropostaExistente,
];
export const rhReadToolNames = rhReadTools.map((t) => `mcp__rh__${t.name}`);
