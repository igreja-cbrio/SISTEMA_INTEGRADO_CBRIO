-- ============================================================================
-- META INSTITUCIONAL · alinhar todos KPIs + materializar alvo absoluto
--
-- Marcos: "todas as metas dos indicadores devem ser alinhadas pela meta
-- principal · ao inserir dados passados, materializar um numero solido
-- para os quantitativos".
--
-- Esta migration:
--   1. Adiciona coluna meta_valor_absoluto (alvo concreto · ex: 1300 conversoes)
--   2. Cria funcao aplicar_meta_institucional(tipo) que:
--      · pra quantitativo: pega baseline do ano anterior via _kpi_agregar_dado,
--        aplica o % do meta_institucional · materializa em meta_valor_absoluto
--      · pra qualitativo: meta_valor_absoluto = meta_institucional.meta_valor
--      · sobrescreve meta_descricao e meta_valor em todos KPIs ativos do tipo
--   3. Trigger em kpi_metas_institucionais · quando meta institucional muda,
--      reaplica automaticamente em todos KPIs do tipo
--   4. Roda 1x na migration pra alinhar tudo agora
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna meta_valor_absoluto
-- ----------------------------------------------------------------------------
ALTER TABLE public.kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS meta_valor_absoluto numeric;

COMMENT ON COLUMN public.kpi_indicadores_taticos.meta_valor_absoluto IS
  'Alvo concreto materializado a partir da meta institucional · ex: 1300 (1000 baseline 2025 + 30%). Calculado por aplicar_meta_institucional().';

-- ----------------------------------------------------------------------------
-- 2. Funcao aplicar_meta_institucional
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_meta_institucional(p_tipo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_meta_inst RECORD;
  v_kpi RECORD;
  v_total_atualizados int := 0;
  v_total_materializados int := 0;
  v_baseline_inicio date;
  v_baseline_fim date;
  v_baseline numeric;
  v_target_absoluto numeric;
  v_dado_tipo text;
  v_ano int := extract(year from current_date)::int;
  v_unidade text;
BEGIN
  FOR v_meta_inst IN
    SELECT * FROM public.kpi_metas_institucionais
     WHERE ativo = true
       AND ano = v_ano
       AND (p_tipo IS NULL OR tipo_kpi = p_tipo)
  LOOP
    -- Periodo baseline = ano calendario anterior
    v_baseline_inicio := make_date(v_ano - 1, 1, 1);
    v_baseline_fim    := make_date(v_ano - 1, 12, 31);

    FOR v_kpi IN
      SELECT id, area, tipo_calculo, formula_config, unidade
        FROM public.kpi_indicadores_taticos
       WHERE ativo = true
         AND tipo_kpi = v_meta_inst.tipo_kpi
    LOOP
      v_target_absoluto := NULL;

      IF v_meta_inst.tipo_kpi = 'quantitativo' THEN
        -- Pega o tipo de dado base · seja delta_pct/delta_abs/soma_periodo · todos usam dado_tipo
        v_dado_tipo := v_kpi.formula_config->>'dado_tipo';

        IF v_dado_tipo IS NOT NULL THEN
          v_baseline := public._kpi_agregar_dado(v_dado_tipo, v_kpi.area, v_baseline_inicio, v_baseline_fim);
          IF v_baseline IS NOT NULL AND v_baseline > 0 THEN
            v_target_absoluto := round(v_baseline * (1 + v_meta_inst.meta_valor / 100), 2);
            v_total_materializados := v_total_materializados + 1;
          END IF;
        END IF;

        -- Razao (numerador/denominador): nao tem baseline por dado_tipo unico · pula
        -- (KPI mantem meta_valor como % institucional · so nao materializa absoluto)
      ELSIF v_meta_inst.tipo_kpi = 'qualitativo' THEN
        -- Qualitativo: alvo = valor institucional (e.g. 90%)
        v_target_absoluto := v_meta_inst.meta_valor;
        v_total_materializados := v_total_materializados + 1;
      END IF;

      -- Atualiza KPI
      UPDATE public.kpi_indicadores_taticos
         SET meta_descricao = v_meta_inst.meta_descricao,
             meta_valor = v_meta_inst.meta_valor,
             meta_valor_absoluto = v_target_absoluto,
             updated_at = now()
       WHERE id = v_kpi.id;

      v_total_atualizados := v_total_atualizados + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'tipos_processados', (SELECT count(*) FROM public.kpi_metas_institucionais WHERE ativo = true AND ano = v_ano AND (p_tipo IS NULL OR tipo_kpi = p_tipo)),
    'kpis_atualizados', v_total_atualizados,
    'kpis_com_alvo_materializado', v_total_materializados,
    'baseline_periodo', jsonb_build_object('inicio', v_baseline_inicio, 'fim', v_baseline_fim)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_meta_institucional(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.aplicar_meta_institucional(text) IS
  'Alinha meta_descricao/meta_valor/meta_valor_absoluto de todos KPIs ativos do tipo informado (ou ambos se NULL) com a meta institucional do ano corrente. Pra quantitativos, materializa alvo absoluto via baseline do ano anterior.';

-- ----------------------------------------------------------------------------
-- 3. Trigger em kpi_metas_institucionais · auto-aplica em mudancas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_aplicar_meta_institucional()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.ativo = true THEN
    PERFORM public.aplicar_meta_institucional(NEW.tipo_kpi);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_metas_inst_aplicar ON public.kpi_metas_institucionais;
CREATE TRIGGER tg_metas_inst_aplicar
  AFTER INSERT OR UPDATE ON public.kpi_metas_institucionais
  FOR EACH ROW EXECUTE FUNCTION public.tg_aplicar_meta_institucional();

-- ----------------------------------------------------------------------------
-- 4. Rodar 1x agora · alinha tudo
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_resultado jsonb;
BEGIN
  v_resultado := public.aplicar_meta_institucional(NULL);
  RAISE NOTICE 'aplicar_meta_institucional: %', v_resultado;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio)
-- ----------------------------------------------------------------------------
-- SELECT id, indicador, descricao, area, tipo_kpi, meta_valor, meta_valor_absoluto, meta_descricao
--   FROM kpi_indicadores_taticos
--  WHERE ativo = true
--  ORDER BY tipo_kpi, area, id
--  LIMIT 30;
