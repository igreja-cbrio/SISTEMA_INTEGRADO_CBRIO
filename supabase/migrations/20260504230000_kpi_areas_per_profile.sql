-- KPIs por area: cada usuario lider de area pode editar/preencher
-- apenas KPIs das areas em que esta atribuido.

-- profiles.kpi_areas: array de areas que o usuario lidera
-- (separado de profiles.area que e o "departamento" RH/organizacional)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kpi_areas text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS idx_profiles_kpi_areas ON public.profiles USING GIN (kpi_areas);

-- Backfill: se o profile ja tem area (singular) preenchida, copiar para
-- kpi_areas em lowercase (KPIs usam ami/cba/kids/integracao em minusculas)
UPDATE public.profiles
   SET kpi_areas = ARRAY[lower(area)]
 WHERE area IS NOT NULL AND area <> '' AND kpi_areas = ARRAY[]::text[];

-- Helper para checar se o usuario atual pode editar KPI de uma area
CREATE OR REPLACE FUNCTION public.can_edit_kpi_area(p_area text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND active = true
       AND (
         role IN ('admin', 'diretor')
         OR lower(p_area) = ANY(kpi_areas)
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_kpi_area(text) TO authenticated, service_role;

-- ── Defense in depth: RLS opcional em kpi_registros / kpi_indicadores_taticos ──
-- O gate primario continua sendo o backend (via service role), mas as policies
-- abaixo previnem que clientes que usem auth.uid() (futura migracao para
-- supabase-js direto) bypassem a regra.

-- kpi_registros: write so pra admins/diretores ou lideres da area do indicador
DO $$ BEGIN
  DROP POLICY IF EXISTS "kpi_registros_write_by_area" ON public.kpi_registros;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "kpi_registros_write_by_area" ON public.kpi_registros
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit_kpi_area(
      (SELECT area FROM public.kpi_indicadores_taticos WHERE id = indicador_id)
    )
  );

DO $$ BEGIN
  DROP POLICY IF EXISTS "kpi_registros_update_by_area" ON public.kpi_registros;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "kpi_registros_update_by_area" ON public.kpi_registros
  FOR UPDATE TO authenticated
  USING (
    public.can_edit_kpi_area(
      (SELECT area FROM public.kpi_indicadores_taticos WHERE id = indicador_id)
    )
  );

-- kpi_indicadores_taticos: update so pra admins/diretores ou lideres da area
DO $$ BEGIN
  DROP POLICY IF EXISTS "kpi_taticos_update_by_area" ON public.kpi_indicadores_taticos;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "kpi_taticos_update_by_area" ON public.kpi_indicadores_taticos
  FOR UPDATE TO authenticated
  USING (public.can_edit_kpi_area(area));

DO $$ BEGIN
  DROP POLICY IF EXISTS "kpi_taticos_insert_by_area" ON public.kpi_indicadores_taticos;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "kpi_taticos_insert_by_area" ON public.kpi_indicadores_taticos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_kpi_area(area));
