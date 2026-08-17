-- Restaura na whitelist de soft-delete as tabelas que o CÓDIGO apaga por RPC e
-- que tinham sumido da lista: `vol_inscricoes`, `prop_proposta`, `whatsapp_lideres`.
--
-- ⚠️⚠️ POR QUE SUMIRAM (medido em 17/08/2026): a migration
-- `20260814160000_time_agentes_fase0` fez `CREATE OR REPLACE` da
-- `app_soft_deletable_tables()` com uma lista ESTÁTICA. Tudo que tinha sido
-- acrescentado por PATCH DINÂMICO antes dela foi apagado em silêncio —
-- `vol_inscricoes` entrou pela M6b (`20260729060000`, que documenta
-- "soft-delete de vol_inscricoes LIBERADO") e não estava mais lá.
--
-- Nada quebrou de forma visível: `app_soft_delete` passou a levantar exceção e
-- cada endpoint virou um 500 genérico dentro do seu módulo, sem ninguém ligar
-- uma coisa à outra. `vol_inscricoes`: 829 linhas vivas, **0 apagadas** — o
-- caminho nunca funcionou.
--
-- ⚠️ Varredura que fecha o caso: das 25 tabelas que `backend/` apaga por essa
-- RPC, 3 estavam fora. Depois desta migration: 0.
--
-- ⚠️ PATCH DINÂMICO sobre a definição VIVA — é a técnica que a 20260814160000
-- não usou, e é exatamente por isso que esta migration existe.
DO $$
DECLARE
  v_lista text;
  v_sql   text;
BEGIN
  IF 'vol_inscricoes' = ANY(public.app_soft_deletable_tables())
     AND 'prop_proposta' = ANY(public.app_soft_deletable_tables())
     AND 'whatsapp_lideres' = ANY(public.app_soft_deletable_tables()) THEN
    RAISE NOTICE 'as tres ja estao na whitelist - nada a fazer';
    RETURN;
  END IF;

  SELECT string_agg(quote_literal(t), ', ' ORDER BY t) INTO v_lista
  FROM (
    SELECT unnest(public.app_soft_deletable_tables()) AS t
    UNION SELECT 'vol_inscricoes'
    UNION SELECT 'prop_proposta'
    UNION SELECT 'whatsapp_lideres'
  ) s;

  v_sql := 'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() '
        || 'RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $body$ SELECT ARRAY['
        || v_lista || ']::TEXT[] $body$';
  EXECUTE v_sql;

  RAISE NOTICE 'whitelist atualizada';
END $$;
