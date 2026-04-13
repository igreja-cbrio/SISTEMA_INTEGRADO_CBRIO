-- ═══════════════════════════════════════════════════════════
-- Famílias (misto) — papel do membro dentro da família
-- ═══════════════════════════════════════════════════════════

-- Adiciona parentesco em mem_membros para descrever o papel do
-- membro dentro da família (responsavel, conjuge, filho, outro).
-- Valor opcional: famílias pequenas podem não precisar rotular.
ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS parentesco text
  CHECK (parentesco IN ('responsavel', 'conjuge', 'filho', 'outro'));

CREATE INDEX IF NOT EXISTS idx_mem_membros_familia
  ON public.mem_membros(familia_id)
  WHERE familia_id IS NOT NULL;
