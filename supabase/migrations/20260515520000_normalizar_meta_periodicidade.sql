-- ============================================================================
-- Normalizar meta_valor_absoluto pela periodicidade do KPI
--
-- Marcos: "algumas que era semanais estão sendo comparadas a números
--          históricos, então a porcentagem está muito baixa"
--
-- DIAGNÓSTICO:
--
-- A função `aplicar_meta_institucional()` (migration 20260515300000) materializa
-- `kpi_indicadores_taticos.meta_valor_absoluto` SEMPRE como meta ANUAL:
--
--   v_baseline_inicio := make_date(v_ano - 1, 1, 1);   -- 2025-01-01
--   v_baseline_fim    := make_date(v_ano - 1, 12, 31); -- 2025-12-31
--   v_baseline_area := _kpi_agregar_dado(...);          -- soma anual
--   v_target_kpi := v_baseline_area * (1 + meta/100);   -- ex: 18000 * 1.30 = 23400
--
-- Mas o coletor automático (`kpiAutoCollector.js`) gera registros na
-- periodicidade do KPI:
--   - SED-21 frequência Sede · periodicidade='semanal' · range = semana atual
--     → valor coletado: ~2.500 (UMA semana)
--   - SED-21 meta_valor_absoluto = 23.400 (ANO inteiro)
--   - Comparação 2.500 / 23.400 = 10.6% → vermelho FALSO POSITIVO
--
-- Esse mesmo problema afeta TODOS os KPIs Seguir semanais (SED-21, SED-18,
-- BRG-01, BRG-02, ONL-11, ONL-13, KIDS-01) e também mensais quando a meta
-- anual é dividida por 1 (estavam fora de escala).
--
-- FIX:
--
-- Normalizar a meta pela periodicidade na hora de comparar:
--
--   meta_periodo = meta_anual / qtd_periodos_no_ano
--                  - semanal:    / 52
--                  - mensal:     / 12
--                  - trimestral: / 4
--                  - semestral:  / 2
--                  - anual:      / 1 (default)
--
-- Aplicado nas duas views: `vw_kpi_trajetoria_atual` (usada pela mandala) e
-- `vw_kpi_taticos_status` (usada por /minha-area).
-- ============================================================================

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
    COALESCE(k.meta_valor_absoluto, t.meta_valor, k.meta_valor) AS meta_anual,
    -- Divisor segundo periodicidade do KPI · meta absoluta é sempre anual
    CASE k.periodicidade
      WHEN 'semanal'    THEN 52
      WHEN 'mensal'     THEN 12
      WHEN 'trimestral' THEN 4
      WHEN 'semestral'  THEN 2
      ELSE 1
    END AS divisor
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
  me.meta_anual        AS meta_efetiva,
  -- Meta normalizada pra periodicidade · so divide se a meta veio de absoluto
  -- (sempre anual). Se a meta veio do checkpoint (kpi_trajetoria) ela ja foi
  -- definida pra aquele periodo · não dividir.
  CASE
    WHEN k.meta_valor_absoluto IS NOT NULL
      THEN round(me.meta_anual / me.divisor, 2)
    ELSE me.meta_anual
  END AS meta_periodo,
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
  -- Comparações usam meta_periodo (normalizada)
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      CASE
        WHEN me.meta_anual IS NULL OR me.meta_anual = 0 THEN
          CASE WHEN uc.valor_calculado > 0 THEN 'verde' ELSE 'vermelho' END
        WHEN uc.valor_calculado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL
                                         THEN me.meta_anual / me.divisor
                                         ELSE me.meta_anual END) THEN 'verde'
        WHEN uc.valor_calculado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL
                                         THEN me.meta_anual / me.divisor
                                         ELSE me.meta_anual END) * 0.9 THEN 'amarelo'
        ELSE 'vermelho'
      END
    WHEN um.valor_realizado IS NOT NULL THEN
      CASE
        WHEN me.meta_anual IS NULL OR me.meta_anual = 0 THEN
          CASE WHEN um.valor_realizado > 0 THEN 'verde' ELSE 'vermelho' END
        WHEN um.valor_realizado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL
                                         THEN me.meta_anual / me.divisor
                                         ELSE me.meta_anual END) THEN 'verde'
        WHEN um.valor_realizado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL
                                         THEN me.meta_anual / me.divisor
                                         ELSE me.meta_anual END) * 0.9 THEN 'amarelo'
        ELSE 'vermelho'
      END
    ELSE 'pendente'
  END AS status,
  -- Alias legado (no_alvo/atras/critico/sem_meta) · backend tabularKpis aceita ambos
  CASE
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      CASE
        WHEN me.meta_anual IS NULL OR me.meta_anual = 0 THEN 'sem_meta'
        WHEN uc.valor_calculado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL
                                         THEN me.meta_anual / me.divisor
                                         ELSE me.meta_anual END) THEN 'no_alvo'
        WHEN uc.valor_calculado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL
                                         THEN me.meta_anual / me.divisor
                                         ELSE me.meta_anual END) * 0.9 THEN 'atras'
        ELSE 'critico'
      END
    WHEN um.valor_realizado IS NOT NULL THEN
      CASE
        WHEN me.meta_anual IS NULL OR me.meta_anual = 0 THEN 'sem_meta'
        WHEN um.valor_realizado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL
                                         THEN me.meta_anual / me.divisor
                                         ELSE me.meta_anual END) THEN 'no_alvo'
        WHEN um.valor_realizado >= (CASE WHEN k.meta_valor_absoluto IS NOT NULL
                                         THEN me.meta_anual / me.divisor
                                         ELSE me.meta_anual END) * 0.9 THEN 'atras'
        ELSE 'critico'
      END
    ELSE 'sem_dado'
  END AS status_trajetoria,
  CASE
    WHEN me.meta_anual IS NULL OR me.meta_anual = 0 THEN NULL
    WHEN k.tipo_calculo != 'manual' AND uc.valor_calculado IS NOT NULL THEN
      round((uc.valor_calculado / (CASE WHEN k.meta_valor_absoluto IS NOT NULL
                                        THEN me.meta_anual / me.divisor
                                        ELSE me.meta_anual END)) * 100, 1)
    WHEN um.valor_realizado IS NOT NULL THEN
      round((um.valor_realizado / (CASE WHEN k.meta_valor_absoluto IS NOT NULL
                                        THEN me.meta_anual / me.divisor
                                        ELSE me.meta_anual END)) * 100, 1)
    ELSE NULL
  END AS percentual_meta
FROM public.kpi_indicadores_taticos k
LEFT JOIN public.kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
LEFT JOIN ultimo_manual um ON um.indicador_id = k.id
LEFT JOIN ultimo_calculado uc ON uc.kpi_id = k.id
LEFT JOIN meta_efetiva me ON me.kpi_id = k.id
WHERE k.ativo = true;

GRANT SELECT ON public.vw_kpi_trajetoria_atual TO authenticated, service_role;

COMMENT ON VIEW public.vw_kpi_trajetoria_atual IS
  'Status atual de cada KPI · meta normalizada pela periodicidade (meta_absoluta sempre anual / qtd periodos no ano).';

-- ----------------------------------------------------------------------------
-- vw_kpi_taticos_status · mesma normalização aplicada
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
  -- meta_efetiva (raw · pode estar em escala anual se veio de meta_valor_absoluto)
  COALESCE(t.meta_valor_absoluto, t.meta_valor) AS meta_efetiva,
  -- meta_periodo · normalizada pra periodicidade do KPI
  CASE
    WHEN t.meta_valor_absoluto IS NOT NULL THEN
      round(t.meta_valor_absoluto / CASE t.periodicidade
        WHEN 'semanal'    THEN 52
        WHEN 'mensal'     THEN 12
        WHEN 'trimestral' THEN 4
        WHEN 'semestral'  THEN 2
        ELSE 1
      END, 2)
    ELSE t.meta_valor
  END AS meta_periodo,
  CASE
    WHEN ur.valor_realizado IS NULL THEN 'pendente'
    WHEN COALESCE(t.meta_valor_absoluto, t.meta_valor) IS NULL
         OR COALESCE(t.meta_valor_absoluto, t.meta_valor) = 0 THEN
      CASE WHEN ur.valor_realizado > 0 THEN 'verde' ELSE 'vermelho' END
    WHEN ur.valor_realizado >= (CASE
        WHEN t.meta_valor_absoluto IS NOT NULL THEN
          t.meta_valor_absoluto / CASE t.periodicidade
            WHEN 'semanal'    THEN 52
            WHEN 'mensal'     THEN 12
            WHEN 'trimestral' THEN 4
            WHEN 'semestral'  THEN 2
            ELSE 1
          END
        ELSE t.meta_valor
      END) THEN 'verde'
    WHEN ur.valor_realizado >= (CASE
        WHEN t.meta_valor_absoluto IS NOT NULL THEN
          t.meta_valor_absoluto / CASE t.periodicidade
            WHEN 'semanal'    THEN 52
            WHEN 'mensal'     THEN 12
            WHEN 'trimestral' THEN 4
            WHEN 'semestral'  THEN 2
            ELSE 1
          END
        ELSE t.meta_valor
      END) * 0.9 THEN 'amarelo'
    ELSE 'vermelho'
  END AS status
FROM public.kpi_indicadores_taticos t
LEFT JOIN public.rh_funcionarios f ON f.id = t.lider_funcionario_id
LEFT JOIN ultimo_registro ur ON ur.indicador_id = t.id
LEFT JOIN periodo_atual pa ON pa.periodicidade = t.periodicidade
WHERE t.ativo = true;

GRANT SELECT ON public.vw_kpi_taticos_status TO authenticated, service_role;

COMMENT ON VIEW public.vw_kpi_taticos_status IS
  'Status do KPI no periodo corrente · meta_periodo = meta_valor_absoluto (sempre anual) / qtd periodos no ano. Comparacoes usam meta_periodo.';

-- ----------------------------------------------------------------------------
-- Conferência (rodar depois):
--   SELECT kpi_id, periodicidade, ultimo_valor, meta_efetiva, meta_periodo,
--          status_trajetoria, percentual_meta
--     FROM vw_kpi_trajetoria_atual
--    WHERE kpi_id IN ('SED-21','SED-18','BRG-01','BRG-02','ONL-11','ONL-13','KIDS-01')
--    ORDER BY periodicidade, kpi_id;
--   Espera: status NAO mais 'critico' em massa · meta_periodo agora = meta_efetiva/52
--   (KPIs semanais) o que faz percentual_meta voltar a faixa realista (50-150%)
-- ============================================================================
