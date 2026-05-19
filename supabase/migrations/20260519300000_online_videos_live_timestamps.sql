-- ============================================================================
-- Online · armazena timestamps de transmissao ao vivo por video
--
-- Pra fazer auto-link de cultos passados sem `youtube_video_id` setado,
-- precisamos do `actualStartTime` que a YouTube Data API expoe em
-- `liveStreamingDetails`. Comparando esse timestamp com a hora marcada
-- do culto (`vol_service_types.recurrence_time` + culto.data) o
-- `backfillCultoVideoIds()` consegue parear automaticamente.
-- ============================================================================

ALTER TABLE public.online_videos
  ADD COLUMN IF NOT EXISTS actual_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS actual_end_time   timestamptz;

CREATE INDEX IF NOT EXISTS idx_online_videos_actual_start
  ON public.online_videos(actual_start_time DESC NULLS LAST);

COMMENT ON COLUMN public.online_videos.actual_start_time IS
  'Quando a live efetivamente comecou · YouTube Data API liveStreamingDetails.actualStartTime · NULL se nao foi live';
COMMENT ON COLUMN public.online_videos.actual_end_time IS
  'Quando a live encerrou · YouTube Data API liveStreamingDetails.actualEndTime';
