-- ============================================================================
-- MIGRATION · Marketing · excluir evento não pode mais travar no card espelho
-- ============================================================================
-- Reportado pelo Marcos (14/08/2026) ao tentar excluir "Dia Reforma Protestante":
--
--   Erro ao excluir evento: new row for relation "marketing_kanban_cards"
--   violates check constraint "marketing_cards_origem_fk_check"
--
-- ⚠️⚠️ CAUSA-RAIZ · CONTRADIÇÃO DENTRO DO PRÓPRIO SCHEMA (20260528360000):
--
--   FK    · marketing_kanban_cards.cycle_phase_task_id
--             REFERENCES cycle_phase_tasks(id) ON DELETE SET NULL
--   CHECK · origem='evento' EXIGE
--             (evento_task_id IS NOT NULL OR cycle_phase_task_id IS NOT NULL)
--
-- Apagar o evento cascateia em `cycle_phase_tasks`; o SET NULL zera o ponteiro
-- do card espelho; o card fica origem='evento' com os DOIS ponteiros nulos e
-- viola o CHECK. O UPDATE do SET NULL falha e **aborta o DELETE do evento
-- inteiro**. Não é bug do evento da Reforma: bloqueia QUALQUER um dos 15
-- eventos que hoje têm card de marketing espelhando tarefa de ciclo.
--
-- É a lei nº 10 do CLAUDE.md pelo avesso: `ON DELETE SET NULL` não pode
-- conviver com CHECK que exige a coluna preenchida.
--
-- ⚠️ Por que NÃO é `ON DELETE CASCADE`: `marketing_kanban_cards` está na
-- whitelist `app_soft_deletable_tables()` (lei nº 2 — nunca DELETE direto em
-- tabela com deleted_at), e o card carrega estado LOCAL do Marketing (dono,
-- etiqueta, estado, checklist) que o /eventos não tem. Hard delete perderia
-- isso; soft-delete preserva.
--
-- A correção tem 2 partes, e as duas são necessárias:
--   1. Trigger BEFORE DELETE em cycle_phase_tasks → SOFT-DELETA o card espelho.
--      Sem isso o card sobreviveria VIVO e sem ponteiro: órfão eterno no Kanban.
--   2. CHECK passa a exigir o ponteiro só de card VIVO. Card apagado não precisa
--      apontar pra nada — e é o que permite o SET NULL concluir.
--
-- ⚠️ Aditiva e SEM perda: o CHECK novo é MAIS PERMISSIVO que o antigo (só
-- dispensa a exigência quando deleted_at IS NOT NULL), então nenhuma linha
-- existente pode passar a violar. Idempotente.
-- ============================================================================

-- 1 · Trigger: a tarefa do ciclo morre → o card espelho é soft-deletado ANTES,
--     na mesma transação. Roda BEFORE DELETE, então acontece antes da ação
--     referencial (o SET NULL da FK).
CREATE OR REPLACE FUNCTION public.fn_marketing_card_espelho_ao_apagar_tarefa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Guarda `.is('deleted_at', null)` pra ser idempotente: card já apagado
  -- (pela equipe, por exemplo) conserva a data original da exclusão.
  UPDATE public.marketing_kanban_cards
     SET deleted_at = now(),
         updated_at = now()
   WHERE cycle_phase_task_id = OLD.id
     AND deleted_at IS NULL;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_card_espelho_ao_apagar_tarefa() IS
  'Soft-deleta o card espelho do Marketing quando a cycle_phase_tasks de origem e apagada. Sem isto o ON DELETE SET NULL da FK deixaria o card vivo e sem ponteiro (orfao no Kanban) e violaria marketing_cards_origem_fk_check, abortando o DELETE do evento.';

DROP TRIGGER IF EXISTS tg_marketing_card_espelho_ao_apagar_tarefa
  ON public.cycle_phase_tasks;

CREATE TRIGGER tg_marketing_card_espelho_ao_apagar_tarefa
  BEFORE DELETE ON public.cycle_phase_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_marketing_card_espelho_ao_apagar_tarefa();

-- 2 · CHECK: card VIVO de origem=evento continua exigindo um ponteiro; card
--     APAGADO fica livre (é o que deixa o SET NULL concluir).
ALTER TABLE public.marketing_kanban_cards
  DROP CONSTRAINT IF EXISTS marketing_cards_origem_fk_check;

ALTER TABLE public.marketing_kanban_cards
  ADD CONSTRAINT marketing_cards_origem_fk_check CHECK (
    (origem = 'solicitacao' AND solicitacao_id IS NOT NULL AND evento_task_id IS NULL AND cycle_phase_task_id IS NULL) OR
    (origem = 'evento'      AND solicitacao_id IS NULL     AND (
                                  evento_task_id IS NOT NULL
                               OR cycle_phase_task_id IS NOT NULL
                               OR deleted_at IS NOT NULL)) OR
    (origem = 'interna'     AND solicitacao_id IS NULL     AND evento_task_id IS NULL     AND cycle_phase_task_id IS NULL)
  );

COMMENT ON CONSTRAINT marketing_cards_origem_fk_check ON public.marketing_kanban_cards IS
  'origem=evento exige ponteiro (evento_task_id OU cycle_phase_task_id) SO enquanto o card esta VIVO. Card soft-deletado fica livre: e o que permite o ON DELETE SET NULL da FK concluir quando o evento (e suas cycle_phase_tasks) e apagado. Ver migration 20260814190000.';
