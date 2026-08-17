-- Liderança da escala é contextual ao template e à área: Online pode ter um
-- responsável no template de quarta e outro no template de domingo. Não vive
-- em `vol_teams` (catálogo global) nem em item de função (repetiria o mesmo
-- responsável em cada função da área).

BEGIN;

CREATE TABLE IF NOT EXISTS public.vol_escala_template_liderancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.vol_escala_templates(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.vol_teams(id) ON DELETE CASCADE,
  responsavel_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vol_escala_template_liderancas_template_equipe_unica
    UNIQUE (template_id, team_id)
);

CREATE INDEX IF NOT EXISTS vol_esc_tpl_liderancas_responsavel_idx
  ON public.vol_escala_template_liderancas(responsavel_profile_id);

CREATE INDEX IF NOT EXISTS vol_esc_tpl_liderancas_template_idx
  ON public.vol_escala_template_liderancas(template_id, team_id);

CREATE OR REPLACE FUNCTION public.vol_escala_template_liderancas_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vol_esc_tpl_liderancas_touch
  ON public.vol_escala_template_liderancas;
CREATE TRIGGER trg_vol_esc_tpl_liderancas_touch
  BEFORE UPDATE ON public.vol_escala_template_liderancas
  FOR EACH ROW EXECUTE FUNCTION public.vol_escala_template_liderancas_touch_updated_at();

ALTER TABLE public.vol_escala_template_liderancas ENABLE ROW LEVEL SECURITY;

CREATE POLICY vol_escala_template_liderancas_select
  ON public.vol_escala_template_liderancas FOR SELECT TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 1 OR public.is_super_admin());

CREATE POLICY vol_escala_template_liderancas_write
  ON public.vol_escala_template_liderancas FOR ALL TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());

CREATE POLICY vol_escala_template_liderancas_service
  ON public.vol_escala_template_liderancas FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;
