-- ============================================================================
-- Corrige hierarquia do Criativo
-- ============================================================================
-- Marcos (2026-05-20): hierarquia real eh
--   Pedro Menezes (diretor-criativo)
--     └── Pedro Paiva (coordenador-marketing)
--           └── Allan Santana, David Silva, Leticia Baldner, Lorena Pariz
--                  (assistentes de marketing)
--
-- A inferencia automatica deu `diretor-criativo` pros 4 assistentes
-- porque eles tinham 4 areas criativas atribuidas. Corrigir agora:
--   1. Cargo · diretor-criativo -> assistente-marketing
--   2. Areas · remover Louvor e Producao · manter so Marketing
--
-- Idempotente · so mexe nos 4 emails listados.
-- ============================================================================

-- Passo 1 · cargo
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'assistente-marketing')
 WHERE LOWER(TRIM(email)) IN (
   'allan.santana@cbrio.org',
   'david.sicon@cbrio.org',
   'leticia.baldner@cbrio.org',
   'lorena.pariz@cbrio.org'
 );

-- Passo 2 · remove areas Louvor e Producao (Online ja foi removido antes)
DELETE FROM public.usuario_areas
 WHERE area_id IN (
   SELECT id FROM public.areas WHERE LOWER(TRIM(nome)) IN ('louvor', 'produção', 'producao')
 )
   AND usuario_id IN (
     SELECT id FROM public.usuarios
      WHERE LOWER(TRIM(email)) IN (
        'allan.santana@cbrio.org',
        'david.sicon@cbrio.org',
        'leticia.baldner@cbrio.org',
        'lorena.pariz@cbrio.org'
      )
   );

-- Conferencia (descomente):
-- SELECT u.email, c.slug AS cargo, array_agg(a.nome ORDER BY a.nome) AS areas
--   FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
--   LEFT JOIN usuario_areas ua ON ua.usuario_id = u.id
--   LEFT JOIN areas a ON a.id = ua.area_id
--  WHERE LOWER(u.email) IN ('allan.santana@cbrio.org', 'david.sicon@cbrio.org',
--                            'leticia.baldner@cbrio.org', 'lorena.pariz@cbrio.org',
--                            'pedro.paiva@cbrio.org', 'pepe.menezes@cbrio.org')
--  GROUP BY u.email, c.slug ORDER BY u.email;
