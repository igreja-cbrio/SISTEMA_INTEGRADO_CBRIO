-- Migration manual — rodar no SQL Editor do Supabase
-- Adiciona flag `has_online_stream` em vol_service_types para indicar
-- quais tipos de culto têm transmissão online (YouTube). Cultos sem
-- online (ex.: Bridge) ficam de fora da coleta automática D+1/D+7
-- e dos alertas "sem vídeo vinculado".

ALTER TABLE public.vol_service_types
  ADD COLUMN IF NOT EXISTS has_online_stream BOOLEAN NOT NULL DEFAULT true;

-- Marca o(s) tipo(s) Bridge como sem transmissão online.
-- Ajuste o filtro caso o nome no cadastro seja diferente.
UPDATE public.vol_service_types
   SET has_online_stream = false
 WHERE LOWER(name) LIKE '%bridge%';
