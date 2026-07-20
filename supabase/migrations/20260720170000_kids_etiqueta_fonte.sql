-- Fonte (família) e escala de tamanho configuráveis na etiqueta Kids.
-- A logo das salas saiu da etiqueta (padronização) — logo_tamanho/logo_posicao
-- ficam por retrocompatibilidade, mas não são mais usadas na renderização.
ALTER TABLE public.kids_etiqueta_config
  ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'sans';
ALTER TABLE public.kids_etiqueta_config
  ADD COLUMN IF NOT EXISTS escala_fonte text NOT NULL DEFAULT 'M';

COMMENT ON COLUMN public.kids_etiqueta_config.fonte IS 'Família da fonte da etiqueta (sans|condensada|arredondada|serif|mono).';
COMMENT ON COLUMN public.kids_etiqueta_config.escala_fonte IS 'Escala global do tamanho da fonte da etiqueta (P|M|G|GG).';
