-- ============================================================================
-- NEXT · presença mensal MANUAL (2026-07-15)
--
-- Pedido do Matheus: a aba NEXT do Dashboard Semanal conta a presença pelo
-- check-in das inscrições. Mas nos meses em que o check-in não foi usado (ex.:
-- junho/2026), o número precisa ser lançado à mão a partir da lista de presença.
-- Esta tabela guarda o total MANUAL por mês; quando existe, ele SUBSTITUI a
-- contagem automática do check-in naquele mês (o dashboard usa manual > auto).
--
-- Não é PII (só um número agregado por mês) → sem deleted_at/whitelist; RLS:
-- leitura pra autenticado, escrita via backend (service_role · o endpoint já
-- guarda por admin/diretor).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.next_presenca_mensal (
  ano_mes      TEXT PRIMARY KEY,              -- 'AAAA-MM'
  total        INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  observacao   TEXT,
  updated_by   UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.next_presenca_mensal ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY next_presenca_mensal_read ON public.next_presenca_mensal
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY next_presenca_mensal_service ON public.next_presenca_mensal
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed do mês passado (junho/2026) = 66 pessoas (lista de presença · check-in
-- não foi usado nesse mês). Idempotente.
INSERT INTO public.next_presenca_mensal (ano_mes, total, observacao)
VALUES ('2026-06', 66, 'Lançado da lista de presença (check-in não usado no mês)')
ON CONFLICT (ano_mes) DO NOTHING;
