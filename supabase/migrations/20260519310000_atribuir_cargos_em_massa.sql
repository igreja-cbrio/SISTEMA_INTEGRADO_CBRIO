-- ============================================================================
-- Atribui cargos em massa baseado em pessoa + areas
-- ============================================================================
-- Marcos confirmou em 2026-05-19 as atribuicoes pra os 60+ usuarios. Esta
-- migration aplica em uma transacao:
--
-- 1. Casos especiais por email (sobrescrevem inferencia)
-- 2. Inferencia automatica por padrao de areas pra quem ainda esta NULL
-- 3. Garante cargo `dev` com nivel 5 em TODOS os modulos ativos (pra Marcos)
--
-- Idempotente · roda quantas vezes precisar.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Passo 1 · Garante cargo `dev` com nivel 5 em todos os modulos ativos
-- (Marcos = desenvolvedor do sistema, precisa de todas as permissoes)
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
-- Passo 2 · Casos especiais por email (decisao do Marcos)
-- ─────────────────────────────────────────────────────────────────────

-- Arthur Serpa · diretor-ministerial (lider dos cultos e ministerios)
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'diretor-ministerial')
 WHERE LOWER(TRIM(email)) = 'arthur.serpa@cbrio.org';

-- Marcos Paulo · dev (acesso pleno · desenvolvedor + PMO)
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'dev')
 WHERE LOWER(TRIM(email)) IN ('marcospaulo.almeida@cbrio.org', 'marcos@cbrio.com');

-- Yago Torres · coordenador-financeiro
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-financeiro')
 WHERE LOWER(TRIM(email)) = 'yago.torres@cbrio.org';

-- Pedro Paiva · coordenador-marketing (so area Marketing)
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'coordenador-marketing')
 WHERE LOWER(TRIM(email)) = 'pedro.paiva@cbrio.org';

-- Pedro Fernandes · lider-producao
UPDATE public.usuarios
   SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'lider-producao')
 WHERE LOWER(TRIM(email)) = 'pedro.fernandes@cbrio.org';

-- ─────────────────────────────────────────────────────────────────────
-- Passo 3 · Inferencia automatica pelo padrao de areas
-- So aplica em quem ainda esta com cargo_id IS NULL apos passo 2
-- ─────────────────────────────────────────────────────────────────────

WITH agg AS (
  SELECT
    u.id AS usuario_id,
    array_agg(a.nome ORDER BY a.nome) AS areas_nomes,
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
      -- 6 areas Gestao (RH/Administrativo, TI, Logistica, Patrimonio, Infraestrutura, Financeiro)
      WHEN setores_ids @> ARRAY[1]::int[]
           AND cardinality(areas_nomes) >= 5
           AND NOT (setores_ids && ARRAY[3]::int[])
        THEN 'diretor-administrativo'

      -- 4 areas Criativas (Marketing, Online, Producao, Louvor)
      WHEN setores_ids @> ARRAY[2]::int[]
           AND cardinality(areas_nomes) >= 3
           AND NOT (setores_ids && ARRAY[1,3]::int[])
        THEN 'diretor-criativo'

      -- 4 areas Ministeriais (Cuidados, Grupos, Integracao, Voluntariado)
      WHEN setores_ids @> ARRAY[3]::int[]
           AND cardinality(areas_nomes) >= 3
           AND NOT (setores_ids && ARRAY[1]::int[])
        THEN 'lider-ministerial'

      -- 1 area Ministerial → lider-ministerial (boost da area da boost)
      WHEN cardinality(areas_nomes) = 1
           AND setores_ids @> ARRAY[3]::int[]
        THEN 'lider-ministerial'

      -- 1 area Criativa específica
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Marketing']::text[]
        THEN 'assistente-marketing'
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Produção']::text[]
        THEN 'assistente-producao'
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Online']::text[]
        THEN 'lider-ministerial'  -- Online tem modulo proprio · boost na area
      WHEN cardinality(areas_nomes) = 1 AND areas_nomes @> ARRAY['Louvor']::text[]
        THEN 'assistente-producao'

      -- 1 area Gestao específica
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

      -- Fallback · sem padrão claro vira assistente-area (mais conservador)
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

-- ─────────────────────────────────────────────────────────────────────
-- Conferencia
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  total_sem_cargo int;
  total_com_cargo int;
BEGIN
  SELECT count(*) INTO total_sem_cargo FROM public.usuarios WHERE cargo_id IS NULL AND ativo = true;
  SELECT count(*) INTO total_com_cargo FROM public.usuarios WHERE cargo_id IS NOT NULL AND ativo = true;
  RAISE NOTICE 'Atribuicao de cargos · com cargo: % · sem cargo: %', total_com_cargo, total_sem_cargo;
END $$;
