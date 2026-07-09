-- ============================================================================
-- Grupos · Fundação do redesenho (2026-07-09)
-- Aditivo e idempotente. Não muda comportamento sozinho — o código liga os usos.
--   1) Campos no grupo: faixa_etaria, capacidade, aceitando_inscricoes
--   2) Redes: mem_redes (rede → supervisor) + mem_grupos.rede_id
-- ============================================================================

-- 1) Campos do grupo -----------------------------------------------------------
ALTER TABLE public.mem_grupos
  ADD COLUMN IF NOT EXISTS faixa_etaria text,
  ADD COLUMN IF NOT EXISTS capacidade int,
  ADD COLUMN IF NOT EXISTS aceitando_inscricoes boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.mem_grupos.faixa_etaria IS
  'Público-alvo por idade (Adolescentes / Jovens / Jovens Adultos / Adultos / Todas as idades). NULL = não tipificado.';
COMMENT ON COLUMN public.mem_grupos.capacidade IS
  'Limite de membros definido pelo líder (conselho, não trava). NULL = sem limite.';
COMMENT ON COLUMN public.mem_grupos.aceitando_inscricoes IS
  'Se false, o grupo some do formulário público (líder parou de receber pedidos).';

-- 2) Redes ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_redes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cor text,
  supervisor_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mem_grupos
  ADD COLUMN IF NOT EXISTS rede_id uuid REFERENCES public.mem_redes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mem_grupos_rede
  ON public.mem_grupos(rede_id) WHERE rede_id IS NOT NULL;

-- RLS: rede é estrutura organizacional (não é PII) → leitura p/ autenticado;
-- escrita p/ quem tem grupos>=3 ou super-admin; delete só super-admin; backend
-- via service_role. Segue o padrão dos helpers current_user_module_level/is_super_admin.
ALTER TABLE public.mem_redes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY mem_redes_select ON public.mem_redes
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mem_redes_insert ON public.mem_redes
    FOR INSERT TO authenticated
    WITH CHECK (public.current_user_module_level('grupos') >= 3 OR public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mem_redes_update ON public.mem_redes
    FOR UPDATE TO authenticated
    USING (public.current_user_module_level('grupos') >= 3 OR public.is_super_admin())
    WITH CHECK (public.current_user_module_level('grupos') >= 3 OR public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mem_redes_delete ON public.mem_redes
    FOR DELETE TO authenticated USING (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mem_redes_service ON public.mem_redes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
