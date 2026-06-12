-- ============================================================================
-- coord-marketing acessa Eventos com nivel 3 (CRUD) + escopo_proprio
-- Marcos: "Pedro Paiva precisa ver todas as tarefas de eventos e preencher,
-- mas filtrado pela area dele (Marketing)"
-- ============================================================================

UPDATE public.cargo_modulo_permissao
   SET nivel = 3,
       escopo_proprio = true,
       updated_at = now()
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-marketing')
   AND modulo_id = (SELECT id FROM public.modulos WHERE slug = 'eventos');

-- Faz o mesmo pro lider-producao (mesma logica de filtrar por area)
UPDATE public.cargo_modulo_permissao
   SET nivel = 3,
       escopo_proprio = true,
       updated_at = now()
 WHERE cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-producao')
   AND modulo_id = (SELECT id FROM public.modulos WHERE slug = 'eventos');
