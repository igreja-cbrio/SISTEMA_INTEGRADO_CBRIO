-- ============================================================================
-- FASE 2.5E · Inativa KPIs fora das 6 areas oficiais da matriz
--
-- A matriz Valor × Area da CBRio tem 6 areas:
--   kids, ami, bridge, sede, online, cba
--
-- Marcos detectou KPIs ativos com areas como:
--   cuidados, voluntariado, grupos, integracao, next, generosidade,
--   jornada, igreja, sem_area
--
-- Essas areas existem como CATEGORIAS (areas_kpi.categoria) e como
-- modulos do sistema, mas nao sao linhas da matriz operacional. KPIs
-- vinculados a elas geram ruido no painel/mandalas/matriz.
--
-- Esta migration:
-- 1. Inativa (ativo=false) todos os KPIs cuja area nao esta nas 6 oficiais
-- 2. Preserva historico (registros, trajetorias) pelo soft delete
-- 3. Lista quantos foram afetados por area
--
-- Idempotente: pode rodar varias vezes.
-- ============================================================================

-- 1. Ver quem sera afetado (pra log)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT lower(area) AS area, count(*) AS qtd
      FROM public.kpi_indicadores_taticos
     WHERE ativo = true
       AND lower(area) NOT IN ('kids', 'ami', 'bridge', 'sede', 'online', 'cba')
     GROUP BY lower(area)
     ORDER BY qtd DESC
  LOOP
    RAISE NOTICE 'Area "%": % KPIs serao inativados', rec.area, rec.qtd;
  END LOOP;
END $$;

-- 2. Inativar todos os KPIs fora das 6 areas oficiais
UPDATE public.kpi_indicadores_taticos
   SET ativo = false,
       updated_at = now()
 WHERE ativo = true
   AND lower(coalesce(area, '')) NOT IN ('kids', 'ami', 'bridge', 'sede', 'online', 'cba');

-- 3. Conferencia
-- SELECT lower(area) AS area, count(*)
--   FROM kpi_indicadores_taticos
--  WHERE ativo = true
--  GROUP BY lower(area)
--  ORDER BY area;
-- Esperado: apenas kids/ami/bridge/sede/online/cba aparecem

-- SELECT count(*) FROM kpi_indicadores_taticos
--  WHERE ativo = true AND is_okr = true; -- 153 (igual antes)

-- SELECT count(*) FROM kpi_indicadores_taticos WHERE ativo = false;
-- Inclui os recem-inativados + os ja existentes
