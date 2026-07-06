-- Supervisor de área do voluntariado (2026-07-06)
-- Pedido do Matheus: a operação de montar escala migra pro APP, mas a categoria
-- "supervisor de área" é concedida aqui no sistema (aba Voluntariado). O supervisor
-- poderá, pelo app, escalar pessoas / ver escalas / ver sua área. Esta tabela é a
-- fonte da verdade da concessão; o app consulta via endpoint app-facing.
CREATE TABLE IF NOT EXISTS public.vol_area_supervisores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  area TEXT NOT NULL,
  concedido_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (membro_id, area)
);

COMMENT ON TABLE public.vol_area_supervisores IS
  'Supervisores de área do voluntariado (concedido no sistema, usado pelo app pra montar escala/ver escalas da área). area: kids/sede/ami/bridge/online/quarta/geral.';

CREATE INDEX IF NOT EXISTS idx_vol_area_supervisores_membro ON public.vol_area_supervisores(membro_id);

ALTER TABLE public.vol_area_supervisores ENABLE ROW LEVEL SECURITY;

CREATE POLICY vol_area_supervisores_select ON public.vol_area_supervisores
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 1 OR public.is_super_admin());
CREATE POLICY vol_area_supervisores_write ON public.vol_area_supervisores
  FOR ALL TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());
CREATE POLICY vol_area_supervisores_service ON public.vol_area_supervisores
  FOR ALL TO service_role USING (true) WITH CHECK (true);
