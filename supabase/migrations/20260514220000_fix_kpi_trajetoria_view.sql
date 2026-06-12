-- ============================================================================
-- Fix vw_kpi_trajetoria_atual · usa kpi_indicadores_taticos.meta_valor
-- como fallback quando kpi_trajetoria nao tem checkpoint para o KPI
--
-- Marcos: "eu vi que os kpis estao amarelos os que voce preencheu, mas eles
--          nao aparecem nas mandalas"
--
-- Causa: a view comparava com `t.meta_valor` (kpi_trajetoria) que esta vazio
-- pra os KPIs Seguir. Status virava 'sem_meta' e o painel (tabularKpis em
-- backend/routes/painel.js) trata 'sem_meta' como 'sem_dado' · mandala fica
-- cinza mesmo com valor preenchido em kpi_registros.
--
-- Fix: COALESCE(t.meta_valor, k.meta_valor) em todas as comparacoes. A meta
-- definitiva do KPI tatico (kpi_indicadores_taticos.meta_valor) e usada como
-- fallback. KPIs com kpi_trajetoria definida continuam usando checkpoints
-- granulares · KPIs sem trajetoria caem no fallback.
--
-- DROP + CREATE porque mudar estrutura/posicao de coluna requer drop.
-- ============================================================================

DROP VIEW IF EXISTS public.vw_kpi_trajetoria_atual;

CREATE VIEW public.vw_kpi_trajetoria_atual AS
WITH ultimo_manual AS (
  SELECT DISTINCT ON (indicador_id)
    indicador_id, periodo_referencia, valor_realizado, data_preenchimento
  FROM public.kpi_registros
  WHERE valor_realizado IS NOT NULL
  ORDER BY indicador_id, data_preenchimento DESC
),
ultimo_calculado AS (
  SELECT DISTINCT ON (kpi_id)
    kpi_id, periodo_referencia, valor_calculado, calculado_em
  FROM public.kpi_valores_calculados
  WHERE valor_calculado IS NOT NULL
  ORDER BY kpi_id, calculado_em DESC
),
meta_efetiva AS (
  -- Prioriza checkpoint (kpi_trajetoria.meta_valor) sobre meta-base do KPI.
  -- Se nenhum: NULL → status='sem_meta'.
  SELECT
    k.id AS kpi_id,
    COALESCE(t.meta_valor, k.meta_valor) AS meta
  FROM public.kpi_indicadores_taticos k
  LEFT JOIN public.kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
)
SELECT
  k.id AS kpi_id,
  k.indicador,
  k.area,
  k.periodicidade,
  k.tipo_calculo,
  t.periodo_referencia AS checkpoint_periodo,
  t.meta_valor AS checkpoint_meta,
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL
      THEN uc.periodo_referencia
    ELSE um.periodo_referencia
  END AS ultimo_periodo,
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL
      THEN uc.valor_calculado
    ELSE um.valor_realizado
  END AS ultimo_valor,
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      CASE
        WHEN me.meta IS NULL OR me.meta = 0 THEN 'sem_meta'
        WHEN uc.valor_calculado >= me.meta THEN 'no_alvo'
        WHEN uc.valor_calculado >= me.meta * 0.9 THEN 'atras'
        ELSE 'critico'
      END
    WHEN um.valor_realizado IS NOT NULL THEN
      CASE
        WHEN me.meta IS NULL OR me.meta = 0 THEN 'sem_meta'
        WHEN um.valor_realizado >= me.meta THEN 'no_alvo'
        WHEN um.valor_realizado >= me.meta * 0.9 THEN 'atras'
        ELSE 'critico'
      END
    ELSE 'sem_dado'
  END AS status_trajetoria,
  CASE
    WHEN me.meta IS NULL OR me.meta = 0 THEN NULL
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      round((uc.valor_calculado / me.meta) * 100, 1)
    WHEN um.valor_realizado IS NOT NULL THEN
      round((um.valor_realizado / me.meta) * 100, 1)
    ELSE NULL
  END AS percentual_meta
FROM public.kpi_indicadores_taticos k
LEFT JOIN public.kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
LEFT JOIN ultimo_manual um ON um.indicador_id = k.id
LEFT JOIN ultimo_calculado uc ON uc.kpi_id = k.id
LEFT JOIN meta_efetiva me ON me.kpi_id = k.id
WHERE k.ativo = true;

GRANT SELECT ON public.vw_kpi_trajetoria_atual TO authenticated, service_role;

COMMENT ON VIEW public.vw_kpi_trajetoria_atual IS
  'Status atual de cada KPI · usa kpi_valores_calculados se tipo_calculo automatico, senao kpi_registros. Meta = checkpoint (kpi_trajetoria) OU meta-base do KPI (kpi_indicadores_taticos.meta_valor) como fallback.';

-- ----------------------------------------------------------------------------
-- Conferencia (apos rodar):
--   SELECT kpi_id, ultimo_valor, status_trajetoria, percentual_meta
--     FROM vw_kpi_trajetoria_atual
--    WHERE kpi_id IN ('AMI-01','SED-21','BRG-01','ONL-11','KIDS-01','AMI-04','SED-20','BRG-21','ONL-14');
--   Espera: status_trajetoria NAO mais 'sem_meta' (vira no_alvo/atras/critico
--   conforme o valor vs meta-base do KPI)
-- ============================================================================
