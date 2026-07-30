-- Contas a Pagar · resumo (KPIs) passa a aceitar filtro por MÊS de vencimento.
-- Os 4 cards (total/baixado/aberto/vencido) refletem o recorte de mês igual à
-- lista. Espelha a regra da rota GET /contas-pagar: quando vem mês+ano, filtra
-- por data_vencimento no intervalo do mês (em vez de cp.ano); ano sozinho segue
-- por cp.ano. CREATE OR REPLACE não troca assinatura → dropa a de 6 args antes.

DROP FUNCTION IF EXISTS public.fn_contas_pagar_resumo(integer, text, text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.fn_contas_pagar_resumo(
  p_ano integer DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_fornecedor text DEFAULT NULL,
  p_plano uuid DEFAULT NULL,
  p_centro uuid DEFAULT NULL,
  p_busca text DEFAULT NULL,
  p_mes integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT cp.valor, cp.status, cp.data_vencimento
      FROM public.fin_contas_pagar cp
     WHERE cp.deleted_at IS NULL
       -- ano sozinho → cp.ano; com mês → usa o intervalo de data_vencimento abaixo
       AND (p_ano        IS NULL OR p_mes IS NOT NULL OR cp.ano = p_ano)
       AND (p_status     IS NULL OR cp.status = p_status)
       AND (p_plano      IS NULL OR cp.plano_contas_id = p_plano)
       AND (p_centro     IS NULL OR cp.centro_custo_id = p_centro)
       AND (p_fornecedor IS NULL OR cp.fornecedor ILIKE '%'||p_fornecedor||'%')
       AND (p_busca      IS NULL OR cp.descricao ILIKE '%'||p_busca||'%'
                                 OR cp.historico ILIKE '%'||p_busca||'%'
                                 OR cp.fornecedor ILIKE '%'||p_busca||'%')
       AND (p_mes IS NULL OR p_ano IS NULL OR (
              cp.data_vencimento >= make_date(p_ano, p_mes, 1)
              AND cp.data_vencimento < (make_date(p_ano, p_mes, 1) + interval '1 month')))
  )
  SELECT jsonb_build_object(
    'total_n',        count(*),
    'total_valor',    coalesce(sum(valor), 0),
    'baixadas_n',     count(*) FILTER (WHERE status = 'pago'),
    'baixadas_valor', coalesce(sum(valor) FILTER (WHERE status = 'pago'), 0),
    'abertas_n',      count(*) FILTER (WHERE status IS DISTINCT FROM 'pago' AND status IS DISTINCT FROM 'cancelado'),
    'abertas_valor',  coalesce(sum(valor) FILTER (WHERE status IS DISTINCT FROM 'pago' AND status IS DISTINCT FROM 'cancelado'), 0),
    'vencidas_n',     count(*) FILTER (WHERE status IS DISTINCT FROM 'pago' AND status IS DISTINCT FROM 'cancelado' AND data_vencimento < current_date),
    'vencidas_valor', coalesce(sum(valor) FILTER (WHERE status IS DISTINCT FROM 'pago' AND status IS DISTINCT FROM 'cancelado' AND data_vencimento < current_date), 0),
    'anos', (SELECT coalesce(jsonb_agg(a ORDER BY a DESC), '[]'::jsonb)
               FROM (SELECT DISTINCT ano AS a FROM public.fin_contas_pagar
                      WHERE deleted_at IS NULL AND ano IS NOT NULL) y)
  )
  FROM base;
$function$;
