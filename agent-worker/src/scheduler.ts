import cron from "node-cron";
import { iniciarVigia } from "./vigia.js";
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
import { runPilotoTriageWatcher } from "./agents/pilotoTriageWatcher.js";
import { runCyberAgent } from "./agents/cyberAgent.js";
import { runDevDispatcher } from "./agents/devDispatcher.js";
import { runKpiRelatorioSemanal } from "./agents/kpiRelatorioSemanal.js";
import { runRotinaGestor } from "./agents/rotinaGestor.js";

// Cron expressions assumem TZ=America/Sao_Paulo (definido no env do Railway).
// Por enquanto: 1x/semana · segunda-feira as 06:00 SP.
const SCHEDULE = "0 6 * * 1";

// Agentes DIÁRIOS (cadência própria · triagem do piloto manda o relatório do dia).
const SCHEDULE_DIARIO = "0 7 * * *"; // todo dia 07:00 SP
const SCHEDULED_AGENTS_DIARIOS: Array<{ type: string; runner: (opts: any) => Promise<any> }> = [
  { type: "piloto_triage_watcher", runner: runPilotoTriageWatcher },
];

// Rotina de GESTÃO DE PROJETOS · 3 dias por semana, não todo dia.
// ⚠️ A cadência É o desenho: SEXTA abastece (tudo que depende de outra pessoa
// sai hoje, com 5 dias de folga até a quarta) · SEGUNDA decide e comunica ·
// QUARTA fecha. Terça e quinta saíram de propósito — cinco manhãs de
// coordenação não caberiam na semana de quem também é dev/QA do sistema.
// 07:00 SP é antes da reunião das 9h da segunda.
const SCHEDULE_ROTINA = "0 7 * * 1,3,5";
const SCHEDULED_AGENTS_ROTINA: Array<{ type: string; runner: (opts: any) => Promise<any> }> = [
  { type: "rotina_gestor", runner: runRotinaGestor },
];

// Dispatcher do dev agent · varre o board a cada 10 min por tarefas agendadas.
const SCHEDULE_DISPATCHER = "*/10 * * * *";

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
  { type: "cyber_agent", runner: runCyberAgent },
  // ⚠️ POR ÚLTIMO de propósito: o relatório lê o estado depois de os watchers
  // da rodada terem passado, e é o único que manda e-mail pra fora — se algum
  // watcher explodir, o loop segue (cada um tem try/catch) e o relatório ainda
  // sai, que é o que a liderança espera na segunda de manhã.
  { type: "kpi_relatorio_semanal", runner: runKpiRelatorioSemanal },
];

export function startScheduler() {
  // ⚠️⚠️ O VIGIA sobe ANTES do gate do SCHEDULER_ENABLED, de propósito:
  // detectar que o sistema caiu não pode depender da mesma chave que liga os
  // agentes de IA. Desligar os agentes (por custo, por exemplo) não pode
  // desligar o alarme de incêndio. O vigia tem o kill switch PRÓPRIO
  // (VIGIA_ENABLED).
  iniciarVigia();

  if (process.env.SCHEDULER_ENABLED !== "1") {
    console.log("[scheduler] desabilitado (SCHEDULER_ENABLED != 1)");
    return;
  }

  const tz = process.env.TZ || "America/Sao_Paulo";
  console.log(
    `[scheduler] semanal ${SCHEDULE}: ${SCHEDULED_AGENTS.map((a) => a.type).join(", ")} · diário ${SCHEDULE_DIARIO}: ${SCHEDULED_AGENTS_DIARIOS.map((a) => a.type).join(", ")} · rotina ${SCHEDULE_ROTINA}: ${SCHEDULED_AGENTS_ROTINA.map((a) => a.type).join(", ")} · dispatcher dev ${SCHEDULE_DISPATCHER} (TZ=${tz})`
  );

  const dispara = async (lista: typeof SCHEDULED_AGENTS) => {
    const now = new Date().toISOString();
    console.log(`[scheduler] ${now} disparando ${lista.length} agente(s)`);
    for (const agent of lista) {
      try {
        const r = await agent.runner({ config: { trigger: "cron" } });
        console.log(`[scheduler] ${agent.type} ${r.runId} ${r.status} · $${(r.cost_usd || 0).toFixed(4)}`);
      } catch (e) {
        console.error(`[scheduler] ${agent.type} excecao:`, (e as Error).message);
      }
    }
  };

  cron.schedule(SCHEDULE, () => dispara(SCHEDULED_AGENTS), { timezone: tz });
  cron.schedule(SCHEDULE_DIARIO, () => dispara(SCHEDULED_AGENTS_DIARIOS), { timezone: tz });
  cron.schedule(SCHEDULE_ROTINA, () => dispara(SCHEDULED_AGENTS_ROTINA), { timezone: tz });
  cron.schedule(
    SCHEDULE_DISPATCHER,
    () => {
      runDevDispatcher().catch((e) => console.error("[scheduler] devDispatcher excecao:", (e as Error).message));
    },
    { timezone: tz }
  );
}
