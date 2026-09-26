-- ════════════════════════════════════════════════════════════════════════
-- Marketing · LINHA DO TEMPO · Fase 3 · checklist fecha a tarefa + rotina
-- (Marcos 2026-09-25 · depende de 20260925100000 e 20260925110000)
--
-- Aplicar junto com o deploy da aba Linha do tempo (não antes): a partir
-- daqui o checklist passa a mandar no estado do card também no Kanban.
--
--   1. Checklist → card: todas as subtarefas feitas ⇒ card 'concluido';
--      alguém DESMARCA uma ⇒ card volta para 'producao'. Só o desmarcar
--      explícito reabre: as 39 etapas fechadas em lote em 25/09 têm itens de
--      registro abertos e não podem reabrir sozinhas. Card sem checklist
--      continua sendo movido à mão, como hoje.
--   2. marketing_rotina_execucoes · a Rotina da linha do tempo. Cada
--      compromisso recorrente × pessoa × semana (domingo a sábado) pode ser
--      marcado como feito; a semana atual fica vermelha até fechar.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Checklist fecha e reabre o card ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_marketing_checklist_fecha_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card   uuid := COALESCE(NEW.card_id, OLD.card_id);
  v_total  int;
  v_abertos int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT feito)
    INTO v_total, v_abertos
    FROM public.marketing_card_checklist WHERE card_id = v_card;

  IF v_total > 0 AND v_abertos = 0 THEN
    UPDATE public.marketing_kanban_cards
       SET estado = 'concluido'
     WHERE id = v_card AND deleted_at IS NULL AND estado <> 'concluido';
  ELSIF TG_OP = 'UPDATE' AND OLD.feito AND NOT NEW.feito AND v_abertos > 0 THEN
    UPDATE public.marketing_kanban_cards
       SET estado = 'producao'
     WHERE id = v_card AND deleted_at IS NULL AND estado = 'concluido';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_marketing_checklist_fecha_card ON public.marketing_card_checklist;
CREATE TRIGGER tg_marketing_checklist_fecha_card
  AFTER INSERT OR DELETE OR UPDATE OF feito ON public.marketing_card_checklist
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_checklist_fecha_card();

-- ── 2. Rotina semanal ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_rotina_execucoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compromisso_id  uuid NOT NULL REFERENCES public.marketing_compromissos_recorrentes(id) ON DELETE CASCADE,
  membro_id       uuid NOT NULL REFERENCES public.marketing_membros(id) ON DELETE CASCADE,
  semana_inicio   date NOT NULL CHECK (EXTRACT(DOW FROM semana_inicio) = 0),
  concluido_em    timestamptz NOT NULL DEFAULT now(),
  concluido_por   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (compromisso_id, membro_id, semana_inicio)
);
CREATE INDEX IF NOT EXISTS idx_mkt_rotina_exec_semana
  ON public.marketing_rotina_execucoes (semana_inicio, membro_id);

COMMENT ON TABLE public.marketing_rotina_execucoes IS
  'Rotina da linha do tempo: 1 linha = a pessoa fez aquele compromisso recorrente naquela semana (semana_inicio = domingo). Sem linha = em aberto. Desmarcar = apagar a linha.';

ALTER TABLE public.marketing_rotina_execucoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_rotina_exec_service ON public.marketing_rotina_execucoes;
CREATE POLICY mkt_rotina_exec_service ON public.marketing_rotina_execucoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.marketing_rotina_execucoes FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_checklist_fecha_card() FROM PUBLIC, anon, authenticated;

-- ── Índices de leitura da linha do tempo (1 ano de cards por request) ───
CREATE INDEX IF NOT EXISTS idx_mkt_cards_linha
  ON public.marketing_kanban_cards (data_fim, prazo_preliminar) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_cards_campanha
  ON public.marketing_kanban_cards (campanha_id) WHERE deleted_at IS NULL;

COMMIT;
