-- Trilha por pessoa (Cuidados · aba "Visitas e Atendimentos") · 2026-07-22.
-- A aba deixa de ser uma lista solta de atendimentos independentes e passa a
-- agrupar por PESSOA: o histórico de cada pessoa vira um fio contínuo, com
-- comentários por atendimento. A trilha JUNTA na leitura cui_visitas
-- (visitas/atendimentos) + cui_acompanhamentos (aconselhamento/capelania) —
-- NÃO migra/mexe no cui_acompanhamentos (ele alimenta KPIs/painel/notif/cérebro/
-- LGPD). Este comentário é polimórfico (ref_tipo visita|acompanhamento) pra
-- anotar qualquer atendimento que apareça na trilha.
CREATE TABLE IF NOT EXISTS public.cui_atendimento_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_tipo text NOT NULL CHECK (ref_tipo IN ('visita', 'acompanhamento')),
  ref_id uuid NOT NULL,
  texto text NOT NULL,
  autor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  autor_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cui_atend_coment_ref
  ON public.cui_atendimento_comentarios (ref_tipo, ref_id, created_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.cui_atendimento_comentarios ENABLE ROW LEVEL SECURITY;
-- Acesso pela API (service_role bypassa). Leitura/escrita direta só p/ Cuidados.
CREATE POLICY cui_atend_coment_sel ON public.cui_atendimento_comentarios FOR SELECT TO authenticated
  USING (public.current_user_module_level('cuidados') >= 1);
CREATE POLICY cui_atend_coment_ins ON public.cui_atendimento_comentarios FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('cuidados') >= 2);
CREATE POLICY cui_atend_coment_upd ON public.cui_atendimento_comentarios FOR UPDATE TO authenticated
  USING (public.current_user_module_level('cuidados') >= 3)
  WITH CHECK (public.current_user_module_level('cuidados') >= 3);
CREATE POLICY cui_atend_coment_del ON public.cui_atendimento_comentarios FOR DELETE TO authenticated
  USING (public.is_super_admin());
CREATE POLICY cui_atend_coment_srv ON public.cui_atendimento_comentarios FOR ALL TO service_role USING (true) WITH CHECK (true);
