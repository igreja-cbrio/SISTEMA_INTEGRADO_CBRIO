-- ============================================================================
-- Expansao some pra `lider-ministerial` por default
-- Marcos: "so aparece pra quem tem responsabilidade atrelada ao planejamento
-- estrategico". Lider ministerial sem participacao no planejamento nao ve.
--
-- Quem precisar de acesso ganha override individual em /admin/permissoes >
-- Usuarios > [pessoa] > Overrides individuais.
-- ============================================================================

UPDATE public.cargo_modulo_permissao
   SET nivel = 0,
       pode_exportar = false,
       pode_aprovar  = false,
       escopo_proprio = false,
       updated_at = now()
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-ministerial')
   AND modulo_id = (SELECT id FROM public.modulos WHERE slug = 'expansao');
