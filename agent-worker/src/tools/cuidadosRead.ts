import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function fail(msg: string) {
  return { content: [{ type: "text" as const, text: `ERRO: ${msg}` }], isError: true };
}

export const listarJornada180Parada = tool(
  "listar_jornada180_parada",
  "Lista convertidos na cui_jornada180 sem encontro nos ultimos 30d. Agrupa por membro_id retornando o ultimo encontro de cada.",
  {
    dias_minimo: z.number().int().min(7).max(180).default(30),
    limit: z.number().int().min(1).max(100).default(40),
  },
  async ({ dias_minimo, limit }) => {
    const corte = new Date();
    corte.setDate(corte.getDate() - dias_minimo);
    const corteStr = corte.toISOString().slice(0, 10);

    // Pega todos os registros · agrupa por membro_id pegando o mais recente
    const { data, error } = await supabase
      .from("cui_jornada180")
      .select("id, membro_id, nome, cpf, etapa, data_encontro, responsavel_id, observacoes, created_at")
      .is("deleted_at", null)
      .order("data_encontro", { ascending: false })
      .limit(500);
    if (error) return fail(error.message);

    const ultimosPorMembro = new Map<string, any>();
    for (const r of (data || []) as any[]) {
      const key = r.membro_id || r.cpf || r.nome;
      if (!key) continue;
      if (!ultimosPorMembro.has(key)) ultimosPorMembro.set(key, r);
    }
    const parados = Array.from(ultimosPorMembro.values())
      .filter((r) => !r.data_encontro || new Date(r.data_encontro) < corte)
      .slice(0, limit);

    return ok({ total: parados.length, itens: parados, corte: corteStr });
  }
);

export const listarVisitantesSemFollowup = tool(
  "listar_visitantes_sem_followup",
  "Lista visitantes (int_visitantes) cadastrados ha 4-14 dias e ainda em status novo/null · sem follow-up.",
  {
    dias_minimo: z.number().int().min(1).max(30).default(4),
    dias_maximo: z.number().int().min(2).max(60).default(14),
    apenas_decisao: z.boolean().default(false).describe("Se true, filtra so quem fez decisao"),
    limit: z.number().int().min(1).max(50).default(30),
  },
  async ({ dias_minimo, dias_maximo, apenas_decisao, limit }) => {
    const from = new Date();
    from.setDate(from.getDate() - dias_maximo);
    const to = new Date();
    to.setDate(to.getDate() - dias_minimo);

    let q = supabase
      .from("int_visitantes")
      .select(
        "id, nome, telefone, email, data_visita, culto_id, fez_decisao, tipo_decisao, responsavel_id, status, created_at"
      )
      .is("deleted_at", null)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .or("status.is.null,status.eq.novo")
      .limit(limit);
    if (apenas_decisao) q = q.eq("fez_decisao", true);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarAcompanhamentosAbertos = tool(
  "listar_acompanhamentos_abertos",
  "Lista cui_acompanhamentos abertos (status != concluido) sem data_encerramento. Filtra por idade minima do registro.",
  {
    dias_minimo_aberto: z.number().int().min(7).max(180).default(30),
    limit: z.number().int().min(1).max(50).default(30),
  },
  async ({ dias_minimo_aberto, limit }) => {
    const corte = new Date();
    corte.setDate(corte.getDate() - dias_minimo_aberto);
    const { data, error } = await supabase
      .from("cui_acompanhamentos")
      .select("id, membro_id, nome, motivo, status, responsavel_id, created_at, data_inicio")
      .is("deleted_at", null)
      .is("data_encerramento", null)
      .neq("status", "concluido")
      .lte("created_at", corte.toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const verificarPropostaExistente = tool(
  "verificar_proposta_existente",
  "Verifica se ja existe proposta pending em agent_queue. Use ANTES de propor.",
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

export const cuidadosReadTools = [
  listarJornada180Parada,
  listarVisitantesSemFollowup,
  listarAcompanhamentosAbertos,
  verificarPropostaExistente,
];
export const cuidadosReadToolNames = cuidadosReadTools.map((t) => `mcp__cuidados__${t.name}`);
