-- Itau for Developers · fundacao da integracao (OAuth mTLS + log de chamadas)
-- Idempotente · pode rodar varias vezes sem efeito colateral.
--
-- Esta migration cria SO a fundacao (auth + log). As tabelas operacionais
-- (extrato cache, saldo snapshot, pix cob, pagamentos, boletos) entram em
-- migrations seguintes conforme cada produto for liberado/contratado no Itau.
-- Espelha o padrao ja consolidado da integracao Santander.

-- 1. Cache do access_token OAuth (1 linha por ambiente)
--    Token do Itau vale apenas 300s · esta tabela e fallback do cache em memoria
--    pra quando o processo serverless reinicia entre requisicoes.
CREATE TABLE IF NOT EXISTS itau_oauth_tokens (
  ambiente text PRIMARY KEY CHECK (ambiente IN ('homologacao', 'producao')),
  access_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'Bearer',
  expires_at timestamptz NOT NULL,
  obtained_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Log de chamadas (debug + auditoria)
CREATE TABLE IF NOT EXISTS itau_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code int,
  duration_ms int,
  trace_id text,             -- x-itau-correlationID retornado
  error_message text,
  request_summary jsonb,
  user_id uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itau_sync_log_created_at_idx
  ON itau_sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS itau_sync_log_endpoint_idx
  ON itau_sync_log(endpoint);

-- 3. RLS · backend usa service_role (bypassa). Leitura so pra quem tem
--    nivel >= 3 em financeiro (via helper) ou super-admin. Sem PII direto
--    nestas tabelas, mas o log pode conter dados de conta · tratamos como
--    sensivel por precaucao.
ALTER TABLE itau_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE itau_sync_log     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS itau_oauth_tokens_service ON itau_oauth_tokens;
CREATE POLICY itau_oauth_tokens_service ON itau_oauth_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS itau_oauth_tokens_read ON itau_oauth_tokens;
CREATE POLICY itau_oauth_tokens_read ON itau_oauth_tokens
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS itau_sync_log_service ON itau_sync_log;
CREATE POLICY itau_sync_log_service ON itau_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS itau_sync_log_read ON itau_sync_log;
CREATE POLICY itau_sync_log_read ON itau_sync_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('financeiro') >= 3
  );

COMMENT ON TABLE itau_oauth_tokens IS
  'Cache do access_token OAuth do Itau for Developers (vale 300s). Fundacao da integracao mTLS.';
COMMENT ON TABLE itau_sync_log IS
  'Log de chamadas a API do Itau (debug/auditoria). Espelha santander_sync_log.';
