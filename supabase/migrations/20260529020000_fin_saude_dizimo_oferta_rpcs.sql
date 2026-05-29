-- RPCs pro slide Saúde Financeira + Dízimo vs Oferta (dashboard semanal · 2026-05-29)
-- Tudo exclui empréstimo/transferência (classe_movimento ordinaria/extraordinaria).

-- ============================================================
-- Saúde financeira · resultado + folha + concentração de doadores
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_saude_financeira(p_ano int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ano int := COALESCE(p_ano, EXTRACT(YEAR FROM CURRENT_DATE)::int);
  v_mes_atual text := to_char(CURRENT_DATE, 'YYYY-MM');
  v_receita_ytd numeric; v_despesa_ytd numeric;
  v_receita_mes numeric; v_despesa_mes numeric;
  v_folha_ytd numeric;
  v_meses_vermelho int; v_meses_com_dado int;
  v_top20_pct numeric; v_top10_pct numeric; v_qtd_doadores int;
  v_resultado_12m numeric;
BEGIN
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo='receita'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo='despesa'), 0)
  INTO v_receita_ytd, v_despesa_ytd
  FROM fin_transacoes
  WHERE classe_movimento IN ('ordinaria','extraordinaria') AND status<>'cancelado'
    AND EXTRACT(YEAR FROM data_competencia) = v_ano;

  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo='receita'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo='despesa'), 0)
  INTO v_receita_mes, v_despesa_mes
  FROM fin_transacoes
  WHERE classe_movimento IN ('ordinaria','extraordinaria') AND status<>'cancelado'
    AND to_char(data_competencia, 'YYYY-MM') = v_mes_atual;

  SELECT COALESCE(SUM(t.valor), 0) INTO v_folha_ytd
  FROM fin_transacoes t JOIN fin_plano_contas pc ON pc.id=t.plano_contas_id
  WHERE t.tipo='despesa' AND t.classe_movimento IN ('ordinaria','extraordinaria')
    AND t.status<>'cancelado' AND EXTRACT(YEAR FROM t.data_competencia)=v_ano
    AND pc.codigo LIKE '4.01%';

  SELECT
    COUNT(*) FILTER (WHERE res < 0), COUNT(*), COALESCE(SUM(res), 0)
  INTO v_meses_vermelho, v_meses_com_dado, v_resultado_12m
  FROM (
    SELECT to_char(data_competencia,'YYYY-MM') AS m,
      SUM(CASE WHEN tipo='receita' THEN valor ELSE -valor END) AS res
    FROM fin_transacoes
    WHERE classe_movimento IN ('ordinaria','extraordinaria') AND status<>'cancelado'
      AND data_competencia >= (date_trunc('month', CURRENT_DATE) - INTERVAL '11 months')
    GROUP BY 1
  ) sub;

  WITH doadores AS (
    SELECT LOWER(TRIM(t.referencia)) AS d, SUM(t.valor) AS total
    FROM fin_transacoes t JOIN fin_plano_contas pc ON pc.id=t.plano_contas_id
    WHERE t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria')
      AND t.status<>'cancelado' AND EXTRACT(YEAR FROM t.data_competencia)=v_ano
      AND pc.codigo LIKE '3.01%' AND t.referencia IS NOT NULL AND TRIM(t.referencia)<>''
    GROUP BY 1
  ),
  ranked AS (
    SELECT total,
      ROW_NUMBER() OVER (ORDER BY total DESC) AS rn,
      SUM(total) OVER () AS geral,
      COUNT(*) OVER () AS qtd,
      GREATEST(1, FLOOR(COUNT(*) OVER () * 0.2)) AS limite_top20
    FROM doadores
  )
  SELECT
    MAX(qtd),
    ROUND(COALESCE(SUM(total) FILTER (WHERE rn <= 10) / NULLIF(MAX(geral),0) * 100, 0), 1),
    ROUND(COALESCE(SUM(total) FILTER (WHERE rn <= limite_top20) / NULLIF(MAX(geral),0) * 100, 0), 1)
  INTO v_qtd_doadores, v_top10_pct, v_top20_pct
  FROM ranked
  GROUP BY limite_top20;

  RETURN jsonb_build_object(
    'ano', v_ano, 'mes_atual', v_mes_atual,
    'receita_mes', v_receita_mes, 'despesa_mes', v_despesa_mes,
    'resultado_mes', v_receita_mes - v_despesa_mes,
    'receita_ytd', v_receita_ytd, 'despesa_ytd', v_despesa_ytd,
    'resultado_ytd', v_receita_ytd - v_despesa_ytd,
    'resultado_12m', v_resultado_12m,
    'folha_ytd', v_folha_ytd,
    'pct_folha', ROUND(COALESCE(v_folha_ytd / NULLIF(v_receita_ytd,0) * 100, 0), 1),
    'meses_vermelho', v_meses_vermelho, 'meses_com_dado', v_meses_com_dado,
    'doadores_qtd', COALESCE(v_qtd_doadores, 0),
    'concentracao_top10_pct', COALESCE(v_top10_pct, 0),
    'concentracao_top20pct_pct', COALESCE(v_top20_pct, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fin_saude_financeira TO authenticated, service_role;

-- ============================================================
-- Dízimo vs Oferta mensal (meses do ano)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_dizimo_oferta_mensal(p_ano int DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'mes', mes_label, 'mes_num', mes_num,
    'dizimo', dizimo, 'oferta', oferta,
    'pct_dizimo', CASE WHEN (dizimo+oferta) > 0 THEN ROUND(dizimo/(dizimo+oferta)*100, 1) ELSE 0 END
  ) ORDER BY mes_num), '[]'::jsonb)
  FROM (
    SELECT
      EXTRACT(MONTH FROM t.data_competencia)::int AS mes_num,
      to_char(t.data_competencia, 'YYYY-MM') AS mes_label,
      COALESCE(SUM(t.valor) FILTER (WHERE pc.codigo LIKE '3.01.01%'), 0) AS dizimo,
      COALESCE(SUM(t.valor) FILTER (WHERE pc.codigo LIKE '3.01.02%'), 0) AS oferta
    FROM fin_transacoes t JOIN fin_plano_contas pc ON pc.id=t.plano_contas_id
    WHERE t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria')
      AND t.status<>'cancelado'
      AND EXTRACT(YEAR FROM t.data_competencia) = COALESCE(p_ano, EXTRACT(YEAR FROM CURRENT_DATE)::int)
      AND (pc.codigo LIKE '3.01.01%' OR pc.codigo LIKE '3.01.02%')
    GROUP BY 1, 2
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION public.fin_dizimo_oferta_mensal TO authenticated, service_role;
