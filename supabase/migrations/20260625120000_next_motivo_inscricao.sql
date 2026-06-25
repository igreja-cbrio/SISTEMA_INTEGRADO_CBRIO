-- ============================================================================
-- NEXT · motivo da inscrição
--
-- O formulário público do NEXT passou a perguntar "Por que você quer participar
-- do NEXT?" (escolha única). Guardamos o motivo como slug estável pra permitir
-- recorte/jornada depois (recém-convertido, prestes a batizar, etc.).
--
-- Aditiva e idempotente. ⚠️ Aplicar ANTES do deploy: o backend passa a inserir
-- a coluna `motivo`; sem ela o PostgREST rejeita o INSERT e o formulário quebra.
-- ============================================================================

ALTER TABLE public.next_inscricoes
  ADD COLUMN IF NOT EXISTS motivo text;

ALTER TABLE public.next_matriculas
  ADD COLUMN IF NOT EXISTS motivo text;

COMMENT ON COLUMN public.next_inscricoes.motivo IS
  'Motivo da inscrição (slug): recem_convertido | prestes_batizar | conhecer_cbrio | servir_voluntario';
COMMENT ON COLUMN public.next_matriculas.motivo IS
  'Motivo da inscrição (slug): recem_convertido | prestes_batizar | conhecer_cbrio | servir_voluntario';
