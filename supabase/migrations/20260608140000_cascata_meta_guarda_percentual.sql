-- Auditoria CBRio (2026-06-08) · guarda na cascata de meta p/ KPIs de PERCENTUAL
-- ============================================================================
-- Achado (alto): aplicar_meta_institucional() cascateia meta_valor_absoluto pros
-- KPIs táticos filhos de um OKR quantitativo como baseline_area * (1 + meta%) — uma
-- CONTAGEM anual. Pra KPIs de PERCENTUAL/coorte (BAT90 "% batizados ≤90d", NEXT90
-- "% aceitam", reunião · unidade='%', tipo_calculo='manual', meta fixa em %), isso
-- sobrescreve o alvo de 30/70% por uma contagem absoluta → a view de normalização
-- (vw_kpi_trajetoria_atual / vw_kpi_taticos_status, que faz COALESCE(meta_valor_absoluto,
-- meta_valor)) passa a comparar % realizado contra uma contagem → semáforo quebrado.
--
-- Hoje só NÃO quebra por acidente (o baseline de 'frequencia_next' agrega 0 → o ramo
-- v_baseline_area > 0 não dispara). Esta migration torna a proteção explícita.
--
-- GUARDA: KPI com unidade = '%' NÃO recebe meta absoluta da cascata — fica com
-- meta_valor_absoluto = NULL (a view cai no meta_valor = o alvo %). Também zera
-- qualquer absoluto que uma execução anterior tenha gravado nesses KPIs.
--
-- CREATE OR REPLACE idempotente · só a função muda (as views da 20260515300000
-- continuam válidas) + re-roda a cascata 1x pra corrigir o estado atual.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.aplicar_meta_institucional(p_tipo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_meta_inst RECORD;
  v_okr RECORD;
  v_kpi RECORD;
  v_total_okrs int := 0;
  v_total_kpis int := 0;
  v_total_okrs_materializados int := 0;
  v_total_kpis_materializados int := 0;
  v_total_kpis_pct_protegidos int := 0;
  v_baseline_inicio date;
  v_baseline_fim date;
  v_baseline numeric;
  v_baseline_area numeric;
  v_target_absoluto numeric;
  v_target_kpi numeric;
  v_ano int := extract(year from current_date)::int;
  v_areas text[] := ARRAY['kids', 'ami', 'bridge', 'sede', 'online', 'cba'];
  v_area text;
  v_parcial numeric;
BEGIN
  FOR v_meta_inst IN
    SELECT * FROM public.kpi_metas_institucionais
     WHERE ativo = true
       AND ano = v_ano
       AND (p_tipo IS NULL OR tipo_kpi = p_tipo)
  LOOP
    v_baseline_inicio := make_date(v_ano - 1, 1, 1);
    v_baseline_fim    := make_date(v_ano - 1, 12, 31);

    FOR v_okr IN
      SELECT id, dado_tipo_principal
        FROM public.kpi_objetivos_gerais
       WHERE ativo = true AND tipo_okr = v_meta_inst.tipo_kpi
    LOOP
      v_target_absoluto := NULL;

      -- ── Nivel 1: meta absoluta do OKR (soma das 6 areas) ──
      IF v_meta_inst.tipo_kpi = 'quantitativo' AND v_okr.dado_tipo_principal IS NOT NULL THEN
        v_baseline := 0;
        FOREACH v_area IN ARRAY v_areas LOOP
          v_parcial := public._kpi_agregar_dado(v_okr.dado_tipo_principal, v_area, v_baseline_inicio, v_baseline_fim);
          v_baseline := v_baseline + COALESCE(v_parcial, 0);
        END LOOP;

        IF v_baseline > 0 THEN
          v_target_absoluto := round(v_baseline * (1 + v_meta_inst.meta_valor / 100), 2);
          v_total_okrs_materializados := v_total_okrs_materializados + 1;
        END IF;
      ELSIF v_meta_inst.tipo_kpi = 'qualitativo' THEN
        v_target_absoluto := v_meta_inst.meta_valor;
        v_total_okrs_materializados := v_total_okrs_materializados + 1;
      END IF;

      UPDATE public.kpi_objetivos_gerais
         SET meta_descricao = v_meta_inst.meta_descricao,
             meta_valor = v_meta_inst.meta_valor,
             meta_valor_absoluto = v_target_absoluto,
             updated_at = now()
       WHERE id = v_okr.id;

      v_total_okrs := v_total_okrs + 1;

      -- ── Nivel 2: cascata pros KPIs taticos filhos do OKR ──
      FOR v_kpi IN
        SELECT id, area, formula_config, unidade
          FROM public.kpi_indicadores_taticos
         WHERE objetivo_geral_id = v_okr.id
           AND ativo = true
      LOOP
        -- GUARDA: KPI de PERCENTUAL não recebe meta absoluta (a meta dele é o %).
        -- Zera qualquer absoluto herdado por engano de execução anterior.
        IF COALESCE(v_kpi.unidade, '') = '%' THEN
          UPDATE public.kpi_indicadores_taticos
             SET meta_valor_absoluto = NULL, updated_at = now()
           WHERE id = v_kpi.id AND meta_valor_absoluto IS NOT NULL;
          v_total_kpis := v_total_kpis + 1;
          v_total_kpis_pct_protegidos := v_total_kpis_pct_protegidos + 1;
          CONTINUE;
        END IF;

        v_target_kpi := NULL;

        IF v_meta_inst.tipo_kpi = 'quantitativo' AND v_okr.dado_tipo_principal IS NOT NULL THEN
          v_baseline_area := public._kpi_agregar_dado(
            v_okr.dado_tipo_principal,
            v_kpi.area,
            v_baseline_inicio,
            v_baseline_fim
          );
          IF v_baseline_area IS NOT NULL AND v_baseline_area > 0 THEN
            v_target_kpi := round(v_baseline_area * (1 + v_meta_inst.meta_valor / 100), 2);
            v_total_kpis_materializados := v_total_kpis_materializados + 1;
          END IF;
        ELSIF v_meta_inst.tipo_kpi = 'qualitativo' THEN
          v_target_kpi := v_meta_inst.meta_valor;
          v_total_kpis_materializados := v_total_kpis_materializados + 1;
        END IF;

        UPDATE public.kpi_indicadores_taticos
           SET meta_valor_absoluto = v_target_kpi,
               updated_at = now()
         WHERE id = v_kpi.id;

        v_total_kpis := v_total_kpis + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'okrs_atualizados',             v_total_okrs,
    'okrs_com_alvo_materializado',  v_total_okrs_materializados,
    'kpis_atualizados',             v_total_kpis,
    'kpis_com_alvo_materializado',  v_total_kpis_materializados,
    'kpis_percentual_protegidos',   v_total_kpis_pct_protegidos,
    'baseline_periodo', jsonb_build_object('inicio', v_baseline_inicio, 'fim', v_baseline_fim)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_meta_institucional(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.aplicar_meta_institucional(text) IS
  'Cascateia meta institucional · OKR (soma 6 areas) + KPI tatico (area especifica). Baseline = ano anterior, alvo = baseline * (1 + meta_valor%). KPIs de percentual (unidade=%) ficam com meta_valor_absoluto=NULL (mantem a meta %, sem clobber).';

-- Re-roda a cascata pra corrigir o estado atual (zera o absoluto dos KPIs de %)
DO $$
DECLARE v_resultado jsonb;
BEGIN
  v_resultado := public.aplicar_meta_institucional(NULL);
  RAISE NOTICE 'cascata re-aplicada (com guarda de %%): %', v_resultado;
END $$;
