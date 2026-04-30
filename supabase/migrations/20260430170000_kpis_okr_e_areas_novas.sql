-- ============================================================================
-- KPIs: flag is_okr + KPIs cross-cutting de Jornada e Igreja
--
-- 1. Adiciona is_okr BOOLEAN ao kpi_indicadores_taticos.
--    KPIs marcados como OKR sao "objetivos estrategicos chave" — devem
--    obrigatoriamente ter pelo menos 1 valor da jornada vinculado e
--    aparecem destacados no /processos OKR tab.
--
-- 2. Insere KPIs novos das areas 'Jornada' (cross-cutting dos 5 valores)
--    e 'Igreja' (institucional, macro). Estes sao OKR por definicao.
--
-- 3. Marca KPIs cross-cutting existentes (CUID-05, CUID-06) como OKR.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Coluna is_okr
-- ----------------------------------------------------------------------------

ALTER TABLE kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS is_okr BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN kpi_indicadores_taticos.is_okr IS
  'Quando true, este KPI e um objetivo estrategico chave. Deve ter pelo '
  'menos 1 valor vinculado em valores[]. Usado pra filtrar dashboards OKR.';

CREATE INDEX IF NOT EXISTS idx_kpi_taticos_okr ON kpi_indicadores_taticos(is_okr) WHERE is_okr = true;

-- ----------------------------------------------------------------------------
-- 2. Marcar KPIs cross-cutting como OKR
-- ----------------------------------------------------------------------------

-- CUID-05 e CUID-06 sao agregadores de multiplos valores -> OKR
UPDATE kpi_indicadores_taticos
  SET is_okr = true, updated_at = now()
  WHERE id IN ('CUID-05', 'CUID-06');

-- KPIs de saude geral (taxas, NPS, satisfacao) sao OKR-tier
UPDATE kpi_indicadores_taticos
  SET is_okr = true, updated_at = now()
  WHERE id IN ('CBA-12', 'NEXT-04', 'GRUP-05', 'VOLT-09');

-- ----------------------------------------------------------------------------
-- 3. KPIs novos da area 'jornada' (medem os 5 valores em conjunto)
-- ----------------------------------------------------------------------------

INSERT INTO kpi_indicadores_taticos
  (id, area, indicador, descricao, periodicidade, periodo_offset_meses,
   meta_descricao, meta_valor, unidade, apuracao, responsavel_area,
   sort_order, ativo, valores, pilar, is_okr, kpi_estrategico_id)
VALUES
  ('JOR-01', 'jornada',
    '% membros que cumprem todos os 5 valores',
    'Membro modelo - alinhado com a missao da igreja',
    'mensal', 0, '20% (12m)', 20, '%',
    'Membros com seguir+conectar+investir+servir+generosidade ativos simultaneamente',
    'Diretoria', 1, true,
    ARRAY['seguir','conectar','investir','servir','generosidade']::TEXT[],
    'Jornada', true, NULL),

  ('JOR-02', 'jornada',
    '% novos convertidos engajados em 60 dias',
    'NSM da igreja: novos convertidos com pelo menos 1 valor ativo',
    'mensal', 0, '>=50%', 50, '%',
    'Novos convertidos com qualquer valor da jornada ativado em 60 dias',
    'Diretoria', 2, true,
    ARRAY['seguir','conectar','servir','generosidade']::TEXT[],
    'Jornada', true, NULL),

  ('JOR-03', 'jornada',
    'Tempo medio para 1o valor (dias)',
    'Velocidade de engajamento pos-conversao',
    'mensal', 0, '<=14 dias', 14, 'dias',
    'Media de dias entre fez_decisao e primeiro valor ativado',
    'Cuidados', 3, true,
    ARRAY['seguir']::TEXT[],
    'Jornada', false, NULL)
ON CONFLICT (id) DO UPDATE SET
  indicador = EXCLUDED.indicador,
  descricao = EXCLUDED.descricao,
  periodicidade = EXCLUDED.periodicidade,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor = EXCLUDED.meta_valor,
  unidade = EXCLUDED.unidade,
  apuracao = EXCLUDED.apuracao,
  responsavel_area = EXCLUDED.responsavel_area,
  sort_order = EXCLUDED.sort_order,
  ativo = EXCLUDED.ativo,
  valores = EXCLUDED.valores,
  pilar = EXCLUDED.pilar,
  is_okr = EXCLUDED.is_okr,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 4. KPIs novos da area 'igreja' (institucional, macro)
-- ----------------------------------------------------------------------------

INSERT INTO kpi_indicadores_taticos
  (id, area, indicador, descricao, periodicidade, periodo_offset_meses,
   meta_descricao, meta_valor, unidade, apuracao, responsavel_area,
   sort_order, ativo, valores, pilar, is_okr, kpi_estrategico_id)
VALUES
  ('IGR-01', 'igreja',
    'Frequencia total dos cultos',
    'Soma de presentes em todos os cultos do periodo',
    'semanal', 0, 'Crescer +20% YoY', 20, '%',
    'SUM(presencial_adulto + presencial_kids) em todos cultos da semana',
    'Diretoria', 1, true,
    ARRAY['conectar']::TEXT[],
    'Igreja', true, NULL),

  ('IGR-02', 'igreja',
    'Crescimento liquido de membros',
    'Novos membros - saidas no periodo',
    'mensal', 0, '+5% mensal', 5, '%',
    'COUNT(novos mem_membros) - COUNT(membros_inativados) no mes',
    'Cuidados', 2, true,
    ARRAY['seguir']::TEXT[],
    'Igreja', true, NULL),

  ('IGR-03', 'igreja',
    'Saude financeira (arrecadacao vs orcamento)',
    'Realizado / planejado',
    'mensal', 0, '>=80% acertividade', 80, '%',
    'SUM(mem_contribuicoes) / orcamento_planejado',
    'Financeiro', 3, true,
    ARRAY['generosidade']::TEXT[],
    'Igreja', true, NULL),

  ('IGR-04', 'igreja',
    'NPS institucional anual',
    'Como a igreja e percebida pelos membros',
    'anual', 0, '>=70', 70, 'nota',
    'Pesquisa anual NPS com membros ativos',
    'Diretoria', 4, true,
    ARRAY['conectar']::TEXT[],
    'Igreja', true, NULL)
ON CONFLICT (id) DO UPDATE SET
  indicador = EXCLUDED.indicador,
  descricao = EXCLUDED.descricao,
  periodicidade = EXCLUDED.periodicidade,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor = EXCLUDED.meta_valor,
  unidade = EXCLUDED.unidade,
  apuracao = EXCLUDED.apuracao,
  responsavel_area = EXCLUDED.responsavel_area,
  sort_order = EXCLUDED.sort_order,
  ativo = EXCLUDED.ativo,
  valores = EXCLUDED.valores,
  pilar = EXCLUDED.pilar,
  is_okr = EXCLUDED.is_okr,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 5. Recriar view com is_okr
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

-- ----------------------------------------------------------------------------
-- 6. Validacoes
-- ----------------------------------------------------------------------------
-- SELECT count(*) FROM kpi_indicadores_taticos WHERE is_okr = true AND ativo = true;
-- esperado: 13 (CUID-05, CUID-06, CBA-12, NEXT-04, GRUP-05, VOLT-09 + JOR-01/02 + IGR-01..04)
--
-- SELECT id, area, valores, is_okr FROM kpi_indicadores_taticos
-- WHERE area IN ('jornada','igreja') ORDER BY id;
-- esperado: 7 KPIs novos (JOR-01..03, IGR-01..04) com valores nao-vazios

COMMIT;
