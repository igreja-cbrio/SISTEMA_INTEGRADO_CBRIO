-- ============================================================================
-- Online · metrica #1 · watch time + retencao por culto
--
-- Adiciona 4 colunas em `cultos` pra captar duas dimensoes de qualidade do
-- conteudo online que ate agora ficavam invisiveis (sabia-se quantos viam,
-- nao quantos terminavam):
--
--   - online_watch_minutes_ds       · total minutos assistidos NO dia D
--   - online_watch_minutes_ddus     · total minutos assistidos D+1..D+7
--   - online_retencao_pct_ds        · % medio do video assistido NO dia D
--   - online_retencao_pct_ddus      · % medio do video assistido D+1..D+7
--
-- Fonte: YouTube Analytics API · metricas `estimatedMinutesWatched` e
-- `averageViewPercentage`. Coletadas pelos collectors ds/ddus ja
-- existentes · sem novo cron.
-- ============================================================================

ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS online_watch_minutes_ds   integer CHECK (online_watch_minutes_ds   IS NULL OR online_watch_minutes_ds   >= 0),
  ADD COLUMN IF NOT EXISTS online_watch_minutes_ddus integer CHECK (online_watch_minutes_ddus IS NULL OR online_watch_minutes_ddus >= 0),
  ADD COLUMN IF NOT EXISTS online_retencao_pct_ds    numeric(5,2) CHECK (online_retencao_pct_ds   IS NULL OR (online_retencao_pct_ds   >= 0 AND online_retencao_pct_ds   <= 100)),
  ADD COLUMN IF NOT EXISTS online_retencao_pct_ddus  numeric(5,2) CHECK (online_retencao_pct_ddus IS NULL OR (online_retencao_pct_ddus >= 0 AND online_retencao_pct_ddus <= 100));

COMMENT ON COLUMN public.cultos.online_watch_minutes_ds   IS 'Total de minutos assistidos no dia D do culto · YouTube Analytics estimatedMinutesWatched';
COMMENT ON COLUMN public.cultos.online_watch_minutes_ddus IS 'Total de minutos assistidos D+1 ate D+7 (on-demand) · YouTube Analytics';
COMMENT ON COLUMN public.cultos.online_retencao_pct_ds    IS '% medio do video assistido no dia D · YouTube Analytics averageViewPercentage';
COMMENT ON COLUMN public.cultos.online_retencao_pct_ddus  IS '% medio do video assistido D+1..D+7 · YouTube Analytics averageViewPercentage';
