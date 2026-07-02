-- E-mails do voluntariado · v2
-- 1) vol_email_config: assinatura global do módulo (HTML com logo opcional).
-- 2) incluir_assinatura por disparo.
-- Sem PII → sem deleted_at (config singleton · linha id=1).

CREATE TABLE IF NOT EXISTS public.vol_email_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  assinatura_html TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.vol_email_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.vol_email_config IS
  'Config singleton dos disparos de e-mail do voluntariado. assinatura_html = assinatura global (texto + logo) appendada ao corpo quando o disparo tem incluir_assinatura=true.';

ALTER TABLE public.vol_email_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY vol_email_config_select ON public.vol_email_config
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 1 OR public.is_super_admin());

CREATE POLICY vol_email_config_update ON public.vol_email_config
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());

CREATE POLICY vol_email_config_service ON public.vol_email_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.vol_email_disparos
  ADD COLUMN IF NOT EXISTS incluir_assinatura BOOLEAN NOT NULL DEFAULT true;
