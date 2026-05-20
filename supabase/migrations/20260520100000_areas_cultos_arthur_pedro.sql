-- ============================================================================
-- Arthur Serpa supervisiona 8 areas + Pedro Menezes unico gerente do Online
-- ============================================================================
-- Decisao do Marcos (2026-05-20):
-- - Arthur Serpa (diretor-ministerial) tambem supervisiona CBKids, AMI,
--   Sede e Bridge alem das 4 ministeriais ja atribuidas
-- - Pedro Menezes gerencia o Online · tirar a area Online dos outros
--   diretor-criativos (Allan, David, Leticia, Lorena Pariz)
--
-- Idempotente.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Passo 1 · Criar areas Sede e Bridge no setor "Geracionais" (id=4)
--   (mesmo setor de AMI e KIDS · todos sao tipos de culto)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.areas (nome, setor_id, ativo)
SELECT 'Sede', 4, true
WHERE NOT EXISTS (SELECT 1 FROM public.areas WHERE LOWER(TRIM(nome)) = 'sede');

INSERT INTO public.areas (nome, setor_id, ativo)
SELECT 'Bridge', 4, true
WHERE NOT EXISTS (SELECT 1 FROM public.areas WHERE LOWER(TRIM(nome)) = 'bridge');

-- ─────────────────────────────────────────────────────────────────────
-- Passo 2 · Atribuir as 8 areas ao Arthur Serpa
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.usuario_areas (usuario_id, area_id, is_principal)
SELECT
  (SELECT id FROM public.usuarios WHERE LOWER(TRIM(email)) = 'arthur.serpa@cbrio.org' LIMIT 1),
  a.id,
  false
  FROM public.areas a
 WHERE a.nome IN ('Cuidados', 'Grupos', 'Integração', 'Voluntariado', 'KIDS', 'AMI', 'Sede', 'Bridge')
   AND a.ativo = true
   AND (SELECT id FROM public.usuarios WHERE LOWER(TRIM(email)) = 'arthur.serpa@cbrio.org' LIMIT 1) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.usuario_areas ua
      WHERE ua.usuario_id = (SELECT id FROM public.usuarios WHERE LOWER(TRIM(email)) = 'arthur.serpa@cbrio.org' LIMIT 1)
        AND ua.area_id = a.id
   );

-- ─────────────────────────────────────────────────────────────────────
-- Passo 3 · Tirar area Online dos diretor-criativos que NAO sao Pedro Menezes
--   (Pedro Menezes = pepe.menezes@cbrio.org · ele mantem Online)
-- ─────────────────────────────────────────────────────────────────────
DELETE FROM public.usuario_areas ua
 WHERE ua.area_id = (SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) = 'online' LIMIT 1)
   AND ua.usuario_id IN (
     SELECT u.id FROM public.usuarios u
       JOIN public.cargos c ON c.id = u.cargo_id
      WHERE c.slug = 'diretor-criativo'
        AND LOWER(TRIM(u.email)) <> 'pepe.menezes@cbrio.org'
   );

-- Conferencia (descomente):
-- SELECT u.email, c.slug AS cargo, array_agg(a.nome ORDER BY a.nome) AS areas
--   FROM usuarios u
--   LEFT JOIN cargos c ON c.id = u.cargo_id
--   LEFT JOIN usuario_areas ua ON ua.usuario_id = u.id
--   LEFT JOIN areas a ON a.id = ua.area_id
--  WHERE LOWER(u.email) IN ('arthur.serpa@cbrio.org', 'pepe.menezes@cbrio.org',
--                            'allan.santana@cbrio.org', 'david.sicon@cbrio.org',
--                            'leticia.baldner@cbrio.org', 'lorena.pariz@cbrio.org')
--  GROUP BY u.email, c.slug;
