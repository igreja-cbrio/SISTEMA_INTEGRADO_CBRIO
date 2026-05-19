-- ============================================================================
-- Online · metrica #5 · views de inscritos vs nao-inscritos (D+7)
--
-- Adiciona 2 colunas em `cultos`:
--   - online_views_inscritos      · views vindas de quem ja eh inscrito
--   - online_views_nao_inscritos  · views vindas de nao-inscritos
--
-- Responde: "qual culto fala mais com a ovelha que ja temos vs com quem
-- ainda nao eh do rebanho?". Proporcao alta de nao-inscritos = video
-- ganhou alcance organico (busca/sugerido). Proporcao alta de inscritos
-- = pregando pra galera ja convertida.
--
-- Fonte: YouTube Analytics dimension `subscribedStatus` (SUBSCRIBED vs
-- UNSUBSCRIBED) + metric `views` · janela D..D+7.
-- ============================================================================

ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS online_views_inscritos     integer CHECK (online_views_inscritos     IS NULL OR online_views_inscritos     >= 0),
  ADD COLUMN IF NOT EXISTS online_views_nao_inscritos integer CHECK (online_views_nao_inscritos IS NULL OR online_views_nao_inscritos >= 0);

COMMENT ON COLUMN public.cultos.online_views_inscritos     IS 'Views D..D+7 atribuidas a viewers ja inscritos no canal · YouTube Analytics subscribedStatus=SUBSCRIBED';
COMMENT ON COLUMN public.cultos.online_views_nao_inscritos IS 'Views D..D+7 atribuidas a viewers NAO inscritos · YouTube Analytics subscribedStatus=UNSUBSCRIBED';
