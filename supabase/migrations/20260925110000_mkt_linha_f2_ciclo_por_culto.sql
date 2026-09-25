-- ════════════════════════════════════════════════════════════════════════
-- Marketing · LINHA DO TEMPO · Fase 2 · ciclo criativo por culto
-- (Marcos 2026-09-25 · depende de 20260925100000_mkt_linha_f1_fundacao)
--
-- Regra do Marcos: toda série tem o MESMO ciclo rodando junto para CBRio, AMI
-- e Kids. Cada etapa do ciclo gera UMA TAREFA POR CULTO (etiqueta), e cada
-- pessoa vê a tarefa da sua etiqueta.
--   CBRio e AMI · responsável geral Cauã · roteiro com o Allan
--   Kids        · responsável geral Letícia · post nas redes com a Lorena
--   Cauã não tem tarefa no Kids · Letícia não tem tarefa em CBRio e AMI
--
-- O que entra:
--   1. marketing_categoria_cultos · quais cultos uma categoria de evento gera
--      (Série → cbrio, ami, kids).
--   2. marketing_evento_cultos · exceção por evento (ex.: retiro só do AMI).
--   3. marketing_ciclo_padroes ganha `culto` · responsável geral por
--      (categoria × fase × culto). Linha com culto NULL continua valendo como
--      padrão genérico.
--   4. marketing_ciclo_itens_padrao · as subtarefas de cada (categoria × fase
--      × culto) com quem faz e horas. Nascem no checklist do card.
--   5. fn_marketing_cards_cycle_phase_sync reescrita: 1 card por culto.
--      Muda também a regra de estado: o ciclo só FECHA o card (concluida);
--      o andamento é do Marketing (antes, qualquer UPDATE do ciclo voltava o
--      card para 'fila' · e 'em_andamento' com underscore nunca casava).
--   6. Volta: quando todas as tarefas de culto de uma etapa terminam, a
--      tarefa do ciclo (cycle_phase_tasks) é concluída sozinha.
--   7. fn_marketing_ciclo_gerar_cultos(event_id) · backfill de eventos futuros.
--
-- ⚠ cycle_phase_tasks / event_cycle_phases / events foram criadas FORA do git.
--   Rodar antes docs/modulo-marketing/linha-do-tempo/00_verificacao_banco_vivo.sql
--   e conferir: cycle_phase_tasks.prazo é date, status usa 'concluida'.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1 e 2. Cultos por categoria e por evento ────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_categoria_cultos (
  category_id uuid NOT NULL REFERENCES public.event_categories(id) ON DELETE CASCADE,
  culto       text NOT NULL CHECK (culto IN ('cbrio', 'ami', 'kids')),
  PRIMARY KEY (category_id, culto)
);
COMMENT ON TABLE public.marketing_categoria_cultos IS
  'Quais cultos o ciclo criativo de uma categoria de evento gera. Série → cbrio, ami, kids. Categoria sem linha aqui gera 1 card sem etiqueta (comportamento antigo).';

CREATE TABLE IF NOT EXISTS public.marketing_evento_cultos (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  culto    text NOT NULL CHECK (culto IN ('cbrio', 'ami', 'kids')),
  PRIMARY KEY (event_id, culto)
);
COMMENT ON TABLE public.marketing_evento_cultos IS
  'Exceção por evento. Se o evento tem linhas aqui, elas substituem as da categoria.';

INSERT INTO public.marketing_categoria_cultos (category_id, culto)
SELECT c.id, x.culto
  FROM public.event_categories c
 CROSS JOIN (VALUES ('cbrio'), ('ami'), ('kids')) AS x(culto)
 WHERE c.name IN ('Série', 'Serie', 'Séries')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_marketing_cultos_do_evento(p_event_id uuid)
RETURNS SETOF text
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.marketing_evento_cultos WHERE event_id = p_event_id) THEN
    RETURN QUERY SELECT culto FROM public.marketing_evento_cultos WHERE event_id = p_event_id ORDER BY 1;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT cc.culto FROM public.marketing_categoria_cultos cc
      JOIN public.events e ON e.category_id = cc.category_id
     WHERE e.id = p_event_id ORDER BY 1;
  IF NOT FOUND THEN
    RETURN NEXT NULL;   -- sem configuração: 1 card sem etiqueta
  END IF;
END;
$$;

-- ── 3. Responsável geral por culto ──────────────────────────────────────
ALTER TABLE public.marketing_ciclo_padroes
  ADD COLUMN IF NOT EXISTS culto text CHECK (culto IN ('cbrio', 'ami', 'kids'));
ALTER TABLE public.marketing_ciclo_padroes
  DROP CONSTRAINT IF EXISTS marketing_ciclo_padroes_category_id_nome_fase_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_ciclo_padroes_fase_culto
  ON public.marketing_ciclo_padroes (category_id, nome_fase, COALESCE(culto, '*'));

COMMENT ON COLUMN public.marketing_ciclo_padroes.culto IS
  'NULL = vale para qualquer culto. Com culto, ganha da linha genérica.';

-- ── 4. Subtarefas padrão ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_ciclo_itens_padrao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES public.event_categories(id) ON DELETE CASCADE,
  nome_fase       text NOT NULL,
  culto           text CHECK (culto IN ('cbrio', 'ami', 'kids')),
  tarefa_titulo   text,
  texto           text NOT NULL,
  membro_id       uuid REFERENCES public.marketing_membros(id) ON DELETE SET NULL,
  horas_previstas numeric(5,1) NOT NULL DEFAULT 0 CHECK (horas_previstas >= 0),
  ordem           int  NOT NULL DEFAULT 0,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_itens_padrao_chave
  ON public.marketing_ciclo_itens_padrao (category_id, nome_fase) WHERE ativo;

COMMENT ON TABLE public.marketing_ciclo_itens_padrao IS
  'Subtarefas que nascem no checklist de cada card de ciclo, por (categoria × fase × culto). culto NULL = todos. tarefa_titulo NULL = qualquer tarefa de marketing da fase; preenchido = só a tarefa do ciclo com esse título. membro_id NULL = o responsável do card.';

-- Responsável geral por culto para a categoria Série (todas as fases de
-- marketing do ciclo). Procura a pessoa pelo nome · se não achar, avisa e segue.
DO $$
DECLARE
  v_serie  uuid;
  v_caua   uuid;
  v_let    uuid;
  v_n      int;
BEGIN
  SELECT id INTO v_serie FROM public.event_categories WHERE name IN ('Série', 'Serie', 'Séries') LIMIT 1;
  SELECT m.id INTO v_caua FROM public.marketing_membros m JOIN public.profiles p ON p.id = m.profile_id
   WHERE m.ativo AND m.deleted_at IS NULL AND m.habilidade <> 'coordenador' AND p.name ILIKE 'Cau%' LIMIT 1;
  SELECT m.id INTO v_let FROM public.marketing_membros m JOIN public.profiles p ON p.id = m.profile_id
   WHERE m.ativo AND m.deleted_at IS NULL AND m.habilidade <> 'coordenador' AND p.name ILIKE 'Let%cia%' LIMIT 1;

  IF v_serie IS NULL OR v_caua IS NULL OR v_let IS NULL THEN
    RAISE NOTICE 'Seed de responsáveis pulado · serie=% caua=% leticia=%', v_serie, v_caua, v_let;
    RETURN;
  END IF;

  INSERT INTO public.marketing_ciclo_padroes (category_id, nome_fase, culto, atribuido_a, ativo)
  SELECT v_serie, f.nome, x.culto, CASE x.culto WHEN 'kids' THEN v_let ELSE v_caua END, true
    FROM (SELECT DISTINCT nome FROM public.cycle_phase_templates
           WHERE (category_id IS NULL OR category_id = v_serie)
             AND area IN ('marketing', 'ambos')) f
   CROSS JOIN (VALUES ('cbrio'), ('ami'), ('kids')) AS x(culto)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Responsáveis gerais semeados: % linhas', v_n;
END $$;

-- ── 5. Espelho ciclo → cards, um por culto ──────────────────────────────
DROP INDEX IF EXISTS public.uq_marketing_cards_cycle_phase_task;
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_cards_cycle_phase_task_culto
  ON public.marketing_kanban_cards (cycle_phase_task_id, COALESCE(culto, '*'))
  WHERE cycle_phase_task_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.fn_marketing_ciclo_sync_tarefa(p_task_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t           record;
  v_cat       uuid;
  v_fase      text;
  v_culto     text;
  v_card      uuid;
  v_etiqueta  uuid;
  v_atribuido uuid;
  v_concluida boolean;
  v_criados   int := 0;
BEGIN
  SELECT * INTO t FROM public.cycle_phase_tasks WHERE id = p_task_id;
  IF NOT FOUND OR LOWER(COALESCE(t.area, '')) <> 'marketing' THEN
    RETURN 0;
  END IF;
  SELECT e.category_id INTO v_cat FROM public.events e WHERE e.id = t.event_id;
  SELECT ecp.nome_fase INTO v_fase FROM public.event_cycle_phases ecp WHERE ecp.id = t.event_phase_id;
  v_concluida := LOWER(COALESCE(t.status, '')) = 'concluida';

  FOR v_culto IN SELECT * FROM public.fn_marketing_cultos_do_evento(t.event_id) LOOP
    v_card := NULL;
    SELECT id INTO v_card FROM public.marketing_kanban_cards
     WHERE cycle_phase_task_id = t.id AND culto IS NOT DISTINCT FROM v_culto AND deleted_at IS NULL
     LIMIT 1;

    IF v_card IS NULL THEN
      v_etiqueta := NULL; v_atribuido := NULL;
      SELECT p.etiqueta_tipo_id, p.atribuido_a INTO v_etiqueta, v_atribuido
        FROM public.marketing_ciclo_padroes p
       WHERE p.category_id = v_cat AND p.nome_fase = v_fase AND p.ativo
         AND (p.culto IS NOT DISTINCT FROM v_culto OR p.culto IS NULL)
       ORDER BY (p.culto IS NULL)
       LIMIT 1;

      INSERT INTO public.marketing_kanban_cards (
        origem, cycle_phase_task_id, culto, titulo, descricao,
        etiqueta_tipo_id, atribuido_a, prazo_preliminar, estado, criado_por
      ) VALUES (
        'evento', t.id, v_culto, t.titulo, t.descricao,
        v_etiqueta, v_atribuido,
        CASE WHEN t.prazo IS NOT NULL THEN t.prazo::timestamptz END,
        CASE WHEN v_concluida THEN 'concluido' ELSE 'backlog' END,
        t.created_by
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_card;

      IF v_card IS NOT NULL THEN
        v_criados := v_criados + 1;
        INSERT INTO public.marketing_card_checklist (card_id, grupo, texto, membro_id, horas_previstas, prazo)
        SELECT v_card, v_fase, i.texto, i.membro_id, i.horas_previstas, t.prazo::date
          FROM public.marketing_ciclo_itens_padrao i
         WHERE i.ativo AND i.category_id = v_cat AND i.nome_fase = v_fase
           AND (i.culto IS NULL OR i.culto IS NOT DISTINCT FROM v_culto)
           AND (i.tarefa_titulo IS NULL OR i.tarefa_titulo = t.titulo)
         ORDER BY i.ordem, i.created_at;
      END IF;
    ELSE
      -- o ciclo manda no título, na descrição e no prazo; no estado, só fecha
      UPDATE public.marketing_kanban_cards
         SET titulo = t.titulo,
             descricao = t.descricao,
             prazo_preliminar = CASE WHEN t.prazo IS NOT NULL THEN t.prazo::timestamptz END,
             estado = CASE WHEN v_concluida THEN 'concluido' ELSE estado END
       WHERE id = v_card
         AND (titulo IS DISTINCT FROM t.titulo
           OR descricao IS DISTINCT FROM t.descricao
           OR prazo_preliminar IS DISTINCT FROM CASE WHEN t.prazo IS NOT NULL THEN t.prazo::timestamptz END
           OR (v_concluida AND estado <> 'concluido'));
    END IF;
  END LOOP;
  RETURN v_criados;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_marketing_cards_cycle_phase_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF LOWER(COALESCE(NEW.area, '')) <> 'marketing' THEN
    IF TG_OP = 'UPDATE' AND LOWER(COALESCE(OLD.area, '')) = 'marketing' THEN
      UPDATE public.marketing_kanban_cards
         SET deleted_at = now()
       WHERE cycle_phase_task_id = NEW.id AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
  END IF;
  PERFORM public.fn_marketing_ciclo_sync_tarefa(NEW.id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_cards_cycle_phase_sync() IS
  'Linha do tempo (2026-09-25): cycle_phase_tasks (area=marketing) → 1 card por culto do evento (fn_marketing_cultos_do_evento), com responsável de marketing_ciclo_padroes e checklist de marketing_ciclo_itens_padrao. O ciclo só FECHA o card; o andamento é do Marketing.';
-- O trigger tg_marketing_cards_cycle_phase_sync (20260528360000) já aponta para esta função.

-- ── 6. Volta: todas as tarefas de culto concluídas → conclui a do ciclo ──
CREATE OR REPLACE FUNCTION public.fn_marketing_card_conclui_tarefa_ciclo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.marketing_kanban_cards
     WHERE cycle_phase_task_id = NEW.cycle_phase_task_id
       AND deleted_at IS NULL AND estado <> 'concluido'
  ) THEN
    UPDATE public.cycle_phase_tasks
       SET status = 'concluida'
     WHERE id = NEW.cycle_phase_task_id
       AND LOWER(COALESCE(status, '')) <> 'concluida';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_marketing_card_conclui_tarefa_ciclo ON public.marketing_kanban_cards;
CREATE TRIGGER tg_marketing_card_conclui_tarefa_ciclo
  AFTER UPDATE OF estado ON public.marketing_kanban_cards
  FOR EACH ROW
  WHEN (NEW.cycle_phase_task_id IS NOT NULL AND NEW.estado = 'concluido' AND OLD.estado IS DISTINCT FROM 'concluido')
  EXECUTE FUNCTION public.fn_marketing_card_conclui_tarefa_ciclo();

-- ── 7. Backfill de eventos futuros ──────────────────────────────────────
-- Card antigo sem etiqueta vira o do 1º culto (guarda histórico e dono);
-- os outros cultos nascem pela função de sync.
CREATE OR REPLACE FUNCTION public.fn_marketing_ciclo_gerar_cultos(p_event_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_primeiro text;
  v_task     uuid;
  v_total    int := 0;
BEGIN
  SELECT c INTO v_primeiro FROM public.fn_marketing_cultos_do_evento(p_event_id) c LIMIT 1;
  IF v_primeiro IS NOT NULL THEN
    UPDATE public.marketing_kanban_cards k
       SET culto = v_primeiro
      FROM public.cycle_phase_tasks t
     WHERE k.cycle_phase_task_id = t.id AND t.event_id = p_event_id
       AND k.culto IS NULL AND k.deleted_at IS NULL;
  END IF;
  FOR v_task IN
    SELECT id FROM public.cycle_phase_tasks
     WHERE event_id = p_event_id AND LOWER(COALESCE(area, '')) = 'marketing'
  LOOP
    v_total := v_total + public.fn_marketing_ciclo_sync_tarefa(v_task);
  END LOOP;
  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_ciclo_gerar_cultos(uuid) IS
  'Gera os cards de culto que faltam para um evento. Uso: SELECT e.name, fn_marketing_ciclo_gerar_cultos(e.id) FROM events e WHERE e.date >= current_date AND e.category_id = <série>;';

-- ── RLS e privilégios ───────────────────────────────────────────────────
ALTER TABLE public.marketing_categoria_cultos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_evento_cultos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ciclo_itens_padrao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_cat_cultos_service   ON public.marketing_categoria_cultos;
DROP POLICY IF EXISTS mkt_evt_cultos_service   ON public.marketing_evento_cultos;
DROP POLICY IF EXISTS mkt_itens_padrao_service ON public.marketing_ciclo_itens_padrao;
CREATE POLICY mkt_cat_cultos_service   ON public.marketing_categoria_cultos   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY mkt_evt_cultos_service   ON public.marketing_evento_cultos      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY mkt_itens_padrao_service ON public.marketing_ciclo_itens_padrao FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.marketing_categoria_cultos, public.marketing_evento_cultos, public.marketing_ciclo_itens_padrao FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_cultos_do_evento(uuid)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_ciclo_sync_tarefa(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_ciclo_gerar_cultos(uuid)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_card_conclui_tarefa_ciclo()  FROM PUBLIC, anon, authenticated;

COMMIT;

-- Depois de aplicar (e com os itens padrão cadastrados pelo Pedro):
--   SELECT e.name, e.date, public.fn_marketing_ciclo_gerar_cultos(e.id) AS cards_novos
--     FROM public.events e JOIN public.event_categories c ON c.id = e.category_id
--    WHERE c.name IN ('Série','Serie','Séries') AND e.date >= current_date
--    ORDER BY e.date;
