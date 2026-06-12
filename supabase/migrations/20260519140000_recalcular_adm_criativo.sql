-- ============================================================================
-- Fix · forca recalculo dos KPIs ADM Criativo (ADM-C-*)
--
-- Diagnostico em 2026-05-19:
-- - ADM-G-* (Gestao SLA · 8 areas)   · periodo inicializado, valor NULL ok
-- - ADM-Q-* (Gestao NPS · 8 areas)   · periodo inicializado, valor NULL ok
-- - ADM-C-G-* e ADM-C-Q-* (Criativo) · NUNCA calculados (periodo NULL)
--
-- Causa: a migration `20260512280000_okr_criativo_seed.sql` cria os KPIs
-- ADM-C-* mas nao chama recalcular_todos_kpis_adm() ao final · como o
-- trigger de solicitacoes so dispara em INSERT/UPDATE/DELETE, sem solicitacao
-- nas areas producao/adoracao/marketing nenhuma linha foi criada em
-- kpi_valores_calculados.
--
-- Esta migration corrige isso chamando recalcular_todos_kpis_adm(). Mesmo
-- sem solicitacoes nas areas criativas, vai criar as linhas com valor NULL
-- (igual aos ADM-G-* / ADM-Q-*), deixando o painel/carrossel consistente.
-- ============================================================================

DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.recalcular_todos_kpis_adm();
  RAISE NOTICE 'KPIs ADM recalculados (fix Criativo): %', v;
END $$;

-- Conferencia (opcional, descomente no Studio):
-- SELECT k.id, k.indicador, k.formula_config->>'area_responsavel' AS area,
--        kv.periodo_referencia, kv.valor_calculado, kv.calculado_em
--   FROM kpi_indicadores_taticos k
--   LEFT JOIN kpi_valores_calculados kv ON kv.kpi_id = k.id
--  WHERE k.id LIKE 'ADM-C-%'
--  ORDER BY k.id;
-- Espera: 6 rows com calculado_em preenchido (mesmo que valor_calculado=NULL)
