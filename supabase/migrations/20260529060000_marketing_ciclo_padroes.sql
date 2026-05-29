-- ============================================================================
-- Marketing · padroes por fase do ciclo criativo
-- Marcos 2026-05-29: padroes reutilizaveis por (categoria do evento × nome da
-- fase) que aplicam etiqueta + esforco + dono automaticamente quando nasce um
-- card de ciclo criativo (origem=evento). ~80% dos cards de ciclo seguem o
-- mesmo padrao · evita o Pedro classificar tarefa por tarefa.
--
-- 1) tabela marketing_ciclo_padroes ((category_id, nome_fase) -> etiqueta + dono)
-- 2) estende fn_marketing_cards_cycle_phase_sync pra preencher etiqueta_tipo_id
--    + atribuido_a SO no nascimento do card (respeita classificacao manual)
-- 3) fn_marketing_aplicar_padroes_ciclo(category_id) · backfill manual (botao)
--
-- Chave do padrao = (events.category_id × event_cycle_phases.nome_fase).
-- O cycle_phase_tasks ja carrega event_id + event_phase_id (ver enrichCards no
-- routes/marketing.js). O esforco vem de graca pela etiqueta (esforco_max_h ·
-- Spec 016). Idempotente.
-- ============================================================================
BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Tabela de padroes
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_ciclo_padroes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       uuid NOT NULL REFERENCES public.event_categories(id) ON DELETE CASCADE,
  nome_fase         text NOT NULL,
  etiqueta_tipo_id  uuid REFERENCES public.marketing_etiquetas_tipo(id) ON DELETE SET NULL,
  atribuido_a       uuid REFERENCES public.marketing_membros(id) ON DELETE SET NULL,
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, nome_fase)
);

COMMENT ON TABLE public.marketing_ciclo_padroes IS
  'Padroes reutilizaveis por (categoria do evento × nome da fase) que aplicam etiqueta + dono automaticos quando nasce card de ciclo criativo (origem=evento). Marcos 2026-05-29.';

CREATE INDEX IF NOT EXISTS idx_marketing_ciclo_padroes_lookup
  ON public.marketing_ciclo_padroes (category_id, nome_fase) WHERE ativo;

ALTER TABLE public.marketing_ciclo_padroes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_ciclo_padroes_select  ON public.marketing_ciclo_padroes;
DROP POLICY IF EXISTS mkt_ciclo_padroes_service ON public.marketing_ciclo_padroes;
CREATE POLICY mkt_ciclo_padroes_select  ON public.marketing_ciclo_padroes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mkt_ciclo_padroes_service ON public.marketing_ciclo_padroes
  FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Estende o trigger de materializacao do ciclo criativo (Spec 022)
--    Agora resolve o padrao (categoria × fase) e preenche etiqueta + dono
--    SO no nascimento do card. UPDATE de card existente NAO toca etiqueta/dono
--    (respeita a classificacao manual feita pelo Pedro na /ciclo-criativo).
-- ──────────────────────────────────────────────────────────────────────────
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

  -- Resolve o padrao por (categoria do evento × nome da fase) · Marcos 2026-05-29
  -- Usado SO no nascimento do card (INSERT). Sem match → fica NULL (Pedro classifica).
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
       AND p.ativo
     LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.marketing_kanban_cards (
      origem, cycle_phase_task_id, titulo, descricao,
      etiqueta_tipo_id, atribuido_a,
      prazo_preliminar, estado, criado_por,
      entregue_em
    ) VALUES (
      'evento',
      NEW.id,
      NEW.titulo,
      NEW.descricao,
      v_etiqueta,
      v_atribuido,
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
    -- Card nao existia (area mudou pra marketing AGORA) · cria · aplica padrao tb
    INSERT INTO public.marketing_kanban_cards (
      origem, cycle_phase_task_id, titulo, descricao,
      etiqueta_tipo_id, atribuido_a,
      prazo_preliminar, estado, criado_por,
      entregue_em
    ) VALUES (
      'evento',
      NEW.id,
      NEW.titulo,
      NEW.descricao,
      v_etiqueta,
      v_atribuido,
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
  'Sync cycle_phase_tasks (area=marketing) → marketing_kanban_cards. Spec 022 + padroes por fase (2026-05-29). No nascimento do card aplica marketing_ciclo_padroes por (categoria × fase). Atribuicao no Marketing eh local (nao toca cycle_phase_tasks.responsavel_id). Status do ciclo dita estado do card.';

-- Trigger ja existe (Spec 022) e aponta pra mesma funcao · CREATE OR REPLACE basta.

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Backfill manual · aplica os padroes aos cards ja existentes
--    Botao "Aplicar a cards ativos sem dono/etiqueta" na /marketing/admin.
--    So preenche campos NULL · nunca sobrescreve classificacao manual.
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_marketing_aplicar_padroes_ciclo(uuid);
CREATE OR REPLACE FUNCTION public.fn_marketing_aplicar_padroes_ciclo(p_category_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH alvo AS (
    UPDATE public.marketing_kanban_cards c
       SET etiqueta_tipo_id = COALESCE(c.etiqueta_tipo_id, p.etiqueta_tipo_id),
           atribuido_a      = COALESCE(c.atribuido_a, p.atribuido_a),
           updated_at       = now()
      FROM public.cycle_phase_tasks cpt
      JOIN public.events e               ON e.id   = cpt.event_id
      JOIN public.event_cycle_phases ecp ON ecp.id = cpt.event_phase_id
      JOIN public.marketing_ciclo_padroes p
           ON p.category_id = e.category_id
          AND p.nome_fase   = ecp.nome_fase
          AND p.ativo
     WHERE c.cycle_phase_task_id = cpt.id
       AND c.deleted_at IS NULL
       AND c.origem = 'evento'
       AND c.estado IN ('fila', 'em_producao')
       AND (p_category_id IS NULL OR e.category_id = p_category_id)
       AND (
            (c.etiqueta_tipo_id IS NULL AND p.etiqueta_tipo_id IS NOT NULL)
         OR (c.atribuido_a      IS NULL AND p.atribuido_a      IS NOT NULL)
       )
    RETURNING c.id
  )
  SELECT count(*) INTO v_count FROM alvo;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_aplicar_padroes_ciclo(uuid) IS
  'Backfill manual · aplica marketing_ciclo_padroes aos cards de evento ativos (fila/em_producao) sem etiqueta e/ou sem dono. So preenche campos NULL (nao sobrescreve classificacao manual). p_category_id opcional limita a uma categoria. Retorna nro de cards afetados.';

COMMIT;
