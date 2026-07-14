-- Assistente do sistema (Jarvis) · FASE 1 · fix de acento na busca (2026-07-07)
-- Corrige descasamento de acento na busca full-text da base de conhecimento.
--
-- Problema: o extractTerms (lado da query) remove acentos ("permissao"), mas o
-- `tsv` era gerado do texto acentuado ("permissão") e o dicionário 'portuguese'
-- NÃO faz unaccent -> os lexemas ficavam acentuados ('permissã', 'nív') e a
-- query sem acento não casava. Isso quebrava a busca para praticamente todo
-- termo acentuado (a maior parte do português).
--
-- Solução: unaccent nos DOIS lados. A query já vem sem acento (extractTerms);
-- o `tsv` passa a ser gerado com unaccent. Coluna gerada exige função IMMUTABLE,
-- então usamos o wrapper public.f_unaccent (a forma unaccent(regdictionary,text)
-- é IMMUTABLE, diferente do unaccent(text) de 1 argumento, que é STABLE).

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = extensions, public, pg_catalog
AS $$ SELECT unaccent('unaccent', $1) $$;

-- Recria a coluna gerada usando f_unaccent (dropar a coluna dropa o índice junto).
ALTER TABLE public.cerebro_conhecimento DROP COLUMN IF EXISTS tsv;
ALTER TABLE public.cerebro_conhecimento
  ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(titulo, ''))), 'A') ||
    setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(secao,  ''))), 'B') ||
    setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(conteudo, ''))), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_cerebro_conhecimento_tsv
  ON public.cerebro_conhecimento USING gin (tsv);
