-- Refino do modulo Grupos:
-- 1. Consolida colunas que o backend ja usava mas nao estavam na migration original
-- 2. Cria tabela mem_grupo_documentos (biblioteca de materiais)
-- 3. Cria funcao RPC para incremento atomico de presencas

-- ── Colunas adicionais em mem_grupos ──
ALTER TABLE public.mem_grupos
  ADD COLUMN IF NOT EXISTS tema text,
  ADD COLUMN IF NOT EXISTS recorrencia text DEFAULT 'semanal',
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS grupo_origem_id uuid REFERENCES public.mem_grupos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS cep text;

CREATE INDEX IF NOT EXISTS idx_mem_grupos_origem ON public.mem_grupos(grupo_origem_id) WHERE grupo_origem_id IS NOT NULL;

-- ── Coluna presencas em mem_grupo_membros ──
ALTER TABLE public.mem_grupo_membros
  ADD COLUMN IF NOT EXISTS presencas integer NOT NULL DEFAULT 0;

-- ── Biblioteca de materiais dos grupos ──
CREATE TABLE IF NOT EXISTS public.mem_grupo_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text,
  nome text NOT NULL,
  comentario text,
  etiquetas text[] NOT NULL DEFAULT ARRAY['Todos']::text[],
  grupo_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  storage_path text,
  sharepoint_url text,
  sharepoint_item_id text,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mem_grupo_documentos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read mem_grupo_documentos" ON public.mem_grupo_documentos FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated write mem_grupo_documentos" ON public.mem_grupo_documentos FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated update mem_grupo_documentos" ON public.mem_grupo_documentos FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated delete mem_grupo_documentos" ON public.mem_grupo_documentos FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_mem_grupo_documentos_etiquetas ON public.mem_grupo_documentos USING GIN (etiquetas);
CREATE INDEX IF NOT EXISTS idx_mem_grupo_documentos_grupos ON public.mem_grupo_documentos USING GIN (grupo_ids);
CREATE INDEX IF NOT EXISTS idx_mem_grupo_documentos_created ON public.mem_grupo_documentos(created_at DESC);

-- ── RPC: incremento atomico de presencas (evita race condition) ──
CREATE OR REPLACE FUNCTION public.incrementar_presenca_grupo(p_id uuid)
RETURNS public.mem_grupo_membros
LANGUAGE sql
AS $$
  UPDATE public.mem_grupo_membros
     SET presencas = COALESCE(presencas, 0) + 1
   WHERE id = p_id
   RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION public.incrementar_presenca_grupo(uuid) TO authenticated, service_role;
