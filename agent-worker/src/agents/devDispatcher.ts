import { supabase } from "../supabase.js";
import { runDevAgent } from "./devAgent.js";

// Dispatcher do Agente Dev · agenda o runner por tarefa.
// Roda a cada 10 min (scheduler.ts). Varre o board por tarefas `agendada` do
// developer_agent (ordem de criação) e dispara o runner para cada uma — o
// claim atômico dentro do runner evita corrida com um disparo manual.
// Re-claim de tarefas órfãs é automático: se o worker reiniciou no meio, a
// tarefa continua `em_andamento`; se ficou presa, um humano volta pra
// `agendada` e o dispatcher pega de novo.

const MAX_POR_TICK = 3;

export async function runDevDispatcher(): Promise<{
  runId: null;
  status: "completed" | "cancelled" | "failed";
  summary: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  error?: string;
}> {
  if (process.env.DEV_AGENT_ENABLED !== "1" || !process.env.GITHUB_TOKEN) {
    const summary = "Dispatcher do dev agent desabilitado (DEV_AGENT_ENABLED != 1 ou GITHUB_TOKEN ausente)";
    console.log(`[devDispatcher] ${summary}`);
    return { runId: null, status: "cancelled", summary, tokens_input: 0, tokens_output: 0, cost_usd: 0 };
  }

  try {
    const { data, error } = await supabase
      .from("agent_tarefas")
      .select("id, titulo")
      .eq("agente_key", "developer_agent")
      .eq("status", "agendada")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(MAX_POR_TICK);
    if (error) throw new Error(error.message);

    let disparadas = 0;
    for (const t of data || []) {
      const r = await runDevAgent({ config: { trigger: "cron", taskId: t.id } });
      if (r.runId) disparadas++;
    }
    const summary = `dispatcher: ${disparadas}/${(data || []).length} tarefa(s) disparada(s)`;
    console.log(`[devDispatcher] ${summary}`);
    return { runId: null, status: "completed", summary, tokens_input: 0, tokens_output: 0, cost_usd: 0 };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[devDispatcher] excecao:", msg);
    return { runId: null, status: "failed", summary: `Falha no dispatcher: ${msg}`, tokens_input: 0, tokens_output: 0, cost_usd: 0, error: msg };
  }
}
