import cron from "node-cron";
import { runFinanceiroExecutor } from "./agents/financeiroExecutor.js";
import { runKpisWatcher } from "./agents/kpisWatcher.js";
import { runRhExecutor } from "./agents/rhExecutor.js";
import { runCuidadosWatcher } from "./agents/cuidadosWatcher.js";
import { runEventosWatcher } from "./agents/eventosWatcher.js";
import { runVoluntariadoWatcher } from "./agents/voluntariadoWatcher.js";
import { runLogisticaWatcher } from "./agents/logisticaWatcher.js";
import { runMembresiaWatcher } from "./agents/membresiaWatcher.js";
import { runPatrimonioWatcher } from "./agents/patrimonioWatcher.js";
import { runCerebroWatcher } from "./agents/cerebroWatcher.js";
import { runNextWatcher } from "./agents/nextWatcher.js";
import { runGruposWatcher } from "./agents/gruposWatcher.js";
import { runNpsWatcher } from "./agents/npsWatcher.js";
import { runProjetosWatcher } from "./agents/projetosWatcher.js";

// Cron expressions assumem TZ=America/Sao_Paulo (definido no env do Railway).
// Por enquanto: 1x/semana · segunda-feira as 06:00 SP.
const SCHEDULE = "0 6 * * 1";

const SCHEDULED_AGENTS: Array<{
  type: string;
  runner: (opts: any) => Promise<any>;
}> = [
  { type: "financeiro_executor", runner: runFinanceiroExecutor },
  { type: "kpis_watcher", runner: runKpisWatcher },
  { type: "rh_executor", runner: runRhExecutor },
  { type: "cuidados_watcher", runner: runCuidadosWatcher },
  { type: "eventos_watcher", runner: runEventosWatcher },
  { type: "voluntariado_watcher", runner: runVoluntariadoWatcher },
  { type: "logistica_watcher", runner: runLogisticaWatcher },
  { type: "membresia_watcher", runner: runMembresiaWatcher },
  { type: "patrimonio_watcher", runner: runPatrimonioWatcher },
  { type: "cerebro_watcher", runner: runCerebroWatcher },
  { type: "next_watcher", runner: runNextWatcher },
  { type: "grupos_watcher", runner: runGruposWatcher },
  { type: "nps_watcher", runner: runNpsWatcher },
  { type: "projetos_watcher", runner: runProjetosWatcher },
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
