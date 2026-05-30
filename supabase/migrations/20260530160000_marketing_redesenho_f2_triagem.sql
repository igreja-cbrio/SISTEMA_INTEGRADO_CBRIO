-- ============================================================================
-- Marketing · REDESENHO · Fase 2 · Triagem + Campanha
-- Marcos 2026-05-30: a solicitacao de marketing aprovada vira uma CAMPANHA em
-- TRIAGEM (a "dor"), nao mais um card direto. O Pedro tria (decide a solucao ·
-- pode != o pedido) e cria os cards de producao (entregaveis) na UI.
--
-- Recria fn_marketing_cards_solicitacao_sync: INSERT em marketing_campanhas
-- (status='triagem') em vez de marketing_kanban_cards. Aposenta o auto-assign
-- por grupo (#806) e a estimativa/piso-7d (#803) · que viram sugestao na triagem.
-- Idempotente · 1 campanha por solicitacao. O trigger (AFTER INSERT/UPDATE em
-- solicitacoes) ja existe e aponta pra esta funcao · CREATE OR REPLACE basta.
--
-- (Eventos/ciclo criativo seguem como estao nesta fase · serao triados numa
--  sub-fase proxima.)
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_marketing_cards_solicitacao_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  DECLARE
    v_deve_criar boolean := false;
  BEGIN
    IF NEW.area_responsavel IS DISTINCT FROM 'marketing' THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
      v_deve_criar := COALESCE(NEW.status, '') = 'pendente';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      v_deve_criar := COALESCE(OLD.status, '') <> 'pendente'
                  AND COALESCE(NEW.status, '') = 'pendente';
    END IF;
    IF NOT v_deve_criar THEN
      RETURN NEW;
    END IF;

    -- A solicitacao aprovada vira uma CAMPANHA em triagem (a "dor"). O Pedro
    -- tria e cria os cards de producao na UI · NAO cria card direto nem
    -- auto-atribui (modelo antigo #806/#803 aposentado). 1 campanha/solicitacao.
    INSERT INTO public.marketing_campanhas (
      origem, solicitacao_id, titulo, dor_descricao, publico_alvo,
      status, solicitante_id, criado_por
    )
    SELECT
      'solicitacao', NEW.id, NEW.titulo, NEW.descricao, NEW.mkt_publico_alvo,
      'triagem', NEW.solicitante_id, NEW.solicitante_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.marketing_campanhas
       WHERE solicitacao_id = NEW.id AND deleted_at IS NULL
    );

    RETURN NEW;
  END;
$function$;

COMMENT ON FUNCTION public.fn_marketing_cards_solicitacao_sync() IS
  'Redesenho 2026-05-30 (Fase 2): solicitacao marketing aprovada -> marketing_campanhas (status triagem). Pedro tria e cria os cards de producao na UI. NAO cria card direto nem auto-atribui.';

COMMIT;
