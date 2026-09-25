-- ════════════════════════════════════════════════════════════════════════
-- Marketing · LINHA DO TEMPO · Fase 1 · fundação de dados
-- (Marcos 2026-09-25 · plano em docs/modulo-marketing/linha-do-tempo/README.md)
--
-- O que entra (nada disso muda o que o Kanban faz hoje):
--   1. Etiqueta de CULTO (cbrio · ami · kids) no card e na campanha, mais
--      prioridade e visibilidade (equipe · so_lider · lider_move) no card.
--   2. Checklist vira SUBTAREFA: quem faz (membro_id), horas previstas, prazo,
--      quando foi concluída (concluido_em / concluido_por) e registro de texto
--      obrigatório quando o item pede (conceito do briefing, report).
--   3. Datas para os indicadores de atraso:
--        card     · prazo_inicial (1ª data planejada, nunca muda) · concluido_em
--        campanha · triada_em / triada_por (saiu do "Sem responsável") · concluida_em
--   4. Histórico de remarcação de prazo (marketing_card_prazo_historico).
--   5. Backfill do que já existe.
--
-- Régua de datas: dia civil em America/Sao_Paulo.
-- Tabela nova nasce SEM privilégio para anon/authenticated (auditoria set/26):
-- o front lê tudo pelo backend (service_role).
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Etiqueta de culto ─────────────────────────────────────────────────
ALTER TABLE public.marketing_kanban_cards
  ADD COLUMN IF NOT EXISTS culto text
    CHECK (culto IN ('cbrio', 'ami', 'kids'));
ALTER TABLE public.marketing_campanhas
  ADD COLUMN IF NOT EXISTS culto text
    CHECK (culto IN ('cbrio', 'ami', 'kids'));

COMMENT ON COLUMN public.marketing_kanban_cards.culto IS
  'Etiqueta de culto da tarefa (cbrio · ami · kids). Numa série, cada etapa do ciclo tem uma tarefa por culto; cada pessoa vê a tarefa da sua etiqueta. NULL = sem etiqueta.';

-- ── 2. Datas do card ─────────────────────────────────────────────────────
ALTER TABLE public.marketing_kanban_cards
  ADD COLUMN IF NOT EXISTS prazo_inicial  date,
  ADD COLUMN IF NOT EXISTS concluido_em   timestamptz,
  ADD COLUMN IF NOT EXISTS atualizado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Prioridade (o Pedro etiqueta ao alocar um Pendente) e visibilidade da tarefa
ALTER TABLE public.marketing_kanban_cards
  ADD COLUMN IF NOT EXISTS prioridade   text CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  ADD COLUMN IF NOT EXISTS visibilidade text NOT NULL DEFAULT 'equipe'
    CHECK (visibilidade IN ('equipe', 'so_lider', 'lider_move'));

COMMENT ON COLUMN public.marketing_kanban_cards.visibilidade IS
  'equipe = regra normal (responsável vê tudo, demais só os seus itens) · so_lider = só o líder vê (ex.: Pré-briefing, marcar as reuniões) · lider_move = o responsável geral do culto vê, mas só o líder marca (ex.: Aprovação).';

COMMENT ON COLUMN public.marketing_kanban_cards.prazo_inicial IS
  'Primeira data planejada da tarefa. Gravada uma vez (trigger) e nunca mais muda: base do indicador "atraso contra o plano original".';
COMMENT ON COLUMN public.marketing_kanban_cards.concluido_em IS
  'Última conclusão (estado → concluido). Limpa se o card sair de concluido. Diferente de entregue_em, que guarda só a PRIMEIRA entrega.';
COMMENT ON COLUMN public.marketing_kanban_cards.atualizado_por IS
  'Quem fez a última alteração pelo backend (service_role não tem auth.uid). Alimenta o histórico de prazo.';

-- prazo "atual" do card, na régua de dia civil
CREATE OR REPLACE FUNCTION public.fn_marketing_card_prazo_atual(
  p_data_fim date, p_prazo_producao timestamptz, p_prazo_confirmado timestamptz, p_prazo_preliminar timestamptz
) RETURNS date
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    p_data_fim,
    (p_prazo_producao   AT TIME ZONE 'America/Sao_Paulo')::date,
    (p_prazo_confirmado AT TIME ZONE 'America/Sao_Paulo')::date,
    (p_prazo_preliminar AT TIME ZONE 'America/Sao_Paulo')::date
  );
$$;
REVOKE ALL ON FUNCTION public.fn_marketing_card_prazo_atual(date, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_marketing_card_datas_ts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- prazo_inicial: grava na primeira vez que o card tem alguma data
  IF NEW.prazo_inicial IS NULL THEN
    NEW.prazo_inicial := public.fn_marketing_card_prazo_atual(
      NEW.data_fim, NEW.prazo_producao, NEW.prazo_confirmado, NEW.prazo_preliminar);
  END IF;

  -- concluido_em acompanha o estado
  IF NEW.estado = 'concluido' THEN
    IF TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'concluido' THEN
      NEW.concluido_em := COALESCE(NEW.concluido_em, now());
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.estado = 'concluido' THEN
    NEW.concluido_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_marketing_card_datas_ts ON public.marketing_kanban_cards;
CREATE TRIGGER tg_marketing_card_datas_ts
  BEFORE INSERT OR UPDATE ON public.marketing_kanban_cards
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_card_datas_ts();

-- ── 3. Histórico de remarcação ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_card_prazo_historico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id       uuid NOT NULL REFERENCES public.marketing_kanban_cards(id) ON DELETE CASCADE,
  de            date,
  para          date,
  alterado_por  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  alterado_em   timestamptz NOT NULL DEFAULT now(),
  motivo        text
);
CREATE INDEX IF NOT EXISTS idx_mkt_prazo_hist_card ON public.marketing_card_prazo_historico (card_id, alterado_em);

COMMENT ON TABLE public.marketing_card_prazo_historico IS
  'Cada vez que o prazo atual de um card muda (data_fim / prazo_producao / prazo_confirmado / prazo_preliminar). Base dos indicadores de remarcação.';

CREATE OR REPLACE FUNCTION public.fn_marketing_card_prazo_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_de   date := public.fn_marketing_card_prazo_atual(OLD.data_fim, OLD.prazo_producao, OLD.prazo_confirmado, OLD.prazo_preliminar);
  v_para date := public.fn_marketing_card_prazo_atual(NEW.data_fim, NEW.prazo_producao, NEW.prazo_confirmado, NEW.prazo_preliminar);
BEGIN
  IF v_de IS DISTINCT FROM v_para AND v_de IS NOT NULL THEN
    INSERT INTO public.marketing_card_prazo_historico (card_id, de, para, alterado_por)
    VALUES (NEW.id, v_de, v_para, NEW.atualizado_por);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_marketing_card_prazo_log() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_marketing_card_prazo_log ON public.marketing_kanban_cards;
CREATE TRIGGER tg_marketing_card_prazo_log
  AFTER UPDATE OF data_fim, prazo_producao, prazo_confirmado, prazo_preliminar ON public.marketing_kanban_cards
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_card_prazo_log();

-- ── 4. Checklist vira subtarefa ──────────────────────────────────────────
ALTER TABLE public.marketing_card_checklist
  ADD COLUMN IF NOT EXISTS membro_id       uuid REFERENCES public.marketing_membros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS horas_previstas numeric(5,1) NOT NULL DEFAULT 0 CHECK (horas_previstas >= 0),
  ADD COLUMN IF NOT EXISTS prazo           date,
  ADD COLUMN IF NOT EXISTS concluido_em    timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_por   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exige_registro  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registro        text;

-- item que exige registro (conceito do briefing, report da aprovação) só fecha com texto
ALTER TABLE public.marketing_card_checklist
  DROP CONSTRAINT IF EXISTS marketing_checklist_registro_check;
ALTER TABLE public.marketing_card_checklist
  ADD CONSTRAINT marketing_checklist_registro_check
  CHECK (NOT feito OR NOT exige_registro OR COALESCE(btrim(registro), '') <> '');

COMMENT ON COLUMN public.marketing_card_checklist.registro IS
  'Texto registrado no item: o conceito decidido no briefing, o report da aprovação. Obrigatório para marcar quando exige_registro.';

COMMENT ON COLUMN public.marketing_card_checklist.membro_id IS
  'Quem faz esta subtarefa. NULL = o responsável do card. A linha do tempo mostra ao liderado só as subtarefas dele (ou todas, se ele for o responsável do card).';
COMMENT ON COLUMN public.marketing_card_checklist.horas_previstas IS
  'Horas que a pessoa deve gastar nesta subtarefa na semana do card. Soma no planner de carga horária.';

CREATE INDEX IF NOT EXISTS idx_mkt_checklist_membro_aberto
  ON public.marketing_card_checklist (membro_id) WHERE NOT feito;

CREATE OR REPLACE FUNCTION public.fn_marketing_checklist_conclusao_ts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.feito THEN
    IF TG_OP = 'INSERT' OR NOT OLD.feito THEN
      NEW.concluido_em := COALESCE(NEW.concluido_em, now());
    END IF;
  ELSE
    NEW.concluido_em  := NULL;
    NEW.concluido_por := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_marketing_checklist_conclusao_ts ON public.marketing_card_checklist;
CREATE TRIGGER tg_marketing_checklist_conclusao_ts
  BEFORE INSERT OR UPDATE ON public.marketing_card_checklist
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_checklist_conclusao_ts();

-- ── 5. Datas da campanha ─────────────────────────────────────────────────
ALTER TABLE public.marketing_campanhas
  ADD COLUMN IF NOT EXISTS triada_em    timestamptz,
  ADD COLUMN IF NOT EXISTS triada_por   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS concluida_em timestamptz;

COMMENT ON COLUMN public.marketing_campanhas.triada_em IS
  'Quando saiu da triagem ("Sem responsável" na linha do tempo). created_at → triada_em = tempo de espera pelo Pedro.';

CREATE OR REPLACE FUNCTION public.fn_marketing_campanha_datas_ts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'triagem' AND NEW.status <> 'triagem' AND NEW.triada_em IS NULL THEN
    NEW.triada_em := now();
  END IF;
  IF NEW.status = 'concluida' AND OLD.status IS DISTINCT FROM 'concluida' THEN
    NEW.concluida_em := COALESCE(NEW.concluida_em, now());
  ELSIF OLD.status = 'concluida' AND NEW.status <> 'concluida' THEN
    NEW.concluida_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_marketing_campanha_datas_ts ON public.marketing_campanhas;
CREATE TRIGGER tg_marketing_campanha_datas_ts
  BEFORE UPDATE OF status ON public.marketing_campanhas
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_campanha_datas_ts();

-- ── 6. Backfill ──────────────────────────────────────────────────────────
-- O trigger BEFORE UPDATE do card roda em cada UPDATE abaixo e já preenche prazo_inicial.
UPDATE public.marketing_kanban_cards
   SET concluido_em = COALESCE(entregue_em, estado_atualizado_em)
 WHERE estado = 'concluido' AND concluido_em IS NULL;

UPDATE public.marketing_kanban_cards
   SET prazo_inicial = public.fn_marketing_card_prazo_atual(data_fim, prazo_producao, prazo_confirmado, prazo_preliminar)
 WHERE prazo_inicial IS NULL;

-- checklist feito antes desta migration: melhor aproximação é o updated_at
UPDATE public.marketing_card_checklist
   SET concluido_em = updated_at
 WHERE feito AND concluido_em IS NULL;

-- triagem: 1º card criado para a campanha marca a saída da triagem
UPDATE public.marketing_campanhas c
   SET triada_em = x.primeiro
  FROM (SELECT campanha_id, min(created_at) AS primeiro
          FROM public.marketing_kanban_cards
         WHERE campanha_id IS NOT NULL
         GROUP BY campanha_id) x
 WHERE x.campanha_id = c.id AND c.status <> 'triagem' AND c.triada_em IS NULL;

UPDATE public.marketing_campanhas
   SET concluida_em = updated_at
 WHERE status = 'concluida' AND concluida_em IS NULL;

-- ── 7. RLS e privilégios da tabela nova ──────────────────────────────────
ALTER TABLE public.marketing_card_prazo_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_prazo_hist_service ON public.marketing_card_prazo_historico;
CREATE POLICY mkt_prazo_hist_service ON public.marketing_card_prazo_historico
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.marketing_card_prazo_historico FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_card_datas_ts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_checklist_conclusao_ts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_campanha_datas_ts() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Conferência depois de aplicar:
--   SELECT count(*) FILTER (WHERE prazo_inicial IS NULL) AS sem_prazo_inicial,
--          count(*) FILTER (WHERE estado = 'concluido' AND concluido_em IS NULL) AS concluido_sem_data
--     FROM public.marketing_kanban_cards WHERE deleted_at IS NULL;
