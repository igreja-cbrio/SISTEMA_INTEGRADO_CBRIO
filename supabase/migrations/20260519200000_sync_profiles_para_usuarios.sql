-- ============================================================================
-- Sync profiles → usuarios · garante que TODO colaborador ativo tem registro
-- na tabela usuarios (e portanto entra no sistema granular de permissoes).
--
-- Problema diagnosticado em 2026-05-19: a tabela `usuarios` so era populada
-- por auto-provision quando alguem logava apos a implementacao do middleware
-- granular. Profiles antigos (como Alda Lorena) ficavam fora, e o backend
-- retornava `granular = null`, fazendo o front cair no "fallback aberto"
-- que mostra tudo no menu.
--
-- Esta migration backfilla TODOS os profiles ativos que ainda nao estao em
-- usuarios, atribuindo cargo default por role (mesmo mapeamento do
-- auto-provision em backend/middleware/auth.js:194):
--   admin/diretor  → diretor-administrativo (acesso amplo)
--   voluntario     → voluntario
--   demais         → membro (mais restritivo · ajustar caso a caso depois)
--
-- Idempotente · NOT EXISTS impede duplicacao por email.
-- ============================================================================

INSERT INTO public.usuarios (email, cargo_id, ativo)
SELECT
  LOWER(TRIM(p.email)),
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

-- Log do backfill (apenas info)
DO $$
DECLARE
  total_profiles int;
  total_usuarios int;
BEGIN
  SELECT count(*) INTO total_profiles FROM public.profiles WHERE active = true AND email IS NOT NULL;
  SELECT count(*) INTO total_usuarios FROM public.usuarios WHERE ativo = true;
  RAISE NOTICE 'Sync profiles→usuarios: profiles ativos=% · usuarios ativos=%',
    total_profiles, total_usuarios;
END $$;

-- Conferencia (descomente no Studio):
-- SELECT p.email, p.name, p.role, u.cargo_id, c.slug AS cargo
--   FROM profiles p
--   LEFT JOIN usuarios u ON LOWER(u.email) = LOWER(p.email)
--   LEFT JOIN cargos c ON c.id = u.cargo_id
--  WHERE p.active = true
--  ORDER BY c.slug NULLS FIRST, p.name;
