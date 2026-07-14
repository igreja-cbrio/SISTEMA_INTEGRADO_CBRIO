-- Logo do Kids pra etiqueta de aniversário (global · na config da etiqueta)
-- ----------------------------------------------------------------------------
-- A etiqueta de aniversário (4ª etiqueta impressa na semana do aniversário)
-- usa uma logo do Kids que a equipe (Milena/Mari) sobe nas Configurações →
-- Etiqueta. URL pública (bucket fotos-membros/kids-logos). Aditiva/idempotente.

ALTER TABLE public.kids_etiqueta_config
  ADD COLUMN IF NOT EXISTS logo_aniversario_url text;

COMMENT ON COLUMN public.kids_etiqueta_config.logo_aniversario_url IS
  'URL pública da logo do Kids impressa na etiqueta de aniversário (bucket fotos-membros/kids-logos).';
