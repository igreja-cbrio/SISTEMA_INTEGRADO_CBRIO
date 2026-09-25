-- ════════════════════════════════════════════════════════════════════════
-- Marketing · LINHA DO TEMPO · Fase 4 · formulário cai em PENDENTES, já
-- com a pessoa sugerida
-- (Marcos 2026-09-25 · depende de 20260925100000)
--
-- Regra do Marcos (25/09): toda solicitação passa pelo Pedro, mesmo quando é
-- óbvio para quem vai (post → Lorena). Ela nasce PRÉ-PREENCHIDA com a pessoa
-- sugerida, e o Pedro etiqueta mesmo assim: prioridade, descrição do que quer
-- e horas esperadas. Na linha do tempo a frente se chama "Pendentes" (antes
-- "Sem responsável"). Não existe roteamento direto para Sistema.
--
-- Sugestão: formato indicado no formulário (solicitacoes.marketing_tipo_id)
-- → marketing_etiquetas_tipo.habilidade_padrao → a única pessoa ativa com essa
-- habilidade. Sem formato, ou com 2+ pessoas na habilidade → sem sugestão.
-- ⚠ O formulário hoje NÃO manda marketing_tipo_id (pede a dor, não a peça).
--   O formulário ganha o campo OPCIONAL "que formato você imagina?" (decisão do
--   Marcos, 25/09) · quem só descreve a dor chega sem sugestão e o Pedro decide.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.marketing_campanhas
  ADD COLUMN IF NOT EXISTS sugerido_membro_id uuid REFERENCES public.marketing_membros(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.marketing_campanhas.sugerido_membro_id IS
  'Pessoa sugerida para o pedido (pré-preenche o editor do Pedro em Pendentes). Não atribui nada sozinho.';

CREATE OR REPLACE FUNCTION public.fn_marketing_sugerir_membro(p_tipo_id uuid)
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(m.id))[1] END
    FROM public.marketing_etiquetas_tipo t
    JOIN public.marketing_membros m
      ON m.habilidade = t.habilidade_padrao AND m.ativo AND m.deleted_at IS NULL
   WHERE t.id = p_tipo_id;
$$;
REVOKE ALL ON FUNCTION public.fn_marketing_sugerir_membro(uuid) FROM PUBLIC, anon, authenticated;

-- Mesma função de 20260530160000, agora gravando a sugestão.
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

    -- 1 campanha por solicitação, em triagem (= "Pendentes" na linha do tempo)
    INSERT INTO public.marketing_campanhas (
      origem, solicitacao_id, titulo, dor_descricao, publico_alvo,
      status, solicitante_id, criado_por, sugerido_membro_id
    )
    SELECT
      'solicitacao', NEW.id, NEW.titulo, NEW.descricao, NEW.mkt_publico_alvo,
      'triagem', NEW.solicitante_id, NEW.solicitante_id,
      public.fn_marketing_sugerir_membro(NEW.marketing_tipo_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.marketing_campanhas
       WHERE solicitacao_id = NEW.id AND deleted_at IS NULL
    );

    RETURN NEW;
  END;
$function$;

COMMENT ON FUNCTION public.fn_marketing_cards_solicitacao_sync() IS
  'Linha do tempo (2026-09-25): solicitação marketing aprovada → campanha em triagem ("Pendentes"), com sugerido_membro_id pelo formato pedido. O Pedro sempre aloca (prioridade, descrição, esforço e prazo de cada subtarefa, e a data de entrega final em prazo_entrega).';

-- Pendentes que já existem ganham a sugestão, quando houver formato
UPDATE public.marketing_campanhas c
   SET sugerido_membro_id = public.fn_marketing_sugerir_membro(s.marketing_tipo_id)
  FROM public.solicitacoes s
 WHERE s.id = c.solicitacao_id AND c.status = 'triagem'
   AND c.sugerido_membro_id IS NULL AND s.marketing_tipo_id IS NOT NULL;

COMMIT;
