-- Sistema · Etapa 3 · Web/API
-- Telemetria de campo anônima e execuções sintéticas.
-- Não aplica retenção automática: os prazos continuam sujeitos à decisão DPO.

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_web_vitals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric           TEXT NOT NULL CHECK (metric IN ('CLS','FCP','INP','LCP','TTFB')),
  value            NUMERIC NOT NULL CHECK (value >= 0 AND value < 1000000000),
  rating           TEXT NOT NULL CHECK (rating IN ('good','needs-improvement','poor')),
  route            TEXT NOT NULL CHECK (char_length(route) BETWEEN 1 AND 300),
  navigation_type  TEXT CHECK (navigation_type IS NULL OR char_length(navigation_type) <= 80),
  device_class     TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (device_class IN ('mobile','tablet','desktop','unknown')),
  release          TEXT,
  environment      TEXT NOT NULL DEFAULT 'unknown',
  request_id       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_web_vitals_metric_created
  ON public.system_web_vitals (metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_web_vitals_route_created
  ON public.system_web_vitals (route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_web_vitals_release_created
  ON public.system_web_vitals (release, created_at DESC)
  WHERE release IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.system_synthetic_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id       TEXT NOT NULL CHECK (char_length(journey_id) BETWEEN 1 AND 120),
  journey_name     TEXT NOT NULL CHECK (char_length(journey_name) BETWEEN 1 AND 180),
  target_path      TEXT NOT NULL CHECK (char_length(target_path) BETWEEN 1 AND 300),
  status           TEXT NOT NULL CHECK (status IN ('passed','warning','failed')),
  http_status      INTEGER CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  duration_ms      INTEGER NOT NULL CHECK (duration_ms >= 0),
  assertion_label  TEXT,
  error_message    TEXT,
  release          TEXT,
  environment      TEXT NOT NULL DEFAULT 'unknown',
  request_id       TEXT,
  triggered_by     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_synthetic_runs_journey_created
  ON public.system_synthetic_runs (journey_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_synthetic_runs_status_created
  ON public.system_synthetic_runs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_synthetic_runs_release_created
  ON public.system_synthetic_runs (release, created_at DESC)
  WHERE release IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_system_etapa3_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '% é uma trilha append-only; correções exigem um novo registro', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_web_vitals_immutable ON public.system_web_vitals;
CREATE TRIGGER trg_system_web_vitals_immutable
  BEFORE UPDATE OR DELETE ON public.system_web_vitals
  FOR EACH ROW EXECUTE FUNCTION public.fn_system_etapa3_append_only();

DROP TRIGGER IF EXISTS trg_system_synthetic_runs_immutable ON public.system_synthetic_runs;
CREATE TRIGGER trg_system_synthetic_runs_immutable
  BEFORE UPDATE OR DELETE ON public.system_synthetic_runs
  FOR EACH ROW EXECUTE FUNCTION public.fn_system_etapa3_append_only();

ALTER TABLE public.system_web_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_synthetic_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.system_web_vitals, public.system_synthetic_runs FROM anon, authenticated;
GRANT SELECT ON public.system_web_vitals, public.system_synthetic_runs TO authenticated;
GRANT ALL ON public.system_web_vitals, public.system_synthetic_runs TO service_role;

DROP POLICY IF EXISTS system_web_vitals_superadmin_select ON public.system_web_vitals;
CREATE POLICY system_web_vitals_superadmin_select ON public.system_web_vitals
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS system_web_vitals_service_all ON public.system_web_vitals;
CREATE POLICY system_web_vitals_service_all ON public.system_web_vitals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS system_synthetic_runs_superadmin_select ON public.system_synthetic_runs;
CREATE POLICY system_synthetic_runs_superadmin_select ON public.system_synthetic_runs
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS system_synthetic_runs_service_all ON public.system_synthetic_runs;
CREATE POLICY system_synthetic_runs_service_all ON public.system_synthetic_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.system_web_vitals IS
  'Amostras anônimas de Web Vitals por rota normalizada; não armazena usuário, sessão, query string ou payload.';
COMMENT ON TABLE public.system_synthetic_runs IS
  'Resultado append-only de testes sintéticos em jornadas públicas fixas e sem efeito colateral.';

COMMIT;
