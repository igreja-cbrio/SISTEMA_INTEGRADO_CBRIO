-- ============================================================================
-- Cascata da meta absoluta · OKR Geral → KPI Tatico por area
--
-- Marcos: "se temos 1000 pessoas total na igreja, 400 na sede, 300 no online,
--          100 no bridge, 100 no ami e 100 no kids. Quando aumentar 30% do
--          dado geral vai ficar 1300 de meta, porém em cada área o aumento
--          e diferente baseado na proporcao da area".
--
-- Hoje: aplicar_meta_institucional() so materializa OKR Geral (soma das 6
-- areas). Os KPIs taticos filhos ficam com meta_valor_absoluto=NULL · cards
-- mostram meta=30% (o % institucional) em vez do alvo concreto da area.
--
-- Solucao: estender a funcao pra TAMBEM popular KPIs taticos do OKR. Cada
-- KPI tatico tem area especifica (sede/ami/bridge/kids/online/cba). A funcao
-- agrega baseline 2025 da area especifica e aplica +X%.
--
-- Exemplo: OKR "Aumentar Frequencia" tem dado_tipo_principal='frequencia_culto'
-- e meta_institucional=+30%:
--   OKR.meta_valor_absoluto = baseline(todas areas 2025) * 1.3 = 1300
--   SED-21 (area=sede).meta_valor_absoluto = baseline(sede 2025) * 1.3 = 520
--   AMI-01 (area=ami).meta_valor_absoluto  = baseline(ami 2025)  * 1.3 = 130
--   ...
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

      -- ── Nivel 2 (NOVO): cascata pros KPIs taticos filhos do OKR ──
      -- Cada KPI tem area especifica · materializa baseline da area * (1 + %).
      FOR v_kpi IN
        SELECT id, area, formula_config
          FROM public.kpi_indicadores_taticos
         WHERE objetivo_geral_id = v_okr.id
           AND ativo = true
      LOOP
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
          -- Qualitativo: KPI herda meta absoluta = valor institucional
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
    'baseline_periodo', jsonb_build_object('inicio', v_baseline_inicio, 'fim', v_baseline_fim)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_meta_institucional(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.aplicar_meta_institucional(text) IS
  'Cascateia meta institucional · OKR (soma 6 areas) + KPI tatico (area especifica). Baseline = ano anterior, alvo = baseline * (1 + meta_valor%).';

-- ----------------------------------------------------------------------------
-- Roda 1x · popula meta_valor_absoluto em todos os KPIs taticos filhos
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_resultado jsonb;
BEGIN
  v_resultado := public.aplicar_meta_institucional(NULL);
  RAISE NOTICE 'cascata aplicada: %', v_resultado;
END $$;

-- ----------------------------------------------------------------------------
-- Atualiza vw_kpi_trajetoria_atual e vw_kpi_taticos_status pra usar
-- meta_valor_absoluto quando disponivel (vs % institucional).
--
-- Logica: COALESCE(meta_valor_absoluto, meta_valor)
-- Assim:
--  - KPI com cascata aplicada: compara contra alvo concreto (ex: 520 pessoas)
--  - KPI sem cascata: usa meta_valor antigo (% institucional · legado)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_kpi_taticos_status;

CREATE VIEW public.vw_kpi_taticos_status AS
WITH periodo_atual AS (
  SELECT 'semanal'    AS periodicidade, to_char(now(), 'IYYY"-W"IW') AS periodo
  UNION ALL SELECT 'mensal',     to_char(now(), 'YYYY-MM')
  UNION ALL SELECT 'trimestral', to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q')
  UNION ALL SELECT 'semestral',  to_char(now(), 'YYYY') || '-S' || (CASE WHEN extract(month FROM now()) <= 6 THEN '1' ELSE '2' END)
  UNION ALL SELECT 'anual',      to_char(now(), 'YYYY')
),
ultimo_registro AS (
  SELECT DISTINCT ON (r.indicador_id)
    r.indicador_id, r.periodo_referencia, r.valor_realizado,
    r.data_preenchimento, r.responsavel, r.observacoes, r.origem
  FROM public.kpi_registros r
  JOIN public.kpi_indicadores_taticos k ON k.id = r.indicador_id
  JOIN periodo_atual pa ON pa.periodicidade = k.periodicidade
  WHERE r.valor_realizado IS NOT NULL
    AND r.valor_realizado > 0
    AND r.periodo_referencia <= pa.periodo
  ORDER BY r.indicador_id, r.periodo_referencia DESC
)
SELECT
  t.id, t.kpi_estrategico_id, t.area, t.indicador, t.descricao,
  t.periodicidade, t.periodo_offset_meses,
  t.meta_descricao, t.meta_valor, t.meta_valor_absoluto, t.unidade,
  t.responsavel_area, t.apuracao, t.sort_order, t.fonte_auto, t.valores, t.pilar,
  t.is_okr, t.ativo,
  t.lider_funcionario_id,
  f.nome AS lider_nome, f.cargo AS lider_cargo,
  pa.periodo AS periodo_atual,
  ur.periodo_referencia AS ultimo_periodo,
  ur.valor_realizado AS ultimo_valor,
  ur.data_preenchimento AS ultima_data,
  ur.responsavel AS ultimo_responsavel,
  ur.origem AS ultima_origem,
  -- Meta efetiva: prioriza absoluto, fallback pro %
  COALESCE(t.meta_valor_absoluto, t.meta_valor) AS meta_efetiva,
  CASE
    WHEN ur.valor_realizado IS NULL THEN 'pendente'
    WHEN COALESCE(t.meta_valor_absoluto, t.meta_valor) IS NULL
         OR COALESCE(t.meta_valor_absoluto, t.meta_valor) = 0 THEN
      CASE WHEN ur.valor_realizado > 0 THEN 'verde' ELSE 'vermelho' END
    WHEN ur.valor_realizado >= COALESCE(t.meta_valor_absoluto, t.meta_valor) THEN 'verde'
    WHEN ur.valor_realizado >= COALESCE(t.meta_valor_absoluto, t.meta_valor) * 0.9 THEN 'amarelo'
    ELSE 'vermelho'
  END AS status
FROM public.kpi_indicadores_taticos t
LEFT JOIN public.rh_funcionarios f ON f.id = t.lider_funcionario_id
LEFT JOIN ultimo_registro ur ON ur.indicador_id = t.id
LEFT JOIN periodo_atual pa ON pa.periodicidade = t.periodicidade
WHERE t.ativo = true;

GRANT SELECT ON public.vw_kpi_taticos_status TO authenticated, service_role;

DROP VIEW IF EXISTS public.vw_kpi_trajetoria_atual;

CREATE VIEW public.vw_kpi_trajetoria_atual AS
WITH ultimo_manual AS (
  SELECT DISTINCT ON (r.indicador_id)
    r.indicador_id, r.periodo_referencia, r.valor_realizado, r.data_preenchimento
  FROM public.kpi_registros r
  WHERE r.valor_realizado IS NOT NULL AND r.valor_realizado > 0
  ORDER BY r.indicador_id, r.periodo_referencia DESC
),
ultimo_calculado AS (
  SELECT DISTINCT ON (kpi_id)
    kpi_id, periodo_referencia, valor_calculado, calculado_em
  FROM public.kpi_valores_calculados
  WHERE valor_calculado IS NOT NULL AND valor_calculado > 0
  ORDER BY kpi_id, periodo_referencia DESC
),
meta_efetiva AS (
  SELECT
    k.id AS kpi_id,
    -- Prioriza absoluto do KPI, depois checkpoint, depois meta_valor base
    COALESCE(k.meta_valor_absoluto, t.meta_valor, k.meta_valor) AS meta
  FROM public.kpi_indicadores_taticos k
  LEFT JOIN public.kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
)
SELECT
  k.id AS kpi_id,
  k.indicador,
  k.area,
  k.periodicidade,
  k.tipo_calculo,
  k.valores,
  k.is_okr,
  k.objetivo_geral_id,
  t.periodo_referencia AS checkpoint_periodo,
  t.meta_valor         AS checkpoint_meta,
  me.meta              AS meta_efetiva,
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL
      THEN uc.periodo_referencia
    ELSE um.periodo_referencia
  END AS ultimo_periodo,
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL
      THEN uc.valor_calculado
    ELSE um.valor_realizado
  END AS ultimo_valor,
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      CASE
        WHEN me.meta IS NULL OR me.meta = 0 THEN
          CASE WHEN uc.valor_calculado > 0 THEN 'verde' ELSE 'vermelho' END
        WHEN uc.valor_calculado >= me.meta THEN 'verde'
        WHEN uc.valor_calculado >= me.meta * 0.9 THEN 'amarelo'
        ELSE 'vermelho'
      END
    WHEN um.valor_realizado IS NOT NULL THEN
      CASE
        WHEN me.meta IS NULL OR me.meta = 0 THEN
          CASE WHEN um.valor_realizado > 0 THEN 'verde' ELSE 'vermelho' END
        WHEN um.valor_realizado >= me.meta THEN 'verde'
        WHEN um.valor_realizado >= me.meta * 0.9 THEN 'amarelo'
        ELSE 'vermelho'
      END
    ELSE 'pendente'
  END AS status,
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      CASE
        WHEN me.meta IS NULL OR me.meta = 0 THEN 'sem_meta'
        WHEN uc.valor_calculado >= me.meta THEN 'no_alvo'
        WHEN uc.valor_calculado >= me.meta * 0.9 THEN 'atras'
        ELSE 'critico'
      END
    WHEN um.valor_realizado IS NOT NULL THEN
      CASE
        WHEN me.meta IS NULL OR me.meta = 0 THEN 'sem_meta'
        WHEN um.valor_realizado >= me.meta THEN 'no_alvo'
        WHEN um.valor_realizado >= me.meta * 0.9 THEN 'atras'
        ELSE 'critico'
      END
    ELSE 'sem_dado'
  END AS status_trajetoria,
  CASE
    WHEN me.meta IS NULL OR me.meta = 0 THEN NULL
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      round((uc.valor_calculado / me.meta) * 100, 1)
    WHEN um.valor_realizado IS NOT NULL THEN
      round((um.valor_realizado / me.meta) * 100, 1)
    ELSE NULL
  END AS percentual_meta
FROM public.kpi_indicadores_taticos k
LEFT JOIN public.kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
LEFT JOIN ultimo_manual um ON um.indicador_id = k.id
LEFT JOIN ultimo_calculado uc ON uc.kpi_id = k.id
LEFT JOIN meta_efetiva me ON me.kpi_id = k.id
WHERE k.ativo = true;

GRANT SELECT ON public.vw_kpi_trajetoria_atual TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT id, area, meta_valor, meta_valor_absoluto, indicador
--     FROM kpi_indicadores_taticos
--    WHERE valores @> '{seguir}' AND tipo_kpi = 'quantitativo' AND ativo = true
--    ORDER BY area, id;
--   Espera: meta_valor_absoluto preenchido com valor por area
--   (SED-21 sede=algum_numero, AMI-01 ami=outro_numero, etc)
--
--   SELECT id, ultimo_valor, meta_efetiva, status, percentual_meta
--     FROM vw_kpi_trajetoria_atual
--    WHERE kpi_id IN ('SED-21','AMI-01','BRG-01','KIDS-01');
--   Espera: meta_efetiva e numero absoluto, % calculado vs ele.
-- ============================================================================
