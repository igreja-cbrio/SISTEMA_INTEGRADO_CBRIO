-- ============================================================================
-- KPIs semanais · comparacao migra pra ano_anterior (YoY)
-- ============================================================================
-- 22 KPIs alvo · todos com periodicidade='semanal' e tipo_calculo delta_*.
-- Migra `semana_anterior` e `ciclo_anterior` → `ano_anterior`.
--
-- Mensais/semestrais NAO alteram (Marcos: "coloca so nos semanais").
-- evento_anterior NAO altera (KPIs de batismos vs ultimo evento).
--
-- Categorias afetadas:
--   - Frequencia (5 areas)              · AMI-01, BRG-01, KIDS-01, ONL-11, SED-21
--   - Conversoes (6 areas)              · AMI-02, BRG-02, KIDS-02, ONL-13, SED-18, CBA-02
--   - Frequencia NEXT (5 areas)         · AMI-03, BRG-04, KIDS-12, ONL-12, SED-23
--   - NPS NEXT (5 areas)                · AMI-25, BRG-24, KIDS-23, ONL-25, SED-26
--   - YouTube comentarios (online)      · MKT-ONL-COMENT-CRESC
--
-- Pos-migration: cache recalcula automatico via trigger SQL
-- (tg_cultos_recalc_kpis, tg_dados_brutos_*). Pra rodar manual agora:
--   SELECT kpi_recalcular_para_data(CURRENT_DATE);
-- ============================================================================

UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(formula_config, '{comparacao}', '"ano_anterior"'),
       updated_at = now()
 WHERE ativo = true
   AND periodicidade = 'semanal'
   AND tipo_calculo IN ('delta_pct', 'delta_abs')
   AND formula_config->>'comparacao' IN ('semana_anterior', 'ciclo_anterior');

-- Conferencia:
--   SELECT id, area, indicador, formula_config->>'comparacao' AS cmp
--     FROM kpi_indicadores_taticos
--    WHERE ativo = true AND periodicidade = 'semanal'
--      AND tipo_calculo IN ('delta_pct', 'delta_abs')
--    ORDER BY id;
-- Esperado: 22 linhas com cmp='ano_anterior'

-- Forca recalculo agora (cache ja vai apontar pra W-1 do ano anterior)
SELECT public.kpi_recalcular_para_data(CURRENT_DATE);
-- ============================================================================
