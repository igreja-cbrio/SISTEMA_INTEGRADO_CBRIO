-- ============================================================================
-- Online · metrica #3 · fontes de trafego por video (D+7)
--
-- YouTube Analytics expoe a dimensao `insightTrafficSourceType` que mostra
-- de onde os viewers chegaram em cada video. Valores comuns:
--   YT_SEARCH        · busca no YouTube
--   YT_RELATED       · "Sugerido" (suggested)
--   EXT_URL          · links externos (Insta, site, etc)
--   BROWSE           · home/feed/inscricoes
--   YT_CHANNEL       · pagina do canal
--   YT_PLAYLIST      · playlist
--   END_SCREEN       · endscreen de outro video
--   SHORTS           · cards/links de Shorts
--   NO_LINK_OTHER    · direto/outros
--
-- Como cada video tem N linhas (1 por fonte), modelamos como tabela
-- separada `online_video_trafico` em vez de colunas em `cultos`.
--
-- Janela: D..D+7 · idempotente via UNIQUE (video_id, fonte) · upsert.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.online_video_trafico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      text NOT NULL,
  fonte         text NOT NULL,
  views         integer NOT NULL DEFAULT 0 CHECK (views >= 0),
  watch_minutes integer NOT NULL DEFAULT 0 CHECK (watch_minutes >= 0),
  periodo_inicio date NOT NULL,
  periodo_fim    date NOT NULL,
  collected_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, fonte)
);

CREATE INDEX IF NOT EXISTS idx_online_trafico_video ON public.online_video_trafico(video_id);
CREATE INDEX IF NOT EXISTS idx_online_trafico_fonte ON public.online_video_trafico(fonte);

COMMENT ON TABLE public.online_video_trafico IS
  'Fontes de trafego por video · YouTube Analytics insightTrafficSourceType (D..D+7)';
COMMENT ON COLUMN public.online_video_trafico.fonte IS
  'Codigo bruto do YouTube · YT_SEARCH, YT_RELATED, EXT_URL, BROWSE, YT_CHANNEL, YT_PLAYLIST, END_SCREEN, SHORTS, NO_LINK_OTHER';

ALTER TABLE public.online_video_trafico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read online_video_trafico" ON public.online_video_trafico;
CREATE POLICY "Authenticated read online_video_trafico"
  ON public.online_video_trafico FOR SELECT TO authenticated USING (true);
