-- ════════════════════════════════════════════════════════════════════════
-- Marketing · LINHA DO TEMPO · Fase 2 · ciclo criativo por FASE × CULTO
-- (Marcos 2026-09-25 · depende de 20260925100000_mkt_linha_f1_fundacao)
--
-- Regras do Marcos (25/09):
--   • Toda série tem o MESMO ciclo para CBRio, AMI e Kids. Nenhuma etapa a
--     menos ou a mais para nenhum culto ⇒ 1 tarefa por FASE × CULTO.
--   • "(Cauã, Letícia)" = Cauã fica com CBRio e AMI, Letícia com Kids.
--   • Pré-briefing: o Pedro marca as 3 reuniões · só ele vê.
--   • Briefing: o responsável do culto registra o conceito decidido na reunião.
--   • Brainstorming e Conceito: Defesa e MoodBoard (Cauã/Letícia) · Referências
--     para redes (Lorena · o Pedro pode passar alguma para a Letícia).
--   • Identidade e Estratégia: Roteirização (Allan) · Logo, Cores, Tipografia,
--     Apresentação visual (Cauã/Letícia) · Planejamento de redes (Lorena).
--   • Aprovação: reunião e report são do Pedro · a equipe vê, só ele marca.
--   • Execução Estratégica: Institucional, PPT Capa, PPT Miolo, Thumbs, Telas
--     laterais, Horários do culto, Tela generosidade (Cauã/Letícia) · Vídeo
--     Instagram (Allan) · Conteúdos para redes (Allan e Lorena).
--   • Pré-Testes: o Pedro acompanha os testes do que foi produzido.
--
-- Por que por FASE e não por cycle_phase_tasks: as tarefas do ciclo vêm de
-- adm_task_templates (módulo Eventos) e não cobrem todas as fases do Marketing
-- (Pré-briefing, Aprovação). O Marketing passa a gerar a sua lista a partir
-- de event_cycle_phases + marketing_ciclo_padroes. Categoria SEM cultos
-- configurados segue no espelho antigo (cycle_phase_tasks → card).
--
-- O que entra:
--   1. marketing_categoria_cultos (Série → cbrio, ami, kids) e
--      marketing_evento_cultos (exceção por evento).
--   2. marketing_ciclo_padroes ganha culto + visibilidade · 1 linha por fase
--      que o Marketing tem · fase sem linha não gera tarefa.
--   3. marketing_ciclo_itens_padrao · subtarefas por fase × culto.
--   4. Card ganha event_id / event_phase_id · UNIQUE (fase, culto).
--   5. Trigger em event_cycle_phases: fase nasce ⇒ tarefas nascem; datas da
--      fase mudam ⇒ datas das tarefas acompanham (se ninguém remarcou à mão).
--   6. Espelho antigo pula eventos por culto (sem card duplicado) e passa a
--      aceitar 'em_andamento' com underscore.
--   7. Volta: todas as tarefas de culto da fase concluídas ⇒ as
--      cycle_phase_tasks de marketing daquela fase ficam 'concluida'.
--   8. fn_marketing_ciclo_gerar_evento(event_id) · backfill.
--   9. Seed da matriz acima (procura as pessoas pelo nome · avisa o que faltar).
--
-- ⚠ events / event_cycle_phases / cycle_phase_tasks foram criadas FORA do git:
--   rodar antes docs/modulo-marketing/linha-do-tempo/00_verificacao_banco_vivo.sql.
--   Os nomes das fases da seed têm que bater com cycle_phase_templates.nome.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Cultos por categoria e por evento ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_categoria_cultos (
  category_id uuid NOT NULL REFERENCES public.event_categories(id) ON DELETE CASCADE,
  culto       text NOT NULL CHECK (culto IN ('cbrio', 'ami', 'kids')),
  PRIMARY KEY (category_id, culto)
);
COMMENT ON TABLE public.marketing_categoria_cultos IS
  'Categoria com linhas aqui gera o ciclo do Marketing por FASE × CULTO. Série → cbrio, ami, kids. Categoria sem linha segue o espelho antigo de cycle_phase_tasks.';

CREATE TABLE IF NOT EXISTS public.marketing_evento_cultos (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  culto    text NOT NULL CHECK (culto IN ('cbrio', 'ami', 'kids')),
  PRIMARY KEY (event_id, culto)
);
COMMENT ON TABLE public.marketing_evento_cultos IS
  'Exceção por evento (ex.: retiro só do AMI). Se o evento tem linhas aqui, elas substituem as da categoria.';

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
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_marketing_evento_por_culto(p_event_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.fn_marketing_cultos_do_evento(p_event_id));
$$;

-- ── 2. Padrão por fase: responsável e visibilidade ──────────────────────
ALTER TABLE public.marketing_ciclo_padroes
  ADD COLUMN IF NOT EXISTS culto        text CHECK (culto IN ('cbrio', 'ami', 'kids')),
  ADD COLUMN IF NOT EXISTS visibilidade text NOT NULL DEFAULT 'equipe'
    CHECK (visibilidade IN ('equipe', 'so_lider', 'lider_move'));
ALTER TABLE public.marketing_ciclo_padroes
  DROP CONSTRAINT IF EXISTS marketing_ciclo_padroes_category_id_nome_fase_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_ciclo_padroes_fase_culto
  ON public.marketing_ciclo_padroes (category_id, nome_fase, COALESCE(culto, '*'));

COMMENT ON COLUMN public.marketing_ciclo_padroes.culto IS
  'NULL = vale para os 3 cultos (ex.: fases do Pedro). Com culto, ganha da linha genérica (ex.: Cauã em cbrio/ami, Letícia em kids).';

-- ── 3. Subtarefas padrão ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_ciclo_itens_padrao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES public.event_categories(id) ON DELETE CASCADE,
  nome_fase       text NOT NULL,
  culto           text CHECK (culto IN ('cbrio', 'ami', 'kids')),
  texto           text NOT NULL,
  membro_id       uuid REFERENCES public.marketing_membros(id) ON DELETE SET NULL,
  esforco_valor   numeric(6,1) NOT NULL DEFAULT 0 CHECK (esforco_valor >= 0),
  esforco_unidade text NOT NULL DEFAULT 'horas' CHECK (esforco_unidade IN ('horas', 'dias')),
  exige_registro  boolean NOT NULL DEFAULT false,
  ordem           int  NOT NULL DEFAULT 0,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_itens_padrao_chave
  ON public.marketing_ciclo_itens_padrao (category_id, nome_fase) WHERE ativo;

COMMENT ON TABLE public.marketing_ciclo_itens_padrao IS
  'Subtarefas que nascem no checklist de cada tarefa de ciclo, por (categoria × fase × culto). culto NULL = os 3 cultos. membro_id NULL = o responsável da tarefa (Cauã em CBRio/AMI, Letícia em Kids, Pedro nas fases dele).';

-- ── 4. Card ligado à fase do evento ─────────────────────────────────────
ALTER TABLE public.marketing_kanban_cards
  ADD COLUMN IF NOT EXISTS event_id       uuid REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_phase_id uuid REFERENCES public.event_cycle_phases(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_cards_fase_culto
  ON public.marketing_kanban_cards (event_phase_id, COALESCE(culto, '*'))
  WHERE event_phase_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_cards_evento
  ON public.marketing_kanban_cards (event_id) WHERE deleted_at IS NULL;

-- origem=evento passa a aceitar a fase como ponteiro
ALTER TABLE public.marketing_kanban_cards
  DROP CONSTRAINT IF EXISTS marketing_cards_origem_fk_check;
ALTER TABLE public.marketing_kanban_cards
  ADD CONSTRAINT marketing_cards_origem_fk_check CHECK (
    (origem = 'solicitacao' AND solicitacao_id IS NOT NULL AND evento_task_id IS NULL AND cycle_phase_task_id IS NULL) OR
    (origem = 'evento'      AND solicitacao_id IS NULL     AND (
                                  evento_task_id IS NOT NULL
                               OR cycle_phase_task_id IS NOT NULL
                               OR event_phase_id IS NOT NULL
                               OR deleted_at IS NOT NULL)) OR
    (origem = 'interna'     AND solicitacao_id IS NULL     AND evento_task_id IS NULL     AND cycle_phase_task_id IS NULL)
  );

-- Fase apagada (evento apagado) → soft-delete das tarefas antes do SET NULL
CREATE OR REPLACE FUNCTION public.fn_marketing_card_fase_apagada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.marketing_kanban_cards
     SET deleted_at = now()
   WHERE event_phase_id = OLD.id AND deleted_at IS NULL;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS tg_marketing_card_fase_apagada ON public.event_cycle_phases;
CREATE TRIGGER tg_marketing_card_fase_apagada
  BEFORE DELETE ON public.event_cycle_phases
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_card_fase_apagada();

-- ── 5. Gerador: fase × culto ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_marketing_ciclo_gerar_fase(p_phase_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f        record;
  v_cat    uuid;
  v_culto  text;
  v_pad    record;
  v_card   uuid;
  v_n      int := 0;
  v_feita  timestamptz;
BEGIN
  SELECT * INTO f FROM public.event_cycle_phases WHERE id = p_phase_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT category_id INTO v_cat FROM public.events WHERE id = f.event_id;

  -- Fase que o modelo antigo JÁ concluiu (tarefa de marketing 'concluida' nesta fase):
  -- o card novo nasce concluído, com a data real. Sem isso, as séries em curso
  -- ganhariam cards atrasados de fases que a equipe já entregou (Fase 0 · 25/09).
  -- Fase passada e NÃO concluída continua aberta: o atraso é verdade.
  SELECT max(t.updated_at) INTO v_feita
    FROM public.cycle_phase_tasks t
   WHERE t.event_phase_id = f.id AND lower(t.area) = 'marketing' AND t.status = 'concluida';

  FOR v_culto IN SELECT * FROM public.fn_marketing_cultos_do_evento(f.event_id) LOOP
    -- padrão do culto ganha do genérico · fase sem padrão = o Marketing não tem tarefa nela
    SELECT p.atribuido_a, p.etiqueta_tipo_id, p.visibilidade INTO v_pad
      FROM public.marketing_ciclo_padroes p
     WHERE p.category_id = v_cat AND p.nome_fase = f.nome_fase AND p.ativo
       AND (p.culto = v_culto OR p.culto IS NULL)
     ORDER BY (p.culto IS NULL)
     LIMIT 1;
    CONTINUE WHEN NOT FOUND;

    v_card := NULL;
    INSERT INTO public.marketing_kanban_cards (
      origem, event_id, event_phase_id, culto, titulo,
      etiqueta_tipo_id, atribuido_a, visibilidade,
      data_inicio, data_fim, prazo_preliminar, estado, concluido_em
    ) VALUES (
      'evento', f.event_id, f.id, v_culto, f.nome_fase,
      v_pad.etiqueta_tipo_id, v_pad.atribuido_a, v_pad.visibilidade,
      f.data_inicio_prevista::date, f.data_fim_prevista::date,
      CASE WHEN f.data_fim_prevista IS NOT NULL
           THEN (f.data_fim_prevista::date + time '18:00') AT TIME ZONE 'America/Sao_Paulo' END,
      CASE WHEN v_feita IS NOT NULL THEN 'concluido' ELSE 'backlog' END,
      v_feita
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_card;

    IF v_card IS NOT NULL THEN
      v_n := v_n + 1;
      INSERT INTO public.marketing_card_checklist
        (card_id, grupo, texto, membro_id, esforco_valor, esforco_unidade, exige_registro, prazo, feito, concluido_em)
      -- em fase já concluída, o item nasce feito · exceto o que exige registro (o CHECK
      -- recusa item feito sem texto, e não se inventa conceito/report que ninguém escreveu)
      SELECT v_card, f.nome_fase, i.texto, i.membro_id, i.esforco_valor, i.esforco_unidade, i.exige_registro, f.data_fim_prevista::date,
             (v_feita IS NOT NULL AND NOT i.exige_registro),
             CASE WHEN v_feita IS NOT NULL AND NOT i.exige_registro THEN v_feita END
        FROM public.marketing_ciclo_itens_padrao i
       WHERE i.ativo AND i.category_id = v_cat AND i.nome_fase = f.nome_fase
         AND (i.culto IS NULL OR i.culto = v_culto)
       ORDER BY i.ordem, i.created_at;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_marketing_fase_ciclo_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_marketing_ciclo_gerar_fase(NEW.id);
    RETURN NEW;
  END IF;
  -- datas da fase mudaram (Dia D mudou) · acompanha só quem não foi remarcado à mão
  UPDATE public.marketing_kanban_cards k
     SET data_inicio = NEW.data_inicio_prevista::date,
         data_fim    = NEW.data_fim_prevista::date,
         prazo_preliminar = CASE WHEN NEW.data_fim_prevista IS NOT NULL
                                 THEN (NEW.data_fim_prevista::date + time '18:00') AT TIME ZONE 'America/Sao_Paulo' END
   WHERE k.event_phase_id = NEW.id AND k.deleted_at IS NULL AND k.estado <> 'concluido'
     AND k.data_fim IS NOT DISTINCT FROM OLD.data_fim_prevista::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_marketing_fase_ciclo_sync ON public.event_cycle_phases;
CREATE TRIGGER tg_marketing_fase_ciclo_sync
  AFTER INSERT OR UPDATE OF data_inicio_prevista, data_fim_prevista ON public.event_cycle_phases
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_fase_ciclo_sync();

-- ── 6. Espelho antigo: pula evento por culto · aceita em_andamento ──────
-- Mesmo corpo de 20260529060000, com o desvio no começo e o status corrigido.
CREATE OR REPLACE FUNCTION public.fn_marketing_cards_cycle_phase_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card_id     uuid;
  v_estado_card text;
  v_etiqueta    uuid;
  v_atribuido   uuid;
BEGIN
  IF LOWER(COALESCE(NEW.area, '')) <> 'marketing' THEN
    IF TG_OP = 'UPDATE' AND LOWER(COALESCE(OLD.area, '')) = 'marketing' THEN
      UPDATE public.marketing_kanban_cards
         SET deleted_at = now()
       WHERE cycle_phase_task_id = NEW.id AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Evento de categoria por culto: o Marketing gera por fase (fn_marketing_ciclo_gerar_fase)
  IF NEW.event_id IS NOT NULL AND public.fn_marketing_evento_por_culto(NEW.event_id) THEN
    RETURN NEW;
  END IF;

  v_estado_card := CASE LOWER(COALESCE(NEW.status, ''))
    WHEN 'concluida'    THEN 'concluido'
    WHEN 'em-andamento' THEN 'producao'
    WHEN 'em_andamento' THEN 'producao'
    ELSE 'backlog'
  END;

  v_etiqueta  := NULL;
  v_atribuido := NULL;
  IF NEW.event_id IS NOT NULL AND NEW.event_phase_id IS NOT NULL THEN
    SELECT p.etiqueta_tipo_id, p.atribuido_a
      INTO v_etiqueta, v_atribuido
      FROM public.marketing_ciclo_padroes p
      JOIN public.events e               ON e.id   = NEW.event_id
      JOIN public.event_cycle_phases ecp ON ecp.id = NEW.event_phase_id
     WHERE p.category_id = e.category_id
       AND p.nome_fase   = ecp.nome_fase
       AND p.culto IS NULL
       AND p.ativo
     LIMIT 1;
  END IF;

  SELECT id INTO v_card_id
    FROM public.marketing_kanban_cards
   WHERE cycle_phase_task_id = NEW.id AND deleted_at IS NULL
   LIMIT 1;

  IF v_card_id IS NULL THEN
    INSERT INTO public.marketing_kanban_cards (
      origem, cycle_phase_task_id, event_id, titulo, descricao,
      etiqueta_tipo_id, atribuido_a,
      prazo_preliminar, estado, criado_por,
      entregue_em
    ) VALUES (
      'evento', NEW.id, NEW.event_id, NEW.titulo, NEW.descricao,
      v_etiqueta, v_atribuido,
      CASE WHEN NEW.prazo IS NOT NULL THEN NEW.prazo::timestamptz ELSE NULL END,
      v_estado_card,
      NEW.created_by,
      CASE WHEN v_estado_card = 'concluido' THEN now() ELSE NULL END
    )
    ON CONFLICT DO NOTHING;
  ELSE
    -- o ciclo manda em título, descrição e prazo; no estado, não faz o card andar para trás
    UPDATE public.marketing_kanban_cards
       SET titulo = NEW.titulo,
           descricao = NEW.descricao,
           prazo_preliminar = CASE WHEN NEW.prazo IS NOT NULL THEN NEW.prazo::timestamptz ELSE NULL END,
           estado = CASE WHEN v_estado_card = 'concluido' THEN 'concluido' ELSE estado END,
           entregue_em = CASE
             WHEN v_estado_card = 'concluido' AND entregue_em IS NULL THEN now()
             ELSE entregue_em
           END
     WHERE id = v_card_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_cards_cycle_phase_sync() IS
  'Espelho cycle_phase_tasks (area=marketing) → card, SÓ para eventos sem cultos configurados. Evento por culto é gerado por fase em fn_marketing_ciclo_gerar_fase (2026-09-25). O ciclo não faz o card andar para trás.';

-- ── 7. Volta para o módulo Eventos ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_marketing_card_conclui_fase_ciclo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.marketing_kanban_cards
     WHERE event_phase_id = NEW.event_phase_id
       AND deleted_at IS NULL AND estado <> 'concluido'
  ) THEN
    UPDATE public.cycle_phase_tasks
       SET status = 'concluida'
     WHERE event_phase_id = NEW.event_phase_id
       AND LOWER(COALESCE(area, '')) = 'marketing'
       AND LOWER(COALESCE(status, '')) <> 'concluida';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_marketing_card_conclui_fase_ciclo ON public.marketing_kanban_cards;
CREATE TRIGGER tg_marketing_card_conclui_fase_ciclo
  AFTER UPDATE OF estado ON public.marketing_kanban_cards
  FOR EACH ROW
  WHEN (NEW.event_phase_id IS NOT NULL AND NEW.estado = 'concluido' AND OLD.estado IS DISTINCT FROM 'concluido')
  EXECUTE FUNCTION public.fn_marketing_card_conclui_fase_ciclo();

-- ── 8. Backfill de um evento ────────────────────────────────────────────
-- p_substituir_espelho: soft-deleta os cards do espelho antigo ainda abertos
-- desse evento (as tarefas por fase × culto substituem). Concluídos ficam.
CREATE OR REPLACE FUNCTION public.fn_marketing_ciclo_gerar_evento(p_event_id uuid, p_substituir_espelho boolean DEFAULT false)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fase  uuid;
  v_total int := 0;
BEGIN
  IF NOT public.fn_marketing_evento_por_culto(p_event_id) THEN
    RETURN 0;
  END IF;
  IF p_substituir_espelho THEN
    UPDATE public.marketing_kanban_cards k
       SET deleted_at = now()
      FROM public.cycle_phase_tasks t
     WHERE k.cycle_phase_task_id = t.id AND t.event_id = p_event_id
       AND k.deleted_at IS NULL AND k.estado <> 'concluido';
  END IF;
  FOR v_fase IN SELECT id FROM public.event_cycle_phases WHERE event_id = p_event_id ORDER BY numero_fase LOOP
    v_total := v_total + public.fn_marketing_ciclo_gerar_fase(v_fase);
  END LOOP;
  RETURN v_total;
END;
$$;

-- ── 9. Seed da matriz do Marcos (categoria Série) ───────────────────────
DO $$
DECLARE
  v_serie  uuid;
  v_pedro  uuid;
  v_caua   uuid;
  v_let    uuid;
  v_lorena uuid;
  v_allan  uuid;
  v_fase   text;
  v_falta  text[] := '{}';
BEGIN
  SELECT id INTO v_serie FROM public.event_categories WHERE name IN ('Série', 'Serie', 'Séries') LIMIT 1;

  SELECT m.id INTO v_pedro FROM public.marketing_membros m
   WHERE m.ativo AND m.deleted_at IS NULL AND m.habilidade = 'coordenador' LIMIT 1;
  SELECT m.id INTO v_caua FROM public.marketing_membros m JOIN public.profiles p ON p.id = m.profile_id
   WHERE m.ativo AND m.deleted_at IS NULL AND m.habilidade <> 'coordenador' AND p.name ILIKE 'Cau%' LIMIT 1;
  SELECT m.id INTO v_let FROM public.marketing_membros m JOIN public.profiles p ON p.id = m.profile_id
   WHERE m.ativo AND m.deleted_at IS NULL AND m.habilidade <> 'coordenador' AND p.name ILIKE 'Let%cia%' LIMIT 1;
  SELECT m.id INTO v_lorena FROM public.marketing_membros m JOIN public.profiles p ON p.id = m.profile_id
   WHERE m.ativo AND m.deleted_at IS NULL AND m.habilidade <> 'coordenador' AND p.name ILIKE 'Lorena%' LIMIT 1;
  SELECT m.id INTO v_allan FROM public.marketing_membros m JOIN public.profiles p ON p.id = m.profile_id
   WHERE m.ativo AND m.deleted_at IS NULL AND m.habilidade <> 'coordenador' AND p.name ILIKE 'Allan%' LIMIT 1;

  IF v_serie  IS NULL THEN v_falta := v_falta || 'categoria Série'::text; END IF;
  IF v_pedro  IS NULL THEN v_falta := v_falta || 'Pedro (coordenador)'::text; END IF;
  IF v_caua   IS NULL THEN v_falta := v_falta || 'Cauã'::text; END IF;
  IF v_let    IS NULL THEN v_falta := v_falta || 'Letícia'::text; END IF;
  IF v_lorena IS NULL THEN v_falta := v_falta || 'Lorena'::text; END IF;
  IF v_allan  IS NULL THEN v_falta := v_falta || 'Allan'::text; END IF;
  IF array_length(v_falta, 1) > 0 THEN
    RAISE NOTICE 'Seed da matriz pulada · não achei: %', array_to_string(v_falta, ', ');
    RETURN;
  END IF;

  -- fases que não batem com o template são avisadas (nome tem que ser idêntico)
  FOREACH v_fase IN ARRAY ARRAY['Pré Briefing', 'Briefing', 'Brainstorming e Conceito', 'Identidade e Estratégia',
                                'Aprovação', 'Execução Estratégica', 'Pré-Testes', 'Dia D', 'Debrief'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.cycle_phase_templates
                    WHERE nome = v_fase AND (category_id IS NULL OR category_id = v_serie)) THEN
      RAISE NOTICE 'Fase "%" não existe em cycle_phase_templates · a seed grava mesmo assim, conferir o nome', v_fase;
    END IF;
  END LOOP;

  -- responsável e visibilidade por fase
  INSERT INTO public.marketing_ciclo_padroes (category_id, nome_fase, culto, atribuido_a, visibilidade, ativo)
  VALUES
    (v_serie, 'Pré Briefing',             NULL,    v_pedro, 'so_lider',   true),
    (v_serie, 'Briefing',                 'cbrio', v_caua,  'equipe',     true),
    (v_serie, 'Briefing',                 'ami',   v_caua,  'equipe',     true),
    (v_serie, 'Briefing',                 'kids',  v_let,   'equipe',     true),
    (v_serie, 'Brainstorming e Conceito', 'cbrio', v_caua,  'equipe',     true),
    (v_serie, 'Brainstorming e Conceito', 'ami',   v_caua,  'equipe',     true),
    (v_serie, 'Brainstorming e Conceito', 'kids',  v_let,   'equipe',     true),
    (v_serie, 'Identidade e Estratégia',  'cbrio', v_caua,  'equipe',     true),
    (v_serie, 'Identidade e Estratégia',  'ami',   v_caua,  'equipe',     true),
    (v_serie, 'Identidade e Estratégia',  'kids',  v_let,   'equipe',     true),
    (v_serie, 'Aprovação',                NULL,    v_pedro, 'lider_move', true),
    (v_serie, 'Execução Estratégica',     'cbrio', v_caua,  'equipe',     true),
    (v_serie, 'Execução Estratégica',     'ami',   v_caua,  'equipe',     true),
    (v_serie, 'Execução Estratégica',     'kids',  v_let,   'equipe',     true),
    (v_serie, 'Pré-Testes',               NULL,    v_pedro, 'lider_move', true),
    -- depois do Pré-Testes a equipe sai do processo; o Pedro volta no Dia D e no Debrief
    (v_serie, 'Dia D',                    NULL,    v_pedro, 'lider_move', true),
    (v_serie, 'Debrief',                  NULL,    v_pedro, 'so_lider',   true)
  ON CONFLICT DO NOTHING;

  -- subtarefas · membro NULL = responsável da tarefa (Cauã/Letícia, ou Pedro nas fases dele)
  INSERT INTO public.marketing_ciclo_itens_padrao (category_id, nome_fase, texto, membro_id, exige_registro, ordem)
  SELECT v_serie, x.fase, x.texto, x.membro, x.registro, x.ordem
    FROM (VALUES
      ('Pré Briefing',             'Marcar a reunião de briefing',               NULL::uuid, false, 1),
      ('Briefing',                 'Registrar o conceito decidido na reunião',   NULL,       true,  1),
      ('Brainstorming e Conceito', 'Defesa',                                     NULL,       false, 1),
      ('Brainstorming e Conceito', 'MoodBoard',                                  NULL,       false, 2),
      ('Brainstorming e Conceito', 'Referências para redes',                     v_lorena,   false, 3),
      ('Identidade e Estratégia',  'Roteirização',                               v_allan,    false, 1),
      ('Identidade e Estratégia',  'Logo',                                       NULL,       false, 2),
      ('Identidade e Estratégia',  'Cores',                                      NULL,       false, 3),
      ('Identidade e Estratégia',  'Tipografia',                                 NULL,       false, 4),
      ('Identidade e Estratégia',  'Apresentação visual',                        NULL,       false, 5),
      ('Identidade e Estratégia',  'Planejamento de redes',                      v_lorena,   false, 6),
      ('Aprovação',                'Reunião de aprovação',                       NULL,       false, 1),
      ('Aprovação',                'Report da aprovação',                        NULL,       true,  2),
      ('Execução Estratégica',     'Institucional',                              NULL,       false, 1),
      ('Execução Estratégica',     'PPT · capa e miolo',                         NULL,       false, 2),
      ('Execução Estratégica',     'Thumbs',                                     NULL,       false, 4),
      ('Execução Estratégica',     'Telas laterais',                             NULL,       false, 5),
      ('Execução Estratégica',     'Horários do culto',                          NULL,       false, 6),
      ('Execução Estratégica',     'Tela generosidade',                          NULL,       false, 7),
      ('Execução Estratégica',     'Vídeo Instagram',                            v_allan,    false, 8),
      ('Execução Estratégica',     'Conteúdos para redes · vídeo',               v_allan,    false, 9),
      ('Execução Estratégica',     'Conteúdos para redes · posts',               v_lorena,   false, 10),
      ('Pré-Testes',               'Acompanhar os testes do que foi produzido',  NULL,       false, 1),
      ('Dia D',                    'Reunião de feedback no dia do evento',       NULL,       false, 1),
      ('Debrief',                  'Reunião de feedback do Debrief',             NULL,       false, 1)
    ) AS x(fase, texto, membro, registro, ordem)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.marketing_ciclo_itens_padrao i
      WHERE i.category_id = v_serie AND i.nome_fase = x.fase AND i.texto = x.texto AND i.culto IS NULL);

  RAISE NOTICE 'Matriz da Série semeada.';
END $$;

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
REVOKE ALL ON FUNCTION public.fn_marketing_cultos_do_evento(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_evento_por_culto(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_ciclo_gerar_fase(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_ciclo_gerar_evento(uuid, boolean)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_fase_ciclo_sync()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_card_fase_apagada()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_marketing_card_conclui_fase_ciclo()          FROM PUBLIC, anon, authenticated;

COMMIT;

-- Depois de aplicar · gerar as tarefas das séries futuras (e trocar o espelho antigo):
--   SELECT e.name, e.date, public.fn_marketing_ciclo_gerar_evento(e.id, true) AS tarefas_novas
--     FROM public.events e JOIN public.event_categories c ON c.id = e.category_id
--    WHERE c.name IN ('Série','Serie','Séries') AND e.date >= current_date
--    ORDER BY e.date;
