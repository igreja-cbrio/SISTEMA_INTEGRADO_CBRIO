-- ============================================================================
-- Matriz `lider-ministerial` · uniformiza modulos com boost por area em nivel 1
-- ============================================================================
-- Modelo aprovado em 2026-05-19: 1 cargo "Líder Ministerial" + as ÁREAS da
-- pessoa definem onde ela ganha boost pra nivel 5 (max). Implementado em
-- backend/middleware/auth.js (AREA_MODULO_BOOST).
--
-- Lista de modulos com boost via area:
--   cuidados, grupos, integracao, voluntariado, next, online
--
-- Pra esses, a matriz do cargo deve ser nivel 1 (so leitura · ele "ve" o
-- modulo no menu mas nao edita). Quem tem a area correspondente ganha nivel 5
-- automaticamente via boost no resolveEffectivePerms.
--
-- Modulos sem boost por area mantem matriz original:
--   - minha-area=3 · KPIs proprios
--   - membresia=3 · CRUD de membros (qualquer lider mexe)
--   - projetos=3 + escopo_proprio · so projetos linkados ao nome
--   - nps=5 · pode criar pesquisa NPS
--   - dashboard, painel-cbrio, perfil, assistente-ia · niveis baixos OK
--   - gestao, ritual, rh, financeiro, etc · 0
-- ============================================================================

-- Apenas modulos com boost por area precisam ser uniformizados em nivel 1
WITH cargo AS (
  SELECT id FROM public.cargos WHERE slug = 'lider-ministerial'
)
UPDATE public.cargo_modulo_permissao cmp
   SET nivel = 1,
       pode_exportar = false,
       pode_aprovar  = false,
       escopo_proprio = false,
       updated_at = now()
  FROM public.modulos m
 WHERE cmp.cargo_id = (SELECT id FROM cargo)
   AND cmp.modulo_id = m.id
   AND m.slug IN ('cuidados', 'grupos', 'integracao', 'voluntariado', 'next', 'online');

-- Conferencia (descomente):
-- SELECT m.slug, cmp.nivel
--   FROM cargo_modulo_permissao cmp
--   JOIN cargos c ON c.id = cmp.cargo_id
--   JOIN modulos m ON m.id = cmp.modulo_id
--  WHERE c.slug = 'lider-ministerial'
--    AND m.slug IN ('cuidados','grupos','integracao','voluntariado','next','online','membresia','nps','minha-area','projetos')
--  ORDER BY m.slug;
-- Esperado: cuidados=1, grupos=1, integracao=1, voluntariado=1, next=1, online=1,
--           membresia=3, nps=5, minha-area=3, projetos=3
