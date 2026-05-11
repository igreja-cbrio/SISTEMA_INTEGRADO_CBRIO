-- ============================================================================
-- DROP · trigger legacy row-level que sobreviveu ao fix dos triggers
--
-- Origem: 20260507280000_fase6c_consolidada.sql criou tg_dados_brutos_recalc
-- (FOR EACH ROW). A migration 20260511100000 deveria ter dropado mas falhou
-- antes de chegar nessa linha.
--
-- Agora os triggers statement-level (ins/upd/del) cobrem o mesmo trabalho ·
-- esse legacy duplica chamadas a recalcular_kpis_por_dado.
-- ============================================================================

DROP TRIGGER IF EXISTS tg_dados_brutos_recalc ON public.dados_brutos;
DROP FUNCTION IF EXISTS public.tg_dados_brutos_recalcular_kpis();

-- Conferencia (descomenta no Studio):
-- SELECT tgname FROM pg_trigger
--  WHERE tgrelid = 'public.dados_brutos'::regclass AND NOT tgisinternal;
-- Espera: 4 linhas (set_updated_at + 3 recalc statement-level)
