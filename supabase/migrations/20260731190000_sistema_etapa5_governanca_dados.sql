-- Sistema · Etapa 5 · Governança de dados, Wi-Fi e reconhecimento facial
-- Registra decisões e evidências. Não copia CPF, telefone, IP, MAC, imagem ou
-- embedding para o command center.

CREATE TABLE IF NOT EXISTS public.system_governance_controls (
  control_key text PRIMARY KEY,
  domain text NOT NULL CHECK (domain IN ('facial', 'wifi', 'telemetry', 'data', 'backup')),
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('implemented', 'monitoring', 'pending_decision', 'review_required', 'blocked')),
  owner text,
  evidence_url text,
  review_due_at timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_governance_control_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  control_key text NOT NULL REFERENCES public.system_governance_controls(control_key) ON DELETE RESTRICT,
  previous_status text,
  new_status text NOT NULL,
  reason text NOT NULL,
  actor_email text,
  evidence_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_governance_controls_domain
  ON public.system_governance_controls (domain, status);
CREATE INDEX IF NOT EXISTS idx_system_governance_events_control
  ON public.system_governance_control_events (control_key, created_at DESC);

ALTER TABLE public.system_governance_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_governance_control_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_governance_controls FROM anon, authenticated;
REVOKE ALL ON TABLE public.system_governance_control_events FROM anon, authenticated;

INSERT INTO public.system_governance_controls
  (control_key, domain, title, description, status, details)
VALUES
  ('facial_dpo_approval', 'facial', 'Parecer biométrico do DPO',
   'A operação facial não deve ser ampliada sem parecer, finalidade, base legal, termo versionado e plano de incidente.',
   'blocked', '{"requires":["owner","https_evidence","versioned_term","revocation_process","incident_plan"]}'::jsonb),
  ('facial_anonymous_retention', 'facial', 'Retenção de biometria anônima',
   'O código atual expurga registros anônimos em 90 dias; o prazo precisa de aprovação formal e evidência.',
   'review_required', '{"current_days":90,"automated_purge":true}'::jsonb),
  ('wifi_pii_retention', 'wifi', 'Retenção de dados do portal Wi-Fi',
   'CPF, telefone, IP e MAC exigem prazo, finalidade e procedimento de expurgo aprovados.',
   'pending_decision', '{"data_classes":["cpf","phone","ip","mac"]}'::jsonb),
  ('telemetry_retention', 'telemetry', 'Retenção de telemetria operacional',
   'Eventos mobile, Web Vitals e erros precisam de expurgo e agregação conforme política aprovada.',
   'pending_decision', '{"proposed_raw_days":90,"proposed_error_days":180}'::jsonb),
  ('identity_conflict_review', 'data', 'Fila de conflitos de identidade',
   'Conflitos vindos do Wi-Fi devem permanecer em revisão humana, sem consolidação automática insegura.',
   'monitoring', '{"source":"identidade_pendencias"}'::jsonb),
  ('backup_restore_evidence', 'backup', 'Evidência de restauração',
   'Backups só são considerados verificados após teste de restauração com data, responsável e evidência.',
   'pending_decision', '{}'::jsonb)
ON CONFLICT (control_key) DO NOTHING;

COMMENT ON TABLE public.system_governance_controls IS
  'Controles e decisões de governança do módulo Sistema; somente metadados e links de evidência.';
COMMENT ON TABLE public.system_governance_control_events IS
  'Histórico append-only das mudanças de controles de governança.';

REVOKE DELETE ON TABLE public.system_governance_controls FROM service_role;
REVOKE UPDATE, DELETE ON TABLE public.system_governance_control_events FROM service_role;
