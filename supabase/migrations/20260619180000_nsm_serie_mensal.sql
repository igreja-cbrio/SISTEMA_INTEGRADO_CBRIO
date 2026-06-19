-- ============================================================================
-- NSM · série mensal (coorte por mês de conversão) pro gráfico de tendência.
-- ============================================================================
-- Cada mês = dos convertidos que decidiram NAQUELE mês, quantos % engajaram em
-- ≥1 sinal dentro de ±60d da conversão (MESMA regra do card · fn_nsm_sinais_engajados).
-- A janela de engajamento é por pessoa (±60d), atravessa meses · o crédito é
-- sempre do MÊS DA CONVERSÃO. Meses recentes ficam "em formação" (a janela não
-- fechou) e sobem depois — exibidos sem aviso (latente · incentivo de adesão).
-- Recalcula da fonte → se autocorrige quando identidades são reconciliadas.
-- Idempotente · CREATE OR REPLACE.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_nsm_serie_mensal(
  p_meses int DEFAULT 12,
  p_area  text DEFAULT NULL
)
RETURNS TABLE (mes text, convertidos int, engajados int, pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_conv int;
  v_eng int;
BEGIN
  FOR r IN
    SELECT to_char(date_trunc('month', current_date) - (g || ' months')::interval, 'YYYY-MM') AS ym,
           (date_trunc('month', current_date) - (g || ' months')::interval)::date AS ini,
           (date_trunc('month', current_date) - (g || ' months')::interval
             + interval '1 month' - interval '1 day')::date AS fim
      FROM generate_series(0, GREATEST(p_meses, 1) - 1) g
      ORDER BY 1
  LOOP
    -- denominador: convertidos da coorte do mês (inclui órfãos sem membro_id)
    SELECT
      (SELECT COUNT(DISTINCT cv.membro_id) FROM public.cui_convertidos cv
         WHERE cv.deleted_at IS NULL AND cv.membro_id IS NOT NULL
           AND cv.data_culto BETWEEN r.ini AND r.fim
           AND (p_area IS NULL OR cv.area = p_area))
    + (SELECT COUNT(*) FROM public.cui_convertidos cv
         WHERE cv.deleted_at IS NULL AND cv.membro_id IS NULL
           AND cv.data_culto BETWEEN r.ini AND r.fim
           AND (p_area IS NULL OR cv.area = p_area))
    INTO v_conv;

    -- numerador: engajados em ≥1 sinal (±60d)
    SELECT COUNT(DISTINCT cv.membro_id) INTO v_eng
      FROM public.cui_convertidos cv
     WHERE cv.deleted_at IS NULL AND cv.membro_id IS NOT NULL
       AND cv.data_culto BETWEEN r.ini AND r.fim
       AND (p_area IS NULL OR cv.area = p_area)
       AND cardinality(public.fn_nsm_sinais_engajados(cv.membro_id, cv.cpf, cv.nome, cv.data_culto, 60)) >= 1;

    mes := r.ym;
    convertidos := v_conv;
    engajados := v_eng;
    pct := CASE WHEN v_conv > 0 THEN round(v_eng::numeric / v_conv * 100, 1) ELSE 0 END;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_nsm_serie_mensal(int, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_nsm_serie_mensal(int, text) IS
  'Série mensal do NSM por mês de conversão (coorte) · engajado = ≥1 sinal em ±60d (fn_nsm_sinais_engajados) · pro gráfico de tendência no /painel.';
