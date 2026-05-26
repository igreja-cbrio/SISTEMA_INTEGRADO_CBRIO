import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(p: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] }; }
function fail(m: string) { return { content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true }; }

export const listarVoluntariosAtivos = tool(
  "listar_voluntarios_ativos",
  "Lista mem_voluntarios com ate IS NULL (formalmente ativos). Inclui dados do membro.",
  {
    ministerio_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(500).default(300),
  },
  async ({ ministerio_id, limit }) => {
    let q = supabase
      .from("mem_voluntarios")
      .select("id, membro_id, ministerio_id, papel, desde, observacoes, mem_membros!inner(nome, telefone, email)")
      .is("ate", null)
      .is("deleted_at", null)
      .limit(limit);
    if (ministerio_id) q = q.eq("ministerio_id", ministerio_id);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const buscarCheckinsRecentes = tool(
  "buscar_checkins_recentes",
  "Pra um volunteer_id, retorna ultimos check-ins (vol_check_ins).",
  {
    volunteer_id: z.string().uuid(),
    limit: z.number().int().min(1).max(20).default(5),
  },
  async ({ volunteer_id, limit }) => {
    const { data, error } = await supabase
      .from("vol_check_ins")
      .select("id, checked_in_at, service_id, method, is_unscheduled")
      .eq("volunteer_id", volunteer_id)
      .order("checked_in_at", { ascending: false })
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarVoluntariosInativos = tool(
  "listar_voluntarios_inativos",
  "Lista voluntarios ativos formalmente (ate IS NULL) que NAO tiveram check-in nos ultimos N dias. Filtra por tempo minimo de servico tambem.",
  {
    dias_sem_checkin: z.number().int().min(7).max(365).default(60),
    dias_minimo_servico: z.number().int().min(0).max(365).default(90),
    limit: z.number().int().min(1).max(100).default(40),
  },
  async ({ dias_sem_checkin, dias_minimo_servico, limit }) => {
    const corte = new Date();
    corte.setDate(corte.getDate() - dias_sem_checkin);
    const corteServico = new Date();
    corteServico.setDate(corteServico.getDate() - dias_minimo_servico);

    // 1. Pega volunteer_ids com check-in recente (pra excluir)
    const { data: recentes } = await supabase
      .from("vol_check_ins")
      .select("volunteer_id")
      .gte("checked_in_at", corte.toISOString())
      .limit(2000);
    const idsAtivos = new Set((recentes || []).map((r: any) => r.volunteer_id));

    // 2. Lista voluntarios formalmente ativos com tempo minimo
    const { data: voluntarios, error } = await supabase
      .from("mem_voluntarios")
      .select("id, membro_id, ministerio_id, papel, desde, mem_membros!inner(nome, telefone, email)")
      .is("ate", null)
      .is("deleted_at", null)
      .lte("desde", corteServico.toISOString().slice(0, 10))
      .limit(limit * 5);
    if (error) return fail(error.message);

    const inativos = (voluntarios || [])
      .filter((v: any) => !idsAtivos.has(v.id))
      .slice(0, limit);

    return ok({
      total: inativos.length,
      dias_sem_checkin_limite: dias_sem_checkin,
      itens: inativos,
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

export const voluntariadoReadTools = [
  listarVoluntariosAtivos,
  buscarCheckinsRecentes,
  listarVoluntariosInativos,
  verificarPropostaExistente,
];
export const voluntariadoReadToolNames = voluntariadoReadTools.map((t) => `mcp__voluntariado__${t.name}`);
