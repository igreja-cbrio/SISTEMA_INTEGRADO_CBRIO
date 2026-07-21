-- Next · turmas: marcador de "contato feito" com a pessoa matriculada.
-- Aditivo/idempotente. A equipe marca na modal da turma se já falou com a pessoa.
ALTER TABLE public.next_matriculas
  ADD COLUMN IF NOT EXISTS contato_em  timestamptz,
  ADD COLUMN IF NOT EXISTS contato_por uuid;

COMMENT ON COLUMN public.next_matriculas.contato_em  IS 'Quando a equipe marcou que fez contato com a pessoa (null = ainda não).';
COMMENT ON COLUMN public.next_matriculas.contato_por IS 'Profile que marcou o contato (profiles.id).';
