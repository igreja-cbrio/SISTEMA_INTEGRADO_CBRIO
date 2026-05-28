-- ============================================================================
-- MIGRATION · Marketing · Triggers de sync (Spec 004)
-- ============================================================================
-- Cria 2 triggers SQL que materializam cards no Kanban Marketing
-- automaticamente quando:
--   1. Solicitacao da area marketing transiciona pra status='pendente'
--      (vinda de aguardando_aprovacao_origem ou dispensada/diretora).
--   2. event_task de area 'marketing' eh criada (ciclo criativo de Eventos).
--
-- Idempotencia garantida pelos UNIQUE parciais (Spec 002):
--   uq_marketing_cards_solicitacao  (solicitacao_id) WHERE NOT NULL AND not deleted
--   uq_marketing_cards_evento_task  (evento_task_id) WHERE NOT NULL AND not deleted
--
-- ON CONFLICT DO NOTHING faz o insert virar no-op se ja existir.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trigger AFTER INSERT/UPDATE em solicitacoes
-- ----------------------------------------------------------------------------
-- Disparo: status muda pra 'pendente' E area_responsavel='marketing'.
-- Ou INSERT direto com status='pendente' + area_responsavel='marketing'
-- (caso solicitacao seja dispensada pelo diretor de origem · cai direto em pendente).
--
-- A solicitacao "nasce" no fluxo do diretor de origem (Spec 001) com status
-- 'aguardando_aprovacao_origem'. Quando aprovada, vira 'pendente' e ai sim
-- o card eh materializado no Kanban Marketing.

CREATE OR REPLACE FUNCTION public.fn_marketing_cards_solicitacao_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deve_criar boolean := false;
BEGIN
  IF NEW.area_responsavel IS DISTINCT FROM 'marketing' THEN
    RETURN NEW;
  END IF;

  -- INSERT · sempre que nascer com status pendente
  IF TG_OP = 'INSERT' THEN
    v_deve_criar := COALESCE(NEW.status, '') = 'pendente';
  END IF;

  -- UPDATE · transicionou pra pendente
  IF TG_OP = 'UPDATE' THEN
    v_deve_criar := COALESCE(OLD.status, '') <> 'pendente'
                AND COALESCE(NEW.status, '') = 'pendente';
  END IF;

  IF NOT v_deve_criar THEN
    RETURN NEW;
  END IF;

  -- Pre-resolve etiqueta_tipo · se a categoria for 'marketing', tipo padrao = artes
  -- (a UI Spec 010 ajusta o tipo no momento do POST · aqui eh fallback)
  INSERT INTO public.marketing_kanban_cards (
    origem, solicitacao_id, titulo, descricao, raia_rapida, criado_por, estado
  ) VALUES (
    'solicitacao',
    NEW.id,
    NEW.titulo,
    NEW.descricao,
    COALESCE(NEW.urgencia_decisao = 'aceita', false),
    NEW.solicitante_id,
    'fila'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_cards_solicitacao_sync() IS
  'Cria card em marketing_kanban_cards quando solicitacao da area marketing entra em status=pendente. Idempotente via UNIQUE parcial.';

DROP TRIGGER IF EXISTS tg_marketing_cards_solicitacao_sync ON public.solicitacoes;
CREATE TRIGGER tg_marketing_cards_solicitacao_sync
  AFTER INSERT OR UPDATE OF status, area_responsavel ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_cards_solicitacao_sync();

-- ----------------------------------------------------------------------------
-- 2. Trigger AFTER INSERT em event_tasks
-- ----------------------------------------------------------------------------
-- Disparo: event_task com area='marketing' criada (ciclo criativo de Eventos
-- ativa o template e materializa as tarefas por area).

CREATE OR REPLACE FUNCTION public.fn_marketing_cards_evento_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF LOWER(COALESCE(NEW.area, '')) NOT IN ('marketing') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.marketing_kanban_cards (
    origem, evento_task_id, titulo, descricao, prazo_preliminar, estado, criado_por
  ) VALUES (
    'evento',
    NEW.id,
    NEW.name,
    NEW.description,
    CASE WHEN NEW.deadline IS NOT NULL THEN NEW.deadline::timestamptz ELSE NULL END,
    'fila',
    NEW.created_by
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_cards_evento_sync() IS
  'Cria card em marketing_kanban_cards quando event_task de area marketing eh criada (ciclo criativo). Idempotente via UNIQUE parcial.';

DROP TRIGGER IF EXISTS tg_marketing_cards_evento_sync ON public.event_tasks;
CREATE TRIGGER tg_marketing_cards_evento_sync
  AFTER INSERT ON public.event_tasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_cards_evento_sync();

-- ----------------------------------------------------------------------------
-- 3. Backfill defensivo · solicitacoes ja existentes em status=pendente
-- ----------------------------------------------------------------------------
-- Solicitacoes da area marketing que estao em status=pendente HOJE devem
-- aparecer no Kanban. ON CONFLICT DO NOTHING evita duplicacao caso ja exista.

INSERT INTO public.marketing_kanban_cards (
  origem, solicitacao_id, titulo, descricao, raia_rapida, criado_por, estado
)
SELECT 'solicitacao', s.id, s.titulo, s.descricao,
       COALESCE(s.urgencia_decisao = 'aceita', false),
       s.solicitante_id, 'fila'
  FROM public.solicitacoes s
 WHERE s.area_responsavel = 'marketing'
   AND s.status = 'pendente'
   AND s.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- event_tasks ja existentes da area marketing
INSERT INTO public.marketing_kanban_cards (
  origem, evento_task_id, titulo, descricao, prazo_preliminar, estado, criado_por
)
SELECT 'evento', t.id, t.name, t.description,
       CASE WHEN t.deadline IS NOT NULL THEN t.deadline::timestamptz ELSE NULL END,
       'fila', t.created_by
  FROM public.event_tasks t
 WHERE LOWER(COALESCE(t.area, '')) = 'marketing'
ON CONFLICT DO NOTHING;
