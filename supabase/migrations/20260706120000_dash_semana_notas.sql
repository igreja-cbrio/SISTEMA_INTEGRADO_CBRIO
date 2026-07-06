-- Dashboard Semanal · Observações da semana (pedido 2026-07-06).
-- Contexto: domingo 05/07 não teve culto das 19h (jogo do Brasil) e o bloco
-- apareceu zerado sem explicação. Nota por (ano, semana ISO) — opcionalmente
-- presa a um bloco de culto (service_type_id da vw_dashboard_*) — explica o
-- porquê pra quem lê o dashboard. Sem PII (texto operacional + autor).

CREATE TABLE IF NOT EXISTS public.dash_semana_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_iso INTEGER NOT NULL,
  semana_iso INTEGER NOT NULL,
  -- NULL = observação da semana toda; senão o bloco fixo do dashboard
  -- (b10c0000-...01..05 · Domingo Manhã/Noite, Quarta, AMI, Bridge) ou culto real.
  service_type_id UUID,
  service_type_name TEXT,
  nota TEXT NOT NULL,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_por_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dash_semana_notas_semana
  ON public.dash_semana_notas (ano_iso, semana_iso);

COMMENT ON TABLE public.dash_semana_notas IS
  'Observações do Dashboard Semanal (ex.: "Não houve culto · jogo do Brasil"). Explicam blocos zerados/atípicos. Escrita via backend (authenticate); leitura de qualquer autenticado.';

ALTER TABLE public.dash_semana_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY dash_semana_notas_select ON public.dash_semana_notas
  FOR SELECT TO authenticated USING (true); -- leitura geral (dashboard é leitura de todos)

CREATE POLICY dash_semana_notas_service ON public.dash_semana_notas
  FOR ALL TO service_role USING (true) WITH CHECK (true);
