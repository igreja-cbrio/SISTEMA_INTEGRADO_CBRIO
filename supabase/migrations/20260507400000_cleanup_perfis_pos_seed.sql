-- ============================================================================
-- CLEANUP · pos-seed v2 · arruma sujeira que sobrou
--
-- Apos rodar o seed v2 + fix data_admissao, a validacao mostrou:
--   1. Eduardo Gnisci AINDA tem ministerio_id = adm_financeiro (devia ser NULL)
--   2. Varios profiles com kpi_areas com setor ('ministerial', 'criativo',
--      'gestão') · isso nao e area KPI valida (so kids/ami/bridge/sede/online/cba)
--   3. Funcao listar_matches_seed sumiu da v2 · recriando
--   4. Alda Lorena e Jessica Salviano tem profile mas nao tem ministerio_id
--      atribuido · seed v2 nao matchou pq buscou por sobrenome curto
--
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RECRIAR listar_matches_seed (sumiu na v2 por motivo desconhecido)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_matches_seed(p_termo text)
RETURNS TABLE (
  origem text,
  id uuid,
  nome text,
  email text
)
LANGUAGE sql
AS $$
  SELECT 'profile'::text AS origem, id, name AS nome, email
    FROM public.profiles
   WHERE active = true
     AND lower(name) LIKE '%' || lower(p_termo) || '%'
  UNION ALL
  SELECT 'membro'::text AS origem, id, nome, email
    FROM public.mem_membros
   WHERE active = true
     AND lower(nome) LIKE '%' || lower(p_termo) || '%'
  UNION ALL
  SELECT 'funcionario'::text AS origem, id, nome, email
    FROM public.rh_funcionarios
   WHERE status = 'ativo'
     AND lower(nome) LIKE '%' || lower(p_termo) || '%';
$$;

GRANT EXECUTE ON FUNCTION public.listar_matches_seed(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. LIMPAR kpi_areas POLUIDOS · so deixa as 6 areas oficiais
--    Areas validas: kids, ami, bridge, sede, online, cba
--    Tudo o que nao for isso (ministerial, criativo, gestão, etc) sai.
--
--    NOTA: kpi_areas e NOT NULL na tabela · array vazio '{}' em vez de NULL.
-- ----------------------------------------------------------------------------
UPDATE public.profiles
   SET kpi_areas = COALESCE(
     (SELECT array_agg(area)
        FROM unnest(kpi_areas) AS area
       WHERE area IN ('kids', 'ami', 'bridge', 'sede', 'online', 'cba')),
     '{}'::text[]
   )
 WHERE array_length(kpi_areas, 1) > 0
   AND EXISTS (
     SELECT 1 FROM unnest(kpi_areas) AS area
      WHERE area NOT IN ('kids', 'ami', 'bridge', 'sede', 'online', 'cba')
   );

-- ----------------------------------------------------------------------------
-- 3. FORCAR Eduardo Gnisci sair do ministerio adm_financeiro
--    Ele e diretoria geral · nao deve aparecer como lider de ministerio
-- ----------------------------------------------------------------------------
UPDATE public.profiles
   SET ministerio_id = NULL,
       ministerio_papel = NULL
 WHERE active = true
   AND lower(name) LIKE '%gnisci%';

-- ----------------------------------------------------------------------------
-- 4. ATRIBUIR MINISTERIOS que ficaram FALTA na v2
--    Alda Lorena Cellos Andrade · integracao lider
--    Jessica Salviano · voluntariado lider
--
--    Buscas mais especificas pra evitar AMBIGUO
-- ----------------------------------------------------------------------------
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Alda Lorena',     'integracao',   'lider');
SELECT 'Min: ' || (resultado) FROM public.atribuir_ministerio('Jessica Salviano','voluntariado', 'lider');

-- ----------------------------------------------------------------------------
-- 5. RELATORIO · perfis FALTANDO (precisam ser criados via Supabase Auth)
--    Esses 4 nomes nao tem profile · nao tem como atribuir ministerio/area
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_falta_ariel int;
  v_falta_pedrao int;
  v_falta_lillian int;
  v_falta_keila int;
BEGIN
  SELECT count(*) INTO v_falta_ariel
    FROM public.profiles WHERE active = true AND lower(name) LIKE '%ariel%';
  SELECT count(*) INTO v_falta_pedrao
    FROM public.profiles WHERE active = true AND (lower(name) LIKE '%pedrao%' OR lower(name) LIKE '%pedrão%');
  SELECT count(*) INTO v_falta_lillian
    FROM public.profiles WHERE active = true AND lower(name) LIKE '%lillian%';
  SELECT count(*) INTO v_falta_keila
    FROM public.profiles WHERE active = true AND lower(name) LIKE '%keila%';

  RAISE NOTICE '===== PROFILES FALTANDO (criar via Auth) =====';
  RAISE NOTICE 'Ariel: % profile(s)', v_falta_ariel;
  RAISE NOTICE 'Pr. Pedrao: % profile(s)', v_falta_pedrao;
  RAISE NOTICE 'Lillian Oliveira: % profile(s) · ela tem rh_funcionario, mas nao profile', v_falta_lillian;
  RAISE NOTICE 'Keila Leal: % profile(s) · ela tem rh_funcionario, mas nao profile', v_falta_keila;
  RAISE NOTICE '==================================================';
END $$;

-- ============================================================================
-- CONFERENCIA · queries pra rodar depois (descomenta no Studio)
-- ============================================================================

-- A) Profiles com ministerio + area (estado final)
-- SELECT name, kpi_areas, ministerio_id, ministerio_papel, is_diretoria_geral, funcao_diretoria
--   FROM profiles
--  WHERE active = true
--    AND (kpi_areas IS NOT NULL OR ministerio_id IS NOT NULL OR is_diretoria_geral = true)
--  ORDER BY name;

-- B) Procurar nomes especificos
-- SELECT * FROM listar_matches_seed('keila');
-- SELECT * FROM listar_matches_seed('lillian');
-- SELECT * FROM listar_matches_seed('ariel');
-- SELECT * FROM listar_matches_seed('pedrao');

-- C) Validar que kpi_areas so tem valores oficiais
-- SELECT name, kpi_areas FROM profiles
--  WHERE array_length(kpi_areas, 1) > 0
--    AND EXISTS (
--      SELECT 1 FROM unnest(kpi_areas) AS a
--       WHERE a NOT IN ('kids', 'ami', 'bridge', 'sede', 'online', 'cba')
--    );
-- Espera: 0 linhas
