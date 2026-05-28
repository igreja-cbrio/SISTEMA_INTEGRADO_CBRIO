-- ============================================================================
-- MIGRATION · Marketing · Cards de ciclo criativo (Spec 022)
-- ============================================================================
-- Marcos: "as demandas de ciclo criativo que ficam no modulo de eventos
-- devem ser listadas aqui tambem, por fases · ai pode ficar com o pedro
-- paiva a responsabilidade de delegar · pode manter o preenchimento pelo
-- modulo de eventos mesmo · so um clique que abre la, ai vai ficar 100%"
--
-- Hoje: trigger fn_marketing_cards_evento_sync (Spec 004) escuta event_tasks.
-- Mas o ciclo criativo real usa cycle_phase_tasks (689 rows · 105 com
-- area=marketing). Trigger atual nao pega nada.
--
-- Mudanca:
-- 1. ADD COLUMN cycle_phase_task_id em marketing_kanban_cards (FK SET NULL)
-- 2. Atualiza CHECK constraint · origem=evento aceita EITHER evento_task_id
--    OR cycle_phase_task_id (mantem compat retro)
-- 3. UNIQUE parcial em cycle_phase_task_id (idempotencia)
-- 4. Trigger fn_marketing_cards_cycle_phase_sync (INSERT + UPDATE)
--    - Cria card quando area=marketing
--    - Sincroniza estado quando cycle_phase_tasks.status muda
-- 5. Backfill 105 cards (101 pendente · 4 concluida)
--
-- Pedro Paiva delega via atribuido_a no card (Marketing-side · nao toca cycle).
-- Preenchimento/conclusao continua no /eventos (Eventos-side).
-- ============================================================================

-- 1. ADD COLUMN
ALTER TABLE public.marketing_kanban_cards
  ADD COLUMN IF NOT EXISTS cycle_phase_task_id uuid
    REFERENCES public.cycle_phase_tasks(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.marketing_kanban_cards.cycle_phase_task_id IS
  'Spec 022 · referencia a tarefa de cycle_phase_tasks (ciclo criativo de eventos). origem=evento pode apontar pra cycle_phase_task_id OU evento_task_id (legacy).';

-- 2. UNIQUE parcial · 1 card por cycle_phase_task
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_cards_cycle_phase_task
  ON public.marketing_kanban_cards (cycle_phase_task_id)
  WHERE cycle_phase_task_id IS NOT NULL AND deleted_at IS NULL;

-- 3. CHECK constraint · permite origem=evento com EITHER
ALTER TABLE public.marketing_kanban_cards
  DROP CONSTRAINT IF EXISTS marketing_cards_origem_fk_check;

ALTER TABLE public.marketing_kanban_cards
  ADD CONSTRAINT marketing_cards_origem_fk_check CHECK (
    (origem = 'solicitacao' AND solicitacao_id IS NOT NULL AND evento_task_id IS NULL AND cycle_phase_task_id IS NULL) OR
    (origem = 'evento'      AND solicitacao_id IS NULL     AND (evento_task_id IS NOT NULL OR cycle_phase_task_id IS NOT NULL)) OR
    (origem = 'interna'     AND solicitacao_id IS NULL     AND evento_task_id IS NULL     AND cycle_phase_task_id IS NULL)
  );

-- 4. Trigger AFTER INSERT em cycle_phase_tasks
CREATE OR REPLACE FUNCTION public.fn_marketing_cards_cycle_phase_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card_id uuid;
  v_estado_card text;
BEGIN
  -- So mexe se area=marketing
  IF LOWER(COALESCE(NEW.area, '')) <> 'marketing' THEN
    -- Se mudou DE marketing pra outra coisa em UPDATE · soft-delete o card existente
    IF TG_OP = 'UPDATE' AND LOWER(COALESCE(OLD.area, '')) = 'marketing' THEN
      UPDATE public.marketing_kanban_cards
         SET deleted_at = now()
       WHERE cycle_phase_task_id = NEW.id AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Mapeia status do ciclo pra estado do card
  v_estado_card := CASE LOWER(COALESCE(NEW.status, ''))
    WHEN 'concluida' THEN 'concluido'
    WHEN 'em-andamento' THEN 'em_producao'
    ELSE 'fila'
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.marketing_kanban_cards (
      origem, cycle_phase_task_id, titulo, descricao,
      prazo_preliminar, estado, criado_por,
      entregue_em
    ) VALUES (
      'evento',
      NEW.id,
      NEW.titulo,
      NEW.descricao,
      CASE WHEN NEW.prazo IS NOT NULL THEN NEW.prazo::timestamptz ELSE NULL END,
      v_estado_card,
      NEW.created_by,
      CASE WHEN v_estado_card = 'concluido' THEN COALESCE(NEW.updated_at, now()) ELSE NULL END
    )
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- UPDATE · sincroniza estado + titulo + prazo se mudaram
  -- (mantem atribuicao do Marketing intacta · so reflete o que vem do ciclo)
  SELECT id INTO v_card_id
    FROM public.marketing_kanban_cards
   WHERE cycle_phase_task_id = NEW.id AND deleted_at IS NULL
   LIMIT 1;

  IF v_card_id IS NULL THEN
    -- Card nao existia (area mudou pra marketing AGORA) · cria
    INSERT INTO public.marketing_kanban_cards (
      origem, cycle_phase_task_id, titulo, descricao,
      prazo_preliminar, estado, criado_por,
      entregue_em
    ) VALUES (
      'evento',
      NEW.id,
      NEW.titulo,
      NEW.descricao,
      CASE WHEN NEW.prazo IS NOT NULL THEN NEW.prazo::timestamptz ELSE NULL END,
      v_estado_card,
      NEW.created_by,
      CASE WHEN v_estado_card = 'concluido' THEN COALESCE(NEW.updated_at, now()) ELSE NULL END
    )
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.marketing_kanban_cards
       SET titulo = NEW.titulo,
           descricao = NEW.descricao,
           prazo_preliminar = CASE WHEN NEW.prazo IS NOT NULL THEN NEW.prazo::timestamptz ELSE NULL END,
           estado = v_estado_card,
           entregue_em = CASE
             WHEN v_estado_card = 'concluido' AND entregue_em IS NULL THEN COALESCE(NEW.updated_at, now())
             ELSE entregue_em
           END
     WHERE id = v_card_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_cards_cycle_phase_sync() IS
  'Sync cycle_phase_tasks (area=marketing) → marketing_kanban_cards. Spec 022. Atribuicao no Marketing eh local (nao toca cycle_phase_tasks.responsavel_id). Status do ciclo dita estado do card.';

DROP TRIGGER IF EXISTS tg_marketing_cards_cycle_phase_sync ON public.cycle_phase_tasks;
CREATE TRIGGER tg_marketing_cards_cycle_phase_sync
  AFTER INSERT OR UPDATE OF area, status, titulo, descricao, prazo ON public.cycle_phase_tasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_cards_cycle_phase_sync();

-- 5. Backfill · 105 cards das cycle_phase_tasks ativas com area=marketing
INSERT INTO public.marketing_kanban_cards (
  origem, cycle_phase_task_id, titulo, descricao,
  prazo_preliminar, estado, criado_por, entregue_em
)
SELECT
  'evento',
  cpt.id,
  cpt.titulo,
  cpt.descricao,
  CASE WHEN cpt.prazo IS NOT NULL THEN cpt.prazo::timestamptz ELSE NULL END,
  CASE LOWER(COALESCE(cpt.status, ''))
    WHEN 'concluida' THEN 'concluido'
    WHEN 'em-andamento' THEN 'em_producao'
    ELSE 'fila'
  END,
  cpt.created_by,
  CASE WHEN LOWER(COALESCE(cpt.status, '')) = 'concluida' THEN cpt.updated_at ELSE NULL END
  FROM public.cycle_phase_tasks cpt
 WHERE LOWER(COALESCE(cpt.area, '')) = 'marketing'
ON CONFLICT DO NOTHING;
