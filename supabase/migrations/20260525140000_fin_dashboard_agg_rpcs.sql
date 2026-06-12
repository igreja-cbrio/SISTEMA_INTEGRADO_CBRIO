-- RPCs pra agregação do dashboard direto no banco
-- Resolve PostgREST db-max-rows=1000 que cortava as queries de série mensal
-- (23k+ rows de 12 meses caiam em 1000 e todos viravam barra de jun/25).

CREATE OR REPLACE FUNCTION public.fin_dashboard_periodo(p_inicio DATE, p_fim DATE)
RETURNS TABLE (receita NUMERIC, despesa NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    coalesce(sum(t.valor) FILTER (WHERE t.tipo='receita' AND pc.codigo LIKE '3.%'), 0) AS receita,
    coalesce(sum(t.valor) FILTER (WHERE t.tipo='despesa' AND pc.codigo LIKE '4.%'), 0) AS despesa
  FROM fin_transacoes t
  LEFT JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
  WHERE t.data_competencia >= p_inicio AND t.data_competencia <= p_fim
    AND t.status <> 'cancelado'
$$;

CREATE OR REPLACE FUNCTION public.fin_dashboard_serie_mensal(p_desde DATE)
RETURNS TABLE (mes TEXT, receita NUMERIC, despesa NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    to_char(t.data_competencia, 'YYYY-MM') AS mes,
    coalesce(sum(t.valor) FILTER (WHERE t.tipo='receita' AND pc.codigo LIKE '3.%'), 0) AS receita,
    coalesce(sum(t.valor) FILTER (WHERE t.tipo='despesa' AND pc.codigo LIKE '4.%'), 0) AS despesa
  FROM fin_transacoes t
  LEFT JOIN fin_plano_contas pc ON pc.id = t.plano_contas_id
  WHERE t.data_competencia >= p_desde
    AND t.status <> 'cancelado'
  GROUP BY mes
  ORDER BY mes
$$;

COMMENT ON FUNCTION public.fin_dashboard_periodo IS
  'Agrega receitas/despesas reais (planos 3.x/4.x) no periodo. Usada pelo /dashboard/overview.';
COMMENT ON FUNCTION public.fin_dashboard_serie_mensal IS
  'Serie mensal de receitas/despesas desde a data. Usada pro grafico de fluxo de caixa.';
