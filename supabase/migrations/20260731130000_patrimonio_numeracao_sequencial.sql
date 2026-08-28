-- ============================================================================
-- Patrimônio · numeração sequencial automática do número de patrimônio
-- ----------------------------------------------------------------------------
-- Pedido do usuário 2026-07-31: todo bem novo cadastrado (individual ou em
-- lote) recebe o PRÓXIMO número de patrimônio em sequência (ex.: último bem é
-- 4433 → o próximo nasce 4434). SECURITY DEFINER + STABLE evita trazer os
-- +4 mil códigos pro backend (calcula o MAX direto no banco, sem cair no cap
-- de 1000 linhas do PostgREST). Advisory lock serializa chamadas concorrentes
-- (2 pessoas cadastrando ao mesmo tempo não recebem o mesmo número).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pat_proximo_codigo_barras(p_qtd integer DEFAULT 1)
RETURNS TABLE(codigo bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(841001);
  SELECT COALESCE(MAX(codigo_barras::bigint), 0) INTO v_max
  FROM public.pat_bens
  WHERE codigo_barras ~ '^\d+$';
  RETURN QUERY SELECT generate_series(v_max + 1, v_max + GREATEST(COALESCE(p_qtd, 1), 1))::bigint;
END;
$$;

COMMENT ON FUNCTION public.pat_proximo_codigo_barras(integer) IS
  'Devolve os próximos N números de patrimônio em sequência (maior código numérico já cadastrado + 1..N). Usado no cadastro individual e em massa de bens.';
