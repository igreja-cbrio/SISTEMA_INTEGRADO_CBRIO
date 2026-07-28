-- ============================================================================
-- vol_inscricoes: 'desistente' entra no CHECK de status (achado do sweep 28/07)
--
-- A PR #2075 criou o botão "Desistiu de servir" (status terminal
-- 'desistente'), mas NENHUMA migration ampliou o CHECK original
-- (20260513210000: inscrito|enviado_ministerio|integrado|kids|nao_responde|
-- nao_pode_ou_duplicata) — o UPDATE viola 23514 e o botão devolve 500.
-- Confirmado no banco: 0 linhas 'desistente'.
--
-- O CHECK original é inline (sem nome explícito) — o bloco descobre o nome
-- REAL no catálogo (robusto a sufixos), dropa e recria com o vocabulário
-- completo. Idempotente; NOT VALID + VALIDATE não trava a tabela viva.
-- ============================================================================
SET lock_timeout = '10s';

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.vol_inscricoes'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%status%'
       AND pg_get_constraintdef(oid) LIKE '%inscrito%'
  LOOP
    EXECUTE format('ALTER TABLE public.vol_inscricoes DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'CHECK antigo removido: %', c.conname;
  END LOOP;
END $$;

ALTER TABLE public.vol_inscricoes ADD CONSTRAINT vol_inscricoes_status_check
  CHECK (status IN ('inscrito', 'enviado_ministerio', 'integrado', 'kids', 'nao_responde', 'nao_pode_ou_duplicata', 'desistente')) NOT VALID;
ALTER TABLE public.vol_inscricoes VALIDATE CONSTRAINT vol_inscricoes_status_check;

COMMENT ON CONSTRAINT vol_inscricoes_status_check ON public.vol_inscricoes IS
  'desistente = terminal, pessoa desistiu antes de virar voluntário (PR #2075); não entra no funil de alocadas nem cria vol_profile.';
