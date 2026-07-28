-- Feedback do Marcos (28/07, teste em produção): série recorrente ganha DATA
-- FINAL ("recorrente mensalmente até X") — exibida no modal da série junto de
-- todas as edições. Tabela nova e sem tráfego → 1 colagem tranquila.
SET lock_timeout = '10s';

ALTER TABLE public.insc_series
  ADD COLUMN IF NOT EXISTS recorre_ate DATE;

COMMENT ON COLUMN public.insc_series.recorre_ate IS
  'Data final da recorrência (informativa · "mensal até 2026-12-31"); NULL = sem data final.';
