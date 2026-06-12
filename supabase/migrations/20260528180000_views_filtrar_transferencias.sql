-- Aplica filtro classe_movimento IN ('ordinaria','extraordinaria') nas views
-- que ainda contavam transferências bancárias e empréstimos como receita/despesa.
-- Regra CLAUDE.md 2026-05-28 · empréstimos não são receita ordinária.
-- Adiciona ainda · transferências internas (Itaú→Santander e vice-versa) também
-- não devem aparecer em arrecadação ou no decêndio (Marcos 2026-05-28).
--
-- Impacto medido em Maio/2026:
--   decêndio 1-10:    R$ 961.972 → R$ 575.105 (-40%)
--   decêndio 11-20:   R$ 500.294 → R$ 396.591 (-21%)
--   decêndio 21-fim:  R$ 217.923 → R$ 151.278 (-31%)
--   total mês:        R$ 1.680.190 → R$ 1.122.975
-- Diferença · R$ 557.214 eram transferências internas Itaú↔Santander.

CREATE OR REPLACE VIEW public.vw_fin_decendio AS
SELECT to_char(data_competencia::timestamp with time zone, 'YYYY-MM'::text) AS mes,
  CASE
    WHEN EXTRACT(day FROM data_competencia) <= 10::numeric THEN 1
    WHEN EXTRACT(day FROM data_competencia) <= 20::numeric THEN 2
    ELSE 3
  END AS decendio,
  CASE
    WHEN EXTRACT(day FROM data_competencia) <= 10::numeric THEN '1-10'::text
    WHEN EXTRACT(day FROM data_competencia) <= 20::numeric THEN '11-20'::text
    ELSE '21-fim'::text
  END AS decendio_label,
  sum(CASE WHEN tipo = 'receita'::text THEN valor ELSE 0::numeric END) AS receita,
  sum(CASE WHEN tipo = 'despesa'::text THEN valor ELSE 0::numeric END) AS despesa,
  count(*) AS qtd
FROM fin_transacoes
WHERE status <> 'cancelado'::text
  AND classe_movimento IN ('ordinaria', 'extraordinaria')
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW public.vw_fin_ano_acumulado AS
SELECT EXTRACT(year FROM data_competencia)::integer AS ano,
  sum(CASE WHEN tipo = 'receita'::text THEN valor ELSE 0::numeric END) AS receita_ytd,
  sum(CASE WHEN tipo = 'despesa'::text THEN valor ELSE 0::numeric END) AS despesa_ytd,
  sum(CASE WHEN tipo = 'receita'::text THEN valor ELSE 0::numeric END)
    - sum(CASE WHEN tipo = 'despesa'::text THEN valor ELSE 0::numeric END) AS resultado_ytd,
  count(*) AS qtd
FROM fin_transacoes
WHERE status <> 'cancelado'::text
  AND classe_movimento IN ('ordinaria', 'extraordinaria')
GROUP BY 1;

CREATE OR REPLACE VIEW public.vw_fin_freq_vs_receita_mensal AS
WITH receita AS (
  SELECT to_char(fin_transacoes.data_competencia::timestamp with time zone, 'YYYY-MM'::text) AS mes,
    sum(CASE WHEN fin_transacoes.tipo = 'receita'::text THEN fin_transacoes.valor ELSE 0::numeric END) AS receita
  FROM fin_transacoes
  WHERE fin_transacoes.status <> 'cancelado'::text
    AND fin_transacoes.classe_movimento IN ('ordinaria', 'extraordinaria')
  GROUP BY 1
),
freq AS (
  SELECT to_char(cultos.data::timestamp with time zone, 'YYYY-MM'::text) AS mes,
    sum(COALESCE(cultos.presencial_adulto, 0) + COALESCE(cultos.presencial_kids, 0)) AS presencial,
    sum(COALESCE(cultos.online_pico, 0)) AS online
  FROM cultos
  WHERE cultos.deleted_at IS NULL
  GROUP BY 1
)
SELECT COALESCE(r.mes, f.mes) AS mes,
  COALESCE(r.receita, 0::numeric) AS receita,
  COALESCE(f.presencial, 0::bigint) AS presencial,
  COALESCE(f.online, 0::bigint) AS online,
  COALESCE(f.presencial, 0::bigint) + COALESCE(f.online, 0::bigint) AS total_freq,
  CASE
    WHEN COALESCE(f.presencial, 0::bigint) > 0
    THEN r.receita / f.presencial::numeric
    ELSE 0::numeric
  END AS ticket_medio_presencial
FROM receita r
FULL JOIN freq f ON r.mes = f.mes;

CREATE OR REPLACE VIEW public.vw_fin_heatmap_arrecadacao AS
WITH base AS (
  SELECT COALESCE(EXTRACT(dow FROM t.data_competencia + COALESCE(t.hora_real, '00:00:00'::time))::integer,
                  EXTRACT(dow FROM t.data_competencia)::integer) AS dia_semana,
    EXTRACT(hour FROM COALESCE(t.hora_real, '12:00:00'::time))::integer AS hora,
    t.valor
  FROM fin_transacoes t
  WHERE t.tipo = 'receita'::text
    AND t.status <> 'cancelado'::text
    AND t.classe_movimento IN ('ordinaria', 'extraordinaria')
    AND t.data_competencia >= (CURRENT_DATE - '1 year'::interval)
)
SELECT dia_semana, hora, sum(valor) AS total, count(*) AS qtd
FROM base
GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.vw_fin_receita_por_culto AS
SELECT cs.id AS culto_slot_id,
  cs.nome AS culto_nome,
  cs.dia_semana,
  cs.service_type_slug,
  (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
  (fin_semana_qua_ter(t.data_competencia)).fim AS semana_fim,
  (fin_semana_qua_ter(t.data_competencia)).label AS semana_label,
  count(*) AS qtd_lancamentos,
  sum(t.valor) AS total_valor,
  sum(CASE WHEN pc.codigo ~~ '3.01.01.%'::text THEN t.valor ELSE 0::numeric END) AS total_dizimos,
  sum(CASE WHEN pc.codigo ~~ '3.01.02.%'::text THEN t.valor ELSE 0::numeric END) AS total_ofertas
FROM fin_transacoes t
  LEFT JOIN fin_culto_slots cs ON cs.id = t.culto_slot_id
  LEFT JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
WHERE t.tipo = 'receita'::text
  AND t.status <> 'cancelado'::text
  AND t.classe_movimento IN ('ordinaria', 'extraordinaria')
  AND t.culto_slot_id IS NOT NULL
GROUP BY cs.id, cs.nome, cs.dia_semana, cs.service_type_slug, t.data_competencia;

CREATE OR REPLACE VIEW public.vw_fin_receita_semanal AS
SELECT (fin_semana_qua_ter(data_competencia)).inicio AS semana_inicio,
  (fin_semana_qua_ter(data_competencia)).fim AS semana_fim,
  (fin_semana_qua_ter(data_competencia)).label AS semana_label,
  sum(valor) AS receita_total,
  count(*) AS qtd_lancamentos
FROM fin_transacoes
WHERE tipo = 'receita'::text
  AND status <> 'cancelado'::text
  AND classe_movimento IN ('ordinaria', 'extraordinaria')
GROUP BY 1, 2, 3
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW public.vw_fin_resumo_semana AS
SELECT (fin_semana_qua_ter(data_competencia)).inicio AS semana_inicio,
  (fin_semana_qua_ter(data_competencia)).fim AS semana_fim,
  (fin_semana_qua_ter(data_competencia)).label AS semana_label,
  sum(CASE WHEN tipo = 'receita'::text THEN valor ELSE 0::numeric END) AS receitas,
  sum(CASE WHEN tipo = 'despesa'::text THEN valor ELSE 0::numeric END) AS despesas,
  sum(CASE WHEN tipo = 'receita'::text THEN valor ELSE - valor END) AS resultado,
  count(*) AS qtd_lancamentos,
  count(*) FILTER (WHERE plano_contas_id IS NULL) AS qtd_nao_classificadas
FROM fin_transacoes
WHERE status <> 'cancelado'::text
  AND classe_movimento IN ('ordinaria', 'extraordinaria')
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW public.vw_fin_saidas_categoria AS
WITH base AS (
  SELECT EXTRACT(YEAR FROM t.data_competencia)::int AS ano,
    EXTRACT(MONTH FROM t.data_competencia)::int AS mes,
    to_char(t.data_competencia, 'YYYY-MM') AS mes_label,
    split_part(pc.codigo, '.', 1) || '.' || split_part(pc.codigo, '.', 2) AS categoria_codigo,
    pc.classe,
    t.valor
  FROM fin_transacoes t
  JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
  WHERE t.tipo = 'despesa'
    AND t.status != 'cancelado'
    AND t.classe_movimento IN ('ordinaria', 'extraordinaria')
)
SELECT ano, mes, mes_label, categoria_codigo, classe,
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

COMMIT;
