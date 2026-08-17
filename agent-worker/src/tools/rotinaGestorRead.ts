// Ferramentas de LEITURA da rotina de gestão de projetos (3 dias · 3 pilares).
//
// Pilares: EVENTOS (o que a igreja vai fazer) · REUNIÕES (onde se decide) ·
// COMPROMISSOS (quem prometeu o quê, até quando). Qualidade NÃO é pilar — é
// checagem que roda dentro dos três.
//
// ⚠️ 100% SOMENTE LEITURA. Este agente não escreve em nenhuma tabela de
// domínio: ele monta o bloco do dia e manda por e-mail. Cobrança é ato de
// gente, e a mensagem sai do WhatsApp do Marcos, não do número da igreja.

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";
// ⚠️ A régua de calendário mora em utils/ (pura, sem supabase, testada).
// NÃO reimplementar aqui: duas cópias divergiriam e o bloco do dia passaria a
// discordar do scheduler.
import {
  hojeBRT,
  diaDaSemanaBRT,
  somarDias,
  blocoDoDia,
  tituloDoBloco,
  proximaQuarta,
  ehUltimaSextaDoMes,
  NOME_DO_DIA,
} from "../utils/rotinaDia.js";

export { hojeBRT, diaDaSemanaBRT, blocoDoDia, proximaQuarta, ehUltimaSextaDoMes };
export type { BlocoDaRotina } from "../utils/rotinaDia.js";

const ok = (p: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true as const });

export const obterDiaDaRotina = tool(
  "obter_dia_da_rotina",
  "Diz que dia é hoje (BRT), qual bloco da rotina roda, qual ritual de governança cai na próxima quarta e se hoje é o fechamento mensal. SEMPRE chamar primeiro.",
  {},
  async () => {
    const hoje = hojeBRT();
    const dow = diaDaSemanaBRT();
    const bloco = blocoDoDia(dow);
    const quarta = proximaQuarta(hoje);

    // Qual ritual cai na quarta que vem? São 4 rituais mensais ROTATIVOS
    // (OKR → DRE → KPI → Conselho), então "a reunião de quarta" é uma
    // diferente em cada semana do mês — e o dado que a diretoria pede muda
    // com ela. Perguntar ao banco em vez de supor pela semana do mês.
    const { data: reuniaoQuarta, error: eR } = await supabase
      .from("governance_meetings")
      .select("id, date, status, pauta, ata, governance_meeting_types(sigla, nome, semana)")
      .eq("date", quarta)
      .is("deleted_at", null)
      .limit(5);

    return ok({
      hoje,
      dia_semana: NOME_DO_DIA[dow],
      bloco,
      bloco_titulo: tituloDoBloco(bloco),
      fechamento_mensal: ehUltimaSextaDoMes(hoje),
      proxima_quarta: quarta,
      // Sem reunião cadastrada pra aquela quarta NÃO é erro: nem toda quarta do
      // ano tem ritual. Mas é declarado, pra não parecer que a leitura falhou.
      reuniao_da_quarta: eR ? null : (reuniaoQuarta || []),
      reuniao_da_quarta_erro: eR?.message || null,
      sem_reuniao_na_quarta: !eR && (reuniaoQuarta || []).length === 0,
    });
  }
);

export const listarEventosPendentes = tool(
  "listar_eventos_pendentes",
  "PILAR EVENTOS: eventos que vêm aí sem dono, sem data, ou com tarefa de ciclo criativo atrasada.",
  { dias_a_frente: z.number().int().min(7).max(180).default(60), limit: z.number().int().min(1).max(60).default(40) },
  async ({ dias_a_frente, limit }) => {
    const hoje = hojeBRT();
    const limite = somarDias(hoje, dias_a_frente);

    const [evRes, tarefaRes] = await Promise.all([
      // ⚠️⚠️ `events` NÃO tem `area`, `leader_id`, `leader` nem `deleted_at` —
      // conferido no catálogo em 17/08. O dono é a coluna TEXT `responsible`
      // (a transição pra UUID pegou `projects` e `event_tasks`, não `events`).
      // Pedir coluna inexistente faz o PostgREST recusar a query INTEIRA (42703)
      // e o pilar Eventos vinha vazio, com o erro escondido no `fail()`.
      supabase
        .from("events")
        .select("id, name, date, status, responsible, category_id")
        .gte("date", hoje)
        .lte("date", limite)
        .not("status", "in", '("concluido","cancelado")')
        .order("date")
        .limit(limit),
      // Tarefa de fase do ciclo criativo já vencida e não concluída.
      supabase
        .from("cycle_phase_tasks")
        .select("id, titulo, prazo, status, area, responsavel_nome, responsavel_id")
        .lt("prazo", hoje)
        .not("status", "in", '("concluida","cancelada")')
        .order("prazo")
        .limit(limit),
    ]);

    if (evRes.error) return fail(`events: ${evRes.error.message}`);

    const eventos = (evRes.data || []).map((e) => ({
      ...e,
      // ⚠️ `responsible` é TEXTO LIVRE e hoje guarda coisas como "PMO" — que é
      // um papel, não uma pessoa. Então "tem dono" aqui significa "tem alguém
      // escrito", e o agente NÃO deve tratar isso como nome de pessoa nem
      // endereçar mensagem a ele (mesma régua do `responsavel` de
      // governance_tasks).
      sem_dono: !e.responsible,
      responsavel_texto: e.responsible || null,
      sem_data: !e.date,
      dias_ate: e.date ? Math.round((new Date(`${e.date}T12:00:00`).getTime() - new Date(`${hoje}T12:00:00`).getTime()) / 86400000) : null,
    }));

    return ok({
      janela: `${hoje} a ${limite} (${dias_a_frente} dias)`,
      total_eventos: eventos.length,
      eventos,
      sem_dono: eventos.filter((e) => e.sem_dono),
      // Evento a menos de 14 dias é o que já não dá pra remarcar produção.
      proximos_14d_sem_dono: eventos.filter((e) => e.sem_dono && e.dias_ate !== null && e.dias_ate <= 14),
      tarefas_de_ciclo_atrasadas: tarefaRes.error ? [] : (tarefaRes.data || []),
      tarefas_erro: tarefaRes.error?.message || null,
    });
  }
);

export const listarReunioesPendentes = tool(
  "listar_reunioes_pendentes",
  "PILAR REUNIÕES: reuniões já realizadas sem ata registrada, reuniões próximas sem pauta, e se há transcrição (Plaud) anexada.",
  { dias_atras: z.number().int().min(7).max(180).default(60), limit: z.number().int().min(1).max(60).default(40) },
  async ({ dias_atras, limit }) => {
    const hoje = hojeBRT();
    const desde = somarDias(hoje, -dias_atras);

    const { data: reunioes, error } = await supabase
      .from("governance_meetings")
      .select("id, date, status, pauta, ata, deliberacoes, governance_meeting_types(sigla, nome)")
      .gte("date", desde)
      .lte("date", somarDias(hoje, 21))
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(limit);
    if (error) return fail(`governance_meetings: ${error.message}`);

    const ids = (reunioes || []).map((r) => r.id);
    // Transcrição do Plaud já é suportada pelo módulo — é ela que permite a ata
    // ser CAPTURADA durante a reunião em vez de reconstruída de memória.
    const { data: docs } = ids.length
      ? await supabase
          .from("governance_meeting_docs")
          .select("meeting_id, tipo, nome_arquivo")
          .in("meeting_id", ids)
          .eq("tipo", "transcricao")
          .is("deleted_at", null)
      : { data: [] as Array<{ meeting_id: string; tipo: string; nome_arquivo: string }> };

    const comTranscricao = new Set((docs || []).map((d) => d.meeting_id));

    const enriquecidas = (reunioes || []).map((r) => ({
      id: r.id,
      data: r.date,
      sigla: (r.governance_meeting_types as any)?.sigla || null,
      nome: (r.governance_meeting_types as any)?.nome || null,
      status: r.status,
      tem_pauta: !!r.pauta,
      tem_ata: !!r.ata,
      tem_deliberacoes_texto: !!r.deliberacoes,
      tem_transcricao: comTranscricao.has(r.id),
      passou: !!r.date && r.date < hoje,
    }));

    return ok({
      janela: `${desde} a ${somarDias(hoje, 21)}`,
      total: enriquecidas.length,
      reunioes: enriquecidas,
      // SLA único de ata: 24h, qualquer reunião, qualquer dia.
      realizadas_sem_ata: enriquecidas.filter((r) => r.passou && r.status !== "cancelada" && !r.tem_ata),
      // Tem transcrição e não tem ata = a extração de deliberações por IA está
      // a um clique (o módulo já faz isso). É o caso mais barato de resolver.
      sem_ata_com_transcricao: enriquecidas.filter((r) => r.passou && !r.tem_ata && r.tem_transcricao),
      proximas_sem_pauta: enriquecidas.filter((r) => !r.passou && r.status !== "cancelada" && !r.tem_pauta),
    });
  }
);

export const listarCompromissos = tool(
  "listar_compromissos",
  "PILAR COMPROMISSOS: deliberações e demandas de reunião em aberto, com idade e degrau de escalonamento (N1/N2/N3).",
  { limit: z.number().int().min(1).max(200).default(120) },
  async ({ limit }) => {
    const hoje = hojeBRT();

    const { data: tasks, error } = await supabase
      .from("governance_tasks")
      .select("id, meeting_id, titulo, responsavel, prazo, status, prioridade, origem, created_at")
      .in("status", ["pendente", "em_andamento"])
      .order("prazo", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (error) return fail(`governance_tasks: ${error.message}`);

    const ids = [...new Set((tasks || []).map((t) => t.meeting_id).filter(Boolean))];
    const { data: mtgs } = ids.length
      ? await supabase
          .from("governance_meetings")
          .select("id, date, governance_meeting_types(sigla)")
          .in("id", ids)
      : { data: [] as any[] };
    const porMtg = Object.fromEntries((mtgs || []).map((m: any) => [m.id, { data: m.date, sigla: m.governance_meeting_types?.sigla || null }]));

    const itens = (tasks || []).map((t) => {
      const atrasoDias = t.prazo
        ? Math.round((new Date(`${hoje}T12:00:00`).getTime() - new Date(`${t.prazo}T12:00:00`).getTime()) / 86400000)
        : null;
      return {
        id: t.id,
        titulo: t.titulo,
        // ⚠️ `responsavel` é TEXTO LIVRE nesta tabela. Não tentar casar com
        // pessoa do sistema — grafia diverge (o caso do Wesley em 4 grafias),
        // e afirmar identidade a partir de texto livre é o que a lei do
        // Contrato de porta proíbe.
        responsavel_texto: t.responsavel || null,
        sem_dono: !t.responsavel,
        prazo: t.prazo,
        sem_prazo: !t.prazo,
        status: t.status,
        prioridade: t.prioridade,
        // `origem='deliberacao'` = decisão que SAIU da reunião (o que importa
        // pro "o que não cumprimos"). O resto é demanda de PREPARO, semeada
        // pelos templates — misturar as duas infla a cobrança.
        eh_deliberacao: t.origem === "deliberacao",
        origem: t.origem,
        reuniao: porMtg[t.meeting_id] || null,
        atraso_dias: atrasoDias !== null && atrasoDias > 0 ? atrasoDias : null,
        vence_em_dias: atrasoDias !== null && atrasoDias < 0 ? -atrasoDias : null,
      };
    });

    const deliberacoes = itens.filter((i) => i.eh_deliberacao);
    const vencidas = itens.filter((i) => i.atraso_dias !== null);

    return ok({
      hoje,
      total_em_aberto: itens.length,
      deliberacoes_em_aberto: deliberacoes.length,
      demandas_de_preparo_em_aberto: itens.length - deliberacoes.length,
      // A escada: N1 pedido na sexta · N2 entra no documento de segunda COM
      // NOME · N3 vira pendência formal na ata e o dono passa a ser o líder
      // da área. Cobrar 3 vezes sem consequência ensina que a cobrança é
      // ignorável — o dente do N2 é de graça porque o documento já existe.
      escalonamento: {
        n1_no_prazo_ou_vencendo: itens.filter((i) => i.atraso_dias === null),
        n2_vencidas_ate_7d: vencidas.filter((i) => (i.atraso_dias as number) <= 7),
        n3_vencidas_mais_de_7d: vencidas.filter((i) => (i.atraso_dias as number) > 7),
      },
      sem_dono: itens.filter((i) => i.sem_dono),
      sem_prazo: itens.filter((i) => i.sem_prazo),
      itens,
    });
  }
);

export const listarSaudeIndicadores = tool(
  "listar_saude_indicadores",
  "CHECAGEM DE QUALIDADE: KPIs ativos sem dado nos últimos 60 dias, os que calculam NULO, e os sem dono. Base das mensagens de cobrança.",
  { dias: z.number().int().min(15).max(180).default(60) },
  async ({ dias }) => {
    const hoje = hojeBRT();
    const corte = somarDias(hoje, -dias);

    const { data: kpis, error } = await supabase
      .from("kpi_indicadores_taticos")
      .select("id, indicador, area, lider_funcionario_id, periodicidade, tipo_calculo")
      .eq("ativo", true)
      // `kpi_indicadores_taticos` TEM `deleted_at` — sem o filtro, KPI apagado
      // entraria na contagem e na fila de cobrança.
      .is("deleted_at", null);
    if (error) return fail(`kpi_indicadores_taticos: ${error.message}`);

    // ⚠️⚠️ ESPELHO da régua de `GET /gestao/saude` (backend/routes/gestao.js).
    // São DUAS fontes de valor e ler só uma faz a contagem mentir: KPI manual
    // grava em `kpi_registros`, KPI com fórmula em `kpi_valores_calculados`.
    // Era esse o bug que acusava ~127 "sem registro" contra ~23 reais — e
    // cobrar líder com base nele queima a credibilidade da cobrança.
    // O worker NÃO pode chamar o endpoint (ele exige sessão admin/diretor), daí
    // o espelho. MUDOU LÁ, MUDA AQUI.
    const [regsRes, calcRes] = await Promise.all([
      supabase.from("kpi_registros").select("indicador_id").gte("data_preenchimento", corte),
      supabase.from("kpi_valores_calculados").select("kpi_id, valor_calculado").gte("periodo_referencia", corte),
    ]);

    const fontesOk = !regsRes.error && !calcRes.error;
    const comDado = new Set<string>();
    (regsRes.data || []).forEach((r: any) => comDado.add(r.indicador_id));
    const calculamNulo = new Set<string>();
    (calcRes.data || []).forEach((v: any) => {
      // ⚠️ NULL não é dado: a fórmula rodou e não devolveu nada.
      if (v.valor_calculado === null || v.valor_calculado === undefined) calculamNulo.add(v.kpi_id);
      else comDado.add(v.kpi_id);
    });

    const todos = kpis || [];
    const semDadoNenhum = todos.filter((k) => !comDado.has(k.id));
    const semDado = semDadoNenhum.filter((k) => !calculamNulo.has(k.id));
    const nulos = semDadoNenhum.filter((k) => calculamNulo.has(k.id));
    const semDono = todos.filter((k) => !k.lider_funcionario_id);

    // Área 100% sem dono é UMA decisão, não N. Agrupar é o que transforma 77
    // linhas soltas em ~9 conversas.
    const porArea: Record<string, { total: number; sem_dono: number }> = {};
    todos.forEach((k) => {
      const a = String(k.area || "(sem área)").toLowerCase();
      porArea[a] = porArea[a] || { total: 0, sem_dono: 0 };
      porArea[a].total++;
      if (!k.lider_funcionario_id) porArea[a].sem_dono++;
    });
    const areasSemDono = Object.entries(porArea)
      .filter(([, v]) => v.sem_dono > 0)
      .map(([area, v]) => ({ area, ...v, cem_por_cento: v.sem_dono === v.total }))
      .sort((a, b) => b.sem_dono - a.sem_dono);

    return ok({
      janela_dias: dias,
      desde: corte,
      fontes_lidas: ["kpi_registros", "kpi_valores_calculados"],
      // ⚠️ Falha de consulta NÃO vira "esse KPI não tem dado" — seria virar
      // instabilidade de banco em fila de cobrança indevida.
      incompleto: !fontesOk,
      aviso_incompleto: fontesOk
        ? null
        : `Leitura incompleta (${[regsRes.error && "kpi_registros", calcRes.error && "kpi_valores_calculados"].filter(Boolean).join(", ")}). NÃO cobrar ninguém com estes números.`,
      total_ativos: todos.length,
      sem_dado_nenhum: { total: semDado.length, itens: semDado.slice(0, 40) },
      // Problema DIFERENTE: a fórmula roda e devolve nulo, quase sempre porque
      // o processo de origem não gera evento. Cobrar preenchimento não resolve
      // — é decidir quem passa a registrar, ou aposentar o KPI.
      calculam_nulo: { total: nulos.length, itens: nulos.slice(0, 40) },
      // ⚠️ KPI sem dono não tem a quem cobrar. Cobrar o LÍDER DA ÁREA.
      sem_dono: { total: semDono.length, itens: semDono.slice(0, 40) },
      areas_sem_dono: areasSemDono,
    });
  }
);

export const rotinaGestorReadTools = [
  obterDiaDaRotina,
  listarEventosPendentes,
  listarReunioesPendentes,
  listarCompromissos,
  listarSaudeIndicadores,
];
export const rotinaGestorReadToolNames = rotinaGestorReadTools.map((t) => `mcp__rotina__${t.name}`);
