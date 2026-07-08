-- Logo por categoria/sala do Kids · impressa na etiqueta da criança
-- ----------------------------------------------------------------------------
-- Cada sala do Kids é uma categoria com faixa de idade (ex.: "Elevate 1").
-- A criança é sugerida pra sala pela idade no check-in, então a logo da sala
-- vira a logo que sai na etiqueta daquela criança. Guardamos só a URL pública
-- (bucket fotos-membros, prefixo kids-logos/) — sem PII, é branding da igreja.
--
-- Aditiva + idempotente. O backend tolera a coluna ausente (só o caminho novo
-- de upload/print de logo depende dela).

ALTER TABLE public.kids_salas
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.kids_salas.logo_url IS
  'URL pública da logo da categoria (bucket fotos-membros/kids-logos). Impressa na etiqueta da criança dessa sala.';
