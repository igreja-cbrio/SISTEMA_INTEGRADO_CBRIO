-- ============================================================================
-- Ajustes da matriz cargo × modulo · cargo `lider-ministerial`
--
-- Apos teste em prod com Alda Lorena (lider de Integracao) em 2026-05-19,
-- Marcos identificou os ajustes abaixo. Sao mudancas de nivel no seed
-- original (20260518200000) baseadas no comportamento esperado.
--
-- Mudancas:
--   gestao        1 → 0   sai do menu · ela nao precisa ver PMO/configuracao
--   online        3 → 1   modulo eh somente leitura (CLAUDE.md regra fixa)
--   grupos        3 → 1   lider ministerial so ve · nao cria/edita grupo
--   voluntariado  3 → 5   gerencia time completo da area dela
--   nps           2 → 5   cria pesquisas, vincula contexto, analisa
--
-- Os modificadores (pode_exportar/aprovar/escopo_proprio) mantem o valor
-- do seed original, exceto quando inconsistentes com o novo nivel (0 zera).
-- ============================================================================

UPDATE public.cargo_modulo_permissao
   SET nivel = 0,
       pode_exportar = false,
       pode_aprovar  = false,
       escopo_proprio = false,
       updated_at = now()
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-ministerial')
   AND modulo_id = (SELECT id FROM public.modulos WHERE slug = 'gestao');

UPDATE public.cargo_modulo_permissao
   SET nivel = 1, updated_at = now()
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-ministerial')
   AND modulo_id = (SELECT id FROM public.modulos WHERE slug = 'online');

UPDATE public.cargo_modulo_permissao
   SET nivel = 1, updated_at = now()
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-ministerial')
   AND modulo_id = (SELECT id FROM public.modulos WHERE slug = 'grupos');

UPDATE public.cargo_modulo_permissao
   SET nivel = 5, updated_at = now()
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-ministerial')
   AND modulo_id = (SELECT id FROM public.modulos WHERE slug = 'voluntariado');

UPDATE public.cargo_modulo_permissao
   SET nivel = 5, updated_at = now()
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-ministerial')
   AND modulo_id = (SELECT id FROM public.modulos WHERE slug = 'nps');

-- Conferencia (descomente no Studio):
-- SELECT m.slug AS modulo, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
--   FROM cargo_modulo_permissao cmp
--   JOIN cargos c ON c.id = cmp.cargo_id
--   JOIN modulos m ON m.id = cmp.modulo_id
--  WHERE c.slug = 'lider-ministerial'
--  ORDER BY m.ordem;
