-- Importação de pesquisas antigas (Google Forms) para o módulo NPS (2026-07-22).
-- (1) Respostas importadas de planilha ganham origem 'importado'.
ALTER TABLE public.nps_respostas DROP CONSTRAINT IF EXISTS nps_respostas_origem_check;
ALTER TABLE public.nps_respostas ADD CONSTRAINT nps_respostas_origem_check
  CHECK (origem = ANY (ARRAY['logado'::text, 'publico'::text, 'importado'::text]));

-- (2) Lembra a origem do import (URL do form + mapeamento de perguntas + escala da
-- nota) para auto-mapear as colunas da planilha de respostas depois.
ALTER TABLE public.nps_pesquisas ADD COLUMN IF NOT EXISTS import_meta jsonb;
