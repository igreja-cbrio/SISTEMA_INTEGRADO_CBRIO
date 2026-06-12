-- Dashboard Financeiro Semanal · PR A
-- Views agregadas pra gráficos mensal/semanal/decendial/YTD/YoY
-- + view de frequencia vs arrecadacao por mes
-- Idempotente

-- ============================================================
-- 1. Arrecadacao por mes (12 meses + ano anterior pra YoY)
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_arrecadacao_mensal AS
SELECT
  to_char(data_competencia, 'YYYY-MM') AS mes,
  EXTRACT(YEAR FROM data_competencia)::int AS ano,
  EXTRACT(MONTH FROM data_competencia)::int AS mes_numero,
  SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END) AS receita,
  SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END) AS despesa,
  SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END) -
    SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END) AS resultado,
  COUNT(*) AS qtd
FROM fin_transacoes
WHERE status != 'cancelado'
GROUP BY mes, ano, mes_numero;

-- ============================================================
-- 2. Arrecadacao por semana (52 semanas qua-ter)
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_arrecadacao_semanal AS
SELECT
  (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
  (fin_semana_qua_ter(t.data_competencia)).fim AS semana_fim,
  (fin_semana_qua_ter(t.data_competencia)).label AS semana_label,
  EXTRACT(YEAR FROM (fin_semana_qua_ter(t.data_competencia)).inicio)::int AS ano,
  SUM(CASE WHEN t.tipo = 'receita' THEN t.valor ELSE 0 END) AS receita,
  SUM(CASE WHEN t.tipo = 'despesa' THEN t.valor ELSE 0 END) AS despesa,
  SUM(CASE WHEN t.tipo = 'receita' THEN t.valor ELSE 0 END) -
    SUM(CASE WHEN t.tipo = 'despesa' THEN t.valor ELSE 0 END) AS resultado,
  COUNT(*) AS qtd
FROM fin_transacoes t
WHERE t.status != 'cancelado'
GROUP BY semana_inicio, semana_fim, semana_label, ano;

-- ============================================================
-- 3. Decêndio (10 em 10 dias do mês)
-- ============================================================
-- D1: 1-10 · D2: 11-20 · D3: 21-fim
CREATE OR REPLACE VIEW vw_fin_decendio AS
SELECT
  to_char(data_competencia, 'YYYY-MM') AS mes,
  CASE
    WHEN EXTRACT(DAY FROM data_competencia) <= 10 THEN 1
    WHEN EXTRACT(DAY FROM data_competencia) <= 20 THEN 2
    ELSE 3
  END AS decendio,
  CASE
    WHEN EXTRACT(DAY FROM data_competencia) <= 10 THEN '1-10'
    WHEN EXTRACT(DAY FROM data_competencia) <= 20 THEN '11-20'
    ELSE '21-fim'
  END AS decendio_label,
  SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END) AS receita,
  SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END) AS despesa,
  COUNT(*) AS qtd
FROM fin_transacoes
WHERE status != 'cancelado'
GROUP BY mes, decendio, decendio_label;

-- ============================================================
-- 4. Ano acumulado (YTD · ano atual + ano anterior)
-- ============================================================
CREATE OR REPLACE VIEW vw_fin_ano_acumulado AS
SELECT
  EXTRACT(YEAR FROM data_competencia)::int AS ano,
  SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END) AS receita_ytd,
  SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END) AS despesa_ytd,
  SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END) -
    SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END) AS resultado_ytd,
  COUNT(*) AS qtd
FROM fin_transacoes
WHERE status != 'cancelado'
GROUP BY ano;

-- ============================================================
-- 5. YoY semanal (mesma semana qua-ter do ano anterior)
-- ============================================================
-- Une vw_fin_arrecadacao_semanal consigo mesma · matcha por (mes, semana)
-- Pra simplicidade no frontend: 1 row por semana_atual com receita_atual + receita_ano_anterior
CREATE OR REPLACE VIEW vw_fin_yoy_semanal AS
WITH semanas AS (
  SELECT *,
    EXTRACT(MONTH FROM semana_inicio)::int AS mes_num,
    EXTRACT(WEEK FROM semana_inicio)::int AS num_semana_iso
  FROM vw_fin_arrecadacao_semanal
)
SELECT
  atual.semana_inicio,
  atual.semana_label,
  atual.ano AS ano_atual,
  atual.receita AS receita_atual,
  anterior.semana_inicio AS semana_anterior_inicio,
  anterior.semana_label AS semana_anterior_label,
  anterior.ano AS ano_anterior,
  anterior.receita AS receita_ano_anterior,
  CASE
    WHEN COALESCE(anterior.receita, 0) > 0
    THEN ((atual.receita - anterior.receita) / anterior.receita) * 100
    ELSE NULL
  END AS delta_pct
FROM semanas atual
LEFT JOIN semanas anterior
  ON anterior.ano = atual.ano - 1
  AND anterior.num_semana_iso = atual.num_semana_iso;

-- ============================================================
-- 6. Frequencia vs Arrecadacao por mês (crescimento %)
-- ============================================================
-- Junta receita mensal com soma de frequencia (cultos do mes)
CREATE OR REPLACE VIEW vw_fin_freq_vs_receita_mensal AS
WITH receita AS (
  SELECT
    to_char(data_competencia, 'YYYY-MM') AS mes,
    SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END) AS receita
  FROM fin_transacoes
  WHERE status != 'cancelado'
  GROUP BY mes
),
freq AS (
  SELECT
    to_char(data, 'YYYY-MM') AS mes,
    SUM(COALESCE(presencial_adulto, 0) + COALESCE(presencial_kids, 0)) AS presencial,
    SUM(COALESCE(online_pico, 0)) AS online
  FROM cultos
  WHERE deleted_at IS NULL
  GROUP BY mes
)
SELECT
  COALESCE(r.mes, f.mes) AS mes,
  COALESCE(r.receita, 0) AS receita,
  COALESCE(f.presencial, 0) AS presencial,
  COALESCE(f.online, 0) AS online,
  COALESCE(f.presencial, 0) + COALESCE(f.online, 0) AS total_freq,
  CASE
    WHEN COALESCE(f.presencial, 0) > 0
    THEN r.receita / f.presencial
    ELSE 0
  END AS ticket_medio_presencial
FROM receita r
FULL OUTER JOIN freq f ON r.mes = f.mes;

COMMIT;
