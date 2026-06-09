-- ============================================================================
-- Onda 0 · Loop de feedback · telemetria de piloto (2026-06-09)
--
-- Captura pra fase de PILOTO: testadores reportam problemas (app_feedback) e o
-- backend registra erros 500 (app_erros_servidor). Um agente Haiku agendado
-- (PR seguinte) vai ler estas tabelas, agrupar/ranquear e mandar o relatório
-- diário pelos canais de notificação que já existem.
--
-- NOTA (exceção JUSTIFICADA à regra de soft-delete do CLAUDE.md): estas são
-- tabelas de TELEMETRIA/LOG operacional (mesmo padrão do `app_audit_log`, que
-- também não tem `deleted_at`). `app_feedback` usa o campo `status`
-- ('descartado') pro ciclo de vida. Não carregam PII sensível (sem CPF/salário)
-- · só a identidade do próprio reporter interno. Por isso ficam FORA da whitelist
-- `app_soft_deletable_tables()`. Todo acesso passa pelo backend (service_role);
-- SELECT direto fica restrito a super-admin.
-- ============================================================================

-- 1. Feedback reportado pelos testadores -------------------------------------
CREATE TABLE IF NOT EXISTS public.app_feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email    text,
  user_nome     text,
  user_role     text,
  tipo          text NOT NULL DEFAULT 'bug'
                  CHECK (tipo IN ('bug','confusao','sugestao','elogio')),
  mensagem      text NOT NULL,
  rota          text,
  modulo        text,
  contexto      jsonb,
  severidade    text NOT NULL DEFAULT 'media'
                  CHECK (severidade IN ('baixa','media','alta','critica')),
  status        text NOT NULL DEFAULT 'novo'
                  CHECK (status IN ('novo','triado','em_andamento','resolvido','descartado')),
  resolvido_em  timestamptz,
  resolvido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_status  ON public.app_feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_feedback_created ON public.app_feedback (created_at DESC);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_feedback_select  ON public.app_feedback;
DROP POLICY IF EXISTS app_feedback_service ON public.app_feedback;
CREATE POLICY app_feedback_select  ON public.app_feedback
  FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY app_feedback_service ON public.app_feedback
  FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- 2. Erros 500 do servidor (telemetria · SEM payload pra não vazar PII) -------
CREATE TABLE IF NOT EXISTS public.app_erros_servidor (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  text,
  metodo      text,
  rota        text,
  mensagem    text,
  stack       text,
  status      integer DEFAULT 500,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_erros_rota    ON public.app_erros_servidor (rota, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_erros_created ON public.app_erros_servidor (created_at DESC);

ALTER TABLE public.app_erros_servidor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_erros_select  ON public.app_erros_servidor;
DROP POLICY IF EXISTS app_erros_service ON public.app_erros_servidor;
CREATE POLICY app_erros_select  ON public.app_erros_servidor
  FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY app_erros_service ON public.app_erros_servidor
  FOR ALL    TO service_role  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.app_feedback       IS 'Feedback dos testadores no piloto (Onda 0). Telemetria · ciclo de vida via status (sem deleted_at, como app_audit_log). Acesso via backend.';
COMMENT ON TABLE public.app_erros_servidor IS 'Log de erros 500 do backend (Onda 0). Telemetria append-only · sem payload (evita PII). Acesso via backend.';
