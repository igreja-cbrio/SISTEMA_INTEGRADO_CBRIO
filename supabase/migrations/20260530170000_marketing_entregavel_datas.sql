-- ============================================================================
-- Marketing · REDESENHO · Fase 2 (ajustes pós-teste do Marcos) · datas do entregável
-- Cada entregavel (card materializado na triagem) ganha data_inicio + data_fim.
-- A "entrega interna" da campanha = max(data_fim) dos entregaveis · deve ficar
-- ANTES do prazo de entrega ao solicitante (buffer de revisao do Pedro).
-- ADITIVO · idempotente.
-- ============================================================================
BEGIN;

ALTER TABLE public.marketing_kanban_cards
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim    date;

COMMENT ON COLUMN public.marketing_kanban_cards.data_inicio IS
  'Inicio da producao do entregavel (Pedro define na triagem). Redesenho 2026-05-30.';
COMMENT ON COLUMN public.marketing_kanban_cards.data_fim IS
  'Fim previsto da producao do entregavel. A entrega interna da campanha = max(data_fim). Redesenho 2026-05-30.';

COMMIT;
