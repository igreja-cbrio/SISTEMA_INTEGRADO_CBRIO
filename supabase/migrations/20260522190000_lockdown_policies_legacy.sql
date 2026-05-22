-- =====================================================================
-- Lockdown final · policies legacy USING(true) em writes
-- =====================================================================
-- Auditoria 2026-05-22 (após Onda 2 RLS) identificou 13 tabelas ainda
-- com policies legacy `USING(true)` ou `WITH CHECK(true)` em writes:
--
-- Kids (7 tabelas · policies legadas re-criadas por migrations recentes
-- do totem-kids #587-#595):
--   - kids_criancas, kids_responsaveis, kids_checkins, kids_sessoes,
--     kids_salas, kids_estacoes, kids_etiquetas_log
--   - Cada uma tinha _delete (USING true), _update (USING true), _write
--     (WITH CHECK true) que não foram dropadas pela migration original
--     `20260521190000_onda2_rls_kids_lgpd.sql` porque o sufixo era _write
--     (não _insert).
--
-- Outros (6 tabelas):
--   - mem_grupo_pedidos ("Authenticated write/update/delete" legacy)
--   - grupo_supervisao_observacoes / visitas (supervisao_obs_* / visitas_*)
--   - cui_atendimentos_agregado (cui_atendimentos_agregado_*)
--   - vol_inscricoes (auth_write/update)
--   - okr_revisoes (auth_write/update/delete)
--
-- Esta migration dropa todas e recria com checks contextuais.
-- Idempotente · DROP IF EXISTS + CREATE.
-- =====================================================================

-- =====================================================================
-- ETAPA 1 · Drop dinâmico de todas as policies legacy
-- =====================================================================
DO $$
DECLARE v_pol RECORD;
BEGIN
  FOR v_pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'kids_criancas','kids_responsaveis','kids_checkins',
        'kids_sessoes','kids_salas','kids_estacoes','kids_etiquetas_log',
        'mem_grupo_pedidos',
        'grupo_supervisao_observacoes','grupo_supervisao_visitas',
        'cui_atendimentos_agregado','vol_inscricoes','okr_revisoes'
      )
      AND policyname NOT LIKE '%service%'
      AND policyname NOT LIKE '%select%'
      AND policyname NOT LIKE '%_read%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   v_pol.policyname, v_pol.tablename);
  END LOOP;
END $$;

-- =====================================================================
-- ETAPA 2 · Recria policies Kids contextuais
-- =====================================================================

-- kids_criancas
CREATE POLICY kids_criancas_insert ON public.kids_criancas FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 3);
CREATE POLICY kids_criancas_update ON public.kids_criancas FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);
CREATE POLICY kids_criancas_delete ON public.kids_criancas FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- kids_responsaveis
CREATE POLICY kids_responsaveis_insert ON public.kids_responsaveis FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 3);
CREATE POLICY kids_responsaveis_update ON public.kids_responsaveis FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);
CREATE POLICY kids_responsaveis_delete ON public.kids_responsaveis FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- kids_checkins
CREATE POLICY kids_checkins_insert ON public.kids_checkins FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 2);
CREATE POLICY kids_checkins_update ON public.kids_checkins FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);
CREATE POLICY kids_checkins_delete ON public.kids_checkins FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- kids_sessoes
CREATE POLICY kids_sessoes_insert ON public.kids_sessoes FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 3);
CREATE POLICY kids_sessoes_update ON public.kids_sessoes FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);
CREATE POLICY kids_sessoes_delete ON public.kids_sessoes FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- kids_salas
CREATE POLICY kids_salas_insert ON public.kids_salas FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 5);
CREATE POLICY kids_salas_update ON public.kids_salas FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 5)
  WITH CHECK (public.current_user_module_level('kids') >= 5);
CREATE POLICY kids_salas_delete ON public.kids_salas FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- kids_estacoes
CREATE POLICY kids_estacoes_insert ON public.kids_estacoes FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 5);
CREATE POLICY kids_estacoes_update ON public.kids_estacoes FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 5)
  WITH CHECK (public.current_user_module_level('kids') >= 5);
CREATE POLICY kids_estacoes_delete ON public.kids_estacoes FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- kids_etiquetas_log (audit imutavel)
CREATE POLICY kids_etiquetas_log_insert ON public.kids_etiquetas_log FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 1);
CREATE POLICY kids_etiquetas_log_update ON public.kids_etiquetas_log FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY kids_etiquetas_log_delete ON public.kids_etiquetas_log FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- =====================================================================
-- ETAPA 3 · mem_grupo_pedidos
-- =====================================================================
CREATE POLICY mem_grupo_pedidos_insert ON public.mem_grupo_pedidos FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('integracao') >= 2
    OR public.current_user_module_level('cuidados') >= 2
    OR public.current_user_module_level('grupos') >= 2
  );
CREATE POLICY mem_grupo_pedidos_update ON public.mem_grupo_pedidos FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('integracao') >= 3
    OR public.current_user_module_level('cuidados') >= 3
    OR public.current_user_module_level('grupos') >= 3
  )
  WITH CHECK (
    public.current_user_module_level('integracao') >= 3
    OR public.current_user_module_level('cuidados') >= 3
    OR public.current_user_module_level('grupos') >= 3
  );
CREATE POLICY mem_grupo_pedidos_delete ON public.mem_grupo_pedidos FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- =====================================================================
-- ETAPA 4 · grupo_supervisao_observacoes + visitas
-- =====================================================================
CREATE POLICY supervisao_obs_insert ON public.grupo_supervisao_observacoes FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('grupos') >= 2);
CREATE POLICY supervisao_obs_update ON public.grupo_supervisao_observacoes FOR UPDATE TO authenticated
  USING (public.current_user_module_level('grupos') >= 3)
  WITH CHECK (public.current_user_module_level('grupos') >= 3);
CREATE POLICY supervisao_obs_delete ON public.grupo_supervisao_observacoes FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY supervisao_visitas_insert ON public.grupo_supervisao_visitas FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('grupos') >= 2);
CREATE POLICY supervisao_visitas_update ON public.grupo_supervisao_visitas FOR UPDATE TO authenticated
  USING (public.current_user_module_level('grupos') >= 3)
  WITH CHECK (public.current_user_module_level('grupos') >= 3);
CREATE POLICY supervisao_visitas_delete ON public.grupo_supervisao_visitas FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- =====================================================================
-- ETAPA 5 · cui_atendimentos_agregado
-- =====================================================================
CREATE POLICY cui_atendimentos_agregado_insert ON public.cui_atendimentos_agregado FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('cuidados') >= 2);
CREATE POLICY cui_atendimentos_agregado_update ON public.cui_atendimentos_agregado FOR UPDATE TO authenticated
  USING (public.current_user_module_level('cuidados') >= 3)
  WITH CHECK (public.current_user_module_level('cuidados') >= 3);
CREATE POLICY cui_atendimentos_agregado_delete ON public.cui_atendimentos_agregado FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- =====================================================================
-- ETAPA 6 · vol_inscricoes
-- =====================================================================
CREATE POLICY vol_inscricoes_insert ON public.vol_inscricoes FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('voluntariado') >= 2);
CREATE POLICY vol_inscricoes_update ON public.vol_inscricoes FOR UPDATE TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3)
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3);

-- =====================================================================
-- ETAPA 7 · okr_revisoes
-- =====================================================================
CREATE POLICY okr_revisoes_insert ON public.okr_revisoes FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('revisao-estrategica') >= 2);
CREATE POLICY okr_revisoes_update ON public.okr_revisoes FOR UPDATE TO authenticated
  USING (public.current_user_module_level('revisao-estrategica') >= 3)
  WITH CHECK (public.current_user_module_level('revisao-estrategica') >= 3);
CREATE POLICY okr_revisoes_delete ON public.okr_revisoes FOR DELETE TO authenticated
  USING (public.is_super_admin());
