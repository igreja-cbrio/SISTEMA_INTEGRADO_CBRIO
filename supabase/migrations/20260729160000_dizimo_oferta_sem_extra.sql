-- Dízimo × Oferta · a RPC passa a respeitar o filtro "Sem extraordinárias".
-- Antes: fin_dizimo_oferta_mensal(p_ano) sempre incluía classe_movimento
-- 'ordinaria' + 'extraordinaria'. Agora aceita p_sem_extra: quando true, conta
-- só a receita ordinária (tira as ofertas extraordinárias do gráfico). CREATE OR
-- REPLACE não muda assinatura → dropa a de 1 arg antes.

DROP FUNCTION IF EXISTS public.fin_dizimo_oferta_mensal(integer);

CREATE OR REPLACE FUNCTION public.fin_dizimo_oferta_mensal(p_ano integer DEFAULT NULL::integer, p_sem_extra boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND (NOT p_sem_extra OR t.classe_movimento = 'ordinaria')
      AND t.status<>'cancelado'
      AND EXTRACT(YEAR FROM t.data_competencia) = COALESCE(p_ano, EXTRACT(YEAR FROM CURRENT_DATE)::int)
      AND (pc.codigo LIKE '3.01.01%' OR pc.codigo LIKE '3.01.02%')
    GROUP BY 1, 2
  ) sub;
$function$;
