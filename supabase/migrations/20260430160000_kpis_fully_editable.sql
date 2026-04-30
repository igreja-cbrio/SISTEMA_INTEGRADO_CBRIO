-- ============================================================================
-- KPIs editaveis: tudo configuravel via UI
--
-- Adiciona ao kpi_indicadores_taticos:
--   - periodo_offset_meses INT (0..5): desloca o inicio do periodo nao-semanal.
--     Trimestral 0=jan/abr/jul/out, 1=fev/mai/ago/nov, 2=mar/jun/set/dez.
--     Semestral 0=jan/jul, 1=fev/ago, ..., 5=jun/dez.
--     Anual 0=jan, 1=fev, ..., 11=dez.
--   - valores TEXT[]: quais dos 5 valores este KPI alimenta.
--                     ('seguir','conectar','investir','servir','generosidade').
--   - pilar TEXT: pilar estrategico opcional (Crescimento, Servico, etc) da
--                 planilha. Util para agrupar relatorios.
--
-- Tambem semeia valores[] inicial usando o mapeamento atual hardcoded em
-- src/pages/ministerial/Jornada.jsx (a fonte de verdade ate agora).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Novas colunas
-- ----------------------------------------------------------------------------

-- Garante que descricao existe (drift: migration 20260428230000 pode nao
-- ter rodado em prod por alguma razao). Idempotente.
ALTER TABLE kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS descricao TEXT;

ALTER TABLE kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS periodo_offset_meses INT NOT NULL DEFAULT 0
    CHECK (periodo_offset_meses BETWEEN 0 AND 11);

COMMENT ON COLUMN kpi_indicadores_taticos.periodo_offset_meses IS
  'Offset em meses para o inicio do periodo. 0=padrao (jan), 1=fev, etc. '
  'Para trimestral, valido 0..2. Para semestral, 0..5. Para anual, 0..11. '
  'Para mensal/semanal, ignorado.';

ALTER TABLE kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS valores TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN kpi_indicadores_taticos.valores IS
  'Valores da jornada que este KPI alimenta. Ex: {servir,generosidade}. '
  'Valores aceitos: seguir, conectar, investir, servir, generosidade.';

ALTER TABLE kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS pilar TEXT;

COMMENT ON COLUMN kpi_indicadores_taticos.pilar IS
  'Pilar estrategico do KPI (da planilha): Crescimento, Servico, '
  'Comunhao, Evangelismo, Reten cao, etc.';

CREATE INDEX IF NOT EXISTS idx_kpi_taticos_valores ON kpi_indicadores_taticos USING GIN (valores);

-- ----------------------------------------------------------------------------
-- 2. Seed valores[] a partir do mapeamento existente em Jornada.jsx
-- ----------------------------------------------------------------------------

-- Seguir a Jesus
UPDATE kpi_indicadores_taticos SET valores = ARRAY['seguir']::TEXT[]
WHERE id IN ('INTG-01', 'AMI-02', 'AMI-06', 'AMI-09', 'CBA-01', 'KID-02', 'KID-03', 'CUID-01');

-- Conectar-se com Pessoas
UPDATE kpi_indicadores_taticos SET valores = ARRAY['conectar']::TEXT[]
WHERE id IN ('GRUP-01', 'GRUP-02', 'GRUP-03', 'GRUP-04', 'GRUP-05', 'AMI-08');

-- Investir Tempo com Deus
UPDATE kpi_indicadores_taticos SET valores = ARRAY['investir']::TEXT[]
WHERE id IN ('CUID-07', 'AMI-03', 'KID-04');

-- Servir em Comunidade
UPDATE kpi_indicadores_taticos SET valores = ARRAY['servir']::TEXT[]
WHERE id IN ('VOLT-01', 'VOLT-02', 'VOLT-04', 'VOLT-05', 'VOLT-06', 'VOLT-07', 'VOLT-08',
             'INTG-04', 'INTG-05', 'KID-05', 'CUID-10', 'CUID-12', 'CUID-14');

-- Viver Generosamente
UPDATE kpi_indicadores_taticos SET valores = ARRAY['generosidade']::TEXT[]
WHERE id IN ('GEN-02', 'GEN-03', 'GEN-04', 'GEN-05');

-- KPI hibridos (CUID-05 e CUID-06: medem multiplos valores)
UPDATE kpi_indicadores_taticos SET valores = ARRAY['seguir','conectar','servir','generosidade']::TEXT[]
WHERE id = 'CUID-05';

UPDATE kpi_indicadores_taticos SET valores = ARRAY['seguir','conectar','investir','servir','generosidade']::TEXT[]
WHERE id = 'CUID-06';

-- ----------------------------------------------------------------------------
-- 3. Seed pilar a partir do indicadores.js (agora no banco)
-- ----------------------------------------------------------------------------

UPDATE kpi_indicadores_taticos SET pilar = 'Crescimento' WHERE id IN ('AMI-01','AMI-03','AMI-05','KID-01','CUID-05','CUID-06');
UPDATE kpi_indicadores_taticos SET pilar = 'Evangelismo' WHERE id IN ('AMI-02','AMI-06','AMI-09','CBA-01','CBA-02','CBA-03','KID-02','KID-03','INTG-01','INTG-02');
UPDATE kpi_indicadores_taticos SET pilar = 'Comunhao' WHERE id IN ('AMI-07','AMI-08','GRUP-01','GRUP-04','GRUP-05','KID-04','CUID-07','CUID-12');
UPDATE kpi_indicadores_taticos SET pilar = 'Servico' WHERE id IN ('AMI-04','CBA-04','CBA-05','CBA-06','CUID-10','CUID-14','GRUP-02','GRUP-03','INTG-04','INTG-05','INTG-06','KID-05','VOLT-01','VOLT-02','VOLT-03','VOLT-04','VOLT-05','VOLT-06','VOLT-07','VOLT-08','VOLT-09');
UPDATE kpi_indicadores_taticos SET pilar = 'Cultura'   WHERE id = 'CBA-08';
UPDATE kpi_indicadores_taticos SET pilar = 'Retencao'  WHERE id = 'CBA-09';
UPDATE kpi_indicadores_taticos SET pilar = 'MAD'       WHERE id IN ('CBA-10','CBA-11');
UPDATE kpi_indicadores_taticos SET pilar = 'Qualidade' WHERE id IN ('CBA-12','NEXT-04');
UPDATE kpi_indicadores_taticos SET pilar = 'Discipulado' WHERE id = 'NEXT-01';
UPDATE kpi_indicadores_taticos SET pilar = 'Generosidade' WHERE id = 'NEXT-03';
UPDATE kpi_indicadores_taticos SET pilar = 'Maturidade'   WHERE id = 'GEN-02';
UPDATE kpi_indicadores_taticos SET pilar = 'Cultura'   WHERE id = 'GEN-03';
UPDATE kpi_indicadores_taticos SET pilar = 'Pos-Next'  WHERE id = 'GEN-04';
UPDATE kpi_indicadores_taticos SET pilar = 'Impacto'   WHERE id = 'GEN-05';

-- ----------------------------------------------------------------------------
-- 4. Atualizar view vw_kpi_taticos_status para expor novos campos
-- ----------------------------------------------------------------------------

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
  t.periodo_offset_meses,
  t.meta_descricao,
  t.meta_valor,
  t.unidade,
  t.responsavel_area,
  t.apuracao,
  t.sort_order,
  t.fonte_auto,
  t.valores,
  t.pilar,
  t.ativo,
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
-- 5. Validacoes
-- ----------------------------------------------------------------------------
-- SELECT count(*) FROM kpi_indicadores_taticos WHERE valores != '{}';
-- esperado: ~60

-- SELECT id, valores, pilar FROM kpi_indicadores_taticos
-- WHERE id IN ('CUID-06','VOLT-02','GEN-04') ORDER BY id;
-- esperado: CUID-06 -> {seguir,conectar,investir,servir,generosidade}; etc.

COMMIT;
