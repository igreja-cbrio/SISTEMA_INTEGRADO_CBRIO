-- Assistente do sistema (Jarvis) · FASE 1 · tags no tsv (2026-07-07)
-- Inclui as tags (sinônimos curados) no vetor de busca, com peso D (baixo).
-- Antes o tsv era só título+seção+conteúdo -> as tags não entravam na busca e
-- os sinônimos não ajudavam o recall (ex.: pergunta "cpf/telefone do membro"
-- não priorizava o item de recusa de PII; "zap" não achava o item do WhatsApp).
--
-- array_to_string(anyarray, text) é STABLE (não serve em coluna gerada), então
-- usamos um wrapper IMMUTABLE especializado para text[] com separador constante.

CREATE OR REPLACE FUNCTION public.f_tags_text(text[])
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT array_to_string($1, ' ') $$;

ALTER TABLE public.cerebro_conhecimento DROP COLUMN IF EXISTS tsv;
ALTER TABLE public.cerebro_conhecimento
  ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(titulo, ''))), 'A') ||
    setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(secao,  ''))), 'B') ||
    setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(conteudo, ''))), 'C') ||
    setweight(to_tsvector('portuguese', public.f_unaccent(coalesce(public.f_tags_text(tags), ''))), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_cerebro_conhecimento_tsv
  ON public.cerebro_conhecimento USING gin (tsv);
