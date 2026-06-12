-- ============================================================================
-- MIGRATION · Solicitacoes · etiquetas Marketing pre-preenchidas (Spec 010)
-- ============================================================================
-- Solicitante escolhe tipo+destino no form de Solicitacoes pra Marketing -
-- ao virar card (apos aprovacao do diretor de origem · Spec 001), trigger
-- propaga as etiquetas direto pro card sem Pedro precisar preencher.
--
-- Pedro pode editar depois no Kanban (Spec 007), mas o ponto-de-partida fica
-- mais informado.
--
-- 1. Colunas novas em solicitacoes
-- 2. Atualiza fn_marketing_cards_solicitacao_sync pra propagar
-- ============================================================================

-- 1. Colunas (NULL aceito · backward compat)
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS marketing_tipo_id    uuid REFERENCES public.marketing_etiquetas_tipo(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketing_destino_id uuid REFERENCES public.marketing_etiquetas_destino(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.solicitacoes.marketing_tipo_id IS
  'Etiqueta tipo pre-preenchida pelo solicitante (Spec 010). Trigger propaga pro card.';
COMMENT ON COLUMN public.solicitacoes.marketing_destino_id IS
  'Etiqueta destino pre-preenchida pelo solicitante (Spec 010). Trigger propaga pro card.';

-- 2. Atualiza trigger · propaga etiquetas (e estimativa de prazo) pro card
CREATE OR REPLACE FUNCTION public.fn_marketing_cards_solicitacao_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deve_criar boolean := false;
  v_estimativa jsonb;
  v_prazo timestamptz;
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

  -- Se tem tipo escolhido, calcula prazo preliminar pra preencher no card
  IF NEW.marketing_tipo_id IS NOT NULL THEN
    BEGIN
      v_estimativa := public.fn_marketing_estimar_prazo(
        NEW.marketing_tipo_id,
        NEW.data_necessaria
      );
      v_prazo := (v_estimativa->>'data_sugerida')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_prazo := NULL;
    END;
  END IF;

  INSERT INTO public.marketing_kanban_cards (
    origem, solicitacao_id, titulo, descricao,
    etiqueta_tipo_id, etiqueta_destino_id,
    prazo_preliminar,
    raia_rapida, criado_por, estado
  ) VALUES (
    'solicitacao',
    NEW.id,
    NEW.titulo,
    NEW.descricao,
    NEW.marketing_tipo_id,
    NEW.marketing_destino_id,
    v_prazo,
    COALESCE(NEW.urgencia_decisao = 'aceita', false),
    NEW.solicitante_id,
    'fila'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_cards_solicitacao_sync() IS
  'Cria card em marketing_kanban_cards quando solicitacao da area marketing entra em status=pendente. Propaga etiquetas (Spec 010) e prazo preliminar (Spec 005). Idempotente via UNIQUE parcial.';

-- 3. Backfill defensivo · solicitacoes ja existentes com etiquetas
-- (caso bizarro: sem cards ainda · so atualiza cards que ja foram materializados
-- copiando as etiquetas da solicitacao quando vazias)
UPDATE public.marketing_kanban_cards c
   SET etiqueta_tipo_id = s.marketing_tipo_id,
       etiqueta_destino_id = s.marketing_destino_id,
       updated_at = now()
  FROM public.solicitacoes s
 WHERE c.solicitacao_id = s.id
   AND c.deleted_at IS NULL
   AND (s.marketing_tipo_id IS NOT NULL OR s.marketing_destino_id IS NOT NULL)
   AND c.etiqueta_tipo_id IS NULL
   AND c.etiqueta_destino_id IS NULL;
