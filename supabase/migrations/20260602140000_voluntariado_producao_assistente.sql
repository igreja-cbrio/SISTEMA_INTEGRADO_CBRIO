-- ============================================================================
-- VOLUNTARIADO — Produção += posição "Assistente de Produção"
-- ----------------------------------------------------------------------------
-- Complemento ao seed 20260602130000 (pedido do Marcos · 2026-06-02).
-- ADITIVO e IDEMPOTENTE (ON CONFLICT (team_id, name)).
-- ============================================================================

DO $$
DECLARE
  t_id uuid;
BEGIN
  SELECT id INTO t_id FROM public.vol_teams WHERE name = 'Produção';
  IF t_id IS NULL THEN
    INSERT INTO public.vol_teams (name, description, color, sort_order, is_active)
    VALUES ('Produção', 'Equipe de produção dos cultos', '#6366F1', 40, true)
    RETURNING id INTO t_id;
  END IF;

  INSERT INTO public.vol_positions (team_id, name, description, min_volunteers, max_volunteers, sort_order, is_active) VALUES
    (t_id, 'Assistente de Produção', NULL, 1, NULL, 7, true)
  ON CONFLICT (team_id, name) DO UPDATE
    SET sort_order = EXCLUDED.sort_order, is_active = true;
END $$;
