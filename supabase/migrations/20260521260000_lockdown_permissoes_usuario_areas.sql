-- =====================================================================
-- P0 · Lockdown · permissoes_modulo + usuario_areas
-- =====================================================================
-- Auditoria 2026-05-21 identificou que essas 2 tabelas ainda têm
-- policies `USING(true)` em writes. São tão críticas quanto
-- `cargo_modulo_permissao` (já fechada na PR #586):
--
-- - permissoes_modulo: overrides individuais com nivel + expiracao.
--   Qualquer authenticated pode criar override pra si mesma · vira
--   admin de qualquer módulo. Privilege escalation trivial.
--
-- - usuario_areas: define áreas de cada user (alimenta AREA_MODULO_BOOST
--   que escala nível pra 5 em módulos relevantes). Qualquer
--   authenticated pode atribuir área KIDS a si mesma e virar admin de
--   Kids via boost.
--
-- Estratégia idêntica à PR #586: read aberto, write só super-admin.
-- =====================================================================

-- =====================================================================
-- ETAPA 1 · Limpa policies abertas existentes
-- =====================================================================
DO $$
DECLARE v_pol RECORD;
BEGIN
  FOR v_pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('permissoes_modulo', 'usuario_areas')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   v_pol.policyname, v_pol.tablename);
  END LOOP;
END $$;

-- =====================================================================
-- ETAPA 2 · permissoes_modulo (overrides individuais)
-- =====================================================================
CREATE POLICY permissoes_modulo_select ON public.permissoes_modulo
  FOR SELECT TO authenticated USING (true);  -- precisa ler pra ModuleGuard

CREATE POLICY permissoes_modulo_insert ON public.permissoes_modulo
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY permissoes_modulo_update ON public.permissoes_modulo
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY permissoes_modulo_delete ON public.permissoes_modulo
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY permissoes_modulo_service ON public.permissoes_modulo
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 3 · usuario_areas (atribuição de áreas)
-- =====================================================================
CREATE POLICY usuario_areas_select ON public.usuario_areas
  FOR SELECT TO authenticated USING (true);  -- precisa ler pra boost calc

CREATE POLICY usuario_areas_insert ON public.usuario_areas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY usuario_areas_update ON public.usuario_areas
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY usuario_areas_delete ON public.usuario_areas
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY usuario_areas_service ON public.usuario_areas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 4 · Audit log nas 2 tabelas (mudanças sensíveis)
-- =====================================================================
DROP TRIGGER IF EXISTS trg_audit_permissoes_modulo ON public.permissoes_modulo;
CREATE TRIGGER trg_audit_permissoes_modulo
AFTER INSERT OR UPDATE OR DELETE ON public.permissoes_modulo
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'nivel,nivel_leitura,nivel_escrita,pode_exportar,pode_aprovar,escopo_proprio,expira_em'
);

DROP TRIGGER IF EXISTS trg_audit_usuario_areas ON public.usuario_areas;
CREATE TRIGGER trg_audit_usuario_areas
AFTER INSERT OR UPDATE OR DELETE ON public.usuario_areas
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'usuario_id,area_id,is_principal'
);

COMMENT ON TABLE public.permissoes_modulo IS
  'Overrides individuais cargo×módulo (com expiracao). Write so super-admin desde 2026-05-21. Audit log ativo.';

COMMENT ON TABLE public.usuario_areas IS
  'Atribuicao de areas (alimenta AREA_MODULO_BOOST). Write so super-admin desde 2026-05-21. Audit log ativo.';
