-- Dízimo × Oferta · a barra "Oferta" passa a incluir a OFERTA EXTRAORDINÁRIA
-- (pedido do Matheus 2026-08-12: o gráfico de proporção não mostrava as
-- extraordinárias; entra tudo como "oferta geral", sem 3ª categoria).
--
-- O que muda: além de 3.01.02% (OFERTAS ordinárias), a coluna 'oferta' soma
-- 3.02.03.03% ("Extraordinarias (Acima de 15mil)" · classe extraordinaria).
-- Medido em 2026-08-12: R$ 2.575.899,48 em 20 transações de 2026 que ficavam
-- fora do gráfico.
--
-- ⚠️ O filtro "Sem extraordinárias" (p_sem_extra) continua mandando: essas
-- transações são classe_movimento='extraordinaria', então com o toggle ligado
-- elas saem sozinhas pela cláusula que já existia — o gráfico volta ao
-- comportamento antigo (só ordinárias).
--
-- ⚠️ De propósito FORA da barra: os irmãos de 3.02.03 (Ação Social, Bazar,
-- Missões, Material Didático) — são ofertas designadas/vendas, não "oferta
-- geral". Se a liderança quiser incluí-los, é ampliar o LIKE aqui.
--
-- CREATE OR REPLACE sem mudança de assinatura (mesmos 2 args da 20260729160000).

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
      COALESCE(SUM(t.valor) FILTER (WHERE pc.codigo LIKE '3.01.02%' OR pc.codigo LIKE '3.02.03.03%'), 0) AS oferta
    FROM fin_transacoes t JOIN fin_plano_contas pc ON pc.id=t.plano_contas_id
    WHERE t.tipo='receita' AND t.classe_movimento IN ('ordinaria','extraordinaria')
      AND (NOT p_sem_extra OR t.classe_movimento = 'ordinaria')
      AND t.status<>'cancelado'
      AND EXTRACT(YEAR FROM t.data_competencia) = COALESCE(p_ano, EXTRACT(YEAR FROM CURRENT_DATE)::int)
      AND (pc.codigo LIKE '3.01.01%' OR pc.codigo LIKE '3.01.02%' OR pc.codigo LIKE '3.02.03.03%')
    GROUP BY 1, 2
  ) sub;
$function$;

-- Conferência (rodar depois de aplicar · o SQL Editor não mostra RAISE NOTICE):
-- SELECT jsonb_array_length(public.fin_dizimo_oferta_mensal(2026, false));
-- SELECT e->>'mes', e->>'oferta' FROM jsonb_array_elements(public.fin_dizimo_oferta_mensal(2026, false)) e;
-- Esperado 2026-07: oferta ≈ 2178895.85 (antes era ≈ 97673.45).
