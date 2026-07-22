-- Controle de "parabéns enviados" por voluntário/ano (o líder acompanha quem já
-- foi parabenizado). Uma linha por voluntário por ano. Já aplicada via MCP.
CREATE TABLE IF NOT EXISTS public.vol_parabens (
  vol_profile_id uuid NOT NULL,
  ano int NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  enviado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resultado text,
  PRIMARY KEY (vol_profile_id, ano)
);
ALTER TABLE public.vol_parabens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vol_parabens_sel ON public.vol_parabens;
CREATE POLICY vol_parabens_sel ON public.vol_parabens FOR SELECT TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 1);
DROP POLICY IF EXISTS vol_parabens_srv ON public.vol_parabens;
CREATE POLICY vol_parabens_srv ON public.vol_parabens FOR ALL TO service_role USING (true) WITH CHECK (true);
