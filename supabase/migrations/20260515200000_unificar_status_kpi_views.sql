-- ============================================================================
-- Unifica status entre vw_kpi_taticos_status e vw_kpi_trajetoria_atual +
-- ignora registros auto-zerados pra pegar o último valor real
--
-- Marcos: "no painel principal, ainda não temos dados de seguir a Jesus"
--
-- Diagnostico:
-- - SED-21 tem registros W14=2679, W15=2069 (dados reais) mas tambem W20=0
--   (auto-zero do trigger pra semana atual sem culto preenchido).
-- - ORDER BY periodo_referencia DESC pega W20 (zero) como "ultimo" · card
--   mostra 0 mesmo com historico cheio.
-- - As 2 views tem nomes diferentes (no_alvo vs verde) · backend painel.js
--   precisava mapear · 1 fonte de bug.
--
-- Fix:
-- 1. CTE ultimo_registro filtra valor_realizado > 0 (ignora zeros como
--    "ainda nao preenchido"). KPIs legitimamente zero perdem aparicao mas
--    isso e raro e a UI mostra "pendente".
-- 2. Renomeia status_trajetoria → status em vw_kpi_trajetoria_atual,
--    valores verde/amarelo/vermelho/pendente (igual vw_kpi_taticos_status).
--    Mantemos status_trajetoria como alias temporario pra compat ate o
--    backend migrar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Recria vw_kpi_taticos_status com filtro de zeros
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
    AND r.valor_realizado > 0  -- ignora zeros (ainda nao preenchidos)
    AND r.periodo_referencia <= pa.periodo
  ORDER BY r.indicador_id, r.periodo_referencia DESC
)
SELECT
  t.id, t.kpi_estrategico_id, t.area, t.indicador, t.descricao,
  t.periodicidade, t.periodo_offset_meses,
  t.meta_descricao, t.meta_valor, t.unidade, t.responsavel_area,
  t.apuracao, t.sort_order, t.fonte_auto, t.valores, t.pilar,
  t.is_okr, t.ativo,
  t.lider_funcionario_id,
  f.nome AS lider_nome,
  f.cargo AS lider_cargo,
  pa.periodo AS periodo_atual,
  ur.periodo_referencia AS ultimo_periodo,
  ur.valor_realizado AS ultimo_valor,
  ur.data_preenchimento AS ultima_data,
  ur.responsavel AS ultimo_responsavel,
  ur.origem AS ultima_origem,
  CASE
    WHEN ur.valor_realizado IS NULL THEN 'pendente'
    WHEN t.meta_valor IS NULL OR t.meta_valor = 0 THEN
      CASE WHEN ur.valor_realizado > 0 THEN 'verde' ELSE 'vermelho' END
    WHEN ur.valor_realizado >= t.meta_valor THEN 'verde'
    WHEN ur.valor_realizado >= t.meta_valor * 0.9 THEN 'amarelo'
    ELSE 'vermelho'
  END AS status
FROM public.kpi_indicadores_taticos t
LEFT JOIN public.rh_funcionarios f ON f.id = t.lider_funcionario_id
LEFT JOIN ultimo_registro ur ON ur.indicador_id = t.id
LEFT JOIN periodo_atual pa ON pa.periodicidade = t.periodicidade
WHERE t.ativo = true;

GRANT SELECT ON public.vw_kpi_taticos_status TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Recria vw_kpi_trajetoria_atual · adiciona coluna `status` com nomes
--    unificados verde/amarelo/vermelho/pendente + filtra zeros tb
-- ----------------------------------------------------------------------------
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
    COALESCE(t.meta_valor, k.meta_valor) AS meta
  FROM public.kpi_indicadores_taticos k
  LEFT JOIN public.kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
)
SELECT
  k.id AS kpi_id,
  k.indicador,
  k.area,
  k.periodicidade,
  k.tipo_calculo,
  k.valores,                       -- usado por painel.js pra filtrar mandala
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
  -- Status unificado (verde/amarelo/vermelho/pendente)
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
  -- status_trajetoria · alias legado (no_alvo/atras/critico/sem_meta/sem_dado)
  -- Mantem ate confirmamos que /painel migrou pra `status`
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

COMMENT ON VIEW public.vw_kpi_trajetoria_atual IS
  'Status atual do KPI · ignora zeros como "ainda nao preenchido" · status unificado (verde/amarelo/vermelho/pendente) + status_trajetoria legado.';

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT kpi_id, ultimo_periodo, ultimo_valor, status, status_trajetoria
--     FROM vw_kpi_trajetoria_atual WHERE kpi_id IN ('SED-21','AMI-01','BRG-01');
--   Espera: ultimo_periodo nao mais W20=0 · ultimo_valor real (2069 etc)
--   status='verde' se valor >= meta
--
--   SELECT count(*), status FROM vw_kpi_trajetoria_atual GROUP BY status;
--   Espera: verde > 0, antes era 'sem_dado: 97'
-- ============================================================================
