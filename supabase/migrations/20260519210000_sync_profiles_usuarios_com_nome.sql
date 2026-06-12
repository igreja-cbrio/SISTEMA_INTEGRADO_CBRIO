-- ============================================================================
-- Fix da migration 20260519200000 · tabela usuarios em prod tem `nome` NOT NULL
-- ============================================================================
-- Erro anterior: null value in column "nome" of relation "usuarios" violates
-- not-null constraint
--
-- Re-roda o backfill incluindo p.name. Fallback: se profile.name for null,
-- usa a parte antes do @ do email pra evitar nova quebra.
--
-- Idempotente (NOT EXISTS por email já garante).
-- ============================================================================

INSERT INTO public.usuarios (email, nome, cargo_id, ativo)
SELECT
  LOWER(TRIM(p.email)),
  COALESCE(NULLIF(TRIM(p.name), ''), split_part(p.email, '@', 1)),
  CASE
    WHEN p.role IN ('admin', 'diretor') THEN
      (SELECT id FROM public.cargos WHERE slug = 'diretor-administrativo' LIMIT 1)
    WHEN p.role = 'voluntario' THEN
      (SELECT id FROM public.cargos WHERE slug = 'voluntario' LIMIT 1)
    ELSE
      (SELECT id FROM public.cargos WHERE slug = 'membro' LIMIT 1)
  END,
  true
  FROM public.profiles p
 WHERE p.active = true
   AND p.email IS NOT NULL
   AND TRIM(p.email) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.usuarios u
      WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(p.email))
   );

DO $$
DECLARE
  total_profiles int;
  total_usuarios int;
BEGIN
  SELECT count(*) INTO total_profiles FROM public.profiles WHERE active = true AND email IS NOT NULL;
  SELECT count(*) INTO total_usuarios FROM public.usuarios WHERE ativo = true;
  RAISE NOTICE 'Sync v2 profiles→usuarios: profiles ativos=% · usuarios ativos=%',
    total_profiles, total_usuarios;
END $$;
