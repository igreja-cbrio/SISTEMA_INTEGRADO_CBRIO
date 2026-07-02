-- Visitas · novos tipos + campo livre "Outro" (Marcos · 2026-07-02)
-- ============================================================================
-- A aba "Visitas e atendimentos" (cui_visitas) passa a usar os tipos que o Marcelo
-- realmente usa: Visita domiciliar · Visita hospitalar · Funeral · Casamento ·
-- Aconselhamento · Outro (com descrição livre em tipo_outro).
-- cui_visitas está VAZIA → troca direta do CHECK, sem migração de dados.
-- Aditiva/idempotente. NÃO toca NSM/jornada (cui_visitas é lida só pelo Cuidados).
-- ============================================================================

ALTER TABLE public.cui_visitas DROP CONSTRAINT IF EXISTS cui_visitas_tipo_check;

ALTER TABLE public.cui_visitas ALTER COLUMN tipo SET DEFAULT 'visita_domiciliar';

ALTER TABLE public.cui_visitas
  ADD CONSTRAINT cui_visitas_tipo_check
  CHECK (tipo IN ('visita_domiciliar', 'visita_hospitalar', 'funeral', 'casamento', 'aconselhamento', 'outro'));

ALTER TABLE public.cui_visitas
  ADD COLUMN IF NOT EXISTS tipo_outro text;

COMMENT ON COLUMN public.cui_visitas.tipo_outro IS
  'Descrição livre do tipo quando tipo = ''outro'' (Marcos 2026-07-02).';
