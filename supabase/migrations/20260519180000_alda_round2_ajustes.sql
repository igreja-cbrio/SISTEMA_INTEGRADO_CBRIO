-- ============================================================================
-- Ajustes round 2 cargo `lider-ministerial` (apos teste com Alda · 2026-05-19)
--
-- Marcos pediu:
-- - Cuidados: ver sem editar (nivel 1)
-- - Projetos: ver com escopo proprio (so projetos linkados ao nome dela)
-- ============================================================================

UPDATE public.cargo_modulo_permissao
   SET nivel = 1,
       pode_exportar = false,
       pode_aprovar  = false,
       escopo_proprio = false,
       updated_at = now()
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-ministerial')
   AND modulo_id = (SELECT id FROM public.modulos WHERE slug = 'cuidados');

UPDATE public.cargo_modulo_permissao
   SET nivel = 3,
       escopo_proprio = true,
       updated_at = now()
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-ministerial')
   AND modulo_id = (SELECT id FROM public.modulos WHERE slug = 'projetos');

-- Conferencia:
-- SELECT m.slug, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
--   FROM cargo_modulo_permissao cmp
--   JOIN cargos c ON c.id = cmp.cargo_id
--   JOIN modulos m ON m.id = cmp.modulo_id
--  WHERE c.slug = 'lider-ministerial'
--    AND m.slug IN ('cuidados', 'projetos');
