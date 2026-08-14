// Agente dev · FASE 2 · PORTÕES PENDENTES.
// Runner de PORTÃO: enquanto as envs de liberação não existirem, é no-op duro —
// não cria agent_run, não chama LLM, não toca no banco.
// Registrado em AGENT_RUNNERS para diagnótico, mas NÃO está no scheduler (nunca
// roda sozinho). A implementação completa (git branch+PR, CI watch, orçamento)
// só entra quando o humano liberar os portões.

const GATES: Array<{ env: string; motivo: string }> = [
  { env: "DEV_AGENT_ENABLED", motivo: "kill-switch DEV_AGENT_ENABLED deve ser '1'" },
  { env: "GITHUB_TOKEN", motivo: "credencial GitHub ausente" },
  { env: "DEV_BUDGET_MENSAL_USD", motivo: "orcamento mensal nao definido" },
  { env: "SANDBOX_DATABASE_URL", motivo: "banco sandbox nao configurado" },
];

export async function runDevAgent(opts: { triggeredBy?: string | null } = {}): Promise<{
  runId: null;
  status: "cancelled";
  motivo: string;
  gates_abertos: Array<{ env: string; motivo: string }>;
}> {
  const gatesAbertos = GATES.filter((g) => {
    if (g.env === "DEV_AGENT_ENABLED") return process.env.DEV_AGENT_ENABLED !== "1";
    return !process.env[g.env];
  });

  const motivo =
    gatesAbertos.length > 0
      ? `Portoes da Fase 2 pendentes (${gatesAbertos.map((g) => g.env).join(", ")}). Nenhuma acao executada.`
      : "Portoes liberados, mas a implementacao completa do dev agent ainda nao foi entregue (scaffold). Nenhuma acao executada.";

  console.warn(`[devAgent] bloqueado: ${motivo}`);

  // Registro de diagnóstico apenas no log do worker; o banco fica intocado
  // enquanto os portões não forem liberados.
  void opts;

  return { runId: null, status: "cancelled", motivo, gates_abertos: gatesAbertos };
}
