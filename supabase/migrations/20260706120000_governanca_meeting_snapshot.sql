ALTER TABLE public.governance_meetings ADD COLUMN IF NOT EXISTS snapshot jsonb;
ALTER TABLE public.governance_meetings ADD COLUMN IF NOT EXISTS snapshot_em timestamptz;
