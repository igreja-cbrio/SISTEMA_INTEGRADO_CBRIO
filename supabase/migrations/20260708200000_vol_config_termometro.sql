-- ============================================================================
-- Voluntariado · config do Termômetro (régua de cálculo editável)
-- ============================================================================
-- Pedido do Matheus (2026-07-08): na aba Termômetro (Relatórios do Voluntariado),
-- poder VER e ALTERAR a memória de cálculo das categorias — Muito Ativo /
-- Regular / Pouco Ativo / Inativo — por CONTAGEM de check-ins no período (ex.:
-- "Muito Ativo = serve 8+ vezes"), alimentada automaticamente pelos check-ins.
--
-- Antes os limiares eram hardcoded no frontend e classificavam por TAXA de
-- presença (checkedIn/scheduled). Passa a classificar por CONTAGEM de check-ins
-- com limiares configuráveis nesta tabela (singleton · id=1).
--
-- Regra: count >= muito_ativo_min → Muito Ativo · >= regular_min → Regular ·
-- >= pouco_ativo_min → Pouco Ativo · senão → Inativo. sobrecarga_limite governa
-- o bloco "Servindo demais" (count > limite).
--
-- Catálogo (sem PII): RLS read=autenticado, write=super-admin, service_role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vol_config (
  id int PRIMARY KEY DEFAULT 1,
  muito_ativo_min int NOT NULL DEFAULT 8,
  regular_min int NOT NULL DEFAULT 4,
  pouco_ativo_min int NOT NULL DEFAULT 1,
  sobrecarga_limite int NOT NULL DEFAULT 8,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT vol_config_singleton CHECK (id = 1)
);

COMMENT ON TABLE public.vol_config IS
  'Config singleton do módulo Voluntariado. Régua do Termômetro: limiares de '
  'check-ins no período por categoria + limite de sobrecarga. Editável no /admin do módulo.';

INSERT INTO public.vol_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.vol_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vol_config' AND policyname='vol_config_select') THEN
    CREATE POLICY vol_config_select ON public.vol_config
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vol_config' AND policyname='vol_config_write') THEN
    CREATE POLICY vol_config_write ON public.vol_config
      FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vol_config' AND policyname='vol_config_service') THEN
    CREATE POLICY vol_config_service ON public.vol_config
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
