-- ============================================================================
-- Marketing · atribuicao padrao por grupo
-- Marcos 2026-05-29: card de solicitacao ja nasce atribuido ao responsavel do
-- grupo (Artes->Caua · Rede Social->Lorena · Videos e Fotos->Allan · fotos tb no
-- Allan pq a Aline nao tem login). Pedro troca no card quando quiser ("Atribuido a").
--
-- 1) tabela marketing_grupo_padrao (grupo -> membro) + seed (por habilidade)
-- 2) recria fn_marketing_cards_solicitacao_sync pra setar atribuido_a no INSERT
-- Idempotente.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_grupo_padrao (
  grupo      text PRIMARY KEY,
  membro_id  uuid REFERENCES public.marketing_membros(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_grupo_padrao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mgp_select  ON public.marketing_grupo_padrao;
DROP POLICY IF EXISTS mgp_service ON public.marketing_grupo_padrao;
CREATE POLICY mgp_select  ON public.marketing_grupo_padrao FOR SELECT TO authenticated USING (true);
CREATE POLICY mgp_service ON public.marketing_grupo_padrao FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Seed por habilidade (1 membro por habilidade hoje · sem UUID hardcoded)
INSERT INTO public.marketing_grupo_padrao (grupo, membro_id)
SELECT 'artes', id FROM public.marketing_membros WHERE habilidade = 'designer' AND ativo LIMIT 1
ON CONFLICT (grupo) DO UPDATE SET membro_id = EXCLUDED.membro_id, updated_at = now();

INSERT INTO public.marketing_grupo_padrao (grupo, membro_id)
SELECT 'rede_social', id FROM public.marketing_membros WHERE habilidade = 'social_media' AND ativo LIMIT 1
ON CONFLICT (grupo) DO UPDATE SET membro_id = EXCLUDED.membro_id, updated_at = now();

INSERT INTO public.marketing_grupo_padrao (grupo, membro_id)
SELECT 'video_foto', id FROM public.marketing_membros WHERE habilidade = 'videomaker' AND ativo LIMIT 1
ON CONFLICT (grupo) DO UPDATE SET membro_id = EXCLUDED.membro_id, updated_at = now();

-- Recria o trigger de materializacao · agora seta atribuido_a pelo grupo
CREATE OR REPLACE FUNCTION public.fn_marketing_cards_solicitacao_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  DECLARE
    v_deve_criar boolean := false;
    v_estimativa jsonb;
    v_prazo      timestamptz;
    v_atribuido  uuid;
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

    IF NEW.marketing_tipo_id IS NOT NULL THEN
      -- prazo preliminar
      BEGIN
        v_estimativa := public.fn_marketing_estimar_prazo(NEW.marketing_tipo_id, NEW.data_necessaria);
        v_prazo := (v_estimativa->>'data_sugerida')::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        v_prazo := NULL;
      END;

      -- atribuicao padrao pelo grupo do entregavel (Pedro pode trocar no card)
      SELECT gp.membro_id INTO v_atribuido
        FROM public.marketing_etiquetas_tipo t
        JOIN public.marketing_grupo_padrao gp ON gp.grupo = t.grupo
       WHERE t.id = NEW.marketing_tipo_id;
    END IF;

    INSERT INTO public.marketing_kanban_cards (
      origem, solicitacao_id, titulo, descricao,
      etiqueta_tipo_id, etiqueta_destino_id,
      prazo_preliminar, atribuido_a,
      raia_rapida, criado_por, estado
    ) VALUES (
      'solicitacao',
      NEW.id,
      NEW.titulo,
      NEW.descricao,
      NEW.marketing_tipo_id,
      NEW.marketing_destino_id,
      v_prazo,
      v_atribuido,
      COALESCE(NEW.urgencia_decisao = 'aceita', false),
      NEW.solicitante_id,
      'fila'
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
  END;
$function$;

COMMIT;
