-- Consolida vw_fin_saidas_categoria por categoria (nível 2 do plano de contas)
-- Bug · a view agrupava também por `classe` (fixa/eventual/variavel), fazendo
-- "Recursos Humanos" aparecer 3x no dashboard de Saídas.
-- Fix · remove `classe` do GROUP BY · 1 linha por categoria.

DROP VIEW IF EXISTS public.vw_fin_saidas_categoria;

CREATE VIEW public.vw_fin_saidas_categoria AS
WITH base AS (
  SELECT EXTRACT(YEAR FROM t.data_competencia)::int AS ano,
    EXTRACT(MONTH FROM t.data_competencia)::int AS mes,
    to_char(t.data_competencia, 'YYYY-MM') AS mes_label,
    split_part(pc.codigo, '.', 1) || '.' || split_part(pc.codigo, '.', 2) AS categoria_codigo,
    t.valor
  FROM fin_transacoes t
  JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
  WHERE t.tipo = 'despesa'
    AND t.status != 'cancelado'
    AND t.classe_movimento IN ('ordinaria', 'extraordinaria')
)
SELECT ano, mes, mes_label, categoria_codigo,
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
GROUP BY ano, mes, mes_label, categoria_codigo;
