-- ============================================================================
-- Marketing · checklists no card + anexos de referencia (input)
-- Marcos 2026-05-29: inspirado no Trello do Pedro (board "Institucional"). O card
-- ganha (1) checklists internos (sub-itens com % de progresso, agrupaveis por
-- "frente": ID e Estrategia, Enxoval, Telao Palco...) e (2) distincao entre
-- arquivo de REFERENCIA (input/briefing) e ENTREGAVEL final (output).
--
-- 1) tabela marketing_card_checklist + RLS
-- 2) coluna tipo em marketing_entregaveis ('entregavel' default | 'referencia')
-- Idempotente. Nao destrutivo (so ADD).
-- ============================================================================
BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Checklists do card (sub-itens · estilo Trello)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_card_checklist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     uuid NOT NULL REFERENCES public.marketing_kanban_cards(id) ON DELETE CASCADE,
  grupo       text,                        -- "frente" opcional (ID e Estrategia, Enxoval, Telao Palco...)
  texto       text NOT NULL,
  feito       boolean NOT NULL DEFAULT false,
  ordem       bigserial,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.marketing_card_checklist IS
  'Sub-itens (checklist) de um card de marketing · agrupaveis por frente (grupo). Inspirado nos checklists do Trello do Pedro. Marcos 2026-05-29.';

CREATE INDEX IF NOT EXISTS idx_marketing_card_checklist_card
  ON public.marketing_card_checklist (card_id, ordem);

ALTER TABLE public.marketing_card_checklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_card_checklist_select  ON public.marketing_card_checklist;
DROP POLICY IF EXISTS mkt_card_checklist_service ON public.marketing_card_checklist;
CREATE POLICY mkt_card_checklist_select  ON public.marketing_card_checklist
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mkt_card_checklist_service ON public.marketing_card_checklist
  FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Tipo do anexo · referencia (input/briefing) vs entregavel (output final)
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.marketing_entregaveis
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'entregavel'
    CHECK (tipo IN ('entregavel', 'referencia'));

COMMENT ON COLUMN public.marketing_entregaveis.tipo IS
  'entregavel = arquivo final (output) · referencia = briefing/inspiracao (input). Marcos 2026-05-29.';

COMMIT;
