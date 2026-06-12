-- ============================================================================
-- Online · metrica #4 · curva de retencao segundo-a-segundo
--
-- YouTube Analytics expoe a dimensao `elapsedVideoTimeRatio` (0.00..1.00 em
-- intervalos de 0.01) com a metrica `audienceWatchRatio` (% dos viewers
-- ainda assistindo naquele ponto).
--
-- Pra cada video, vem ~100 linhas (1 por percentual). Modelamos numa tabela
-- separada `online_video_retencao_curva` · idempotente via UNIQUE
-- (video_id, ratio_pct).
--
-- Janela: D..D+7. Frontend pode renderizar como mini-grafico de linha
-- pra entender onde a galera fecha o video.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.online_video_retencao_curva (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id                text NOT NULL,
  ratio_pct               integer NOT NULL CHECK (ratio_pct >= 0 AND ratio_pct <= 100),
  audience_watch_ratio    numeric(6,4) NOT NULL CHECK (audience_watch_ratio >= 0),
  periodo_inicio          date NOT NULL,
  periodo_fim             date NOT NULL,
  collected_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, ratio_pct)
);

CREATE INDEX IF NOT EXISTS idx_online_retcurva_video ON public.online_video_retencao_curva(video_id);

COMMENT ON TABLE public.online_video_retencao_curva IS
  'Curva de retencao por video · YouTube Analytics audienceWatchRatio × elapsedVideoTimeRatio (D..D+7) · ~100 linhas por video';
COMMENT ON COLUMN public.online_video_retencao_curva.ratio_pct IS
  'Posicao no video em % (0..100) · 0 = inicio, 100 = fim';
COMMENT ON COLUMN public.online_video_retencao_curva.audience_watch_ratio IS
  '% de viewers ainda assistindo naquele ponto · valores 0..1 (1.0 = 100% dos que comecaram)';

ALTER TABLE public.online_video_retencao_curva ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read online_video_retencao_curva" ON public.online_video_retencao_curva;
CREATE POLICY "Authenticated read online_video_retencao_curva"
  ON public.online_video_retencao_curva FOR SELECT TO authenticated USING (true);
