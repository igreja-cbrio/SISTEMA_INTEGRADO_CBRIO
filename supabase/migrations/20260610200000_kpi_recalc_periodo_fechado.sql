-- ============================================================================
-- FIX · kpi_recalcular_todos passa a calcular o último período FECHADO
--
-- Regressão pega na revisão da leva 20260610180000 (mesmo dia): o recálculo
-- geral rodava recalcular_kpi(id, NULL) = período CORRENTE. Pra KPIs semanais
-- de delta isso gravou a semana EM CURSO (ainda sem culto) vs a semana
-- passada → "-100%" falso no painel (SED-21, SED-18, BRG-05...). Antes da
-- leva, o período corrente só era calculado quando chegava DADO real (triggers
-- com a data do dado) — parcial "em construção" fazia sentido; parcial vazio
-- gravado pelo cron, não.
--
-- Correção:
--   1. kpi_recalcular_todos() recalcula o último período FECHADO de cada KPI
--      (semana passada / mês passado / etc · período corrente fica por conta
--      dos gatilhos de dado novo, que disparam exatamente quando há dado).
--      + statement_timeout próprio de 120s (não depender do default do
--      PostgREST quando a base crescer).
--   2. Limpeza dos valores do período corrente gravados hoje pelo run da
--      20260610180000 (serão regravados pelos gatilhos quando houver dado ·
--      até lá a view vw_kpi_trajetoria_atual volta a mostrar o último período
--      com dado real, comportamento estável de antes).
--   3. Re-run no modo novo (popula os períodos fechados).
--
-- fn_kpi_recalc_dado_tipos (gatilhos por tabela) continua NULL = corrente:
-- ela dispara JUNTO com o dado novo, então o parcial é legítimo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. kpi_recalcular_todos v2 · período fechado anterior
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kpi_recalcular_todos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '120s'
AS $$
DECLARE
  r RECORD;
  v_ok int := 0;
  v_erro int := 0;
  v_periodo text;
BEGIN
  FOR r IN
    SELECT id, periodicidade FROM public.kpi_indicadores_taticos
     WHERE ativo = true AND COALESCE(tipo_calculo, 'manual') <> 'manual'
  LOOP
    -- último período FECHADO (mesmo formato que recalcular_kpi gera pra NULL,
    -- só que deslocado 1 período pra trás)
    v_periodo := CASE r.periodicidade
      WHEN 'mensal'     THEN to_char(current_date - interval '1 month', 'YYYY-MM')
      WHEN 'trimestral' THEN to_char(current_date - interval '3 months', 'YYYY')
                             || '-Q' || ((extract(month from current_date - interval '3 months')::int - 1) / 3 + 1)::text
      WHEN 'semestral'  THEN to_char(current_date - interval '6 months', 'YYYY')
                             || '-S' || (CASE WHEN extract(month from current_date - interval '6 months') <= 6 THEN 1 ELSE 2 END)::text
      WHEN 'anual'      THEN to_char(current_date - interval '1 year', 'YYYY')
      WHEN 'semanal'    THEN to_char(current_date - 7, 'YYYY')
                             || '-W' || lpad(extract(week from current_date - 7)::text, 2, '0')
      ELSE to_char(current_date - interval '1 month', 'YYYY-MM')
    END;
    BEGIN
      PERFORM public.recalcular_kpi(r.id, v_periodo);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_erro := v_erro + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('recalculados', v_ok, 'erros', v_erro, 'modo', 'periodo_fechado_anterior');
END $$;

GRANT EXECUTE ON FUNCTION public.kpi_recalcular_todos() TO service_role;

COMMENT ON FUNCTION public.kpi_recalcular_todos() IS
  'Recalcula o último período FECHADO de todos os KPIs ativos não-manuais (cron diário /api/kpis/v2/cron/coletar). O período corrente fica por conta dos gatilhos de dado novo — evita gravar parciais vazios (-100% falsos).';

-- ----------------------------------------------------------------------------
-- 2. Limpeza · valores do período CORRENTE gravados hoje (run do modo antigo)
--    Serão regravados pelos gatilhos quando o dado real do período chegar.
-- ----------------------------------------------------------------------------
DELETE FROM public.kpi_valores_calculados c
 USING public.kpi_indicadores_taticos k
 WHERE k.id = c.kpi_id
   AND c.calculado_em::date = CURRENT_DATE
   AND c.periodo_referencia = CASE k.periodicidade
      WHEN 'mensal'     THEN to_char(current_date, 'YYYY-MM')
      WHEN 'trimestral' THEN to_char(current_date, 'YYYY')
                             || '-Q' || ((extract(month from current_date)::int - 1) / 3 + 1)::text
      WHEN 'semestral'  THEN to_char(current_date, 'YYYY')
                             || '-S' || (CASE WHEN extract(month from current_date) <= 6 THEN 1 ELSE 2 END)::text
      WHEN 'anual'      THEN to_char(current_date, 'YYYY')
      WHEN 'semanal'    THEN to_char(current_date, 'YYYY')
                             || '-W' || lpad(extract(week from current_date)::text, 2, '0')
      ELSE to_char(current_date, 'YYYY-MM')
    END;

-- ----------------------------------------------------------------------------
-- 3. Re-run no modo novo (períodos fechados)
-- ----------------------------------------------------------------------------
DO $$
DECLARE v jsonb;
BEGIN
  v := public.kpi_recalcular_todos();
  RAISE NOTICE 'kpi_recalcular_todos (período fechado): %', v;
END $$;

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT kpi_id, periodo_referencia, valor_calculado
--     FROM kpi_valores_calculados ORDER BY calculado_em DESC LIMIT 20;
--   -- esperado: períodos da semana/mês PASSADO · sem -100% da semana em curso
-- ----------------------------------------------------------------------------
