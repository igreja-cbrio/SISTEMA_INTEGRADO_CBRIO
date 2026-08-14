// Tool de ENTREGA do relatório de KPI/OKR.
//
// ⚠️ Por que uma tool em vez de "responda em JSON": texto final de modelo varia
// de formato e o parse quebra — e quebrar aqui significa a segunda-feira sem
// relatório. Com tool, o schema é validado pelo próprio SDK antes de chegar em
// nós, e o payload cai numa closure em memória (mesmo padrão dos `propor_*`).
//
// ⚠️ Ela NÃO escreve no banco. O relatório é somente-leitura; rascunho de
// revisão de OKR sai como texto no e-mail, pra alguém registrar.

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const Achado = z.object({
  titulo: z.string().describe("Uma frase. O defeito ou o avanço, sem rodeio."),
  numero: z.string().describe("O valor COM o período. Ex: '1.228 (2026-W32)'. Sem período, não entra."),
  comparacao: z.string().describe("A base da variação. Ex: 'de 1.674 (W32/2025) para 1.228'. Nunca só '-27%'."),
  kpi_id: z.string().optional(),
  area: z.string().optional(),
  dono: z.string().optional().describe("Nome do líder quando existir cadastrado. Sem inventar."),
  causa: z.string().optional(),
  causa_verificada: z.boolean().default(false).describe("true só se uma consulta sustenta. Senão sai rotulado como hipótese."),
  acao: z.string().optional().describe("Uma ação concreta. Na seção de decisão, é a decisão pedida."),
});

const schema = {
  periodo_semanal: z.string().describe("Período semanal fechado julgado. Ex: 2026-W32"),
  periodo_mensal: z.string().describe("Período mensal fechado julgado. Ex: 2026-07"),

  veredito_mudou: z.string().describe("O que mudou. Uma frase com número."),
  veredito_risco: z.string().describe("O que está em risco. Uma frase."),
  veredito_fazer: z.string().describe("O que fazer. Uma frase."),

  ressalva: z
    .string()
    .optional()
    .describe("Aviso que abre o relatório quando o painel não pode ser lido ao pé da letra. Vazio se não houver."),

  decisoes: z.array(Achado).max(6).describe("Itens em que nada anda sem o Matheus. Vazio se não houver — e aí o texto diz isso."),
  riscos: z.array(Achado).max(8).describe("Desvios materiais com tendência, do maior pro menor."),
  avancos: z.array(Achado).max(6).describe("O que melhorou, com número. Não omitir: metade do valor é saber o que funciona."),

  okr_resumo: z.string().describe("2-4 frases sobre o nível objetivo: defasagem contra o ciclo e o que está travado por área."),
  okr_travados: z
    .array(z.object({ area: z.string(), o_que_trava: z.string(), lider: z.string().optional() }))
    .max(10)
    .default([]),

  confiabilidade_indice: z.number().min(0).max(100).describe("0-100. Quanto o painel merece confiança nesta semana."),
  confiabilidade_conta: z.string().describe("A conta explícita que produziu o índice. Sem isso o número é opinião."),
  confiabilidade_pendencias: z.array(z.string()).max(5).default([]),

  falsos_alarmes: z
    .array(z.string())
    .max(6)
    .default([])
    .describe("O que PARECE problema e não é (feriado, módulo que entrou em uso, base nominal atrasada). Evita a liderança escalar ruído."),

  revisoes_okr_sugeridas: z
    .array(
      z.object({
        objetivo: z.string(),
        causa_desvio: z.string(),
        decisao: z.string(),
        proximo_passo: z.string(),
        prazo: z.string().optional(),
      })
    )
    .max(5)
    .default([])
    .describe("Rascunho pra alguém registrar em okr_revisoes. O time NÃO escreve no banco."),
};

export type RelatorioPayload = {
  periodo_semanal: string;
  periodo_mensal: string;
  veredito_mudou: string;
  veredito_risco: string;
  veredito_fazer: string;
  ressalva?: string;
  decisoes: any[];
  riscos: any[];
  avancos: any[];
  okr_resumo: string;
  okr_travados: any[];
  confiabilidade_indice: number;
  confiabilidade_conta: string;
  confiabilidade_pendencias: string[];
  falsos_alarmes: string[];
  revisoes_okr_sugeridas: any[];
};

export function createEntregaTool() {
  const capturado: { payload: RelatorioPayload | null } = { payload: null };

  const entregar = tool(
    "entregar_relatorio",
    "Entrega o relatorio final estruturado. Chame UMA vez, no fim, depois de ter verificado os achados. Todo numero precisa vir com periodo; achado apoiado em periodo em aberto NAO entra.",
    schema,
    async (input) => {
      capturado.payload = input as RelatorioPayload;
      const n =
        (input.decisoes?.length || 0) +
        (input.riscos?.length || 0) +
        (input.avancos?.length || 0);
      return {
        content: [
          {
            type: "text" as const,
            text: `Relatorio recebido: ${n} itens (${input.decisoes?.length || 0} decisao, ${input.riscos?.length || 0} risco, ${input.avancos?.length || 0} avanco) · confiabilidade ${input.confiabilidade_indice}/100. Pode encerrar.`,
          },
        ],
      };
    }
  );

  return { entregar, capturado, toolName: "mcp__kpirel__entregar_relatorio" };
}
