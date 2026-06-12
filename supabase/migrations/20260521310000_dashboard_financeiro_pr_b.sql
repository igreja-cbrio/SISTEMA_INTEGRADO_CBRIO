-- PR B · Metas financeiras + Saidas detalhadas + Melhor semana
-- Idempotente

-- ============================================================
-- 1. Tabela de metas financeiras
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN (
    'receita_mensal',
    'receita_anual',
    'despesa_max_mensal',
    'saldo_minimo',
    'pct_categoria',
    'meta_centro_custo'
  )),
  descricao text,
  valor numeric(18, 2) NOT NULL,
  pct numeric,                          -- usado quando tipo = pct_categoria
  ano int NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  mes_inicio int CHECK (mes_inicio BETWEEN 1 AND 12),
  mes_fim int CHECK (mes_fim BETWEEN 1 AND 12),
  plano_contas_id uuid REFERENCES fin_plano_contas(id) ON DELETE SET NULL,
  centro_custo_id uuid REFERENCES fin_centros_custo(id) ON DELETE SET NULL,
  observacao text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS fin_metas_ativa_idx ON fin_metas(ativa, tipo);
CREATE INDEX IF NOT EXISTS fin_metas_ano_idx ON fin_metas(ano);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION fin_metas_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_fin_metas_touch ON fin_metas;
CREATE TRIGGER tg_fin_metas_touch
  BEFORE UPDATE ON fin_metas
  FOR EACH ROW EXECUTE FUNCTION fin_metas_touch_updated_at();

-- ============================================================
-- 2. View · saidas por categoria (nivel 2 do plano)
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_saidas_categoria AS
WITH base AS (
  SELECT
    EXTRACT(YEAR FROM t.data_competencia)::int AS ano,
    EXTRACT(MONTH FROM t.data_competencia)::int AS mes,
    to_char(t.data_competencia, 'YYYY-MM') AS mes_label,
    -- Nivel 2 do plano de contas (ex: 4.01, 4.02)
    split_part(pc.codigo, '.', 1) || '.' || split_part(pc.codigo, '.', 2) AS categoria_codigo,
    pc.classe,
    t.valor
  FROM fin_transacoes t
  JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
  WHERE t.tipo = 'despesa'
    AND t.status != 'cancelado'
)
SELECT
  ano,
  mes,
  mes_label,
  categoria_codigo,
  classe,
  -- Label amigavel baseado no codigo (nivel 2)
  CASE categoria_codigo
    WHEN '4.01' THEN 'Recursos Humanos'
    WHEN '4.02' THEN 'Despesas Prediais'
    WHEN '4.03' THEN 'Servicos Terceirizados'
    WHEN '4.04' THEN 'Repasse a Missoes'
    WHEN '4.05' THEN 'Acao Social'
    WHEN '4.06' THEN 'Materiais de Consumo'
    WHEN '4.07' THEN 'Viagens'
    WHEN '4.08' THEN 'Veiculos'
    WHEN '4.09' THEN 'Patrimoniais'
    WHEN '4.10' THEN 'Eventos'
    WHEN '4.11' THEN 'Marketing'
    WHEN '4.12' THEN 'Outras'
    WHEN '4.13' THEN 'Impostos'
    WHEN '4.14' THEN 'Financeiras'
    ELSE categoria_codigo
  END AS categoria_nome,
  COUNT(*) AS qtd,
  SUM(valor) AS total
FROM base
GROUP BY ano, mes, mes_label, categoria_codigo, classe;

-- ============================================================
-- 3. View · saidas por plano de contas (nivel folha · todo o detalhe)
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_saidas_plano AS
SELECT
  EXTRACT(YEAR FROM t.data_competencia)::int AS ano,
  EXTRACT(MONTH FROM t.data_competencia)::int AS mes,
  to_char(t.data_competencia, 'YYYY-MM') AS mes_label,
  pc.id AS plano_contas_id,
  pc.codigo AS plano_codigo,
  pc.nome AS plano_nome,
  pc.classe,
  COUNT(*) AS qtd,
  SUM(t.valor) AS total
FROM fin_transacoes t
JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
WHERE t.tipo = 'despesa'
  AND t.status != 'cancelado'
GROUP BY ano, mes, mes_label, pc.id, pc.codigo, pc.nome, pc.classe;

-- ============================================================
-- 4. View · saidas por centro de custo
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_saidas_centro AS
SELECT
  EXTRACT(YEAR FROM t.data_competencia)::int AS ano,
  EXTRACT(MONTH FROM t.data_competencia)::int AS mes,
  to_char(t.data_competencia, 'YYYY-MM') AS mes_label,
  cc.id AS centro_id,
  cc.codigo AS centro_codigo,
  cc.nome AS centro_nome,
  cc.campus,
  cc.area_slug,
  COUNT(*) AS qtd,
  SUM(t.valor) AS total
FROM fin_transacoes t
JOIN fin_centros_custo cc ON cc.id = t.centro_custo_id
WHERE t.tipo = 'despesa'
  AND t.status != 'cancelado'
GROUP BY ano, mes, mes_label, cc.id, cc.codigo, cc.nome, cc.campus, cc.area_slug;

-- ============================================================
-- 5. View · melhor semana do mes e do ano
-- ============================================================
-- Top 1 semana por mes (ranking · maior receita do mes)
-- E top 1 do ano
CREATE OR REPLACE VIEW vw_fin_melhor_semana_mes AS
WITH ranked AS (
  SELECT
    EXTRACT(YEAR FROM semana_inicio)::int AS ano,
    EXTRACT(MONTH FROM semana_inicio)::int AS mes,
    to_char(semana_inicio, 'YYYY-MM') AS mes_label,
    semana_inicio,
    semana_fim,
    semana_label,
    receita,
    ROW_NUMBER() OVER (
      PARTITION BY EXTRACT(YEAR FROM semana_inicio), EXTRACT(MONTH FROM semana_inicio)
      ORDER BY receita DESC
    ) AS rnk
  FROM vw_fin_arrecadacao_semanal
  WHERE receita > 0
)
SELECT * FROM ranked WHERE rnk = 1;

CREATE OR REPLACE VIEW vw_fin_melhor_semana_ano AS
WITH ranked AS (
  SELECT
    EXTRACT(YEAR FROM semana_inicio)::int AS ano,
    semana_inicio,
    semana_fim,
    semana_label,
    receita,
    ROW_NUMBER() OVER (
      PARTITION BY EXTRACT(YEAR FROM semana_inicio)
      ORDER BY receita DESC
    ) AS rnk
  FROM vw_fin_arrecadacao_semanal
  WHERE receita > 0
)
SELECT * FROM ranked WHERE rnk = 1;

COMMIT;
