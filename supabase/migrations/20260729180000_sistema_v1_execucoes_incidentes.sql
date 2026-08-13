-- ============================================================================
-- Módulo Sistema · Etapa 2 · fundação operacional
-- ADITIVA: cria execuções canônicas, incidentes e timeline; não remove fontes
-- legadas. Retenção NÃO é automatizada aqui: os prazos da Etapa 0 ainda
-- dependem de aprovação organizacional/DPO.
-- ============================================================================

SET lock_timeout = '10s';

-- ── 1. Execuções canônicas de crons, workflows e workers ───────────────────
CREATE TABLE IF NOT EXISTS public.system_job_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           TEXT NOT NULL,
  provider         TEXT NOT NULL CHECK (provider IN ('vercel','github','railway','supabase','manual','internal')),
  schedule         TEXT,
  trigger_type     TEXT NOT NULL DEFAULT 'scheduled'
                     CHECK (trigger_type IN ('scheduled','manual','webhook','retry','unknown')),
  status           TEXT NOT NULL
                     CHECK (status IN ('running','success','warning','failed','skipped')),
  effect_status    TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (effect_status IN ('unknown','confirmed','not_applicable','failed')),
  attempt          INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
  started_at       TIMESTAMPTZ NOT NULL,
  finished_at      TIMESTAMPTZ,
  duration_ms      BIGINT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  input_count      BIGINT CHECK (input_count IS NULL OR input_count >= 0),
  output_count     BIGINT CHECK (output_count IS NULL OR output_count >= 0),
  discarded_count  BIGINT CHECK (discarded_count IS NULL OR discarded_count >= 0),
  error_code       TEXT,
  error_message    TEXT,
  request_id       TEXT,
  release          TEXT,
  environment      TEXT NOT NULL DEFAULT 'unknown',
  owner_label      TEXT,
  runbook_url      TEXT,
  triggered_by     TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(metadata) = 'object'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (finished_at IS NULL OR finished_at >= started_at),
  CHECK (
    status = 'running'
    OR (finished_at IS NOT NULL AND duration_ms IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_system_job_runs_job_started
  ON public.system_job_runs (job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_job_runs_status_started
  ON public.system_job_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_job_runs_request
  ON public.system_job_runs (request_id)
  WHERE request_id IS NOT NULL;

ALTER TABLE public.system_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_job_runs FROM anon, authenticated;
GRANT SELECT ON public.system_job_runs TO authenticated;

DROP POLICY IF EXISTS system_job_runs_superadmin_select ON public.system_job_runs;
CREATE POLICY system_job_runs_superadmin_select ON public.system_job_runs
  FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS system_job_runs_service_all ON public.system_job_runs;
CREATE POLICY system_job_runs_service_all ON public.system_job_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Execução é trilha operacional append-only. Correções geram nova execução.
CREATE OR REPLACE FUNCTION public.fn_system_job_runs_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'system_job_runs não permite exclusão';
  END IF;

  IF OLD.status = 'running'
     AND NEW.status IN ('success','warning','failed','skipped')
     AND NEW.job_id = OLD.job_id
     AND NEW.provider = OLD.provider
     AND NEW.started_at = OLD.started_at
     AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'system_job_runs só permite finalizar uma execução running';
END;
$$;

DROP TRIGGER IF EXISTS trg_system_job_runs_immutable ON public.system_job_runs;
CREATE TRIGGER trg_system_job_runs_immutable
  BEFORE UPDATE OR DELETE ON public.system_job_runs
  FOR EACH ROW EXECUTE FUNCTION public.fn_system_job_runs_immutable();

-- ── 2. Incidentes e timeline ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_incidents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  description      TEXT,
  severity         TEXT NOT NULL DEFAULT 'warning'
                     CHECK (severity IN ('info','warning','error','critical')),
  status           TEXT NOT NULL DEFAULT 'novo'
                     CHECK (status IN (
                       'novo','reconhecido','investigando','mitigado','resolvido',
                       'monitorado','duplicado','nao_reproduzido','risco_aceito'
                     )),
  source_type      TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source_type IN ('manual','feedback','server_error','job','sentry','security')),
  source_ref       TEXT,
  affected_surface TEXT,
  impact_summary   TEXT,
  owner_email      TEXT,
  request_id       TEXT,
  release          TEXT,
  environment      TEXT NOT NULL DEFAULT 'unknown',
  created_by_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email TEXT,
  updated_by_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_email TEXT,
  acknowledged_at  TIMESTAMPTZ,
  mitigated_at     TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  monitor_until    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_incidents_source
  ON public.system_incidents (source_type, source_ref)
  WHERE source_ref IS NOT NULL
    AND status IN ('novo','reconhecido','investigando','mitigado','monitorado');
CREATE INDEX IF NOT EXISTS idx_system_incidents_status_severity
  ON public.system_incidents (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_incidents_request
  ON public.system_incidents (request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.system_incident_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id      UUID NOT NULL REFERENCES public.system_incidents(id) ON DELETE RESTRICT,
  event_type       TEXT NOT NULL
                     CHECK (event_type IN ('created','status_changed','note','linked','assignment')),
  from_status      TEXT,
  to_status        TEXT,
  message          TEXT,
  actor_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email      TEXT,
  request_id       TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(metadata) = 'object'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_incident_events_incident_created
  ON public.system_incident_events (incident_id, created_at ASC);

ALTER TABLE public.system_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_incident_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_incidents, public.system_incident_events FROM anon, authenticated;
GRANT SELECT ON public.system_incidents, public.system_incident_events TO authenticated;
GRANT ALL ON public.system_job_runs, public.system_incidents, public.system_incident_events TO service_role;

DROP POLICY IF EXISTS system_incidents_superadmin_select ON public.system_incidents;
CREATE POLICY system_incidents_superadmin_select ON public.system_incidents
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS system_incidents_service_all ON public.system_incidents;
CREATE POLICY system_incidents_service_all ON public.system_incidents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS system_incident_events_superadmin_select ON public.system_incident_events;
CREATE POLICY system_incident_events_superadmin_select ON public.system_incident_events
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS system_incident_events_service_all ON public.system_incident_events;
CREATE POLICY system_incident_events_service_all ON public.system_incident_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.fn_system_incident_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_incident_touch ON public.system_incidents;
CREATE TRIGGER trg_system_incident_touch
  BEFORE INSERT OR UPDATE ON public.system_incidents
  FOR EACH ROW EXECUTE FUNCTION public.fn_system_incident_touch();

CREATE OR REPLACE FUNCTION public.fn_system_incident_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.system_incident_events (
      incident_id, event_type, to_status, message, actor_id, actor_email, request_id
    ) VALUES (
      NEW.id, 'created', NEW.status, 'Incidente criado',
      NEW.created_by_id, NEW.created_by_email, NEW.request_id
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.system_incident_events (
      incident_id, event_type, from_status, to_status, message,
      actor_id, actor_email, request_id
    ) VALUES (
      NEW.id, 'status_changed', OLD.status, NEW.status, 'Status atualizado',
      NEW.updated_by_id, NEW.updated_by_email, NEW.request_id
    );
  ELSIF NEW.owner_email IS DISTINCT FROM OLD.owner_email THEN
    INSERT INTO public.system_incident_events (
      incident_id, event_type, message, actor_id, actor_email, request_id, metadata
    ) VALUES (
      NEW.id, 'assignment', 'Responsável atualizado',
      NEW.updated_by_id, NEW.updated_by_email, NEW.request_id,
      jsonb_build_object('from', OLD.owner_email, 'to', NEW.owner_email)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_incident_timeline ON public.system_incidents;
CREATE TRIGGER trg_system_incident_timeline
  AFTER INSERT OR UPDATE ON public.system_incidents
  FOR EACH ROW EXECUTE FUNCTION public.fn_system_incident_timeline();

CREATE OR REPLACE FUNCTION public.fn_system_incident_events_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'system_incident_events é append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_system_incident_events_immutable ON public.system_incident_events;
CREATE TRIGGER trg_system_incident_events_immutable
  BEFORE UPDATE OR DELETE ON public.system_incident_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_system_incident_events_immutable();

-- ── 3. Correlação dos erros HTTP existentes ────────────────────────────────
ALTER TABLE public.app_erros_servidor
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS release TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT;

CREATE INDEX IF NOT EXISTS idx_app_erros_request
  ON public.app_erros_servidor (request_id)
  WHERE request_id IS NOT NULL;

COMMENT ON TABLE public.system_job_runs IS
  'Execuções canônicas de jobs. Append-only; sucesso exige efeito confirmado quando aplicável.';
COMMENT ON TABLE public.system_incidents IS
  'Incidentes operacionais do command center Sistema; fonte vinculada, sem copiar payload sensível.';
COMMENT ON TABLE public.system_incident_events IS
  'Timeline append-only dos incidentes do módulo Sistema.';
