-- ============================================================================
-- 20260514210000_online_oauth_tokens.sql
-- Persiste tokens OAuth do YouTube para coleta automatica via Analytics API.
--
-- Modelo: 1 linha por canal conectado. O refresh_token sobrevive a expiracao
-- do access_token (1h). Se for revogado pelo dono no Google, marcamos revoked_at
-- e a UI pede pra reconectar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.online_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL UNIQUE,
  channel_title text,
  -- Tokens (criptografar via pgsodium ja existe no projeto? por enquanto
  -- guardamos como text. Service role bypassa RLS, so admins acessam.)
  access_token text,
  refresh_token text NOT NULL,
  expires_at timestamptz,
  scope text,
  -- Auditoria
  connected_by uuid REFERENCES auth.users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz,
  revoked_at timestamptz,
  -- Metadata
  last_error text,
  last_check_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_oauth_revoked
  ON public.online_oauth_tokens (revoked_at)
  WHERE revoked_at IS NULL;

-- RLS: nenhuma leitura/escrita via API anon/auth. Tudo via service_role.
ALTER TABLE public.online_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_oauth_tokens" ON public.online_oauth_tokens;
CREATE POLICY "service_role_oauth_tokens" ON public.online_oauth_tokens
  FOR ALL TO service_role USING (true);

-- Status agregado pra UI (sem expor tokens)
CREATE OR REPLACE VIEW public.vw_online_oauth_status AS
SELECT
  channel_id,
  channel_title,
  connected_at,
  refreshed_at,
  revoked_at,
  last_check_at,
  last_error,
  (revoked_at IS NULL AND refresh_token IS NOT NULL) AS conectado,
  expires_at
FROM public.online_oauth_tokens;

GRANT SELECT ON public.vw_online_oauth_status TO authenticated, service_role;

COMMENT ON TABLE public.online_oauth_tokens IS 'Tokens OAuth do YouTube para coleta via Analytics API';
