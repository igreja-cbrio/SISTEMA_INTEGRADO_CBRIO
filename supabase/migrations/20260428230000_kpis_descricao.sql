-- ============================================================================
-- Adiciona campo 'descricao' aos indicadores taticos.
--
-- Diferente de:
--   - meta_descricao: descreve o ALVO do indicador (ex: '+15% em 6m')
--   - apuracao:       descreve COMO calcular (ex: 'Soma da contagem presencial')
--
-- 'descricao' explica O QUE e o indicador (contexto / o porque).
-- ============================================================================

ALTER TABLE kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS descricao TEXT;

COMMENT ON COLUMN kpi_indicadores_taticos.descricao IS
  'Explicacao livre do que mede o indicador (contexto, o porque). NULL se nao informado.';

-- ============================================================================
-- Recriar a view para incluir descricao
-- ============================================================================
DROP VIEW IF EXISTS vw_kpi_taticos_status;

CREATE VIEW vw_kpi_taticos_status AS
WITH ultimo_registro AS (
  SELECT DISTINCT ON (indicador_id)
    indicador_id,
    periodo_referencia,
    valor_realizado,
    data_preenchimento,
    responsavel,
    observacoes,
    origem
  FROM kpi_registros
  ORDER BY indicador_id, data_preenchimento DESC
),
periodo_atual AS (
  SELECT 'semanal' AS periodicidade, to_char(now(), 'IYYY"-W"IW') AS periodo
  UNION ALL SELECT 'mensal', to_char(now(), 'YYYY-MM')
  UNION ALL SELECT 'trimestral', to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q')
  UNION ALL SELECT 'semestral', to_char(now(), 'YYYY') || '-S' || (CASE WHEN extract(month FROM now()) <= 6 THEN '1' ELSE '2' END)
  UNION ALL SELECT 'anual', to_char(now(), 'YYYY')
)
SELECT
  t.id,
  t.kpi_estrategico_id,
  t.area,
  t.indicador,
  t.descricao,
  t.periodicidade,
  t.meta_descricao,
  t.meta_valor,
  t.unidade,
  t.responsavel_area,
  t.apuracao,
  t.sort_order,
  t.fonte_auto,
  pa.periodo AS periodo_atual,
  ur.periodo_referencia AS ultimo_periodo,
  ur.valor_realizado AS ultimo_valor,
  ur.data_preenchimento AS ultima_data,
  ur.responsavel AS ultimo_responsavel,
  ur.origem AS ultima_origem,
  CASE
    WHEN ur.periodo_referencia = pa.periodo THEN 'verde'
    WHEN ur.periodo_referencia IS NULL THEN 'pendente'
    ELSE 'vermelho'
  END AS status
FROM kpi_indicadores_taticos t
LEFT JOIN ultimo_registro ur ON ur.indicador_id = t.id
LEFT JOIN periodo_atual pa ON pa.periodicidade = t.periodicidade
WHERE t.ativo = true;
