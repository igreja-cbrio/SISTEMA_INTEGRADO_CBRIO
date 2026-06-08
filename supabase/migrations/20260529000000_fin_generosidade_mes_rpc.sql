-- Migration · 2026-05-29
-- Fix · generosidade da Mandala estava cortando em 1000 linhas (cap do PostgREST)
-- e mostrava ofertantes=0 porque todos os 1000 primeiros eram dízimos.
-- Solução · função SECURITY DEFINER que retorna JSONB agregado · escapa do cap.

CREATE OR REPLACE FUNCTION public.fin_generosidade_mes(p_mes date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'dizimistas', COALESCE(COUNT(DISTINCT LOWER(TRIM(t.referencia))) FILTER (WHERE pc.codigo LIKE '3.01.01.%'), 0),
    'ofertantes', COALESCE(COUNT(DISTINCT LOWER(TRIM(t.referencia))) FILTER (WHERE pc.codigo LIKE '3.01.02.%'), 0),
    'doadores_unicos', COALESCE(COUNT(DISTINCT LOWER(TRIM(t.referencia))), 0),
    'valor_dizimo', COALESCE(SUM(t.valor) FILTER (WHERE pc.codigo LIKE '3.01.01.%'), 0),
    'valor_oferta', COALESCE(SUM(t.valor) FILTER (WHERE pc.codigo LIKE '3.01.02.%'), 0),
    'qtd_lancamentos_dizimo', COALESCE(COUNT(*) FILTER (WHERE pc.codigo LIKE '3.01.01.%'), 0),
    'qtd_lancamentos_oferta', COALESCE(COUNT(*) FILTER (WHERE pc.codigo LIKE '3.01.02.%'), 0)
  )
  FROM public.fin_transacoes t
  JOIN public.fin_plano_contas pc ON pc.id = t.plano_contas_id
  WHERE t.data_competencia >= p_mes
    AND t.data_competencia < (p_mes + INTERVAL '1 month')
    AND t.tipo = 'receita'
    AND t.status <> 'cancelado'
    AND t.classe_movimento IN ('ordinaria','extraordinaria')
    AND t.referencia IS NOT NULL
    AND TRIM(t.referencia) <> '';
$$;

GRANT EXECUTE ON FUNCTION public.fin_generosidade_mes TO authenticated, service_role;
