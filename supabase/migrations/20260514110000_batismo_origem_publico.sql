-- ============================================================================
-- batismo_inscricoes.origem: adiciona 'publico' (formulario publico de
-- inscricao para batismo)
-- ============================================================================

ALTER TABLE public.batismo_inscricoes
  DROP CONSTRAINT IF EXISTS batismo_inscricoes_origem_check;

ALTER TABLE public.batismo_inscricoes
  ADD CONSTRAINT batismo_inscricoes_origem_check
  CHECK (origem IN ('totem', 'manual', 'publico'));
