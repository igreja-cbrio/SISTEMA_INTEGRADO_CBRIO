-- ============================================================================
-- Fix vw_kpi_taticos_status · status com meta + ultimo cronologico real
--
-- Marcos: "as metas todas estao com 0, mesmo o grafico estando preenchido,
--          em compensacao o servir a Jesus esta com dados e % na mandala
--          mesmo nao tendo nem grafico aparecendo nos objetivos".
--
-- Causa dos 2 bugs:
--
--  1. ORDER BY data_preenchimento DESC · o backfill de 14/05 criou TODOS os
--     2367 registros no mesmo dia. DISTINCT ON pegava aleatorio · pra SED-21
--     pegou W20 (semana atual, valor=0) em vez de W15 (valor=2069 real).
--     Card mostrava 0 mesmo com historico cheio.
--
--  2. Status era CASE WHEN ur.periodo_referencia = pa.periodo THEN 'verde'.
--     So checava "tem registro do periodo atual" · NAO comparava com meta.
--     KPI com valor=0 mas registro no periodo atual virava verde.
--     Mandala mostrava % de KPIs "verdes" inflado.
--
-- Fix:
--  - CTE ultimo_registro_valido filtra periodo_referencia <= periodo atual
--    (descarta lixo de periodos futuros gerados pelo backfill recorrente)
--  - ORDER BY periodo_referencia DESC (cronologico)
--  - Status compara com meta_valor (verde/amarelo/vermelho) · igual a logica
--    de vw_kpi_trajetoria_atual mas mantem nomes pra nao quebrar /painel
-- ============================================================================

DROP VIEW IF EXISTS public.vw_kpi_taticos_status;

CREATE VIEW public.vw_kpi_taticos_status AS
WITH periodo_atual AS (
  SELECT 'semanal'    AS periodicidade, to_char(now(), 'IYYY"-W"IW') AS periodo
  UNION ALL SELECT 'mensal',     to_char(now(), 'YYYY-MM')
  UNION ALL SELECT 'trimestral', to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q')
  UNION ALL SELECT 'semestral',  to_char(now(), 'YYYY') || '-S' || (CASE WHEN extract(month FROM now()) <= 6 THEN '1' ELSE '2' END)
  UNION ALL SELECT 'anual',      to_char(now(), 'YYYY')
),
-- Ultimo registro <= periodo atual da periodicidade do KPI · cronologico real
ultimo_registro AS (
  SELECT DISTINCT ON (r.indicador_id)
    r.indicador_id, r.periodo_referencia, r.valor_realizado,
    r.data_preenchimento, r.responsavel, r.observacoes, r.origem
  FROM public.kpi_registros r
  JOIN public.kpi_indicadores_taticos k ON k.id = r.indicador_id
  JOIN periodo_atual pa ON pa.periodicidade = k.periodicidade
  WHERE r.valor_realizado IS NOT NULL
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
  -- Status baseado em meta (igual vw_kpi_trajetoria_atual) com nomes
  -- legados pra nao quebrar /painel:
  CASE
    WHEN ur.valor_realizado IS NULL THEN 'pendente'
    WHEN t.meta_valor IS NULL OR t.meta_valor = 0 THEN
      -- KPI sem meta: verde se preencheu algo > 0, vermelho se zero
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

COMMENT ON VIEW public.vw_kpi_taticos_status IS
  'Status atual dos KPIs taticos · ultimo registro cronologico <= periodo atual · status verde/amarelo/vermelho/pendente comparado com meta_valor.';

-- ----------------------------------------------------------------------------
-- LIMPEZA do lixo do backfill · registros origem=auto valor=0 em periodos
-- futuros (criados pela funcao kpi_recalcular_para_data quando processou
-- cultos com data > hoje no schedule recorrente). Mantemos os zeros do passado
-- (podem ser legitimos · ex: semana sem culto). So tira o que e FUTURO.
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_removed int;
BEGIN
  DELETE FROM public.kpi_registros r
   USING public.kpi_indicadores_taticos k
   WHERE r.indicador_id = k.id
     AND r.origem = 'auto'
     AND r.valor_realizado = 0
     AND r.periodo_referencia > (
       CASE k.periodicidade
         WHEN 'semanal'    THEN to_char(now(), 'IYYY"-W"IW')
         WHEN 'mensal'     THEN to_char(now(), 'YYYY-MM')
         WHEN 'trimestral' THEN to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q')
         WHEN 'semestral'  THEN to_char(now(), 'YYYY') || '-S' || (CASE WHEN extract(month FROM now()) <= 6 THEN '1' ELSE '2' END)
         WHEN 'anual'      THEN to_char(now(), 'YYYY')
         ELSE to_char(now(), 'YYYY-MM')
       END
     );
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RAISE NOTICE 'Removidos % registros auto-zero de periodos futuros', v_removed;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT id, ultimo_periodo, ultimo_valor, status
--     FROM vw_kpi_taticos_status
--    WHERE id IN ('SED-21','AMI-01','BRG-01','SED-18','SED-20');
--   Espera: ultimo_periodo na semana <= W20, ultimo_valor real (nao zero
--   se houve dado), status comparado com meta.
-- ============================================================================
