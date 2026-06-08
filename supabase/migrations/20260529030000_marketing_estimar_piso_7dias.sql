-- ============================================================================
-- Marketing · estimativa preliminar com PISO de 7 dias
-- Marcos 2026-05-29: "minimo de 7 dias. Se a demanda couber pela carga horaria
-- em menos de 7 dias, mantem 7. Se so for possivel em +7 dias, mostra o maior."
-- Da um tempo minimo viavel pra equipe pensar + executar.
--
-- Recria fn_marketing_estimar_prazo (CREATE OR REPLACE · idempotente). Unica
-- mudanca em relacao a versao anterior: GREATEST(7, dias_da_carga) + observacao
-- + sem-SLA tambem cai no piso de 7. Data agora em dias corridos.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_marketing_estimar_prazo(p_tipo_id uuid, p_data_alvo date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  DECLARE
    v_esforco        numeric;
    v_capacidade_dia numeric;
    v_dias           integer;
    v_data_sugerida  date;
    v_observacao     text;
    v_fator          numeric := 0.6;
    v_piso           integer := 7;   -- prazo minimo viavel (Marcos 2026-05-29)
  BEGIN
    SELECT esforco_max_h INTO v_esforco
      FROM public.marketing_etiquetas_tipo
     WHERE id = p_tipo_id AND ativo = true;

    -- Tipo sem SLA definido · ainda respeita o piso de 7 dias
    IF v_esforco IS NULL THEN
      v_data_sugerida := CURRENT_DATE + v_piso;
      IF p_data_alvo IS NOT NULL AND p_data_alvo > v_data_sugerida THEN
        v_data_sugerida := p_data_alvo;
      END IF;
      RETURN jsonb_build_object(
        'data_sugerida', v_data_sugerida,
        'dias_uteis', (v_data_sugerida - CURRENT_DATE),
        'esforco_h', NULL,
        'capacidade_dia', NULL,
        'observacao', 'Tipo ainda sem SLA definido · prazo minimo de 7 dias · Pedro confirma depois.'
      );
    END IF;

    -- Capacidade livre da equipe inteira nesta semana, por dia (5 dias)
    SELECT GREATEST(SUM(horas_livres), 0) / 5 INTO v_capacidade_dia
      FROM public.fn_marketing_calcular_capacidade_semana(CURRENT_DATE);

    IF v_capacidade_dia IS NULL OR v_capacidade_dia <= 0 THEN
      v_dias := 10;
      v_observacao := 'Equipe sem capacidade livre nesta semana · prazo realista em ~2 semanas.';
    ELSE
      v_dias := GREATEST(1, CEIL(v_esforco / (v_capacidade_dia * v_fator))::integer);
      v_observacao := 'Estimativa pela carga da equipe (SLA maximo). Pedro confirma o prazo real depois.';
    END IF;

    -- PISO de 7 dias · se a carga couber em menos, vale o piso · se exigir mais, vale a carga
    IF v_dias < v_piso THEN
      v_dias := v_piso;
      v_observacao := 'Prazo minimo de 7 dias pra planejamento e execucao. Pedro confirma depois.';
    END IF;

    v_data_sugerida := CURRENT_DATE + v_dias;
    IF p_data_alvo IS NOT NULL AND p_data_alvo > v_data_sugerida THEN
      v_data_sugerida := p_data_alvo;
    END IF;

    RETURN jsonb_build_object(
      'data_sugerida', v_data_sugerida,
      'dias_uteis', (v_data_sugerida - CURRENT_DATE),
      'esforco_h', v_esforco,
      'capacidade_dia', v_capacidade_dia,
      'observacao', v_observacao
    );
  END;
$function$;

COMMIT;
