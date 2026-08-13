ALTER TABLE public.nps_respostas ADD COLUMN IF NOT EXISTS turma_id UUID REFERENCES public.next_turmas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_nps_respostas_turma ON public.nps_respostas (turma_id) WHERE turma_id IS NOT NULL;
COMMENT ON COLUMN public.nps_respostas.turma_id IS 'Turma do Next quando a resposta veio do QR por turma (?turma=). Null = geral/outras origens.';
