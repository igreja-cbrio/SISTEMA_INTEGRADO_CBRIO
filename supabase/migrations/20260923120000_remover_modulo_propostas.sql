-- Remove o módulo PROPOSTAS (ciclo anual de propostas de projetos/eventos/rotinas,
-- spec Yago 2026-07-30). Decisão do Marcos em 2026-09-23: acabar com o módulo.
--
-- Medido em produção antes de escrever (23/09/2026, service_role):
--   prop_proposta 0 · prop_avaliacao 0 · prop_deliberacao 0 · prop_log 0 ·
--   prop_pos_evento 0 · prop_ciclo 1 · prop_area_diretor 1 · prop_parametro 5 ·
--   modulos(slug='propostas') 1 linha (id 80) · cargo_modulo_permissao 34 linhas.
-- Nenhuma proposta jamais foi cadastrada — só configuração de teste. O
-- sucessor de fato é o Planejamento Anual (`plan_*`, 2026-08), que NÃO usa
-- nenhuma tabela `prop_*` e não é tocado aqui.
--
-- Ordem: catálogo/permissões → whitelist de soft-delete → funções → tabelas.
-- Idempotente (IF EXISTS em tudo).

-- ── 1. Catálogo do módulo + matriz de permissões ──────────────────────────
DELETE FROM public.cargo_modulo_permissao
 WHERE modulo_id IN (SELECT id FROM public.modulos WHERE slug = 'propostas');
DELETE FROM public.modulos WHERE slug = 'propostas';

-- ── 2. Tira `prop_proposta` da whitelist do app_soft_delete ───────────────
-- A whitelist é o CORPO da função `app_soft_deletable_tables()` (ver
-- 20260817180000). Recria a função sem a tabela, preservando o resto.
DO $$
DECLARE
  v_lista text;
BEGIN
  IF NOT ('prop_proposta' = ANY(public.app_soft_deletable_tables())) THEN
    RAISE NOTICE 'prop_proposta ja nao estava na whitelist - nada a fazer';
  ELSE
    SELECT string_agg(quote_literal(t), ', ' ORDER BY t) INTO v_lista
      FROM unnest(public.app_soft_deletable_tables()) AS t
     WHERE t <> 'prop_proposta';
    EXECUTE 'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() '
         || 'RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $body$ SELECT ARRAY['
         || v_lista || ']::TEXT[] $body$';
    RAISE NOTICE 'whitelist atualizada sem prop_proposta';
  END IF;
END $$;

-- ── 3. Funções e trigger do módulo ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_prop_derivados ON public.prop_proposta;
DROP FUNCTION IF EXISTS public.fn_prop_derivados();
DROP FUNCTION IF EXISTS public.fn_prop_transicionar(UUID, TEXT, TEXT, UUID);

-- ── 4. Tabelas (filhas antes da mãe; CASCADE cobre FKs e policies) ────────
DROP TABLE IF EXISTS public.prop_pos_evento      CASCADE;
DROP TABLE IF EXISTS public.prop_deliberacao     CASCADE;
DROP TABLE IF EXISTS public.prop_avaliacao_nota  CASCADE;
DROP TABLE IF EXISTS public.prop_avaliacao       CASCADE;
DROP TABLE IF EXISTS public.prop_snapshot        CASCADE;
DROP TABLE IF EXISTS public.prop_log             CASCADE;
DROP TABLE IF EXISTS public.prop_anexo           CASCADE;
DROP TABLE IF EXISTS public.prop_desembolso      CASCADE;
DROP TABLE IF EXISTS public.prop_risco           CASCADE;
DROP TABLE IF EXISTS public.prop_atividade       CASCADE;
DROP TABLE IF EXISTS public.prop_indicador       CASCADE;
DROP TABLE IF EXISTS public.prop_proposta        CASCADE;
DROP TABLE IF EXISTS public.prop_criterio        CASCADE;
DROP TABLE IF EXISTS public.prop_parametro       CASCADE;
DROP TABLE IF EXISTS public.prop_area_diretor    CASCADE;
DROP TABLE IF EXISTS public.prop_ciclo           CASCADE;

-- Nada no bucket `log-arquivos`: prop_anexo tinha 0 linhas (o bucket é
-- compartilhado com Solicitações e continua existindo).
