-- ============================================================================
-- KPI · `delta_abs` sem dado nenhum é AUSÊNCIA, não zero
--
-- Achado ao aplicar a `20260818180000` (zero conta em período fechado) e MEDIR o
-- efeito antes de considerar pronto: dos KPIs `delta_abs` que passaram a exibir
-- **0**, **13 de 13 não tinham dado em NENHUM dos dois lados** — nem no período,
-- nem no anterior. O zero vinha da própria fórmula:
--
--     v_valor := COALESCE(v_atual, 0) - COALESCE(v_anterior, 0);   -- 0 - 0 = 0
--
-- Enquanto a view descartava zero, isso ficava escondido. Com zero passando a
-- contar, esses 13 apareceriam no painel como "0, medido" — ou seja, eu teria
-- trocado um buraco honesto por um **número inventado**, que é pior: buraco a
-- equipe investiga, número ela acredita.
--
-- ⚠️ O zero LEGÍTIMO continua: se um dos lados tem dado, a conta vale (tinha 5 e
-- agora 0 → -5; tinha 0 e continua 0 → 0). Só o caso "não existe medição de lado
-- nenhum" volta a ser NULL.
--
-- ⚠️ `delta_pct` NÃO é tocado: ele já devolvia NULL com base zero, e os 6 que
-- exibem 0% têm dado dos dois lados (ex.: 5 grupos no semestre passado, 5 agora).
--
-- PATCH DINÂMICO sobre a definição VIVA — `calcular_kpi` foi alterada em produção
-- e colar a versão do repo reverteria aquilo em silêncio.
-- ============================================================================

DO $$
DECLARE
  v_def text;
  v_novo text;
  v_ocorr int;
  v_alvo text := '      v_valor := COALESCE(v_atual, 0) - COALESCE(v_anterior, 0);';
  v_troca text := '      IF v_atual IS NULL AND v_anterior IS NULL THEN v_valor := NULL;' || chr(13) || chr(10) ||
                  '      ELSE v_valor := COALESCE(v_atual, 0) - COALESCE(v_anterior, 0);' || chr(13) || chr(10) ||
                  '      END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'calcular_kpi';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: calcular_kpi nao encontrada';
  END IF;

  IF v_def LIKE '%IF v_atual IS NULL AND v_anterior IS NULL THEN%' THEN
    RAISE NOTICE 'calcular_kpi ja trata delta_abs sem dado - nada a fazer';
    RETURN;
  END IF;

  SELECT count(*) INTO v_ocorr
    FROM regexp_matches(v_def, 'v_valor := COALESCE\(v_atual, 0\) - COALESCE\(v_anterior, 0\);', 'g');

  IF v_ocorr <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: a ancora do delta_abs aparece % vez(es), esperado 1', v_ocorr;
  END IF;

  -- A definição viva usa CRLF; o replace é feito sobre a linha sem depender da
  -- indentação exata do arquivo original.
  v_novo := regexp_replace(
    v_def,
    '( *)v_valor := COALESCE\(v_atual, 0\) - COALESCE\(v_anterior, 0\);',
    E'\\1IF v_atual IS NULL AND v_anterior IS NULL THEN v_valor := NULL;\\1ELSE v_valor := COALESCE(v_atual, 0) - COALESCE(v_anterior, 0);\\1END IF;'
  );

  EXECUTE v_novo;
  RAISE NOTICE 'calcular_kpi: delta_abs sem dado dos dois lados volta a ser NULL';
END $$;

-- Limpa o zero fabricado que já está gravado: recalcula todo `delta_abs` ativo
-- no período fechado anterior e no corrente.
DO $$
DECLARE
  r RECORD;
  v_ant text;
  v_cor text;
  v_n int := 0;
BEGIN
  FOR r IN
    SELECT id, periodicidade FROM public.kpi_indicadores_taticos
     WHERE ativo = true AND tipo_calculo = 'delta_abs'
  LOOP
    v_cor := public._kpi_periodo_corrente(r.periodicidade);
    v_ant := CASE r.periodicidade
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
      PERFORM public.recalcular_kpi(r.id, v_ant);
      IF v_cor IS DISTINCT FROM v_ant THEN
        PERFORM public.recalcular_kpi(r.id, v_cor);
      END IF;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'recalculo falhou no KPI % (%)', r.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'delta_abs recalculados: %', v_n;
END $$;
