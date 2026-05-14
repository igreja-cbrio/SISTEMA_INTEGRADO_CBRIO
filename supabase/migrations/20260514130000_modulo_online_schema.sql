-- ============================================================================
-- Modulo Online · snapshot do canal YouTube + agrupamento por series (playlists)
--
-- Decisao:
-- - Series de pregacao = playlists do YouTube (clean, voce controla no YT Studio)
-- - Cron diario popula essas tabelas (~40 unidades de quota/dia)
-- - UI le do snapshot · sem chamar API ao vivo
--
-- Quem preenche frequencia/aceitacoes do online: Alda Lorena via
-- /ministerial/integracao (aba Cultos). Este modulo eh SOMENTE leitura.
-- ============================================================================

-- 1) Snapshot diario do canal (1 linha por dia)
CREATE TABLE IF NOT EXISTS public.online_canal_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL UNIQUE,
  channel_id text NOT NULL,
  channel_title text,
  channel_thumbnail text,
  subscriber_count int,
  view_count bigint,
  video_count int,
  collected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_canal_snap_data
  ON public.online_canal_snapshot (data DESC);

-- 2) Series (playlists)
CREATE TABLE IF NOT EXISTS public.online_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id text NOT NULL UNIQUE,
  titulo text NOT NULL,
  descricao text,
  thumbnail_url text,
  total_videos int DEFAULT 0,
  publicada_em timestamptz,
  collected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_series_publicada
  ON public.online_series (publicada_em DESC NULLS LAST);

-- 3) Videos do canal (snapshot)
CREATE TABLE IF NOT EXISTS public.online_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text NOT NULL UNIQUE,
  serie_id uuid REFERENCES public.online_series(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descricao text,
  thumbnail_url text,
  duration_iso text,
  duration_seconds int,
  publicado_em timestamptz NOT NULL,
  view_count bigint DEFAULT 0,
  like_count int DEFAULT 0,
  comment_count int DEFAULT 0,
  -- like_count / view_count * 100 (calculado no app, salvo aqui pra index)
  taxa_engajamento numeric,
  culto_id uuid REFERENCES public.cultos(id) ON DELETE SET NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_videos_publicado
  ON public.online_videos (publicado_em DESC);
CREATE INDEX IF NOT EXISTS idx_online_videos_views
  ON public.online_videos (view_count DESC);
CREATE INDEX IF NOT EXISTS idx_online_videos_engajamento
  ON public.online_videos (taxa_engajamento DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_online_videos_serie
  ON public.online_videos (serie_id) WHERE serie_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_online_videos_culto
  ON public.online_videos (culto_id) WHERE culto_id IS NOT NULL;

-- RLS
ALTER TABLE public.online_canal_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_online_snap" ON public.online_canal_snapshot;
CREATE POLICY "service_role_online_snap" ON public.online_canal_snapshot
  FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "auth_read_online_snap" ON public.online_canal_snapshot;
CREATE POLICY "auth_read_online_snap" ON public.online_canal_snapshot
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_role_online_series" ON public.online_series;
CREATE POLICY "service_role_online_series" ON public.online_series
  FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "auth_read_online_series" ON public.online_series;
CREATE POLICY "auth_read_online_series" ON public.online_series
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_role_online_videos" ON public.online_videos;
CREATE POLICY "service_role_online_videos" ON public.online_videos
  FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "auth_read_online_videos" ON public.online_videos;
CREATE POLICY "auth_read_online_videos" ON public.online_videos
  FOR SELECT TO authenticated USING (true);

-- Vistas auxiliares
CREATE OR REPLACE VIEW public.vw_online_series_kpi AS
SELECT
  s.id, s.playlist_id, s.titulo, s.descricao, s.thumbnail_url,
  s.publicada_em, s.total_videos,
  count(v.id) AS videos_publicados,
  coalesce(sum(v.view_count), 0) AS total_views,
  coalesce(sum(v.like_count), 0) AS total_likes,
  coalesce(sum(v.comment_count), 0) AS total_comments,
  CASE
    WHEN sum(v.view_count) > 0
      THEN round((sum(v.like_count)::numeric / sum(v.view_count)::numeric) * 100, 2)
    ELSE NULL
  END AS taxa_engajamento_media,
  max(v.publicado_em) AS ultimo_video_em
FROM public.online_series s
LEFT JOIN public.online_videos v ON v.serie_id = s.id
GROUP BY s.id;

GRANT SELECT ON public.vw_online_series_kpi TO authenticated, service_role;

COMMENT ON TABLE public.online_canal_snapshot IS 'Snapshot diario do canal YouTube CBRio (inscritos, views totais)';
COMMENT ON TABLE public.online_series IS 'Series de pregacao espelhando playlists do canal';
COMMENT ON TABLE public.online_videos IS 'Videos do canal com estatisticas (view_count, like_count)';
