import cron from "node-cron";
import { runFinanceiroExecutor } from "./agents/financeiroExecutor.js";

// Cron expressions assumem TZ=America/Sao_Paulo (definido no env do Railway).
// 9h, 14h, 19h diario.
const SCHEDULE = "0 9,14,19 * * *";

export function startScheduler() {
  if (process.env.SCHEDULER_ENABLED !== "1") {
    console.log("[scheduler] desabilitado (SCHEDULER_ENABLED != 1)");
    return;
  }

  console.log(`[scheduler] cron registrado: ${SCHEDULE} (TZ=${process.env.TZ || "default"})`);

  cron.schedule(
    SCHEDULE,
    async () => {
      const now = new Date().toISOString();
      console.log(`[scheduler] ${now} disparando financeiroExecutor`);
      try {
        const r = await runFinanceiroExecutor({ config: { trigger: "cron" } });
        console.log(
          `[scheduler] run ${r.runId} ${r.status} · ${r.propostas_geradas} propostas · $${r.cost_usd.toFixed(4)}`
        );
      } catch (e) {
        console.error("[scheduler] excecao:", (e as Error).message);
      }
    },
    { timezone: process.env.TZ || "America/Sao_Paulo" }
  );
}
