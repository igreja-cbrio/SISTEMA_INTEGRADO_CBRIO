-- ============================================================================
-- FIX FASE 6C · DROP da view antes de recriar
--
-- Problema: a Fase 6C usou CREATE OR REPLACE VIEW pra alterar
-- vw_kpi_trajetoria_atual, mas Postgres nao permite reordenar/renomear
-- colunas via OR REPLACE. Erro:
--   42P16: cannot change name of view column "checkpoint_periodo" to "tipo_calculo"
--
-- Solucao: DROP VIEW IF EXISTS, depois CREATE.
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
        WHEN t.meta_valor IS NULL THEN 'sem_meta'
        WHEN uc.valor_calculado >= t.meta_valor THEN 'no_alvo'
        WHEN uc.valor_calculado >= t.meta_valor * 0.9 THEN 'atras'
        ELSE 'critico'
      END
    WHEN um.valor_realizado IS NOT NULL THEN
      CASE
        WHEN t.meta_valor IS NULL THEN 'sem_meta'
        WHEN um.valor_realizado >= t.meta_valor THEN 'no_alvo'
        WHEN um.valor_realizado >= t.meta_valor * 0.9 THEN 'atras'
        ELSE 'critico'
      END
    ELSE 'sem_dado'
  END AS status_trajetoria,
  CASE
    WHEN t.meta_valor IS NULL OR t.meta_valor = 0 THEN NULL
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      round((uc.valor_calculado / t.meta_valor) * 100, 1)
    WHEN um.valor_realizado IS NOT NULL THEN
      round((um.valor_realizado / t.meta_valor) * 100, 1)
    ELSE NULL
  END AS percentual_meta
FROM public.kpi_indicadores_taticos k
LEFT JOIN public.kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
LEFT JOIN ultimo_manual um ON um.indicador_id = k.id
LEFT JOIN ultimo_calculado uc ON uc.kpi_id = k.id
WHERE k.ativo = true;

GRANT SELECT ON public.vw_kpi_trajetoria_atual TO authenticated, service_role;

COMMENT ON VIEW public.vw_kpi_trajetoria_atual IS
  'Status atual de cada KPI. Se tipo_calculo automatico, usa kpi_valores_calculados. Senao, usa kpi_registros (legado).';
