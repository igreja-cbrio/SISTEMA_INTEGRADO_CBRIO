-- ============================================================
-- Comunicados / Mural · conteúdo criado no Marketing → app (mural + push)
-- Sem PII (avisos da igreja). Foto em bucket público 'comunicados'.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.comunicados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  corpo text NOT NULL,
  foto_url text,
  -- segmentação: todos | ami | bridge | online | sede | kids
  segmento text NOT NULL DEFAULT 'todos',
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado', 'arquivado')),
  publicado_em timestamptz,
  criado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_comunicados_pub
  ON public.comunicados (status, publicado_em DESC) WHERE deleted_at IS NULL;

ALTER TABLE public.comunicados ENABLE ROW LEVEL SECURITY;

-- Equipe Marketing lê (>=1) e edita (>=3). App lê os publicados via backend
-- (service role). Sem acesso anon direto.
DROP POLICY IF EXISTS comunicados_staff_read ON public.comunicados;
CREATE POLICY comunicados_staff_read ON public.comunicados
  FOR SELECT TO authenticated USING (public.current_user_module_level('marketing') >= 1);

DROP POLICY IF EXISTS comunicados_staff_write ON public.comunicados;
CREATE POLICY comunicados_staff_write ON public.comunicados
  FOR ALL TO authenticated
  USING (public.current_user_module_level('marketing') >= 3)
  WITH CHECK (public.current_user_module_level('marketing') >= 3);

DROP POLICY IF EXISTS comunicados_service ON public.comunicados;
CREATE POLICY comunicados_service ON public.comunicados
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Bucket público pros banners/fotos dos comunicados.
INSERT INTO storage.buckets (id, name, public)
VALUES ('comunicados', 'comunicados', true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.comunicados IS
  'Avisos/comunicados criados no Marketing, exibidos no mural do app + push segmentado.';
