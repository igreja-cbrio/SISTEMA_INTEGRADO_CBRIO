-- Kids · vínculo sala ↔ localização do Patrimônio (2026-06-25)
-- Liga a sala do Kids a uma localização do módulo Patrimônio. Permite sincronizar
-- (criar salas a partir das localizações Kids) e refletir os bens do patrimônio
-- no "estoque por sala" do Kids.
ALTER TABLE public.kids_salas
  ADD COLUMN IF NOT EXISTS pat_localizacao_id uuid REFERENCES public.pat_localizacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kids_salas_pat_loc
  ON public.kids_salas(pat_localizacao_id) WHERE pat_localizacao_id IS NOT NULL;
