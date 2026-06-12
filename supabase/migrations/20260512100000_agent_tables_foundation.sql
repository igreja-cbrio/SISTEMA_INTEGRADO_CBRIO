-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Foundation do Assistente IA — tabelas faltantes                       ║
-- ║                                                                       ║
-- ║ As tabelas abaixo são referenciadas em backend/routes/agents.js e em  ║
-- ║ backend/services/agentService.js desde o início do módulo, mas        ║
-- ║ NENHUMA delas tinha migration. Sem isso:                              ║
-- ║   • Auditores (system_auditor, module_*, design_auditor) não rodavam  ║
-- ║   • Chat IA insere em agent_sessions/agent_messages que não existem   ║
-- ║   • agent_log usado para audit trail não persistia                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ── agent_runs: cada execução de auditoria ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type      text NOT NULL,
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','completed','failed','cancelled')),
  triggered_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary         text,
  findings        jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions_taken   jsonb NOT NULL DEFAULT '[]'::jsonb,
  error           text,
  tokens_input    integer NOT NULL DEFAULT 0,
  tokens_output   integer NOT NULL DEFAULT 0,
  cost_usd        numeric(12, 6) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_type_created
  ON public.agent_runs(agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status
  ON public.agent_runs(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_agent_runs_triggered_by
  ON public.agent_runs(triggered_by);

-- ── agent_steps: cada chamada a Claude dentro de uma run ──────────────────
CREATE TABLE IF NOT EXISTS public.agent_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step_number     integer NOT NULL,
  model           text NOT NULL,
  role            text NOT NULL DEFAULT 'step',
  tokens_input    integer NOT NULL DEFAULT 0,
  tokens_output   integer NOT NULL DEFAULT 0,
  cost_usd        numeric(12, 6) NOT NULL DEFAULT 0,
  response_text   text,
  tool_calls      jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms     integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_steps_run
  ON public.agent_steps(run_id, step_number);

-- ── agent_memory: memória persistente por agente/módulo ───────────────────
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type      text NOT NULL,
  module          text NOT NULL,
  key             text NOT NULL,
  value           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_type, module, key)
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_type_module
  ON public.agent_memory(agent_type, module);

-- ── agent_queue: ações sugeridas pelos agentes aguardando aprovação ──────
CREATE TABLE IF NOT EXISTS public.agent_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  agent_type      text NOT NULL,
  action_type     text NOT NULL,
  description     text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','executed','failed')),
  reviewed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_queue_status
  ON public.agent_queue(status, created_at DESC);

-- ── agent_log: audit trail leve de chamadas avulsas a IA ──────────────────
CREATE TABLE IF NOT EXISTS public.agent_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent           text NOT NULL,
  action          text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_log_created
  ON public.agent_log(created_at DESC);

-- ── agent_sessions: chat IA via Anthropic Sessions API ────────────────────
CREATE TABLE IF NOT EXISTS public.agent_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anthropic_session_id  text NOT NULL,
  agent_module          text NOT NULL DEFAULT 'supervisor',
  title                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_message_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user
  ON public.agent_sessions(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_anthropic
  ON public.agent_sessions(anthropic_session_id);

-- ── agent_messages: mensagens do chat ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user','assistant','system')),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_session
  ON public.agent_messages(session_id, created_at);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Backend usa service role (bypass RLS). Habilitamos RLS para qualquer
-- acesso futuro via cliente anônimo.
ALTER TABLE public.agent_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_steps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_queue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages  ENABLE ROW LEVEL SECURITY;

-- Sessões/mensagens: o dono lê as próprias.
DROP POLICY IF EXISTS agent_sessions_own ON public.agent_sessions;
CREATE POLICY agent_sessions_own ON public.agent_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS agent_messages_own ON public.agent_messages;
CREATE POLICY agent_messages_own ON public.agent_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.agent_sessions s
      WHERE s.id = agent_messages.session_id AND s.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.agent_runs     IS 'Execuções de agentes auditores (system, module_*, design).';
COMMENT ON TABLE public.agent_steps    IS 'Cada chamada a Claude dentro de uma run, com custo e tokens.';
COMMENT ON TABLE public.agent_memory   IS 'Memória persistente por agente — aprende entre execuções.';
COMMENT ON TABLE public.agent_queue    IS 'Ações sugeridas pelos agentes aguardando aprovação humana.';
COMMENT ON TABLE public.agent_log      IS 'Audit trail leve de chamadas avulsas a IA (chat, generate).';
COMMENT ON TABLE public.agent_sessions IS 'Sessões de Chat IA (Anthropic Managed Agents).';
COMMENT ON TABLE public.agent_messages IS 'Mensagens individuais do Chat IA.';
