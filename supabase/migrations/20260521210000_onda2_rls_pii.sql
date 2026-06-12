-- =====================================================================
-- Onda 2 PR4 · RLS contextual PII (mem_membros, decisões, batismos, cuidados)
-- =====================================================================
-- Última PR da onda 2 RLS · resolve as tabelas com PII mais sensível
-- que ainda estavam em USING(true):
--
--   - mem_membros (nome, CPF, telefone, endereço, data_nasc)
--   - cultos_decisoes_pessoas (CPF, telefone, dados do responsável kids)
--   - batismo_inscricoes (CPF, data_nasc)
--   - nsm_eventos (rastreamento jornada NSM)
--   - int_visitantes (PII de visitantes)
--   - cui_acompanhamentos / cui_jornada180 / cui_convertidos (PII pastoral)
--
-- Estratégia:
--   - Membro vê só os próprios dados (`current_user_membro_id()`)
--   - Cargos com módulo `membresia` ≥ 3 vêem tudo (administração)
--   - Cargos com módulo `integracao` ≥ 1 (Alda Lorena) vêem decisões/batismos/visitantes
--   - Cargos com módulo `cuidados` ≥ 1 (Lorena/pastoral) vêem cuidados (cui_*)
--   - Super-admin sempre passa
--   - DELETE só super-admin (PII + LGPD · use app_soft_delete)
--
-- Reusa helpers já criados (super-admin, current_user_membro_id,
-- current_user_module_level).
--
-- ETAPA inicial limpa TODAS as policies das tabelas alvo (idempotente).
-- =====================================================================

-- =====================================================================
-- ETAPA 1 · Limpa policies legadas das tabelas alvo
-- =====================================================================
DO $$
DECLARE
  v_table TEXT;
  v_pol RECORD;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'mem_membros', 'cultos_decisoes_pessoas', 'batismo_inscricoes',
    'nsm_eventos', 'int_visitantes',
    'cui_acompanhamentos', 'cui_jornada180', 'cui_convertidos'
  ] LOOP
    FOR v_pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                     v_pol.policyname, v_table);
    END LOOP;
  END LOOP;
END $$;

-- =====================================================================
-- ETAPA 2 · mem_membros (PII central · CPF/endereço/telefone)
-- Membro vê próprio · membresia≥1 vê tudo · membresia≥3 edita · super-admin deleta
-- =====================================================================
CREATE POLICY mem_membros_select ON public.mem_membros
  FOR SELECT TO authenticated
  USING (
    id = public.current_user_membro_id()
    OR public.current_user_module_level('membresia') >= 1
  );

CREATE POLICY mem_membros_insert ON public.mem_membros
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('membresia') >= 3);

-- UPDATE: próprio (campos não-críticos validados pelo app) OR admin membresia
CREATE POLICY mem_membros_update ON public.mem_membros
  FOR UPDATE TO authenticated
  USING (
    id = public.current_user_membro_id()
    OR public.current_user_module_level('membresia') >= 3
  )
  WITH CHECK (
    id = public.current_user_membro_id()
    OR public.current_user_module_level('membresia') >= 3
  );

CREATE POLICY mem_membros_delete ON public.mem_membros
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY mem_membros_service ON public.mem_membros
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 3 · cultos_decisoes_pessoas (decisões + dados kids responsável)
-- Pessoa decidida vê o próprio registro · integracao/cuidados ≥1 vê tudo
-- =====================================================================
CREATE POLICY cultos_decisoes_pessoas_select ON public.cultos_decisoes_pessoas
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('integracao') >= 1
    OR public.current_user_module_level('cuidados') >= 1
    OR public.current_user_module_level('membresia') >= 3
  );

CREATE POLICY cultos_decisoes_pessoas_insert ON public.cultos_decisoes_pessoas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('integracao') >= 2
    OR public.current_user_module_level('kids') >= 2
  );

CREATE POLICY cultos_decisoes_pessoas_update ON public.cultos_decisoes_pessoas
  FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('integracao') >= 3
    OR public.current_user_module_level('cuidados') >= 3
  )
  WITH CHECK (
    public.current_user_module_level('integracao') >= 3
    OR public.current_user_module_level('cuidados') >= 3
  );

CREATE POLICY cultos_decisoes_pessoas_delete ON public.cultos_decisoes_pessoas
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY cultos_decisoes_pessoas_service ON public.cultos_decisoes_pessoas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 4 · batismo_inscricoes
-- =====================================================================
CREATE POLICY batismo_inscricoes_select ON public.batismo_inscricoes
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('integracao') >= 1
    OR public.current_user_module_level('membresia') >= 3
  );

CREATE POLICY batismo_inscricoes_insert ON public.batismo_inscricoes
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('integracao') >= 2);

CREATE POLICY batismo_inscricoes_update ON public.batismo_inscricoes
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('integracao') >= 3)
  WITH CHECK (public.current_user_module_level('integracao') >= 3);

CREATE POLICY batismo_inscricoes_delete ON public.batismo_inscricoes
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY batismo_inscricoes_service ON public.batismo_inscricoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 5 · nsm_eventos (rastreamento jornada)
-- Pessoa vê seus eventos · integracao/cuidados vêem tudo
-- =====================================================================
CREATE POLICY nsm_eventos_select ON public.nsm_eventos
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('integracao') >= 1
    OR public.current_user_module_level('cuidados') >= 1
    OR public.current_user_module_level('painel-cbrio') >= 1
  );

CREATE POLICY nsm_eventos_insert ON public.nsm_eventos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('integracao') >= 2
    OR public.current_user_module_level('cuidados') >= 2
  );

CREATE POLICY nsm_eventos_update ON public.nsm_eventos
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('integracao') >= 3)
  WITH CHECK (public.current_user_module_level('integracao') >= 3);

CREATE POLICY nsm_eventos_delete ON public.nsm_eventos
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY nsm_eventos_service ON public.nsm_eventos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 6 · int_visitantes
-- =====================================================================
CREATE POLICY int_visitantes_select ON public.int_visitantes
  FOR SELECT TO authenticated
  USING (
    membresia_id = public.current_user_membro_id()
    OR public.current_user_module_level('integracao') >= 1
    OR public.current_user_module_level('cuidados') >= 1
  );

CREATE POLICY int_visitantes_insert ON public.int_visitantes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('integracao') >= 2
    OR public.current_user_module_level('cuidados') >= 2
  );

CREATE POLICY int_visitantes_update ON public.int_visitantes
  FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('integracao') >= 3
    OR public.current_user_module_level('cuidados') >= 3
  )
  WITH CHECK (
    public.current_user_module_level('integracao') >= 3
    OR public.current_user_module_level('cuidados') >= 3
  );

CREATE POLICY int_visitantes_delete ON public.int_visitantes
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY int_visitantes_service ON public.int_visitantes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 7 · cui_* (acompanhamento pastoral · LGPD sensível)
-- 3 tabelas com mesmo padrão · próprio membro vê + cuidados≥1 vê
-- =====================================================================
DO $$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cui_acompanhamentos', 'cui_jornada180', 'cui_convertidos'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (membro_id = public.current_user_membro_id() OR public.current_user_module_level(''cuidados'') >= 1 OR public.current_user_module_level(''integracao'') >= 1)',
      v_table, v_table
    );
    EXECUTE format(
      'CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.current_user_module_level(''cuidados'') >= 2 OR public.current_user_module_level(''integracao'') >= 2)',
      v_table, v_table
    );
    EXECUTE format(
      'CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated USING (public.current_user_module_level(''cuidados'') >= 3 OR public.current_user_module_level(''integracao'') >= 3) WITH CHECK (public.current_user_module_level(''cuidados'') >= 3 OR public.current_user_module_level(''integracao'') >= 3)',
      v_table, v_table
    );
    EXECUTE format(
      'CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated USING (public.is_super_admin())',
      v_table, v_table
    );
    EXECUTE format(
      'CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      v_table, v_table
    );
  END LOOP;
END $$;

-- =====================================================================
-- ETAPA 8 · Comentários
-- =====================================================================
COMMENT ON TABLE public.mem_membros IS
  'Cadastro principal de membros (PII: CPF, endereço, telefone). RLS: membro vê próprio · membresia>=1 vê tudo · membresia>=3 edita · super-admin deleta.';

COMMENT ON TABLE public.cultos_decisoes_pessoas IS
  'Decisões de culto (PII: CPF + dados do responsável quando kids). RLS: pessoa decidida vê próprio · integracao/cuidados>=1 vê tudo · integracao>=2 cria (kids>=2 também) · integracao/cuidados>=3 edita.';

COMMENT ON TABLE public.batismo_inscricoes IS
  'Inscrições de batismo (PII: CPF). RLS: candidato vê própria · integracao>=1 vê tudo · integracao>=3 edita.';

COMMENT ON TABLE public.nsm_eventos IS
  'Eventos NSM (rastreamento jornada). RLS: pessoa vê seus eventos · integracao/cuidados/painel-cbrio>=1 vê tudo.';

COMMENT ON TABLE public.int_visitantes IS
  'Visitantes (PII: telefone, email). RLS: linkado a si vê próprio · integracao/cuidados>=1 vê tudo · 2+ cria · 3+ edita.';
