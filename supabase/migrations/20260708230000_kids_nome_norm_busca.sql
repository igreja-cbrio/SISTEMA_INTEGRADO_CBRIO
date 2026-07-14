-- ============================================================================
-- Kids · busca por nome SEM depender de acento/maiúscula (check-in)
-- ============================================================================
-- A busca do check-in usava ilike('nome', ...) — ignora maiúscula, mas NÃO
-- ignora acento ("jose" não achava "José"). Adiciona uma coluna normalizada
-- (minúscula + sem acento) mantida pelo banco + índice, pra a busca ser
-- acento/caixa-insensível e rápida.
--
-- unaccent() é STABLE (não pode ir direto numa coluna GENERATED, que exige
-- IMMUTABLE) → embrulha num wrapper IMMUTABLE (f_unaccent) usando a forma de
-- 2 args (regdictionary, text), que é imutável. Padrão consagrado do Postgres.
-- ADITIVA / não-destrutiva.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

ALTER TABLE public.kids_criancas
  ADD COLUMN IF NOT EXISTS nome_norm text
  GENERATED ALWAYS AS (lower(public.f_unaccent(nome))) STORED;

CREATE INDEX IF NOT EXISTS idx_kids_criancas_nome_norm
  ON public.kids_criancas (nome_norm text_pattern_ops);
