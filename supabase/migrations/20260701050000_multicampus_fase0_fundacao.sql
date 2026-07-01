-- Multi-campus · FASE 0 (fundação) · 2026-07-01
-- Ref: docs/multicampus-plano.md (ADR). Prepara o terreno para o 2º campus
-- (fim de 2026) SEM mudar comportamento: nada consome estas estruturas ainda.
-- 100% aditiva. As policies por campus (Fase 2) só serão escritas depois de
-- backfillar usuario_igrejas para todos os usuários.
--
-- NÃO incluído aqui (por dependerem de outro passo):
--   - fix da policy USING(true) da tabela `igrejas` (precisa das defs atuais)
--   - req.user.igrejas[] no auth.js (Fase 0b · após esta migration aplicada)

-- ─────────────────────────────────────────────────────────────────────────
-- 1. usuario_igrejas · escopo de ACESSO (M:N) · distinto do campus-base do
--    membro (mem_membros.igreja_id). Um usuário pode ter acesso a N campi
--    (liderança regional, diretoria); membro pertence a UM campus.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usuario_igrejas (
  usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  igreja_id  UUID NOT NULL REFERENCES public.igrejas(id)  ON DELETE CASCADE,
  papel      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, igreja_id)
);
CREATE INDEX IF NOT EXISTS idx_usuario_igrejas_usuario ON public.usuario_igrejas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_igrejas_igreja  ON public.usuario_igrejas (igreja_id);

ALTER TABLE public.usuario_igrejas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuario_igrejas_select      ON public.usuario_igrejas;
DROP POLICY IF EXISTS usuario_igrejas_write_admin ON public.usuario_igrejas;
DROP POLICY IF EXISTS usuario_igrejas_service     ON public.usuario_igrejas;

-- leitura aberta a autenticado (mapeamento, sem PII); escrita só super-admin.
CREATE POLICY usuario_igrejas_select ON public.usuario_igrejas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY usuario_igrejas_write_admin ON public.usuario_igrejas
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY usuario_igrejas_service ON public.usuario_igrejas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.usuario_igrejas IS
  'Multi-campus · escopo de ACESSO por usuário (M:N). Super-admin e diretoria geral veem todos os campi (via current_user_igreja_ids). Distinto de mem_membros.igreja_id (campus-base do membro).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Helper current_user_igreja_ids() · campi que o usuário PODE acessar.
--    Super-admin ou diretoria geral = todos os campi ativos. Senão, os campi
--    de usuario_igrejas. SECURITY DEFINER (não recorre à RLS). Vazio = sem
--    campus (Fase 2 fará backfill antes de as policies usarem o helper).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_igreja_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT CASE
    WHEN public.is_super_admin()
         OR EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = auth.uid() AND p.is_diretoria_geral IS TRUE)
    THEN ARRAY(SELECT id FROM public.igrejas WHERE ativa)
    ELSE COALESCE(
      (SELECT array_agg(ui.igreja_id) FROM public.usuario_igrejas ui
        WHERE ui.usuario_id = auth.uid()),
      ARRAY[]::uuid[]
    )
  END
$$;

COMMENT ON FUNCTION public.current_user_igreja_ids() IS
  'Multi-campus · UUIDs dos campi que o usuário pode acessar. Super-admin/diretoria geral = todos ativos. STABLE SECURITY DEFINER (padrão dos helpers de RLS). Uso futuro em policies: igreja_id = ANY(current_user_igreja_ids()).';

GRANT EXECUTE ON FUNCTION public.current_user_igreja_ids() TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. modulos.escopo_campus · define quais módulos isolam dados por campus
--    (decisão do usuário: "visibilidade configurável por módulo"). Ainda NÃO
--    consumido pela RLS (Fase 2). Default 'compartilhado'; marca os módulos
--    de operação/PII como 'isolado'. Lista ajustável na UI de permissões.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.modulos
  ADD COLUMN IF NOT EXISTS escopo_campus TEXT NOT NULL DEFAULT 'compartilhado'
  CHECK (escopo_campus IN ('isolado', 'compartilhado'));

UPDATE public.modulos SET escopo_campus = 'isolado'
 WHERE slug IN (
   'integracao','cuidados','online','next','voluntariado','membresia','grupos',
   'rh','financeiro','logistica','patrimonio','solicitacoes','dados-brutos',
   'kids','ami','bridge','producao','minha-area'
 );

COMMENT ON COLUMN public.modulos.escopo_campus IS
  'Multi-campus · isolado = dados filtrados por campus na RLS (Fase 2); compartilhado = sem filtro de campus (catálogos, estratégico, institucional).';
