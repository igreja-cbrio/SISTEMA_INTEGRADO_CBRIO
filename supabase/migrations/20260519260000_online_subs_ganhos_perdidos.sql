-- ============================================================================
-- Online · metrica #2 · inscritos ganhos/perdidos por video (D+7)
--
-- Adiciona 2 colunas em `cultos`:
--   - online_subs_ganhos    · inscritos novos que ASSINARAM apos assistir
--   - online_subs_perdidos  · inscritos que desassinaram apos assistir
--
-- Responde "qual culto esta convertendo audiencia em ovelhas novas?".
-- Fonte: YouTube Analytics API · metricas `subscribersGained` e
-- `subscribersLost` filtradas por video, janela D ate D+7.
-- ============================================================================

ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS online_subs_ganhos   integer CHECK (online_subs_ganhos   IS NULL OR online_subs_ganhos   >= 0),
  ADD COLUMN IF NOT EXISTS online_subs_perdidos integer CHECK (online_subs_perdidos IS NULL OR online_subs_perdidos >= 0);

COMMENT ON COLUMN public.cultos.online_subs_ganhos   IS 'Inscritos novos atribuidos ao video do culto · YouTube Analytics subscribersGained (D..D+7)';
COMMENT ON COLUMN public.cultos.online_subs_perdidos IS 'Inscritos perdidos atribuidos ao video do culto · YouTube Analytics subscribersLost (D..D+7)';
