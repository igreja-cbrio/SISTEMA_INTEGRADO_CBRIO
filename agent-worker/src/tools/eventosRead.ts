import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(p: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] }; }
function fail(m: string) { return { content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true }; }

export const listarEventosProximos = tool(
  "listar_eventos_proximos",
  "Lista eventos com data entre hoje e hoje+dias (default 30). Filtra cancelado/concluido.",
  {
    dias: z.number().int().min(1).max(120).default(30),
    limit: z.number().int().min(1).max(50).default(30),
  },
  async ({ dias, limit }) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const limite = new Date();
    limite.setDate(limite.getDate() + dias);
    const { data, error } = await supabase
      .from("events")
      .select("id, name, date, category_id, status, responsible, location, expected_attendance")
      .gte("date", hoje)
      .lte("date", limite.toISOString().slice(0, 10))
      .not("status", "in", "(cancelado,concluido)")
      .order("date", { ascending: true })
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarTarefasAtrasadas = tool(
  "listar_tarefas_atrasadas",
  "Lista event_tasks e cycle_phase_tasks com prazo/deadline vencido e status != concluido.",
  {
    limit: z.number().int().min(1).max(100).default(60),
  },
  async ({ limit }) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const [et, cpt] = await Promise.all([
      supabase
        .from("event_tasks")
        .select("id, event_id, name, area, responsible_id, responsible, deadline, status, priority, is_milestone")
        .lt("deadline", hoje)
        .neq("status", "concluido")
        .limit(Math.ceil(limit / 2)),
      supabase
        .from("cycle_phase_tasks")
        .select("id, event_id, titulo, area, responsavel_id, responsavel_nome, prazo, status, prioridade, is_critical")
        .lt("prazo", hoje)
        .neq("status", "concluido")
        .limit(Math.ceil(limit / 2)),
    ]);
    if (et.error) return fail(`event_tasks: ${et.error.message}`);
    if (cpt.error) return fail(`cycle_phase_tasks: ${cpt.error.message}`);
    return ok({
      event_tasks: et.data || [],
      cycle_phase_tasks: cpt.data || [],
      total: (et.data?.length || 0) + (cpt.data?.length || 0),
    });
  }
);

export const listarTarefasSemResponsavel = tool(
  "listar_tarefas_sem_responsavel",
  "Lista tarefas sem responsavel (responsible_id NULL E responsible NULL) em eventos futuros.",
  {
    apenas_criticas: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(40),
  },
  async ({ apenas_criticas, limit }) => {
    const hoje = new Date().toISOString().slice(0, 10);
    let qEt = supabase
      .from("event_tasks")
      .select("id, event_id, name, area, deadline, status, is_milestone, events!inner(name, date, status)")
      .is("responsible_id", null)
      .is("responsible", null)
      .neq("status", "concluido")
      .gte("events.date", hoje)
      .not("events.status", "in", "(cancelado,concluido)")
      .limit(Math.ceil(limit / 2));
    if (apenas_criticas) qEt = qEt.eq("is_milestone", true);

    let qCpt = supabase
      .from("cycle_phase_tasks")
      .select("id, event_id, titulo, area, prazo, status, is_critical")
      .is("responsavel_id", null)
      .is("responsavel_nome", null)
      .neq("status", "concluido")
      .limit(Math.ceil(limit / 2));
    if (apenas_criticas) qCpt = qCpt.eq("is_critical", true);

    const [et, cpt] = await Promise.all([qEt, qCpt]);
    if (et.error) return fail(`event_tasks: ${et.error.message}`);
    if (cpt.error) return fail(`cycle_phase_tasks: ${cpt.error.message}`);
    return ok({
      event_tasks: et.data || [],
      cycle_phase_tasks: cpt.data || [],
      total: (et.data?.length || 0) + (cpt.data?.length || 0),
    });
  }
);

export const buscarEventoCompletude = tool(
  "buscar_evento_completude",
  "Calcula % de tarefas concluidas vs total de um evento. Use pra detectar eventos atrasados em preparacao.",
  {
    event_id: z.string().uuid(),
  },
  async ({ event_id }) => {
    const [et, cpt, ev] = await Promise.all([
      supabase.from("event_tasks").select("status", { count: "exact" }).eq("event_id", event_id),
      supabase.from("cycle_phase_tasks").select("status", { count: "exact" }).eq("event_id", event_id),
      supabase.from("events").select("id, name, date, status, responsible").eq("id", event_id).maybeSingle(),
    ]);
    if (ev.error) return fail(ev.error.message);
    if (!ev.data) return fail("evento nao encontrado");

    const todas = [...(et.data || []), ...(cpt.data || [])] as Array<{ status: string }>;
    const total = todas.length;
    const concluidas = todas.filter((t) => t.status === "concluido").length;
    const pendentes = todas.filter((t) => t.status === "pendente" || !t.status).length;
    return ok({
      evento: ev.data,
      total_tarefas: total,
      concluidas,
      pendentes,
      pct_concluido: total ? Math.round((concluidas / total) * 100) : 0,
    });
  }
);

export const verificarPropostaExistente = tool(
  "verificar_proposta_existente",
  "Verifica se ja existe proposta pending em agent_queue. Use ANTES de propor.",
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

export const eventosReadTools = [
  listarEventosProximos,
  listarTarefasAtrasadas,
  listarTarefasSemResponsavel,
  buscarEventoCompletude,
  verificarPropostaExistente,
];
export const eventosReadToolNames = eventosReadTools.map((t) => `mcp__eventos__${t.name}`);
