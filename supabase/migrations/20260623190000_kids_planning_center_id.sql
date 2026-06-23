-- ============================================================================
-- kids_criancas.planning_center_id · idempotência do sync com a API do PCO
-- ============================================================================
-- O sync de crianças puxa a base do Planning Center Check-Ins e faz upsert por
-- este id. Coluna nullable + índice UNIQUE (NULLs são distintos no Postgres, então
-- as crianças antigas/importadas por XLSX sem id convivem sem conflito). Aditivo
-- e backwards-compatible.

ALTER TABLE public.kids_criancas
  ADD COLUMN IF NOT EXISTS planning_center_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kids_criancas_pco_id
  ON public.kids_criancas (planning_center_id);

COMMENT ON COLUMN public.kids_criancas.planning_center_id IS
  'ID da pessoa no Planning Center Check-Ins · chave do sync (upsert idempotente).';
