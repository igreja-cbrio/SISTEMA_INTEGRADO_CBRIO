-- DRE por Centro de Custo · agregacao mensal por centro × tipo
-- 2026-05-22 · destrava os 82 centros de custo cadastrados em fin_centros_custo

CREATE OR REPLACE VIEW public.vw_dre_centro_custo_mensal AS
SELECT
  cc.id AS centro_custo_id, cc.codigo, cc.nome AS centro_nome,
  cc.campus, cc.area_slug, cc.nivel,
  date_trunc('month', ft.data_competencia)::date AS mes,
  ft.tipo,
  COUNT(*) AS qtd_lancamentos,
  SUM(ft.valor) AS total
FROM fin_transacoes ft
JOIN fin_centros_custo cc ON cc.id = ft.centro_custo_id
WHERE ft.status != 'cancelado'
GROUP BY cc.id, cc.codigo, cc.nome, cc.campus, cc.area_slug, cc.nivel,
         date_trunc('month', ft.data_competencia), ft.tipo;

CREATE OR REPLACE VIEW public.vw_dre_centro_custo_atual AS
WITH atual AS (
  SELECT centro_custo_id, codigo, centro_nome, campus, area_slug, tipo, SUM(total) AS total
    FROM vw_dre_centro_custo_mensal
   WHERE mes = date_trunc('month', CURRENT_DATE)
   GROUP BY centro_custo_id, codigo, centro_nome, campus, area_slug, tipo
),
anterior AS (
  SELECT centro_custo_id, tipo, SUM(total) AS total
    FROM vw_dre_centro_custo_mensal
   WHERE mes = date_trunc('month', CURRENT_DATE) - interval '1 month'
   GROUP BY centro_custo_id, tipo
)
SELECT
  a.centro_custo_id, a.codigo, a.centro_nome, a.campus, a.area_slug, a.tipo,
  COALESCE(a.total, 0) AS atual,
  COALESCE(p.total, 0) AS anterior,
  CASE WHEN p.total IS NULL OR p.total = 0 THEN NULL
       ELSE ROUND(((a.total - p.total) / NULLIF(p.total, 0)) * 100, 1) END AS variacao_pct
FROM atual a
LEFT JOIN anterior p ON p.centro_custo_id = a.centro_custo_id AND p.tipo = a.tipo;

GRANT SELECT ON public.vw_dre_centro_custo_mensal TO authenticated, service_role;
GRANT SELECT ON public.vw_dre_centro_custo_atual TO authenticated, service_role;

COMMIT;
