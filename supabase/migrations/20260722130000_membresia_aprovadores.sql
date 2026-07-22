-- Aprovadores extras de cadastros de membresia (além de admin/diretor e da área
-- Integração, liberados por lógica no backend). Ex.: Marcelo Soares (Cuidados).
-- Já aplicada via MCP.
CREATE TABLE IF NOT EXISTS public.membresia_aprovadores (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.membresia_aprovadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membresia_aprovadores_sel ON public.membresia_aprovadores;
CREATE POLICY membresia_aprovadores_sel ON public.membresia_aprovadores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS membresia_aprovadores_srv ON public.membresia_aprovadores;
CREATE POLICY membresia_aprovadores_srv ON public.membresia_aprovadores FOR ALL TO service_role USING (true) WITH CHECK (true);

-- seed: Marcelo Soares (Cuidados)
INSERT INTO public.membresia_aprovadores (profile_id)
VALUES ('fcbfdd44-4de9-4469-96cd-4d0aafc4298d')
ON CONFLICT (profile_id) DO NOTHING;
