-- Resumo automático do Kids (fim de culto, via check-ins do Planning Center).
-- Coluna de controle pra DEDUP do envio: marca quando o resumo daquele culto já
-- foi disparado pros líderes (Mari Gaia, Milena, Matheus). O cron horário só
-- processa cultos com kids que já terminaram e ainda estão com isto nulo.
-- Aditiva e backwards-compatible (ADD COLUMN IF NOT EXISTS).
ALTER TABLE public.cultos ADD COLUMN IF NOT EXISTS kids_resumo_enviado_at timestamptz;
