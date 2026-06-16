-- Fix · import da frequência de voluntariado quebrava com
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Causa: o índice único de idempotência era PARCIAL (WHERE deleted_at IS NULL).
-- O ON CONFLICT do PostgREST (Supabase JS .upsert({ onConflict: '...' })) só
-- consegue mirar um índice único por inferência de colunas quando ele é
-- NÃO-parcial; com predicado parcial o Postgres não casa o arbiter e rejeita.
--
-- Solução: recriar o índice sem o WHERE. Não há fluxo de soft-delete ativo
-- nesta tabela (só o import escreve), então uma linha soft-deletada ocupar o
-- slot único é aceitável — o re-import com ignoreDuplicates apenas a ignora.

DROP INDEX IF EXISTS public.uq_vol_servhist;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vol_servhist
  ON public.vol_servicos_historico (nome_norm, data, culto_label, origem);
