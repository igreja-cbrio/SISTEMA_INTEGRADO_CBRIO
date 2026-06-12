-- Adiciona campo complemento ao endereco do grupo (apto, bloco, casa, etc.)
ALTER TABLE public.mem_grupos
  ADD COLUMN IF NOT EXISTS complemento text;

COMMENT ON COLUMN public.mem_grupos.complemento IS 'Complemento do endereco (apto, bloco, casa, ponto de referencia)';
