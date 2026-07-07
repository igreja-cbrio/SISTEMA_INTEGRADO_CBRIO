ALTER TABLE public.governance_meetings ADD COLUMN IF NOT EXISTS temas jsonb;
ALTER TABLE public.governance_tasks DROP CONSTRAINT IF EXISTS governance_tasks_status_check;
ALTER TABLE public.governance_tasks ADD CONSTRAINT governance_tasks_status_check CHECK (status IN ('pendente','em_andamento','concluida','cancelada','nao_executada'));
