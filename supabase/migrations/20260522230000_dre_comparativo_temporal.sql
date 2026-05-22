-- DRE Comparativo Temporal · mes atual vs anterior vs mesmo mes ano passado
-- 2026-05-22 · 2 views + RLS herdado de fin_transacoes/fin_plano_contas

CREATE OR REPLACE VIEW public.vw_dre_comparativo AS
WITH agregado AS (
  SELECT
    pc.codigo AS plano_codigo, pc.nome AS plano_nome,
    LEFT(pc.codigo, 4) AS grupo_codigo, ft.tipo,
    date_trunc('month', ft.data_competencia)::date AS mes,
    SUM(ft.valor) AS total
  FROM fin_transacoes ft
  LEFT JOIN fin_plano_contas pc ON pc.id = ft.plano_contas_id
  WHERE ft.status != 'cancelado'
    AND ft.data_competencia >= date_trunc('month', CURRENT_DATE - interval '13 months')
  GROUP BY pc.codigo, pc.nome, LEFT(pc.codigo, 4), ft.tipo, date_trunc('month', ft.data_competencia)
)
SELECT
  plano_codigo, plano_nome, grupo_codigo, tipo,
  SUM(CASE WHEN mes = date_trunc('month', CURRENT_DATE)                      THEN total ELSE 0 END) AS atual,
  SUM(CASE WHEN mes = date_trunc('month', CURRENT_DATE - interval '1 month') THEN total ELSE 0 END) AS anterior,
  SUM(CASE WHEN mes = date_trunc('month', CURRENT_DATE - interval '1 year')  THEN total ELSE 0 END) AS ano_passado
FROM agregado
GROUP BY plano_codigo, plano_nome, grupo_codigo, tipo
HAVING SUM(CASE WHEN mes = date_trunc('month', CURRENT_DATE)                      THEN total ELSE 0 END) <> 0
    OR SUM(CASE WHEN mes = date_trunc('month', CURRENT_DATE - interval '1 month') THEN total ELSE 0 END) <> 0
    OR SUM(CASE WHEN mes = date_trunc('month', CURRENT_DATE - interval '1 year')  THEN total ELSE 0 END) <> 0
ORDER BY plano_codigo;

CREATE OR REPLACE VIEW public.vw_dre_comparativo_totais AS
WITH d AS (
  SELECT ft.tipo, date_trunc('month', ft.data_competencia)::date AS mes, SUM(ft.valor) AS total
  FROM fin_transacoes ft
  WHERE ft.status != 'cancelado'
    AND ft.data_competencia >= date_trunc('month', CURRENT_DATE - interval '13 months')
  GROUP BY ft.tipo, date_trunc('month', ft.data_competencia)
)
SELECT
  tipo,
  COALESCE(SUM(total) FILTER (WHERE mes = date_trunc('month', CURRENT_DATE)),                       0) AS atual,
  COALESCE(SUM(total) FILTER (WHERE mes = date_trunc('month', CURRENT_DATE - interval '1 month')),  0) AS anterior,
  COALESCE(SUM(total) FILTER (WHERE mes = date_trunc('month', CURRENT_DATE - interval '1 year')),   0) AS ano_passado
FROM d
GROUP BY tipo;

GRANT SELECT ON public.vw_dre_comparativo TO authenticated, service_role;
GRANT SELECT ON public.vw_dre_comparativo_totais TO authenticated, service_role;

COMMIT;
