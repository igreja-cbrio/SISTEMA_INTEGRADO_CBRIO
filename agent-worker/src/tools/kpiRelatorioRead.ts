// Ferramentas de LEITURA do relatório semanal de KPI/OKR.
//
// Separadas de kpisRead.ts de propósito: aquelas servem o WATCHER (que propõe
// alerta pro líder e olha o estado de AGORA); estas servem o RELATÓRIO (que
// julga PERÍODO FECHADO e precisa de série, cobertura e frescor de fonte).
//
// ⚠️ Nenhuma delas escreve. O relatório é 100% somente-leitura: rascunho de
// revisão de OKR sai como TEXTO no e-mail, pra alguém registrar.

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function fail(msg: string) {
  return { content: [{ type: "text" as const, text: `ERRO: ${msg}` }], isError: true };
}

// ---------------------------------------------------------------------------
// Períodos de FECHAMENTO
//
// ⚠️ Calculados a partir de AGORA, nunca de max(periodo_referencia): há valor
// lançado em período FUTURO na base (placeholder zerado do coletor), e usar o
// máximo faria o relatório julgar uma semana que ainda não aconteceu.
// ---------------------------------------------------------------------------

/** Semana ISO de uma data, no formato AAAA-Www (mesmo formato do banco). */
export function semanaIso(d: Date): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = dt.getUTCDay() || 7; // domingo = 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dow); // quinta da mesma semana ISO
  const ano = dt.getUTCFullYear();
  const jan1 = new Date(Date.UTC(ano, 0, 1));
  const semana = Math.ceil(((dt.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${ano}-W${String(semana).padStart(2, "0")}`;
}

/** "Hoje" no fuso da igreja — o dia de operação é BRT, não UTC. */
function hojeBRT(): Date {
  const agora = new Date();
  const s = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [a, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function periodosFechados(base?: Date) {
  const hoje = base || hojeBRT();

  const semanaPassada = new Date(hoje);
  semanaPassada.setUTCDate(semanaPassada.getUTCDate() - 7);

  const mesAnterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  const mensal = `${mesAnterior.getUTCFullYear()}-${String(mesAnterior.getUTCMonth() + 1).padStart(2, "0")}`;

  // Trimestre/semestre FECHADO = o anterior ao corrente.
  const trimCorrente = Math.floor(hoje.getUTCMonth() / 3) + 1;
  const trimestral =
    trimCorrente === 1
      ? `${hoje.getUTCFullYear() - 1}-Q4`
      : `${hoje.getUTCFullYear()}-Q${trimCorrente - 1}`;

  const semCorrente = hoje.getUTCMonth() < 6 ? 1 : 2;
  const semestral =
    semCorrente === 1
      ? `${hoje.getUTCFullYear() - 1}-S2`
      : `${hoje.getUTCFullYear()}-S1`;

  return {
    hoje: hoje.toISOString().slice(0, 10),
    semanal: semanaIso(semanaPassada),
    semanal_corrente: semanaIso(hoje),
    mensal,
    trimestral,
    semestral,
    anual: String(hoje.getUTCFullYear() - 1),
  };
}

export const obterPeriodosFechados = tool(
  "obter_periodos_fechados",
  "Devolve os periodos de FECHAMENTO a julgar (semanal/mensal/trimestral/semestral/anual), calculados a partir de hoje no fuso de Sao Paulo. Chame SEMPRE primeiro. Nunca deduza periodo de max(periodo_referencia): ha valor lancado em periodo futuro na base.",
  {},
  async () => ok(periodosFechados())
);

export const listarFarol = tool(
  "listar_farol",
  "Farol de todos os KPIs taticos ativos (vw_kpi_taticos_status): meta_efetiva, ultimo_valor, ultimo_periodo, status, lider, fonte_auto. Use para o retrato geral e para a tabela final.",
  {
    area: z.string().optional(),
    status: z.enum(["vermelho", "amarelo", "verde", "pendente"]).optional(),
    limit: z.number().int().min(1).max(200).default(200),
  },
  async ({ area, status, limit }) => {
    let q = supabase
      .from("vw_kpi_taticos_status")
      .select(
        "id, area, indicador, periodicidade, unidade, meta_efetiva, meta_periodo, periodo_atual, ultimo_periodo, ultimo_valor, ultima_data, status, lider_nome, fonte_auto, is_okr, ativo"
      )
      .eq("ativo", true)
      .order("area", { ascending: true })
      .limit(limit);
    if (area) q = q.ilike("area", area);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const listarTrajetoria = tool(
  "listar_trajetoria",
  "Percentual da meta e status_trajetoria por KPI (vw_kpi_trajetoria_atual). Complementa o farol com a leitura de trajetoria.",
  { limit: z.number().int().min(1).max(200).default(200) },
  async ({ limit }) => {
    const { data, error } = await supabase
      .from("vw_kpi_trajetoria_atual")
      .select(
        "kpi_id, indicador, area, periodicidade, is_okr, meta_efetiva, meta_periodo, ultimo_periodo, ultimo_valor, status, status_trajetoria, percentual_meta"
      )
      .limit(limit);
    if (error) return fail(error.message);
    return ok({ total: data?.length || 0, itens: data || [] });
  }
);

export const serieDoKpi = tool(
  "serie_do_kpi",
  "Serie historica de um KPI: une kpi_registros (manual) e kpi_valores_calculados (automatico), ordenada por periodo. Use para julgar TENDENCIA — uma queda pontual nao e achado, tres periodos na mesma direcao sim.",
  {
    kpi_id: z.string(),
    limit: z.number().int().min(2).max(24).default(8),
  },
  async ({ kpi_id, limit }) => {
    const [reg, calc] = await Promise.all([
      supabase
        .from("kpi_registros")
        .select("periodo_referencia, valor_realizado, data_preenchimento, responsavel, origem")
        .eq("indicador_id", kpi_id)
        .order("periodo_referencia", { ascending: false })
        .limit(limit * 2),
      supabase
        .from("kpi_valores_calculados")
        .select("periodo_referencia, valor_calculado, calculado_em, detalhes")
        .eq("kpi_id", kpi_id)
        .order("periodo_referencia", { ascending: false })
        .limit(limit * 2),
    ]);
    if (reg.error) return fail(`kpi_registros: ${reg.error.message}`);
    if (calc.error) return fail(`kpi_valores_calculados: ${calc.error.message}`);

    const porPeriodo = new Map<string, any>();
    for (const r of calc.data || []) {
      porPeriodo.set(r.periodo_referencia, {
        periodo: r.periodo_referencia,
        valor: r.valor_calculado,
        fonte: "calculado",
        em: r.calculado_em,
        detalhes: r.detalhes,
      });
    }
    // Manual VENCE o calculado no mesmo período: quando alguém preenche à mão
    // sobre um KPI automático, é correção humana — e correção humana ganha.
    for (const r of reg.data || []) {
      porPeriodo.set(r.periodo_referencia, {
        periodo: r.periodo_referencia,
        valor: r.valor_realizado,
        fonte: r.origem === "auto" ? "auto(registro)" : "manual",
        em: r.data_preenchimento,
        responsavel: r.responsavel,
      });
    }
    const serie = [...porPeriodo.values()]
      .sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)))
      .slice(0, limit)
      .reverse();
    return ok({ kpi_id, pontos: serie.length, serie });
  }
);

export const coberturaDoPeriodo = tool(
  "cobertura_do_periodo",
  "Quantos KPIs tem valor no periodo FECHADO da sua periodicidade, por area. Responde 'da pra confiar no painel esta semana?'. Separa manual (falha de rotina) de fonte_auto (falha tecnica).",
  {},
  async () => {
    const p = periodosFechados();
    const alvo: Record<string, string> = {
      semanal: p.semanal,
      mensal: p.mensal,
      trimestral: p.trimestral,
      semestral: p.semestral,
      anual: p.anual,
    };

    const { data: kpis, error } = await supabase
      .from("kpi_indicadores_taticos")
      .select("id, area, periodicidade, fonte_auto, meta_valor, lider_funcionario_id")
      .eq("ativo", true)
      .is("deleted_at", null)
      .limit(500);
    if (error) return fail(error.message);

    const ids = (kpis || []).map((k) => k.id);
    const comValor = new Set<string>();
    // .in() em lotes de 200: lista longa estoura a URL do PostgREST.
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const periodos = [...new Set(Object.values(alvo))];
      const [r1, r2] = await Promise.all([
        supabase
          .from("kpi_registros")
          .select("indicador_id, periodo_referencia")
          .in("indicador_id", lote)
          .in("periodo_referencia", periodos),
        supabase
          .from("kpi_valores_calculados")
          .select("kpi_id, periodo_referencia, valor_calculado")
          .in("kpi_id", lote)
          .in("periodo_referencia", periodos),
      ]);
      if (r1.error) return fail(`kpi_registros: ${r1.error.message}`);
      if (r2.error) return fail(`kpi_valores_calculados: ${r2.error.message}`);
      for (const r of r1.data || []) comValor.add(`${r.indicador_id}|${r.periodo_referencia}`);
      for (const r of r2.data || []) {
        if (r.valor_calculado !== null && r.valor_calculado !== undefined) {
          comValor.add(`${r.kpi_id}|${r.periodo_referencia}`);
        }
      }
    }

    const porArea: Record<string, any> = {};
    const faltantes: any[] = [];
    for (const k of kpis || []) {
      const periodo = alvo[k.periodicidade as string];
      if (!periodo) continue;
      const area = k.area || "(sem area)";
      porArea[area] = porArea[area] || { area, total: 0, com_valor: 0, sem_valor_auto: 0, sem_valor_manual: 0 };
      porArea[area].total++;
      if (comValor.has(`${k.id}|${periodo}`)) {
        porArea[area].com_valor++;
      } else {
        if (k.fonte_auto) porArea[area].sem_valor_auto++;
        else porArea[area].sem_valor_manual++;
        faltantes.push({
          kpi_id: k.id,
          area,
          periodicidade: k.periodicidade,
          periodo,
          tipo: k.fonte_auto ? "tecnica(fonte_auto)" : "rotina(manual)",
          fonte_auto: k.fonte_auto || null,
        });
      }
    }

    const total = (kpis || []).length;
    const cobertos = Object.values(porArea).reduce((s: number, a: any) => s + a.com_valor, 0);
    return ok({
      periodos: alvo,
      total_kpis: total,
      com_valor_no_periodo_fechado: cobertos,
      percentual: total ? Math.round((cobertos / total) * 1000) / 10 : 0,
      por_area: Object.values(porArea).sort((a: any, b: any) => b.total - a.total),
      sem_meta: (kpis || []).filter((k) => k.meta_valor === null).length,
      sem_lider: (kpis || []).filter((k) => !k.lider_funcionario_id).length,
      faltantes: faltantes.slice(0, 80),
    });
  }
);

export const frescorDasFontes = tool(
  "frescor_das_fontes",
  "Por familia de fonte_auto (cultos.*, cuidados.*, nps.*, ...): quantos KPIs, quando escreveu pela ultima vez em cada tabela. Familia inteira parada = cron quebrado; KPI isolado = problema do indicador.",
  {},
  async () => {
    const { data: kpis, error } = await supabase
      .from("kpi_indicadores_taticos")
      .select("id, fonte_auto, area, periodicidade")
      .eq("ativo", true)
      .is("deleted_at", null)
      .not("fonte_auto", "is", null)
      .limit(300);
    if (error) return fail(error.message);

    const ids = (kpis || []).map((k) => k.id);
    const ultimoCalc = new Map<string, string>();
    const ultimoReg = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const [c, r] = await Promise.all([
        supabase
          .from("kpi_valores_calculados")
          .select("kpi_id, calculado_em")
          .in("kpi_id", lote)
          .order("calculado_em", { ascending: false })
          .limit(2000),
        supabase
          .from("kpi_registros")
          .select("indicador_id, data_preenchimento")
          .in("indicador_id", lote)
          .order("data_preenchimento", { ascending: false })
          .limit(2000),
      ]);
      if (c.error) return fail(`kpi_valores_calculados: ${c.error.message}`);
      if (r.error) return fail(`kpi_registros: ${r.error.message}`);
      for (const x of c.data || []) {
        if (!ultimoCalc.has(x.kpi_id)) ultimoCalc.set(x.kpi_id, x.calculado_em);
      }
      for (const x of r.data || []) {
        if (!ultimoReg.has(x.indicador_id)) ultimoReg.set(x.indicador_id, x.data_preenchimento);
      }
    }

    const familias: Record<string, any> = {};
    for (const k of kpis || []) {
      const fam = String(k.fonte_auto).split(".")[0];
      familias[fam] = familias[fam] || { familia: fam, kpis: 0, nunca_calculou: 0, ultimo_calculado_em: null, ultimo_registro_em: null };
      familias[fam].kpis++;
      const c = ultimoCalc.get(k.id);
      const r = ultimoReg.get(k.id);
      if (!c) familias[fam].nunca_calculou++;
      if (c && (!familias[fam].ultimo_calculado_em || c > familias[fam].ultimo_calculado_em)) {
        familias[fam].ultimo_calculado_em = c;
      }
      if (r && (!familias[fam].ultimo_registro_em || r > familias[fam].ultimo_registro_em)) {
        familias[fam].ultimo_registro_em = r;
      }
    }
    return ok({
      total_com_fonte_auto: (kpis || []).length,
      // ⚠️ Uma familia pode estar viva por kpi_registros (origem auto) mesmo com
      // kpi_valores_calculados parado: sao DUAS trilhas de escrita.
      familias: Object.values(familias).sort((a: any, b: any) => b.kpis - a.kpis),
    });
  }
);

export const okrPanorama = tool(
  "okr_panorama",
  "Nivel OKR: score composto por objetivo, cascata de KRs e revisoes abertas. Use para a secao de OKR do relatorio.",
  {},
  async () => {
    const [score, cascata, revisoes] = await Promise.all([
      supabase.from("vw_okr_score_composto").select("*").limit(100),
      supabase.from("vw_kr_cascata").select("*").limit(200),
      supabase.from("vw_okr_revisoes_abertas").select("*").limit(50),
    ]);
    if (score.error) return fail(`vw_okr_score_composto: ${score.error.message}`);
    return ok({
      objetivos: score.data || [],
      cascata: cascata.error ? { erro: cascata.error.message } : cascata.data || [],
      revisoes_abertas: revisoes.error ? { erro: revisoes.error.message } : revisoes.data || [],
    });
  }
);

export const nsmPanorama = tool(
  "nsm_panorama",
  "North Star Metric: painel por segmento (convertidos, engajados em 60d, % vs meta) e o tamanho do buraco de dados (cultos com decisao sem cadastro) nos ultimos 90 dias.",
  {},
  async () => {
    const noventaDias = new Date();
    noventaDias.setDate(noventaDias.getDate() - 90);
    const [painel, semDados] = await Promise.all([
      supabase.from("vw_nsm_painel").select("*").limit(20),
      supabase
        .from("vw_nsm_sem_dados")
        .select("data_culto, total_decisoes, total_registradas, sem_dados, gap_status")
        .gte("data_culto", noventaDias.toISOString().slice(0, 10))
        .limit(400),
    ]);
    if (painel.error) return fail(`vw_nsm_painel: ${painel.error.message}`);

    const linhas = semDados.error ? [] : semDados.data || [];
    const decisoes = linhas.reduce((s, l: any) => s + (l.total_decisoes || 0), 0);
    const gap = linhas.reduce((s, l: any) => s + (l.sem_dados || 0), 0);
    return ok({
      painel: painel.data || [],
      // ⚠️ O gap ACUMULADO historico e lastro, nao operacao atual. Sempre
      // reportar a janela de 90 dias, dizendo que e de 90 dias.
      gap_90_dias: semDados.error
        ? { erro: semDados.error.message }
        : {
            cultos: linhas.length,
            decisoes,
            sem_cadastro: gap,
            percentual: decisoes ? Math.round((gap / decisoes) * 1000) / 10 : 0,
          },
    });
  }
);

export const pulsoSemanal = tool(
  "pulso_semanal",
  "Frequencia, kids, aceitacoes, voluntariado e online por semana ISO (vw_dashboard_semanal), ultimas semanas. Serve para checar a causa operacional por tras de um KPI.",
  { semanas: z.number().int().min(2).max(16).default(8) },
  async ({ semanas }) => {
    const { data, error } = await supabase
      .from("vw_dashboard_semanal")
      .select(
        "ano_iso, semana_iso, service_type_name, total_cultos, frequencia, frequencia_kids, aceitacoes, aceitacoes_online, aceitacoes_kids, voluntariado, total_presencial"
      )
      .order("ano_iso", { ascending: false })
      .order("semana_iso", { ascending: false })
      .limit(semanas * 12);
    if (error) return fail(error.message);
    return ok({ linhas: data?.length || 0, itens: data || [] });
  }
);

export const consultarViewFinanceira = tool(
  "consultar_view_financeira",
  "Le uma view financeira de apoio para checar causa: vw_fin_arrecadacao_mensal, vw_fin_dre_mensal, vw_doacoes_mensal, vw_solicitacoes_sla. Somente leitura.",
  {
    view: z.enum([
      "vw_fin_arrecadacao_mensal",
      "vw_fin_dre_mensal",
      "vw_doacoes_mensal",
      "vw_solicitacoes_sla",
    ]),
    limit: z.number().int().min(1).max(60).default(14),
  },
  async ({ view, limit }) => {
    const { data, error } = await supabase.from(view).select("*").limit(limit);
    if (error) return fail(`${view}: ${error.message}`);
    return ok({ view, linhas: data?.length || 0, itens: data || [] });
  }
);

export const kpiRelatorioReadTools = [
  obterPeriodosFechados,
  listarFarol,
  listarTrajetoria,
  serieDoKpi,
  coberturaDoPeriodo,
  frescorDasFontes,
  okrPanorama,
  nsmPanorama,
  pulsoSemanal,
  consultarViewFinanceira,
];

export const kpiRelatorioReadToolNames = kpiRelatorioReadTools.map(
  (t) => `mcp__kpirel__${t.name}`
);
