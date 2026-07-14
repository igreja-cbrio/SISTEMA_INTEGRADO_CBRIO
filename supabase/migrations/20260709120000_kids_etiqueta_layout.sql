-- Layout configurável da etiqueta do Kids (singleton)
-- ----------------------------------------------------------------------------
-- Ajustes visuais da etiqueta impressa: tamanho da logo da categoria, posição
-- da logo em relação ao nome e tamanho da fonte do nome. Não é PII — é config.
-- Singleton (id=1). Aditiva + idempotente.

CREATE TABLE IF NOT EXISTS public.kids_etiqueta_config (
  id            smallint PRIMARY KEY DEFAULT 1,
  logo_tamanho  text NOT NULL DEFAULT 'M',        -- P | M | G
  logo_posicao  text NOT NULL DEFAULT 'esquerda', -- esquerda | direita | acima
  nome_tamanho  text NOT NULL DEFAULT 'auto',     -- auto | P | M | G
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kids_etiqueta_config_singleton CHECK (id = 1)
);

INSERT INTO public.kids_etiqueta_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.kids_etiqueta_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kids_etiqueta_config_read"    ON public.kids_etiqueta_config;
DROP POLICY IF EXISTS "kids_etiqueta_config_service" ON public.kids_etiqueta_config;
CREATE POLICY "kids_etiqueta_config_read"    ON public.kids_etiqueta_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kids_etiqueta_config_service" ON public.kids_etiqueta_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
