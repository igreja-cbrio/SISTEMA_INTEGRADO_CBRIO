-- Sistema · Etapa 4 · Mobile Android/iOS
-- Amplia a telemetria existente sem expor identidade no command center e
-- registra apenas metadados operacionais dos tickets/recibos Expo.

ALTER TABLE public.app_eventos
  ADD COLUMN IF NOT EXISTS event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS installation_id text,
  ADD COLUMN IF NOT EXISTS build_number text,
  ADD COLUMN IF NOT EXISTS os_version text,
  ADD COLUMN IF NOT EXISTS device_model text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS network_type text,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS is_offline boolean,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_eventos_event_id
  ON public.app_eventos (event_id);
CREATE INDEX IF NOT EXISTS idx_app_eventos_platform_created
  ON public.app_eventos (plataforma, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_eventos_session_created
  ON public.app_eventos (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_eventos_installation_created
  ON public.app_eventos (installation_id, created_at DESC)
  WHERE installation_id IS NOT NULL;

ALTER TABLE public.app_eventos
  DROP CONSTRAINT IF EXISTS app_eventos_duration_ms_check;
ALTER TABLE public.app_eventos
  ADD CONSTRAINT app_eventos_duration_ms_check
  CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 600000);

CREATE TABLE IF NOT EXISTS public.system_mobile_push_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'expo' CHECK (provider IN ('expo')),
  provider_ticket_id text UNIQUE,
  platform text CHECK (platform IN ('android', 'ios', 'unknown')),
  ticket_status text NOT NULL CHECK (ticket_status IN ('accepted', 'error')),
  ticket_error_code text,
  ticket_error_message text,
  receipt_status text CHECK (receipt_status IN ('delivered_to_provider', 'error')),
  receipt_error_code text,
  receipt_error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  receipt_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_mobile_push_pending
  ON public.system_mobile_push_tickets (sent_at)
  WHERE provider_ticket_id IS NOT NULL AND receipt_checked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_system_mobile_push_platform_sent
  ON public.system_mobile_push_tickets (platform, sent_at DESC);

ALTER TABLE public.system_mobile_push_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_mobile_push_tickets FROM anon, authenticated;

COMMENT ON TABLE public.system_mobile_push_tickets IS
  'Metadados técnicos de tickets e recibos Expo, sem token, destinatário ou conteúdo da notificação.';

CREATE OR REPLACE FUNCTION public.fn_system_mobile_overview(
  p_platform text,
  p_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      CASE WHEN lower(p_platform) IN ('android', 'ios') THEN lower(p_platform) ELSE 'android' END AS platform,
      least(greatest(coalesce(p_days, 14), 1), 30) AS days
  ),
  base AS (
    SELECT e.*
    FROM public.app_eventos e, params p
    WHERE lower(coalesce(e.plataforma, '')) = p.platform
      AND e.created_at >= now() - make_interval(days => p.days)
  ),
  sessions AS (
    SELECT count(DISTINCT session_id)::integer AS total
    FROM base WHERE session_id IS NOT NULL
  ),
  error_sessions AS (
    SELECT count(DISTINCT session_id)::integer AS total
    FROM base WHERE session_id IS NOT NULL AND tipo = 'erro'
  ),
  versions AS (
    SELECT
      coalesce(nullif(app_version, ''), 'desconhecida') AS version,
      coalesce(nullif(build_number, ''), 'desconhecido') AS build,
      count(*)::integer AS events,
      count(DISTINCT user_id)::integer AS users,
      count(*) FILTER (WHERE tipo = 'erro')::integer AS errors,
      max(created_at) AS last_seen
    FROM base
    GROUP BY 1, 2
    ORDER BY users DESC, events DESC
    LIMIT 20
  ),
  event_signals AS (
    SELECT nome, tipo, count(*)::integer AS events, max(created_at) AS last_seen
    FROM base
    WHERE tipo <> 'ping'
    GROUP BY nome, tipo
    ORDER BY events DESC
    LIMIT 30
  ),
  devices AS (
    SELECT
      coalesce(nullif(manufacturer, ''), 'desconhecido') AS manufacturer,
      coalesce(nullif(device_model, ''), 'desconhecido') AS model,
      count(DISTINCT coalesce(installation_id, session_id, user_id::text))::integer AS installations,
      count(*)::integer AS events
    FROM base
    WHERE manufacturer IS NOT NULL OR device_model IS NOT NULL
    GROUP BY 1, 2
    ORDER BY installations DESC, events DESC
    LIMIT 15
  ),
  os_versions AS (
    SELECT os_version AS version, count(*)::integer AS events,
      count(DISTINCT coalesce(installation_id, session_id, user_id::text))::integer AS installations
    FROM base
    WHERE nullif(os_version, '') IS NOT NULL
    GROUP BY os_version
    ORDER BY installations DESC, events DESC
    LIMIT 15
  ),
  recent_errors AS (
    SELECT
      id, nome, app_version, build_number, os_version, device_model,
      lower(coalesce(props->>'fatal', 'false')) IN ('true', '1', 'yes') AS fatal,
      left(coalesce(props->>'message', props->>'reason', 'Erro sem detalhe seguro'), 500) AS message,
      created_at
    FROM base
    WHERE tipo = 'erro'
    ORDER BY created_at DESC
    LIMIT 30
  ),
  push AS (
    SELECT
      count(*)::integer AS total,
      count(*) FILTER (WHERE ticket_status = 'accepted')::integer AS accepted,
      count(*) FILTER (WHERE ticket_status = 'error')::integer AS ticket_errors,
      count(*) FILTER (WHERE receipt_status = 'delivered_to_provider')::integer AS delivered_to_provider,
      count(*) FILTER (WHERE receipt_status = 'error')::integer AS receipt_errors,
      count(*) FILTER (WHERE provider_ticket_id IS NOT NULL AND receipt_checked_at IS NULL)::integer AS pending_receipts
    FROM public.system_mobile_push_tickets t, params p
    WHERE t.platform = p.platform
      AND t.sent_at >= now() - make_interval(days => p.days)
  ),
  push_tokens AS (
    SELECT count(*)::integer AS total
    FROM public.app_push_tokens t, params p
    WHERE lower(coalesce(t.platform, '')) = p.platform
  )
  SELECT jsonb_build_object(
    'platform', (SELECT platform FROM params),
    'days', (SELECT days FROM params),
    'generatedAt', now(),
    'lastEventAt', (SELECT max(created_at) FROM base),
    'totals', jsonb_build_object(
      'events', (SELECT count(*) FROM base),
      'activeUsers', (SELECT count(DISTINCT user_id) FROM base WHERE user_id IS NOT NULL),
      'sessions', (SELECT total FROM sessions),
      'installations', (SELECT count(DISTINCT installation_id) FROM base WHERE installation_id IS NOT NULL),
      'online5m', (SELECT count(DISTINCT coalesce(session_id, installation_id, user_id::text))
                   FROM base WHERE created_at >= now() - interval '5 minutes'),
      'errors', (SELECT count(*) FROM base WHERE tipo = 'erro'),
      'fatalErrors', (SELECT count(*) FROM base
                      WHERE tipo = 'erro' AND lower(coalesce(props->>'fatal', 'false')) IN ('true', '1', 'yes')),
      'crashFreeSessions', (
        SELECT CASE WHEN s.total = 0 THEN NULL
          ELSE round(100.0 * greatest(s.total - es.total, 0) / s.total, 2) END
        FROM sessions s CROSS JOIN error_sessions es
      )
    ),
    'coverage', jsonb_build_object(
      'sessions', (SELECT count(*) FROM base WHERE session_id IS NOT NULL),
      'installations', (SELECT count(*) FROM base WHERE installation_id IS NOT NULL),
      'builds', (SELECT count(*) FROM base WHERE build_number IS NOT NULL),
      'osVersions', (SELECT count(*) FROM base WHERE os_version IS NOT NULL),
      'devices', (SELECT count(*) FROM base WHERE device_model IS NOT NULL),
      'durations', (SELECT count(*) FROM base WHERE duration_ms IS NOT NULL),
      'network', (SELECT count(*) FROM base WHERE network_type IS NOT NULL),
      'offline', (SELECT count(*) FROM base WHERE is_offline IS NOT NULL)
    ),
    'performance', jsonb_build_object(
      'startupSamples', (SELECT count(*) FROM base WHERE nome IN ('app_startup', 'startup', 'cold_start') AND duration_ms IS NOT NULL),
      'startupAvgMs', (SELECT round(avg(duration_ms)) FROM base WHERE nome IN ('app_startup', 'startup', 'cold_start') AND duration_ms IS NOT NULL),
      'startupP95Ms', (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
                       FROM base WHERE nome IN ('app_startup', 'startup', 'cold_start') AND duration_ms IS NOT NULL),
      'networkFailures', (SELECT count(*) FROM base WHERE nome IN ('network_error', 'api_error', 'request_failed')),
      'offlineEvents', (SELECT count(*) FROM base WHERE is_offline IS TRUE),
      'authFailures', (SELECT count(*) FROM base WHERE nome IN ('auth_error', 'login_error', 'session_expired')),
      'pushEvents', (SELECT count(*) FROM base WHERE nome LIKE 'push_%' OR nome LIKE 'notification_%'),
      'deepLinkEvents', (SELECT count(*) FROM base WHERE nome LIKE 'deep_link%')
    ),
    'versions', coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM versions v), '[]'::jsonb),
    'signals', coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM event_signals s), '[]'::jsonb),
    'devices', coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM devices d), '[]'::jsonb),
    'osVersions', coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM os_versions o), '[]'::jsonb),
    'errors', coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM recent_errors e), '[]'::jsonb),
    'push', (SELECT to_jsonb(push) FROM push),
    'pushTokens', (SELECT total FROM push_tokens)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_system_mobile_overview(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_system_mobile_overview(text, integer) TO service_role;

COMMENT ON FUNCTION public.fn_system_mobile_overview(text, integer) IS
  'Agregados operacionais mobile por plataforma. Não retorna user_id, installation_id nem session_id.';
