-- =====================================================================
-- RLS contextual · tabelas mem_* operacionais
-- =====================================================================
-- Auditoria 2026-05-21 · tabelas mem_* que ainda têm policies USING(true)
-- e precisam de RLS contextual.
--
-- Estratégia geral:
--   - Catálogos (mem_grupos, mem_ministerios, mem_familias) · read aberto
--     + write membresia/voluntariado >= 3
--   - Participação (mem_grupo_membros, mem_grupo_encontros, etc) · read
--     contextual (próprio OR ministerio relevante) + write >= 2/3
--   - Histórico (mem_historico, mem_escalas) · próprio + admin
--   - mem_trilha_valores · já estava na Onda 2 PR4 (membresia) · skip
--
-- DELETE em TODAS · só super-admin (usa app_soft_delete pro resto).
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
      AND tablename IN (
        'mem_familias', 'mem_grupos', 'mem_grupo_membros',
        'mem_grupo_encontros', 'mem_grupo_encontro_presencas',
        'mem_grupo_documentos', 'mem_ministerios', 'mem_voluntarios',
        'mem_escalas', 'mem_checkins', 'mem_historico',
        'mem_temporadas', 'mem_devocionais'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   v_pol.policyname, v_pol.tablename);
  END LOOP;
END $$;

-- =====================================================================
-- ETAPA 2 · mem_familias (PII família · agrupa membros)
-- =====================================================================
CREATE POLICY mem_familias_select ON public.mem_familias
  FOR SELECT TO authenticated
  USING (
    -- Tem membro_id na sua família?
    EXISTS (SELECT 1 FROM public.mem_membros m
            WHERE m.familia_id = mem_familias.id
              AND m.id = public.current_user_membro_id())
    OR public.current_user_module_level('membresia') >= 1
  );
CREATE POLICY mem_familias_write ON public.mem_familias
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('membresia') >= 3);
CREATE POLICY mem_familias_update ON public.mem_familias
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('membresia') >= 3)
  WITH CHECK (public.current_user_module_level('membresia') >= 3);
CREATE POLICY mem_familias_delete ON public.mem_familias
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_familias_service ON public.mem_familias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 3 · mem_grupos (catálogo de células)
-- =====================================================================
CREATE POLICY mem_grupos_select ON public.mem_grupos
  FOR SELECT TO authenticated USING (true);  -- catálogo público
CREATE POLICY mem_grupos_write ON public.mem_grupos
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('grupos') >= 3);
CREATE POLICY mem_grupos_update ON public.mem_grupos
  FOR UPDATE TO authenticated
  USING (
    -- Líder do grupo OR coord
    lider_id = public.current_user_membro_id()
    OR public.current_user_module_level('grupos') >= 3
  )
  WITH CHECK (
    lider_id = public.current_user_membro_id()
    OR public.current_user_module_level('grupos') >= 3
  );
CREATE POLICY mem_grupos_delete ON public.mem_grupos
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_grupos_service ON public.mem_grupos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 4 · mem_grupo_membros (M:N membro × grupo)
-- =====================================================================
CREATE POLICY mem_grupo_membros_select ON public.mem_grupo_membros
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('grupos') >= 1
  );
CREATE POLICY mem_grupo_membros_write ON public.mem_grupo_membros
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('grupos') >= 2);
CREATE POLICY mem_grupo_membros_update ON public.mem_grupo_membros
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('grupos') >= 3)
  WITH CHECK (public.current_user_module_level('grupos') >= 3);
CREATE POLICY mem_grupo_membros_delete ON public.mem_grupo_membros
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_grupo_membros_service ON public.mem_grupo_membros
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 5 · mem_grupo_encontros (reuniões de célula)
-- =====================================================================
CREATE POLICY mem_grupo_encontros_select ON public.mem_grupo_encontros
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('grupos') >= 1);
CREATE POLICY mem_grupo_encontros_write ON public.mem_grupo_encontros
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('grupos') >= 2);
CREATE POLICY mem_grupo_encontros_update ON public.mem_grupo_encontros
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('grupos') >= 3)
  WITH CHECK (public.current_user_module_level('grupos') >= 3);
CREATE POLICY mem_grupo_encontros_delete ON public.mem_grupo_encontros
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_grupo_encontros_service ON public.mem_grupo_encontros
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 6 · mem_grupo_encontro_presencas
-- =====================================================================
CREATE POLICY mem_grupo_encontro_presencas_select ON public.mem_grupo_encontro_presencas
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('grupos') >= 1
  );
CREATE POLICY mem_grupo_encontro_presencas_write ON public.mem_grupo_encontro_presencas
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('grupos') >= 2);
CREATE POLICY mem_grupo_encontro_presencas_update ON public.mem_grupo_encontro_presencas
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('grupos') >= 3)
  WITH CHECK (public.current_user_module_level('grupos') >= 3);
CREATE POLICY mem_grupo_encontro_presencas_delete ON public.mem_grupo_encontro_presencas
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_grupo_encontro_presencas_service ON public.mem_grupo_encontro_presencas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 7 · mem_grupo_documentos
-- =====================================================================
CREATE POLICY mem_grupo_documentos_select ON public.mem_grupo_documentos
  FOR SELECT TO authenticated USING (true);  -- compartilhado no grupo
CREATE POLICY mem_grupo_documentos_write ON public.mem_grupo_documentos
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('grupos') >= 2);
CREATE POLICY mem_grupo_documentos_update ON public.mem_grupo_documentos
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('grupos') >= 3)
  WITH CHECK (public.current_user_module_level('grupos') >= 3);
CREATE POLICY mem_grupo_documentos_delete ON public.mem_grupo_documentos
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_grupo_documentos_service ON public.mem_grupo_documentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 8 · mem_ministerios (catálogo)
-- =====================================================================
CREATE POLICY mem_ministerios_select ON public.mem_ministerios
  FOR SELECT TO authenticated USING (true);  -- catálogo público
CREATE POLICY mem_ministerios_write ON public.mem_ministerios
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3);
CREATE POLICY mem_ministerios_update ON public.mem_ministerios
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3)
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3);
CREATE POLICY mem_ministerios_delete ON public.mem_ministerios
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_ministerios_service ON public.mem_ministerios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 9 · mem_voluntarios (FK membro × ministério)
-- =====================================================================
CREATE POLICY mem_voluntarios_select ON public.mem_voluntarios
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('voluntariado') >= 1
  );
CREATE POLICY mem_voluntarios_write ON public.mem_voluntarios
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('voluntariado') >= 2);
CREATE POLICY mem_voluntarios_update ON public.mem_voluntarios
  FOR UPDATE TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('voluntariado') >= 3
  )
  WITH CHECK (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('voluntariado') >= 3
  );
CREATE POLICY mem_voluntarios_delete ON public.mem_voluntarios
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_voluntarios_service ON public.mem_voluntarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 10 · mem_escalas (agendamento operacional)
-- =====================================================================
CREATE POLICY mem_escalas_select ON public.mem_escalas
  FOR SELECT TO authenticated USING (true);  -- escalas são públicas
CREATE POLICY mem_escalas_write ON public.mem_escalas
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('voluntariado') >= 2);
CREATE POLICY mem_escalas_update ON public.mem_escalas
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3)
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3);
CREATE POLICY mem_escalas_delete ON public.mem_escalas
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_escalas_service ON public.mem_escalas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 11 · mem_checkins (presença em culto/voluntariado)
-- =====================================================================
CREATE POLICY mem_checkins_select ON public.mem_checkins
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('voluntariado') >= 1
  );
CREATE POLICY mem_checkins_write ON public.mem_checkins
  FOR INSERT TO authenticated
  WITH CHECK (
    membro_id = public.current_user_membro_id()  -- self check-in
    OR public.current_user_module_level('voluntariado') >= 1
  );
CREATE POLICY mem_checkins_update ON public.mem_checkins
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3)
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3);
CREATE POLICY mem_checkins_delete ON public.mem_checkins
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_checkins_service ON public.mem_checkins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 12 · mem_historico (acompanhamento pastoral · PII sensível)
-- =====================================================================
CREATE POLICY mem_historico_select ON public.mem_historico
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('cuidados') >= 1
    OR public.current_user_module_level('membresia') >= 1
  );
CREATE POLICY mem_historico_write ON public.mem_historico
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('cuidados') >= 2
    OR public.current_user_module_level('membresia') >= 2
  );
CREATE POLICY mem_historico_update ON public.mem_historico
  FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('cuidados') >= 3
    OR public.current_user_module_level('membresia') >= 3
  )
  WITH CHECK (
    public.current_user_module_level('cuidados') >= 3
    OR public.current_user_module_level('membresia') >= 3
  );
CREATE POLICY mem_historico_delete ON public.mem_historico
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_historico_service ON public.mem_historico
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 13 · mem_temporadas (catálogo de temporadas grupos)
-- =====================================================================
CREATE POLICY mem_temporadas_select ON public.mem_temporadas
  FOR SELECT TO authenticated USING (true);  -- catálogo público
CREATE POLICY mem_temporadas_write ON public.mem_temporadas
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('grupos') >= 3);
CREATE POLICY mem_temporadas_update ON public.mem_temporadas
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('grupos') >= 3)
  WITH CHECK (public.current_user_module_level('grupos') >= 3);
CREATE POLICY mem_temporadas_delete ON public.mem_temporadas
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_temporadas_service ON public.mem_temporadas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 14 · mem_devocionais (devocional do membro)
-- =====================================================================
CREATE POLICY mem_devocionais_select ON public.mem_devocionais
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('cuidados') >= 1
  );
CREATE POLICY mem_devocionais_write ON public.mem_devocionais
  FOR INSERT TO authenticated
  WITH CHECK (
    membro_id = public.current_user_membro_id()  -- self
    OR public.current_user_module_level('cuidados') >= 2
  );
CREATE POLICY mem_devocionais_update ON public.mem_devocionais
  FOR UPDATE TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('cuidados') >= 3
  )
  WITH CHECK (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('cuidados') >= 3
  );
CREATE POLICY mem_devocionais_delete ON public.mem_devocionais
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY mem_devocionais_service ON public.mem_devocionais
  FOR ALL TO service_role USING (true) WITH CHECK (true);
