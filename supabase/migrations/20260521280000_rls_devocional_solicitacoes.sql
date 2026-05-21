-- =====================================================================
-- RLS contextual · devocional_* + solicitacoes_eventos
-- =====================================================================
-- Diagnóstico 2026-05-21 confirmou estas 4 tabelas com policies abertas:
--   - devocional_planos · 2 policies (read + write abertas)
--   - devocional_itens · 2 policies
--   - devocional_envios · 2 policies
--   - solicitacoes_eventos · 2 policies (read + write)
-- =====================================================================

-- ETAPA 1 · limpa policies legadas
DO $$
DECLARE v_pol RECORD;
BEGIN
  FOR v_pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'devocional_planos', 'devocional_itens',
        'devocional_envios', 'solicitacoes_eventos'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   v_pol.policyname, v_pol.tablename);
  END LOOP;
END $$;

-- ETAPA 2 · devocional_planos / devocional_itens (catálogos)
DO $$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['devocional_planos', 'devocional_itens'] LOOP
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (true)',
      v_table, v_table);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR INSERT TO authenticated WITH CHECK (public.current_user_module_level(''cuidados'') >= 3)',
      v_table, v_table);
    EXECUTE format(
      'CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated USING (public.current_user_module_level(''cuidados'') >= 3) WITH CHECK (public.current_user_module_level(''cuidados'') >= 3)',
      v_table, v_table);
    EXECUTE format(
      'CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated USING (public.is_super_admin())',
      v_table, v_table);
    EXECUTE format(
      'CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      v_table, v_table);
  END LOOP;
END $$;

-- ETAPA 3 · devocional_envios (engajamento individual)
CREATE POLICY devocional_envios_select ON public.devocional_envios
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('cuidados') >= 1
  );
CREATE POLICY devocional_envios_insert ON public.devocional_envios
  FOR INSERT TO authenticated
  WITH CHECK (
    membro_id = public.current_user_membro_id()  -- self
    OR public.current_user_module_level('cuidados') >= 2
  );
CREATE POLICY devocional_envios_update ON public.devocional_envios
  FOR UPDATE TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('cuidados') >= 3
  )
  WITH CHECK (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('cuidados') >= 3
  );
CREATE POLICY devocional_envios_delete ON public.devocional_envios
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY devocional_envios_service ON public.devocional_envios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ETAPA 4 · solicitacoes_eventos (audit imutável de solicitações)
CREATE POLICY solicitacoes_eventos_select ON public.solicitacoes_eventos
  FOR SELECT TO authenticated USING (true);  -- transparência
CREATE POLICY solicitacoes_eventos_insert ON public.solicitacoes_eventos
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('solicitacoes') >= 1);
-- UPDATE/DELETE só super-admin · audit imutável
CREATE POLICY solicitacoes_eventos_update ON public.solicitacoes_eventos
  FOR UPDATE TO authenticated USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
CREATE POLICY solicitacoes_eventos_delete ON public.solicitacoes_eventos
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY solicitacoes_eventos_service ON public.solicitacoes_eventos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
