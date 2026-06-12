-- Tutorial progress · tracks which onboarding tours each user has seen
-- Created 2026-05-26 · supports first-login guided tours per module

CREATE TABLE IF NOT EXISTS public.app_tutorial_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'skipped')),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tour_id)
);

CREATE INDEX IF NOT EXISTS idx_app_tutorial_progress_user
  ON public.app_tutorial_progress (user_id);

ALTER TABLE public.app_tutorial_progress ENABLE ROW LEVEL SECURITY;

-- Drop legacy policies if rerunning
DROP POLICY IF EXISTS app_tutorial_progress_select ON public.app_tutorial_progress;
DROP POLICY IF EXISTS app_tutorial_progress_insert ON public.app_tutorial_progress;
DROP POLICY IF EXISTS app_tutorial_progress_delete ON public.app_tutorial_progress;
DROP POLICY IF EXISTS app_tutorial_progress_service ON public.app_tutorial_progress;

CREATE POLICY app_tutorial_progress_select
  ON public.app_tutorial_progress
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY app_tutorial_progress_insert
  ON public.app_tutorial_progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY app_tutorial_progress_delete
  ON public.app_tutorial_progress
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY app_tutorial_progress_service
  ON public.app_tutorial_progress
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.app_tutorial_progress IS
  'Tracks completed/skipped onboarding tours per user. Used by the tutorial system to know which tours to show on first access.';
