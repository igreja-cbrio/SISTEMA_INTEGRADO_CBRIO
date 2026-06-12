-- ============================================================================
-- Fix da migration 20260519310000 · areas.nome eh varchar, precisa cast pra text
-- ============================================================================
-- Erro em prod: "operator does not exist: character varying[] @> text[]"
-- Causa: array_agg(a.nome) retorna varchar[] e o operador @> ARRAY['x']::text[]
-- exige tipos iguais.
--
-- Esta migration roda a inferencia novamente · idempotente, só toca quem
-- ainda esta com cargo_id IS NULL.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Cargo `dev` com nivel 5 em todos os modulos ativos (idempotente)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT
  (SELECT id FROM public.cargos WHERE slug = 'dev'),
  m.id,
  5,
  true,
  true,
  false
  FROM public.modulos m
 WHERE m.ativo = true
   AND m.slug IS NOT NULL
ON CONFLICT (cargo_id, modulo_id) DO UPDATE
   SET nivel = 5,
       pode_exportar = true,
       pode_aprovar = true,
       escopo_proprio = false,
       updated_at = now();

-- ─────────────────────────────────────────────────────────────────────
-- Casos especiais por email (decisao do Marcos)
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'diretor-ministerial')
 WHERE LOWER(TRIM(email)) = 'arthur.serpa@cbrio.org';

UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'dev')
 WHERE LOWER(TRIM(email)) IN ('marcospaulo.almeida@cbrio.org', 'marcos@cbrio.com');

UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-financeiro')
 WHERE LOWER(TRIM(email)) = 'yago.torres@cbrio.org';

UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-marketing')
 WHERE LOWER(TRIM(email)) = 'pedro.paiva@cbrio.org';

UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-producao')
 WHERE LOWER(TRIM(email)) = 'pedro.fernandes@cbrio.org';

-- ─────────────────────────────────────────────────────────────────────
-- Inferencia automatica · COM CAST text[]
-- ─────────────────────────────────────────────────────────────────────
WITH agg AS (
  SELECT
    u.id AS usuario_id,
    array_agg(a.nome::text ORDER BY a.nome::text) AS areas_nomes,
    array_agg(DISTINCT s.id) AS setores_ids
    FROM public.usuarios u
    JOIN public.usuario_areas ua ON ua.usuario_id = u.id
    JOIN public.areas a ON a.id = ua.area_id
    JOIN public.setores s ON s.id = a.setor_id
   WHERE u.cargo_id IS NULL
     AND u.ativo = true
   GROUP BY u.id
),
inferencia AS (
  SELECT
    usuario_id,
    CASE
      WHEN setores_ids @> ARRAY[1]::int[]
           AND cardinality(areas_nomes) >= 5
           AND NOT (setores_ids && ARRAY[3]::int[])
        THEN 'diretor-administrativo'

      WHEN setores_ids @> ARRAY[2]::int[]
           AND cardinality(areas_nomes) >= 3
           AND NOT (setores_ids && ARRAY[1,3]::int[])
        THEN 'diretor-criativo'

      WHEN setores_ids @> ARRAY[3]::int[]
           AND cardinality(areas_nomes) >= 3
           AND NOT (setores_ids && ARRAY[1]::int[])
        THEN 'lider-ministerial'

      WHEN cardinality(areas_nomes) = 1
           AND setores_ids @> ARRAY[3]::int[]
        THEN 'lider-ministerial'

      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Marketing']::text[]
        THEN 'assistente-marketing'
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Produção']::text[]
        THEN 'assistente-producao'
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Online']::text[]
        THEN 'lider-ministerial'
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Louvor']::text[]
        THEN 'assistente-producao'

      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Financeiro']::text[]
        THEN 'assistente-financeiro'
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Logística']::text[]
        THEN 'assistente-logistica'
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['TI']::text[]
        THEN 'assistente-area'
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Patrimônio']::text[]
        THEN 'assistente-area'
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Infraestrutura']::text[]
        THEN 'assistente-operacoes'
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['RH/Administrativo']::text[]
        THEN 'assistente-area'

      ELSE 'assistente-area'
    END AS cargo_slug
    FROM agg
)
UPDATE public.usuarios u
   SET cargo_id = c.id
  FROM inferencia i
  JOIN public.cargos c ON c.slug = i.cargo_slug
 WHERE u.id = i.usuario_id
   AND u.cargo_id IS NULL;

DO $$
DECLARE
  total_sem_cargo int;
  total_com_cargo int;
BEGIN
  SELECT count(*) INTO total_sem_cargo FROM public.usuarios WHERE cargo_id IS NULL AND ativo = true;
  SELECT count(*) INTO total_com_cargo FROM public.usuarios WHERE cargo_id IS NOT NULL AND ativo = true;
  RAISE NOTICE 'Pos-fix · com cargo: % · sem cargo: %', total_com_cargo, total_sem_cargo;
END $$;
