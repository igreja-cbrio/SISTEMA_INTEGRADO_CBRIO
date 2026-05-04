-- ============================================================================
-- OKR Lider: vincula KPI/OKR a um rh_funcionarios (Gap 4)
--
-- Antes: kpi_indicadores_taticos.responsavel_area era texto livre (ex:
-- 'Coord Voluntariado', 'Lideranca AMI'). Sem vinculo com user real, nao
-- da pra notificar lider, filtrar 'meus OKRs', etc.
--
-- Agora: lider_funcionario_id FK pra rh_funcionarios. Editor de KPI ganha
-- dropdown de funcionarios ativos. Admin preenche manualmente (sem
-- backfill heuristico arriscado — Marcos pode preencher rapido via UI).
-- ============================================================================

BEGIN;

ALTER TABLE kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS lider_funcionario_id UUID REFERENCES rh_funcionarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kpi_taticos_lider ON kpi_indicadores_taticos(lider_funcionario_id) WHERE lider_funcionario_id IS NOT NULL;

COMMENT ON COLUMN kpi_indicadores_taticos.lider_funcionario_id IS
  'Funcionario responsavel pelo OKR/KPI. Preenchido pelo editor de KPI '
  '(dropdown de rh_funcionarios ativos). Usado para notificacao quando KPI '
  'fica em risco e para filtro "meus OKRs" no painel pessoal.';

-- ----------------------------------------------------------------------------
-- Atualizar view pra expor o lider
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS vw_kpi_taticos_status;

CREATE VIEW vw_kpi_taticos_status AS
WITH ultimo_registro AS (
  SELECT DISTINCT ON (indicador_id)
    indicador_id, periodo_referencia, valor_realizado,
    data_preenchimento, responsavel, observacoes, origem
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
  t.id, t.kpi_estrategico_id, t.area, t.indicador, t.descricao,
  t.periodicidade, t.periodo_offset_meses,
  t.meta_descricao, t.meta_valor, t.unidade, t.responsavel_area,
  t.apuracao, t.sort_order, t.fonte_auto, t.valores, t.pilar,
  t.is_okr, t.ativo,
  t.lider_funcionario_id,
  f.nome AS lider_nome,
  f.cargo AS lider_cargo,
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
LEFT JOIN rh_funcionarios f ON f.id = t.lider_funcionario_id
LEFT JOIN ultimo_registro ur ON ur.indicador_id = t.id
LEFT JOIN periodo_atual pa ON pa.periodicidade = t.periodicidade
WHERE t.ativo = true;

-- Validacao:
-- SELECT count(*) FROM kpi_indicadores_taticos WHERE lider_funcionario_id IS NOT NULL;
-- esperado: 0 (preenche manualmente via UI)

COMMIT;
