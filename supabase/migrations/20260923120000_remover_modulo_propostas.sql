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

-- ── 1. Catálogo do módulo + TODAS as tabelas que apontam pra ele ──────────
-- ⚠️ 1ª tentativa (23/09) falhou com 23503: além de `cargo_modulo_permissao`
-- (34 linhas, por cargo), `permissoes_modulo` (por USUÁRIO) tinha 1 linha —
-- a permissão dev temporária da conta pessoal do Marcos (03/09/2026) — e em
-- produção a FK está SEM cascade, ao contrário do que a migration de origem
-- declara. Em vez de listar tabela por tabela, varre `pg_constraint`: toda FK
-- que referencia `public.modulos` tem suas linhas do módulo apagadas antes.
DO $$
DECLARE
  v_id  int;
  r     record;
  v_n   bigint;
BEGIN
  SELECT id INTO v_id FROM public.modulos WHERE slug = 'propostas';
  IF v_id IS NULL THEN
    RAISE NOTICE 'modulo propostas ja nao existe em modulos - nada a fazer';
    RETURN;
  END IF;

  FOR r IN
    SELECT c.conrelid::regclass AS tabela, a.attname AS coluna
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.modulos'::regclass
  LOOP
    EXECUTE format('DELETE FROM %s WHERE %I = $1', r.tabela, r.coluna) USING v_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '% . % : % linha(s) do modulo % apagadas', r.tabela, r.coluna, v_n, v_id;
  END LOOP;

  DELETE FROM public.modulos WHERE id = v_id;
  RAISE NOTICE 'modulos: linha % (propostas) apagada', v_id;
END $$;

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
