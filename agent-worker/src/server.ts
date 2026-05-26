import express, { type Request, type Response, type NextFunction } from "express";
import { verify } from "./hmac.js";
import { runFinanceiroExecutor } from "./agents/financeiroExecutor.js";
import { runKpisWatcher } from "./agents/kpisWatcher.js";
import { runRhExecutor } from "./agents/rhExecutor.js";
import { runCuidadosWatcher } from "./agents/cuidadosWatcher.js";
import { runEventosWatcher } from "./agents/eventosWatcher.js";
import { runVoluntariadoWatcher } from "./agents/voluntariadoWatcher.js";
import { runLogisticaWatcher } from "./agents/logisticaWatcher.js";
import { runMembresiaWatcher } from "./agents/membresiaWatcher.js";
import { startScheduler } from "./scheduler.js";

const AGENT_RUNNERS: Record<string, (opts: any) => Promise<any>> = {
  financeiro_executor: runFinanceiroExecutor,
  kpis_watcher: runKpisWatcher,
  rh_executor: runRhExecutor,
  cuidados_watcher: runCuidadosWatcher,
  eventos_watcher: runEventosWatcher,
  voluntariado_watcher: runVoluntariadoWatcher,
  logistica_watcher: runLogisticaWatcher,
  membresia_watcher: runMembresiaWatcher,
};

const app = express();
const PORT = parseInt(process.env.PORT || "8080", 10);

// Captura raw body pra HMAC sem perder pra JSON parser depois
app.use(
  express.json({
    limit: "256kb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

// Health check pro Railway
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "cbrio-agent-worker",
    uptime_s: process.uptime(),
    scheduler: process.env.SCHEDULER_ENABLED === "1",
    timezone: process.env.TZ || "default",
  });
});

// Middleware HMAC pras rotas autenticadas
function hmacAuth(req: any, res: Response, next: NextFunction) {
  const sig = req.header("x-agent-signature");
  if (!verify(req.rawBody || "", sig)) {
    return res.status(401).json({ error: "HMAC invalido" });
  }
  next();
}

// POST /run/:agentType · dispara agente em background, retorna runId imediatamente
app.post("/run/:agentType", hmacAuth, async (req: Request, res: Response) => {
  const { agentType } = req.params;
  const { triggeredBy, config } = req.body || {};

  const runner = AGENT_RUNNERS[agentType];
  if (!runner) {
    return res.status(404).json({
      error: `agentType desconhecido: ${agentType}`,
      disponiveis: Object.keys(AGENT_RUNNERS),
    });
  }

  // Fire-and-forget · responde 202 imediato
  res.status(202).json({ accepted: true, agentType });

  setImmediate(async () => {
    try {
      const r = await runner({ triggeredBy, config });
      console.log(
        `[run] ${agentType} ${r.runId} ${r.status} · $${(r.cost_usd || 0).toFixed(4)}`
      );
    } catch (e) {
      console.error(`[run] ${agentType} excecao:`, (e as Error).message);
    }
  });
});

// Sync endpoint (dev/debug) · roda inline e retorna resultado
app.post(
  "/run-sync/:agentType",
  hmacAuth,
  async (req: Request, res: Response) => {
    const { agentType } = req.params;
    const { triggeredBy, config } = req.body || {};

    const runner = AGENT_RUNNERS[agentType];
    if (!runner) {
      return res.status(404).json({
        error: `agentType desconhecido: ${agentType}`,
        disponiveis: Object.keys(AGENT_RUNNERS),
      });
    }
    try {
      const r = await runner({ triggeredBy, config });
      res.json(r);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] erro:", err.message);
  res.status(500).json({ error: "Erro interno" });
});

app.listen(PORT, () => {
  console.log(`[server] cbrio-agent-worker escutando em :${PORT}`);
  startScheduler();
});
