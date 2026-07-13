-- ============================================================================
-- Grupos · limites de idade OPCIONAIS por grupo (Marcos · 2026-07-13)
--
-- O formulário público de inscrição passa a BLOQUEAR pessoa fora da faixa
-- etária do grupo — mas só quando o grupo tem limite definido (NULL = sem
-- restrição · grupos gerais não precisam de nada). Os grupos com rótulo
-- etário (faixa_etaria Jovens/Adolescentes/etc. ou nome "de jovens") sem
-- limites aparecem no filtro de pendências do admin pra liderança resolver.
--
-- Aditiva e idempotente. Sem RLS nova (mem_grupos já tem as suas policies).
-- ============================================================================

ALTER TABLE public.mem_grupos ADD COLUMN IF NOT EXISTS idade_min integer;
ALTER TABLE public.mem_grupos ADD COLUMN IF NOT EXISTS idade_max integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mem_grupos_idade_range_check'
  ) THEN
    ALTER TABLE public.mem_grupos ADD CONSTRAINT mem_grupos_idade_range_check
      CHECK (
        (idade_min IS NULL OR (idade_min >= 0 AND idade_min <= 120))
        AND (idade_max IS NULL OR (idade_max >= 0 AND idade_max <= 120))
        AND (idade_min IS NULL OR idade_max IS NULL OR idade_min <= idade_max)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.mem_grupos.idade_min IS
  'Idade mínima pra inscrição no grupo (NULL = sem restrição · trava do form público)';
COMMENT ON COLUMN public.mem_grupos.idade_max IS
  'Idade máxima pra inscrição no grupo (NULL = sem restrição · trava do form público)';
