import cron from "node-cron";
import { runFinanceiroExecutor } from "./agents/financeiroExecutor.js";
import { runKpisWatcher } from "./agents/kpisWatcher.js";

// Cron expressions assumem TZ=America/Sao_Paulo (definido no env do Railway).
// Todos rodam 3x/dia: 9h, 14h, 19h.
const SCHEDULE = "0 9,14,19 * * *";

const SCHEDULED_AGENTS: Array<{
  type: string;
  runner: (opts: any) => Promise<any>;
}> = [
  { type: "financeiro_executor", runner: runFinanceiroExecutor },
  { type: "kpis_watcher", runner: runKpisWatcher },
];

export function startScheduler() {
  if (process.env.SCHEDULER_ENABLED !== "1") {
    console.log("[scheduler] desabilitado (SCHEDULER_ENABLED != 1)");
    return;
  }

  console.log(
    `[scheduler] cron registrado: ${SCHEDULE} (TZ=${process.env.TZ || "default"}) · agentes: ${SCHEDULED_AGENTS.map((a) => a.type).join(", ")}`
  );

  cron.schedule(
    SCHEDULE,
    async () => {
      const now = new Date().toISOString();
      console.log(`[scheduler] ${now} disparando ${SCHEDULED_AGENTS.length} agente(s)`);
      for (const agent of SCHEDULED_AGENTS) {
        try {
          const r = await agent.runner({ config: { trigger: "cron" } });
          console.log(
            `[scheduler] ${agent.type} ${r.runId} ${r.status} · $${(r.cost_usd || 0).toFixed(4)}`
          );
        } catch (e) {
          console.error(`[scheduler] ${agent.type} excecao:`, (e as Error).message);
        }
      }
    },
    { timezone: process.env.TZ || "America/Sao_Paulo" }
  );
}
