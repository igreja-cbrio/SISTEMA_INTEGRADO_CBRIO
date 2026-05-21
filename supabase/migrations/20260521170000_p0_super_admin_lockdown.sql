-- =====================================================================
-- P0 · Super-admin + lockdown crítico de tabelas sensíveis
-- =====================================================================
-- Resolve achados da auditoria de 2026-05-21:
--   1. cargo_modulo_permissao com policies USING(true) WITH CHECK(true)
--      → privilege escalation trivial via anon key (qualquer authenticated
--        edita a matriz e vira admin de qualquer módulo)
--   2. igrejas com write aberto pra qualquer authenticated
--   3. kpi_metas com write aberto (metas estratégicas alteradas por qualquer um)
--   4. mem_grupo_pedidos com policy de INSERT pra role anon (vetor de spam · forms
--      públicos já usam endpoint backend /public/grupos/inscrever via service_role,
--      a policy anon era resíduo morto)
--
-- Estratégia:
--   - Cria tabela app_super_admins gerenciada por email (fácil adicionar Marcos+
--     Matheus antes mesmo do signup, e qualquer pessoa nova depois)
--   - Função public.is_super_admin() SECURITY DEFINER pra evitar recursão de RLS
--   - Mantém READ aberto pra authenticated (não quebra ModuleGuard / UIs)
--   - Restringe WRITE a super-admin. UI /admin/permissoes continua funcionando
--     porque usa backend (service_role bypassa RLS).
--
-- Reversibilidade: TODAS as alterações usam DROP IF EXISTS + CREATE, idempotente.
-- Pra reverter: restaurar policies antigas com USING(true) WITH CHECK(true).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela app_super_admins (controle de quem é admin do sistema)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_super_admins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  nome       TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by   TEXT,
  notes      TEXT
);

COMMENT ON TABLE public.app_super_admins IS
  'Lista de super-admins do sistema (bypass de RLS em tabelas críticas via is_super_admin()). Match por email contra auth.users.';

ALTER TABLE public.app_super_admins ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2. Função is_super_admin() — SECURITY DEFINER pra evitar recursão de RLS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_super_admins sa
    JOIN auth.users u ON LOWER(u.email) = LOWER(sa.email)
    WHERE u.id = auth.uid()
      AND sa.ativo = true
  )
$$;

COMMENT ON FUNCTION public.is_super_admin() IS
  'TRUE se o usuário autenticado está em app_super_admins ativo. SECURITY DEFINER pra evitar recursão de RLS na própria tabela. Match por email lowercase contra auth.users.';

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 3. Policies da própria app_super_admins (só super-admin pode mexer)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS app_super_admins_select ON public.app_super_admins;
DROP POLICY IF EXISTS app_super_admins_write  ON public.app_super_admins;
DROP POLICY IF EXISTS app_super_admins_service ON public.app_super_admins;

CREATE POLICY app_super_admins_select ON public.app_super_admins
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY app_super_admins_write ON public.app_super_admins
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Service role bypass (pra backend conseguir gerenciar via /api admin)
CREATE POLICY app_super_admins_service ON public.app_super_admins
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 4. Seed inicial · Marcos + Matheus
-- ---------------------------------------------------------------------
INSERT INTO public.app_super_admins (email, nome, added_by, notes) VALUES
  ('infra@cbrio.com.br',          'Marcos Paulo Almeida',   'bootstrap-p0', 'Dev infra/ERP · auditoria de segurança 2026-05-21'),
  ('matheus.toscano@cbrio.org',   'Matheus Ribeiro Toscano','bootstrap-p0', 'Dev infra/ERP · auditoria de segurança 2026-05-21')
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. LOCKDOWN · cargo_modulo_permissao
--    Bug crítico: qualquer authenticated podia se promover via JS direto.
--    Mantém READ aberto pra ModuleGuard (anon key lê a matriz pra
--    calcular permissões). Trava WRITE.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read cargo_modulo_permissao"   ON public.cargo_modulo_permissao;
DROP POLICY IF EXISTS "Authenticated write cargo_modulo_permissao"  ON public.cargo_modulo_permissao;
DROP POLICY IF EXISTS "Authenticated update cargo_modulo_permissao" ON public.cargo_modulo_permissao;
DROP POLICY IF EXISTS "Authenticated delete cargo_modulo_permissao" ON public.cargo_modulo_permissao;
DROP POLICY IF EXISTS cmp_read_authenticated   ON public.cargo_modulo_permissao;
DROP POLICY IF EXISTS cmp_insert_super_admin   ON public.cargo_modulo_permissao;
DROP POLICY IF EXISTS cmp_update_super_admin   ON public.cargo_modulo_permissao;
DROP POLICY IF EXISTS cmp_delete_super_admin   ON public.cargo_modulo_permissao;
DROP POLICY IF EXISTS cmp_service_role         ON public.cargo_modulo_permissao;

CREATE POLICY cmp_read_authenticated ON public.cargo_modulo_permissao
  FOR SELECT TO authenticated USING (true);

CREATE POLICY cmp_insert_super_admin ON public.cargo_modulo_permissao
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

CREATE POLICY cmp_update_super_admin ON public.cargo_modulo_permissao
  FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY cmp_delete_super_admin ON public.cargo_modulo_permissao
  FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE POLICY cmp_service_role ON public.cargo_modulo_permissao
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 6. LOCKDOWN · igrejas
--    Read continua aberto. Write só super-admin.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS igrejas_write_authenticated   ON public.igrejas;
DROP POLICY IF EXISTS igrejas_insert_super_admin    ON public.igrejas;
DROP POLICY IF EXISTS igrejas_update_super_admin    ON public.igrejas;
DROP POLICY IF EXISTS igrejas_delete_super_admin    ON public.igrejas;
DROP POLICY IF EXISTS igrejas_service_role          ON public.igrejas;

CREATE POLICY igrejas_insert_super_admin ON public.igrejas
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

CREATE POLICY igrejas_update_super_admin ON public.igrejas
  FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY igrejas_delete_super_admin ON public.igrejas
  FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE POLICY igrejas_service_role ON public.igrejas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- igrejas_read_authenticated (read pra todos) permanece intacto.

-- ---------------------------------------------------------------------
-- 7. LOCKDOWN · kpi_metas
--    Metas são decisão estratégica · só super-admin altera.
--    Read continua aberto pra dashboards lerem.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS auth_read_kpi_metas              ON public.kpi_metas;
DROP POLICY IF EXISTS service_role_kpi_metas           ON public.kpi_metas;
DROP POLICY IF EXISTS "Authenticated write kpi_metas"  ON public.kpi_metas;
DROP POLICY IF EXISTS "Authenticated update kpi_metas" ON public.kpi_metas;
DROP POLICY IF EXISTS "Authenticated delete kpi_metas" ON public.kpi_metas;
DROP POLICY IF EXISTS kpi_metas_read                   ON public.kpi_metas;
DROP POLICY IF EXISTS kpi_metas_insert_super_admin     ON public.kpi_metas;
DROP POLICY IF EXISTS kpi_metas_update_super_admin     ON public.kpi_metas;
DROP POLICY IF EXISTS kpi_metas_delete_super_admin     ON public.kpi_metas;
DROP POLICY IF EXISTS kpi_metas_service_role           ON public.kpi_metas;

CREATE POLICY kpi_metas_read ON public.kpi_metas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY kpi_metas_insert_super_admin ON public.kpi_metas
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

CREATE POLICY kpi_metas_update_super_admin ON public.kpi_metas
  FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY kpi_metas_delete_super_admin ON public.kpi_metas
  FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE POLICY kpi_metas_service_role ON public.kpi_metas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 8. Drop · policy anon insert em mem_grupo_pedidos
--    Form público /inscricao-grupos usa POST /public/grupos/inscrever
--    (backend com service_role). A policy anon era resíduo morto e
--    vetor de spam.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon insert mem_grupo_pedidos" ON public.mem_grupo_pedidos;

-- ---------------------------------------------------------------------
-- 9. Comentário de auditoria
-- ---------------------------------------------------------------------
COMMENT ON COLUMN public.cargo_modulo_permissao.nivel IS
  'Matriz de permissões cargo×módulo. Write restrito a super-admin (app_super_admins) via RLS desde 2026-05-21. UI /admin/permissoes usa backend (service_role) e continua funcionando.';
