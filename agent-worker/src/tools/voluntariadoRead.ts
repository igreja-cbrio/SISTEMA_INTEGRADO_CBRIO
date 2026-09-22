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

    // ⚠️⚠️ AQUI MORAVA O BUG, e ele acusava TODO MUNDO. `vol_check_ins.volunteer_id`
    // guarda o id de **`vol_profiles`** (o perfil da escala/PCO), e a lista de
    // baixo vem de **`mem_voluntarios`** (o vinculo da membresia). Sao tabelas
    // diferentes para a mesma pessoa — o elo entre elas e o `membro_id`
    // (`vol_profiles.membresia_id`). O filtro fazia `idsAtivos.has(v.id)`
    // comparando id de uma com id da outra: **nunca casava**, entao todo
    // voluntario formalmente ativo caia como inativo.
    //
    // Medido em 22/09/2026, depois do Matheus estranhar a tela: **24 das 32
    // propostas pendentes eram de gente que serviu nos ultimos 90 dias** — o
    // Rubens Camerlengo, acusado de "158 dias sem check-in (nunca serviu)",
    // tinha servido **2 dias antes**, com 6 check-ins no historico. Ao limpar a
    // fila apareceram **42 propostas erradas em 7 rodadas** do agente.
    const { data: recentes } = await supabase
      .from("vol_check_ins")
      .select("volunteer_id, checked_in_at")
      .gte("checked_in_at", corte.toISOString())
      .limit(5000);
    const perfisComCheckin = [...new Set((recentes || []).map((r: any) => r.volunteer_id).filter(Boolean))];

    // Traduz vol_profiles.id -> membro_id, que e a chave que as duas tabelas
    // compartilham.
    const membrosAtivos = new Set<string>();
    for (let i = 0; i < perfisComCheckin.length; i += 200) {
      const chunk = perfisComCheckin.slice(i, i + 200);
      const { data: perfis } = await supabase
        .from("vol_profiles")
        .select("id, membresia_id")
        .in("id", chunk);
      for (const p of perfis || []) if (p.membresia_id) membrosAtivos.add(p.membresia_id);
    }

    // 2. Lista voluntarios formalmente ativos com tempo minimo
    const { data: voluntarios, error } = await supabase
      .from("mem_voluntarios")
      .select("id, membro_id, ministerio_id, papel, desde, mem_membros!inner(nome, telefone, email)")
      .is("ate", null)
      .is("deleted_at", null)
      .lte("desde", corteServico.toISOString().slice(0, 10))
      .limit(limit * 5);
    if (error) return fail(error.message);

    const candidatos = (voluntarios || [])
      .filter((v: any) => !membrosAtivos.has(v.membro_id))
      .slice(0, limit);

    // ⚠️⚠️ CADA ITEM LEVA O ULTIMO CHECK-IN DE VERDADE. Sem isto o modelo so
    // enxergava `desde` (a data de cadastro) e escrevia "158 dias sem check-in"
    // quando 158 era o tempo de CASA — dois numeros diferentes com a mesma cara.
    // E `ultimo_checkin: null` aqui significa "nenhum na base inteira", nao
    // "nunca serviu": quem nao tem `vol_profiles` vinculado (36% dos perfis nao
    // tem `membresia_id`) cai aqui sem ter deixado de servir.
    const itens = [] as any[];
    for (const v of candidatos) {
      const { data: perfil } = await supabase
        .from("vol_profiles").select("id").eq("membresia_id", v.membro_id).limit(1).maybeSingle();
      let ultimo: string | null = null;
      let total = 0;
      if (perfil?.id) {
        const { data: cks, count } = await supabase
          .from("vol_check_ins")
          .select("checked_in_at", { count: "exact" })
          .eq("volunteer_id", perfil.id)
          .order("checked_in_at", { ascending: false })
          .limit(1);
        ultimo = cks?.[0]?.checked_in_at || null;
        total = count || 0;
      }
      itens.push({
        ...v,
        vol_profile_id: perfil?.id || null,
        ultimo_checkin: ultimo,
        total_checkins: total,
        dias_desde_ultimo_checkin: ultimo
          ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000)
          : null,
        sem_perfil_de_escala: !perfil?.id,
      });
    }

    return ok({
      total: itens.length,
      dias_sem_checkin_limite: dias_sem_checkin,
      // ⚠️ Instrucao explicita para quem le: as duas reguas da casa
      // (`atividadeVoluntario.js` e `volRodizio.js`) PROIBEM dizer "nunca
      // serviu" a partir de uma janela — e o agente vinha dizendo exatamente
      // isso, 42 vezes.
      aviso: "`desde` e a data de CADASTRO, nao o ultimo check-in — use `dias_desde_ultimo_checkin`. `ultimo_checkin: null` significa 'nenhum registro encontrado', NUNCA 'nunca serviu'; quem esta com `sem_perfil_de_escala: true` pode ter servido sem vinculo de perfil.",
      itens,
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
