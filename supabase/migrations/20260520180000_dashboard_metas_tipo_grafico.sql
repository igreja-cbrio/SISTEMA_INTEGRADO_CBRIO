-- ============================================================================
-- Dashboard Semanal · adiciona tipo_grafico em dashboard_metas
--
-- Permite escolher a visualizacao da meta:
--   - barra  · barra de progresso horizontal (atual)
--   - gauge  · semicirculo com ponteiro (novo)
-- ============================================================================

ALTER TABLE public.dashboard_metas
  ADD COLUMN IF NOT EXISTS tipo_grafico text NOT NULL DEFAULT 'barra'
    CHECK (tipo_grafico IN ('barra', 'gauge'));

COMMENT ON COLUMN public.dashboard_metas.tipo_grafico IS
  'Visualizacao do progresso: barra (horizontal) ou gauge (semicirculo com ponteiro)';
