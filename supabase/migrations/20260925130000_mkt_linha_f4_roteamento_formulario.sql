-- ════════════════════════════════════════════════════════════════════════
-- Marketing · LINHA DO TEMPO · Fase 4 · formulário cai em Sistema OU em
-- "Sem responsável"
-- (Marcos 2026-09-25 · depende de 20260925100000)
--
-- Hoje toda solicitação de marketing aprovada vira campanha em 'triagem'
-- (= "Sem responsável" na linha do tempo) e espera o Pedro. Continua sendo o
-- padrão: o Pedro faz curadoria da dor (decisão de 2026-05-30).
--
-- Novo: regra OPCIONAL de roteamento por área de quem pediu. Se existe regra
-- ativa para solicitacoes.area_cliente, a solicitação já nasce em Sistema:
-- campanha 'ativa' + 1 card no nome da pessoa, com prazo = data pedida
-- (ou +7 dias). A tabela nasce VAZIA: nada muda até o Pedro cadastrar regra.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_roteamento (
  area_cliente text PRIMARY KEY,
  membro_id    uuid NOT NULL REFERENCES public.marketing_membros(id) ON DELETE CASCADE,
  culto        text CHECK (culto IN ('cbrio', 'ami', 'kids')),
  ativo        boolean NOT NULL DEFAULT true,
  criado_por   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.marketing_roteamento IS
  'Solicitação de marketing cuja area_cliente tem regra ativa vai direto para Sistema, no nome de membro_id. Sem regra → campanha em triagem ("Sem responsável", Pedro decide).';

ALTER TABLE public.marketing_roteamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_roteamento_service ON public.marketing_roteamento;
CREATE POLICY mkt_roteamento_service ON public.marketing_roteamento
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.marketing_roteamento FROM anon, authenticated;

-- Mesma função de 20260530160000, com o desvio no fim.
CREATE OR REPLACE FUNCTION public.fn_marketing_cards_solicitacao_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  DECLARE
    v_deve_criar boolean := false;
    v_campanha   uuid;
    v_regra      record;
    v_fim        date;
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

    -- 1 campanha por solicitação, nascendo em triagem (= "Sem responsável")
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
    )
    RETURNING id INTO v_campanha;

    IF v_campanha IS NULL THEN
      RETURN NEW;
    END IF;

    -- Regra de roteamento: vai direto para Sistema
    SELECT r.membro_id, r.culto INTO v_regra
      FROM public.marketing_roteamento r
      JOIN public.marketing_membros m ON m.id = r.membro_id AND m.ativo AND m.deleted_at IS NULL
     WHERE r.ativo AND r.area_cliente = NEW.area_cliente
     LIMIT 1;

    IF FOUND THEN
      v_fim := COALESCE(NEW.data_necessaria::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 7);
      INSERT INTO public.marketing_kanban_cards (
        origem, campanha_id, culto, titulo, descricao, atribuido_a,
        data_inicio, data_fim, prazo_producao, estado, criado_por
      ) VALUES (
        'interna', v_campanha, v_regra.culto, NEW.titulo, NEW.descricao, v_regra.membro_id,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date, v_fim,
        (v_fim + time '18:00') AT TIME ZONE 'America/Sao_Paulo',
        'backlog', NEW.solicitante_id
      );
      UPDATE public.marketing_campanhas
         SET status = 'ativa', culto = v_regra.culto,
             prazo_entrega = (v_fim + time '18:00') AT TIME ZONE 'America/Sao_Paulo'
       WHERE id = v_campanha;
    END IF;

    RETURN NEW;
  END;
$function$;

COMMENT ON FUNCTION public.fn_marketing_cards_solicitacao_sync() IS
  'Linha do tempo (2026-09-25): solicitação marketing aprovada → campanha em triagem ("Sem responsável"). Se marketing_roteamento tem regra ativa para area_cliente → campanha ativa + card no nome da pessoa (Sistema).';

COMMIT;
