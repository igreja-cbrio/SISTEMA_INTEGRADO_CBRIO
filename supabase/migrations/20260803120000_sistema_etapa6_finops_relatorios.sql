-- Sistema - Etapa 6: FinOps e prestacao de contas
-- Base canonica para custos, evidencias, trilha de auditoria e relatorios executivos.

CREATE TABLE IF NOT EXISTS public.system_cost_providers (
  provider_key text PRIMARY KEY CHECK (provider_key ~ '^[a-z0-9_]+$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  category text NOT NULL CHECK (category IN (
    'platform', 'observability', 'ai', 'communication', 'mobile',
    'infrastructure', 'domain', 'other'
  )),
  default_currency text NOT NULL DEFAULT 'BRL'
    CHECK (default_currency IN ('BRL', 'USD')),
  billing_cycle text NOT NULL DEFAULT 'unknown'
    CHECK (billing_cycle IN ('monthly', 'annual', 'usage', 'one_off', 'unknown')),
  owner_email text,
  budget_monthly_brl numeric(16,2)
    CHECK (budget_monthly_brl IS NULL OR budget_monthly_brl >= 0),
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'invoice', 'api', 'legacy_estimate')),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_email text,
  updated_by_email text,
  CONSTRAINT system_cost_providers_owner_email_chk
    CHECK (owner_email IS NULL OR owner_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

CREATE TABLE IF NOT EXISTS public.system_cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL REFERENCES public.system_cost_providers(provider_key),
  competence date NOT NULL,
  cost_type text NOT NULL CHECK (cost_type IN (
    'subscription', 'usage', 'one_off', 'tax', 'adjustment', 'credit'
  )),
  direction text NOT NULL DEFAULT 'debit'
    CHECK (direction IN ('debit', 'credit')),
  amount numeric(16,4) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL CHECK (currency IN ('BRL', 'USD')),
  fx_rate_to_brl numeric(16,6) NOT NULL DEFAULT 1
    CHECK (fx_rate_to_brl > 0),
  amount_brl numeric(16,2) GENERATED ALWAYS AS (
    round(
      (CASE WHEN direction = 'credit' THEN -1 ELSE 1 END)::numeric
      * amount * fx_rate_to_brl,
      2
    )
  ) STORED,
  status text NOT NULL DEFAULT 'estimated'
    CHECK (status IN ('estimated', 'accrued', 'actual')),
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'invoice', 'api', 'legacy_estimate')),
  evidence_url text,
  external_ref text,
  idempotency_key text UNIQUE,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_email text,
  updated_by_email text,
  CONSTRAINT system_cost_entries_competence_chk
    CHECK (competence = date_trunc('month', competence)::date),
  CONSTRAINT system_cost_entries_credit_chk
    CHECK (cost_type <> 'credit' OR direction = 'credit'),
  CONSTRAINT system_cost_entries_evidence_url_chk
    CHECK (evidence_url IS NULL OR evidence_url ~* '^https://[^[:space:]]+$')
);

CREATE TABLE IF NOT EXISTS public.system_cost_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('provider', 'cost_entry', 'executive_report')),
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  action text NOT NULL CHECK (action IN (
    'created', 'updated', 'deactivated', 'published', 'superseded', 'exported'
  )),
  actor_email text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_cost_events_before_data_chk
    CHECK (before_data IS NULL OR jsonb_typeof(before_data) = 'object'),
  CONSTRAINT system_cost_events_after_data_chk
    CHECK (after_data IS NULL OR jsonb_typeof(after_data) = 'object')
);

CREATE TABLE IF NOT EXISTS public.system_executive_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 180),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'superseded')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  checksum_sha256 text,
  notes text,
  generated_by_email text,
  published_by_email text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_executive_reports_period_chk CHECK (period_end >= period_start),
  CONSTRAINT system_executive_reports_checksum_chk
    CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT system_executive_reports_publish_chk CHECK (
    (status = 'draft' AND published_at IS NULL)
    OR (status IN ('published', 'superseded') AND published_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS system_cost_entries_competence_idx
  ON public.system_cost_entries (competence DESC, provider_key);
CREATE INDEX IF NOT EXISTS system_cost_entries_status_idx
  ON public.system_cost_entries (status, competence DESC);
CREATE INDEX IF NOT EXISTS system_cost_events_entity_idx
  ON public.system_cost_events (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS system_executive_reports_period_idx
  ON public.system_executive_reports (period_start DESC, period_end DESC);

CREATE OR REPLACE FUNCTION public.system_finops_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS system_cost_providers_touch_updated_at
  ON public.system_cost_providers;
CREATE TRIGGER system_cost_providers_touch_updated_at
BEFORE UPDATE ON public.system_cost_providers
FOR EACH ROW EXECUTE FUNCTION public.system_finops_touch_updated_at();

DROP TRIGGER IF EXISTS system_cost_entries_touch_updated_at
  ON public.system_cost_entries;
CREATE TRIGGER system_cost_entries_touch_updated_at
BEFORE UPDATE ON public.system_cost_entries
FOR EACH ROW EXECUTE FUNCTION public.system_finops_touch_updated_at();

DROP TRIGGER IF EXISTS system_executive_reports_touch_updated_at
  ON public.system_executive_reports;
CREATE TRIGGER system_executive_reports_touch_updated_at
BEFORE UPDATE ON public.system_executive_reports
FOR EACH ROW EXECUTE FUNCTION public.system_finops_touch_updated_at();

ALTER TABLE public.system_cost_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_cost_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_executive_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.system_cost_providers FROM anon, authenticated;
REVOKE ALL ON TABLE public.system_cost_entries FROM anon, authenticated;
REVOKE ALL ON TABLE public.system_cost_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.system_executive_reports FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.system_cost_events_id_seq FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_cost_providers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_cost_entries TO service_role;
GRANT SELECT, INSERT ON TABLE public.system_cost_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.system_cost_events_id_seq TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_executive_reports TO service_role;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.system_cost_events FROM service_role;

INSERT INTO public.system_cost_providers
  (provider_key, name, category, default_currency, billing_cycle, source_type)
VALUES
  ('supabase', 'Supabase', 'platform', 'USD', 'monthly', 'manual'),
  ('vercel', 'Vercel', 'platform', 'USD', 'monthly', 'manual'),
  ('railway', 'Railway', 'infrastructure', 'USD', 'monthly', 'manual'),
  ('github', 'GitHub', 'platform', 'USD', 'monthly', 'manual'),
  ('anthropic', 'Anthropic', 'ai', 'USD', 'usage', 'manual'),
  ('openai', 'OpenAI', 'ai', 'USD', 'usage', 'manual'),
  ('meta_whatsapp', 'Meta / WhatsApp', 'communication', 'USD', 'usage', 'manual'),
  ('sentry', 'Sentry', 'observability', 'USD', 'usage', 'manual'),
  ('google_play', 'Google Play', 'mobile', 'USD', 'one_off', 'manual'),
  ('app_store', 'Apple App Store', 'mobile', 'USD', 'annual', 'manual'),
  ('domains', 'Dominios', 'domain', 'BRL', 'annual', 'manual')
ON CONFLICT (provider_key) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  default_currency = EXCLUDED.default_currency,
  billing_cycle = EXCLUDED.billing_cycle,
  updated_at = now();

COMMENT ON TABLE public.system_cost_entries IS
  'Lancamentos FinOps do modulo Sistema. status distingue estimativa, competencia e valor realizado.';
COMMENT ON COLUMN public.system_cost_entries.evidence_url IS
  'Referencia HTTPS para evidencia autorizada; nunca armazenar segredo ou conteudo integral de fatura.';
COMMENT ON TABLE public.system_cost_events IS
  'Trilha append-only de alteracoes e publicacoes da prestacao de contas.';
COMMENT ON TABLE public.system_executive_reports IS
  'Snapshots imutaveis apos publicacao, aplicados pela camada de servico do modulo Sistema.';
