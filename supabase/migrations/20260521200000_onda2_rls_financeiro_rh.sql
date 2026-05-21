-- =====================================================================
-- Onda 2 · RLS contextual Financeiro/RH (PR3)
-- =====================================================================
-- Substitui policies USING(true) em:
--   - mem_contribuicoes (dízimos/ofertas · LGPD financeira)
--   - rh_funcionarios + dependentes (salário, CPF, documentos)
--   - PCS · graus/critérios/níveis/benefícios (configuração financeira)
--   - PCS · progressões/pontuação/avaliações (histórico individual)
--
-- Estratégia:
--   - Configuração de RH/PCS · read pra todos com módulo `rh` >= 1,
--     write só super-admin
--   - Dados pessoais financeiros · funcionário vê só os próprios,
--     diretor-rh / coord-financeiro vêem tudo, super-admin total
--   - Contribuições · membro vê só as próprias, financeiro vê tudo
--
-- Reusa helpers da Onda 2 PR2:
--   - current_user_membro_id() · auth → mem_membros
--   - current_user_module_level(slug) · super-admin/override/matriz/boost
--   - is_super_admin()
--
-- Cria 2 helpers novos:
--   - current_user_funcionario_id() · auth → rh_funcionarios via email
--   - user_is_lider_de(funcionario_id) · checa hierarquia gestor_id
-- =====================================================================

-- =====================================================================
-- ETAPA 1 · Helper · current_user_funcionario_id()
-- =====================================================================
CREATE OR REPLACE FUNCTION public.current_user_funcionario_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT f.id
  FROM auth.users au
  JOIN public.rh_funcionarios f
    ON LOWER(f.email) = LOWER(au.email)
  WHERE au.id = auth.uid()
    AND f.deleted_at IS NULL
    AND f.status = 'ativo'
  LIMIT 1
$$;

COMMENT ON FUNCTION public.current_user_funcionario_id() IS
  'Retorna rh_funcionarios.id do user logado via match por email (LOWER). NULL se não é funcionário ativo.';

GRANT EXECUTE ON FUNCTION public.current_user_funcionario_id() TO authenticated, anon;

-- =====================================================================
-- ETAPA 2 · Helper · user_is_lider_de(funcionario_id)
-- Checa se o user é gestor hierárquico (direto) do funcionário alvo.
-- Hierarquia: rh_funcionarios.gestor_id self-FK
-- =====================================================================
CREATE OR REPLACE FUNCTION public.user_is_lider_de(p_funcionario_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rh_funcionarios f
    WHERE f.id = p_funcionario_id
      AND f.gestor_id = public.current_user_funcionario_id()
  )
$$;

COMMENT ON FUNCTION public.user_is_lider_de(UUID) IS
  'TRUE se o user logado é gestor direto do funcionário alvo (rh_funcionarios.gestor_id).';

GRANT EXECUTE ON FUNCTION public.user_is_lider_de(UUID) TO authenticated, anon;

-- =====================================================================
-- ETAPA 3 · mem_contribuicoes (dízimos/ofertas)
-- Membro vê só as próprias · módulo `financeiro` >= 3 vê tudo
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read mem_contribuicoes"    ON public.mem_contribuicoes;
DROP POLICY IF EXISTS "Authenticated write mem_contribuicoes"   ON public.mem_contribuicoes;
DROP POLICY IF EXISTS "Authenticated update mem_contribuicoes"  ON public.mem_contribuicoes;
DROP POLICY IF EXISTS "Authenticated delete mem_contribuicoes"  ON public.mem_contribuicoes;
DROP POLICY IF EXISTS mem_contribuicoes_read    ON public.mem_contribuicoes;
DROP POLICY IF EXISTS mem_contribuicoes_select  ON public.mem_contribuicoes;
DROP POLICY IF EXISTS mem_contribuicoes_insert  ON public.mem_contribuicoes;
DROP POLICY IF EXISTS mem_contribuicoes_update  ON public.mem_contribuicoes;
DROP POLICY IF EXISTS mem_contribuicoes_delete  ON public.mem_contribuicoes;
DROP POLICY IF EXISTS mem_contribuicoes_service ON public.mem_contribuicoes;

CREATE POLICY mem_contribuicoes_select ON public.mem_contribuicoes
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('financeiro') >= 3
  );

CREATE POLICY mem_contribuicoes_insert ON public.mem_contribuicoes
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('financeiro') >= 3);

CREATE POLICY mem_contribuicoes_update ON public.mem_contribuicoes
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('financeiro') >= 3)
  WITH CHECK (public.current_user_module_level('financeiro') >= 3);

CREATE POLICY mem_contribuicoes_delete ON public.mem_contribuicoes
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY mem_contribuicoes_service ON public.mem_contribuicoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 4 · rh_funcionarios (cadastro · salário · CPF)
-- Funcionário vê só o próprio · diretor-rh vê tudo (nivel 5 em `rh`)
-- coord-financeiro vê tudo (precisa pra folha) · super-admin total
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read rh_funcionarios"   ON public.rh_funcionarios;
DROP POLICY IF EXISTS "Authenticated write rh_funcionarios"  ON public.rh_funcionarios;
DROP POLICY IF EXISTS "Authenticated update rh_funcionarios" ON public.rh_funcionarios;
DROP POLICY IF EXISTS "Authenticated delete rh_funcionarios" ON public.rh_funcionarios;
DROP POLICY IF EXISTS rh_admin_all             ON public.rh_funcionarios;
DROP POLICY IF EXISTS rh_funcionarios_select   ON public.rh_funcionarios;
DROP POLICY IF EXISTS rh_funcionarios_insert   ON public.rh_funcionarios;
DROP POLICY IF EXISTS rh_funcionarios_update   ON public.rh_funcionarios;
DROP POLICY IF EXISTS rh_funcionarios_delete   ON public.rh_funcionarios;
DROP POLICY IF EXISTS rh_funcionarios_service  ON public.rh_funcionarios;

CREATE POLICY rh_funcionarios_select ON public.rh_funcionarios
  FOR SELECT TO authenticated
  USING (
    id = public.current_user_funcionario_id()
    OR public.current_user_module_level('rh') >= 3
    OR public.current_user_module_level('financeiro') >= 3
  );

CREATE POLICY rh_funcionarios_insert ON public.rh_funcionarios
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('rh') >= 3);

-- UPDATE: próprio (campos não-sensíveis ficam pro app validar) OR RH
CREATE POLICY rh_funcionarios_update ON public.rh_funcionarios
  FOR UPDATE TO authenticated
  USING (
    id = public.current_user_funcionario_id()
    OR public.current_user_module_level('rh') >= 3
  )
  WITH CHECK (
    id = public.current_user_funcionario_id()
    OR public.current_user_module_level('rh') >= 3
  );

CREATE POLICY rh_funcionarios_delete ON public.rh_funcionarios
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY rh_funcionarios_service ON public.rh_funcionarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 5 · rh_documentos
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read rh_documentos"   ON public.rh_documentos;
DROP POLICY IF EXISTS "Authenticated write rh_documentos"  ON public.rh_documentos;
DROP POLICY IF EXISTS "Authenticated update rh_documentos" ON public.rh_documentos;
DROP POLICY IF EXISTS "Authenticated delete rh_documentos" ON public.rh_documentos;
DROP POLICY IF EXISTS rh_docs_admin_all      ON public.rh_documentos;
DROP POLICY IF EXISTS rh_documentos_select   ON public.rh_documentos;
DROP POLICY IF EXISTS rh_documentos_insert   ON public.rh_documentos;
DROP POLICY IF EXISTS rh_documentos_update   ON public.rh_documentos;
DROP POLICY IF EXISTS rh_documentos_delete   ON public.rh_documentos;
DROP POLICY IF EXISTS rh_documentos_service  ON public.rh_documentos;

CREATE POLICY rh_documentos_select ON public.rh_documentos
  FOR SELECT TO authenticated
  USING (
    funcionario_id = public.current_user_funcionario_id()
    OR public.current_user_module_level('rh') >= 3
  );

CREATE POLICY rh_documentos_insert ON public.rh_documentos
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('rh') >= 3);

CREATE POLICY rh_documentos_update ON public.rh_documentos
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('rh') >= 3)
  WITH CHECK (public.current_user_module_level('rh') >= 3);

CREATE POLICY rh_documentos_delete ON public.rh_documentos
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY rh_documentos_service ON public.rh_documentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 6 · rh_avaliacoes (ciclo 360°)
-- Funcionário vê próprias · líder vê subordinados · diretor-rh tudo
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read rh_avaliacoes"   ON public.rh_avaliacoes;
DROP POLICY IF EXISTS "Authenticated write rh_avaliacoes"  ON public.rh_avaliacoes;
DROP POLICY IF EXISTS "Authenticated update rh_avaliacoes" ON public.rh_avaliacoes;
DROP POLICY IF EXISTS "Authenticated delete rh_avaliacoes" ON public.rh_avaliacoes;
DROP POLICY IF EXISTS rh_avaliacoes_write    ON public.rh_avaliacoes;
DROP POLICY IF EXISTS rh_avaliacoes_select   ON public.rh_avaliacoes;
DROP POLICY IF EXISTS rh_avaliacoes_insert   ON public.rh_avaliacoes;
DROP POLICY IF EXISTS rh_avaliacoes_update   ON public.rh_avaliacoes;
DROP POLICY IF EXISTS rh_avaliacoes_delete   ON public.rh_avaliacoes;
DROP POLICY IF EXISTS rh_avaliacoes_service  ON public.rh_avaliacoes;

CREATE POLICY rh_avaliacoes_select ON public.rh_avaliacoes
  FOR SELECT TO authenticated
  USING (
    funcionario_id = public.current_user_funcionario_id()
    OR public.user_is_lider_de(funcionario_id)
    OR public.current_user_module_level('rh') >= 3
  );

CREATE POLICY rh_avaliacoes_insert ON public.rh_avaliacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    funcionario_id = public.current_user_funcionario_id()
    OR public.user_is_lider_de(funcionario_id)
    OR public.current_user_module_level('rh') >= 3
  );

CREATE POLICY rh_avaliacoes_update ON public.rh_avaliacoes
  FOR UPDATE TO authenticated
  USING (
    funcionario_id = public.current_user_funcionario_id()
    OR public.user_is_lider_de(funcionario_id)
    OR public.current_user_module_level('rh') >= 3
  )
  WITH CHECK (
    funcionario_id = public.current_user_funcionario_id()
    OR public.user_is_lider_de(funcionario_id)
    OR public.current_user_module_level('rh') >= 3
  );

CREATE POLICY rh_avaliacoes_delete ON public.rh_avaliacoes
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY rh_avaliacoes_service ON public.rh_avaliacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 7 · rh_avaliacao_fatores
-- Herda permissão da avaliação pai (JOIN)
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read rh_avaliacao_fatores"   ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS "Authenticated write rh_avaliacao_fatores"  ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS "Authenticated update rh_avaliacao_fatores" ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS "Authenticated delete rh_avaliacao_fatores" ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS rh_aval_fatores_write         ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS rh_aval_fatores_select        ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS rh_avaliacao_fatores_select   ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS rh_avaliacao_fatores_insert   ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS rh_avaliacao_fatores_update   ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS rh_avaliacao_fatores_delete   ON public.rh_avaliacao_fatores;
DROP POLICY IF EXISTS rh_avaliacao_fatores_service  ON public.rh_avaliacao_fatores;

CREATE POLICY rh_avaliacao_fatores_select ON public.rh_avaliacao_fatores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rh_avaliacoes a
      WHERE a.id = rh_avaliacao_fatores.avaliacao_id
        AND (
          a.funcionario_id = public.current_user_funcionario_id()
          OR public.user_is_lider_de(a.funcionario_id)
          OR public.current_user_module_level('rh') >= 3
        )
    )
  );

CREATE POLICY rh_avaliacao_fatores_insert ON public.rh_avaliacao_fatores
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rh_avaliacoes a
      WHERE a.id = rh_avaliacao_fatores.avaliacao_id
        AND (
          a.funcionario_id = public.current_user_funcionario_id()
          OR public.user_is_lider_de(a.funcionario_id)
          OR public.current_user_module_level('rh') >= 3
        )
    )
  );

CREATE POLICY rh_avaliacao_fatores_update ON public.rh_avaliacao_fatores
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rh_avaliacoes a
      WHERE a.id = rh_avaliacao_fatores.avaliacao_id
        AND (
          a.funcionario_id = public.current_user_funcionario_id()
          OR public.user_is_lider_de(a.funcionario_id)
          OR public.current_user_module_level('rh') >= 3
        )
    )
  )
  WITH CHECK (true);

CREATE POLICY rh_avaliacao_fatores_delete ON public.rh_avaliacao_fatores
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY rh_avaliacao_fatores_service ON public.rh_avaliacao_fatores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 8 · rh_treinamentos (catálogo) + rh_treinamentos_funcionarios (inscrições)
-- Treinamentos é catálogo · todo authenticated lê · RH gerencia
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read rh_treinamentos"   ON public.rh_treinamentos;
DROP POLICY IF EXISTS "Authenticated write rh_treinamentos"  ON public.rh_treinamentos;
DROP POLICY IF EXISTS "Authenticated update rh_treinamentos" ON public.rh_treinamentos;
DROP POLICY IF EXISTS "Authenticated delete rh_treinamentos" ON public.rh_treinamentos;
DROP POLICY IF EXISTS rh_treinamentos_select   ON public.rh_treinamentos;
DROP POLICY IF EXISTS rh_treinamentos_write    ON public.rh_treinamentos;
DROP POLICY IF EXISTS rh_treinamentos_update   ON public.rh_treinamentos;
DROP POLICY IF EXISTS rh_treinamentos_delete   ON public.rh_treinamentos;
DROP POLICY IF EXISTS rh_treinamentos_service  ON public.rh_treinamentos;

CREATE POLICY rh_treinamentos_select ON public.rh_treinamentos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY rh_treinamentos_write ON public.rh_treinamentos
  FOR INSERT TO authenticated WITH CHECK (public.current_user_module_level('rh') >= 3);
CREATE POLICY rh_treinamentos_update ON public.rh_treinamentos
  FOR UPDATE TO authenticated USING (public.current_user_module_level('rh') >= 3)
  WITH CHECK (public.current_user_module_level('rh') >= 3);
CREATE POLICY rh_treinamentos_delete ON public.rh_treinamentos
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY rh_treinamentos_service ON public.rh_treinamentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- rh_treinamentos_funcionarios
DROP POLICY IF EXISTS "Authenticated read rh_treinamentos_funcionarios"   ON public.rh_treinamentos_funcionarios;
DROP POLICY IF EXISTS "Authenticated write rh_treinamentos_funcionarios"  ON public.rh_treinamentos_funcionarios;
DROP POLICY IF EXISTS "Authenticated update rh_treinamentos_funcionarios" ON public.rh_treinamentos_funcionarios;
DROP POLICY IF EXISTS "Authenticated delete rh_treinamentos_funcionarios" ON public.rh_treinamentos_funcionarios;
DROP POLICY IF EXISTS rh_trein_func_admin_all               ON public.rh_treinamentos_funcionarios;
DROP POLICY IF EXISTS rh_treinamentos_funcionarios_select   ON public.rh_treinamentos_funcionarios;
DROP POLICY IF EXISTS rh_treinamentos_funcionarios_insert   ON public.rh_treinamentos_funcionarios;
DROP POLICY IF EXISTS rh_treinamentos_funcionarios_update   ON public.rh_treinamentos_funcionarios;
DROP POLICY IF EXISTS rh_treinamentos_funcionarios_delete   ON public.rh_treinamentos_funcionarios;
DROP POLICY IF EXISTS rh_treinamentos_funcionarios_service  ON public.rh_treinamentos_funcionarios;

CREATE POLICY rh_treinamentos_funcionarios_select ON public.rh_treinamentos_funcionarios
  FOR SELECT TO authenticated
  USING (
    funcionario_id = public.current_user_funcionario_id()
    OR public.current_user_module_level('rh') >= 3
  );
CREATE POLICY rh_treinamentos_funcionarios_insert ON public.rh_treinamentos_funcionarios
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('rh') >= 3);
CREATE POLICY rh_treinamentos_funcionarios_update ON public.rh_treinamentos_funcionarios
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('rh') >= 3)
  WITH CHECK (public.current_user_module_level('rh') >= 3);
CREATE POLICY rh_treinamentos_funcionarios_delete ON public.rh_treinamentos_funcionarios
  FOR DELETE TO authenticated USING (public.is_super_admin());
CREATE POLICY rh_treinamentos_funcionarios_service ON public.rh_treinamentos_funcionarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 9 · rh_ferias_licencas
-- Funcionário vê/cria próprias · líder aprova · RH gerencia tudo
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read rh_ferias_licencas"   ON public.rh_ferias_licencas;
DROP POLICY IF EXISTS "Authenticated write rh_ferias_licencas"  ON public.rh_ferias_licencas;
DROP POLICY IF EXISTS "Authenticated update rh_ferias_licencas" ON public.rh_ferias_licencas;
DROP POLICY IF EXISTS "Authenticated delete rh_ferias_licencas" ON public.rh_ferias_licencas;
DROP POLICY IF EXISTS rh_ferias_admin_all         ON public.rh_ferias_licencas;
DROP POLICY IF EXISTS rh_ferias_licencas_select   ON public.rh_ferias_licencas;
DROP POLICY IF EXISTS rh_ferias_licencas_insert   ON public.rh_ferias_licencas;
DROP POLICY IF EXISTS rh_ferias_licencas_update   ON public.rh_ferias_licencas;
DROP POLICY IF EXISTS rh_ferias_licencas_delete   ON public.rh_ferias_licencas;
DROP POLICY IF EXISTS rh_ferias_licencas_service  ON public.rh_ferias_licencas;

CREATE POLICY rh_ferias_licencas_select ON public.rh_ferias_licencas
  FOR SELECT TO authenticated
  USING (
    funcionario_id = public.current_user_funcionario_id()
    OR public.user_is_lider_de(funcionario_id)
    OR public.current_user_module_level('rh') >= 3
  );

CREATE POLICY rh_ferias_licencas_insert ON public.rh_ferias_licencas
  FOR INSERT TO authenticated
  WITH CHECK (
    funcionario_id = public.current_user_funcionario_id()
    OR public.current_user_module_level('rh') >= 3
  );

CREATE POLICY rh_ferias_licencas_update ON public.rh_ferias_licencas
  FOR UPDATE TO authenticated
  USING (
    public.user_is_lider_de(funcionario_id)
    OR public.current_user_module_level('rh') >= 3
  )
  WITH CHECK (
    public.user_is_lider_de(funcionario_id)
    OR public.current_user_module_level('rh') >= 3
  );

CREATE POLICY rh_ferias_licencas_delete ON public.rh_ferias_licencas
  FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE POLICY rh_ferias_licencas_service ON public.rh_ferias_licencas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 10 · PCS · Tabelas de CONFIGURAÇÃO (read pra todos com `rh`≥1)
-- pcs_graus, pcs_criterios, pcs_niveis_criterio, pcs_beneficios,
-- pcs_beneficio_grau, pcs_reajustes_coletivos
-- =====================================================================

-- Helper macro · padrão idêntico pras 6 tabelas (read rh>=1, write super-admin)
DO $$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pcs_graus', 'pcs_criterios', 'pcs_niveis_criterio',
    'pcs_beneficios', 'pcs_beneficio_grau', 'pcs_reajustes_coletivos'
  ] LOOP
    -- Drop policies abertas existentes
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_write  ON public.%I', v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I', v_table, v_table);

    -- Cria policies novas
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.current_user_module_level(''rh'') >= 1)',
      v_table, v_table
    );
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_super_admin())',
      v_table, v_table
    );
    EXECUTE format(
      'CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())',
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
-- ETAPA 11 · PCS · Tabelas de HISTÓRICO INDIVIDUAL
-- pcs_progressoes, pcs_pontuacao_colaborador, pcs_avaliacoes_funcionario
-- Funcionário vê próprio · diretor-rh vê tudo
-- =====================================================================
DO $$
DECLARE v_table TEXT;
BEGIN
  -- NOTA: `pcs_avaliacoes_funcionario` mencionado em auditoria nao existe
  -- em prod · so `pcs_progressoes` e `pcs_pontuacao_colaborador`.
  -- Avaliacoes formais ficam em `rh_avaliacoes` + `rh_avaliacao_fatores`.
  FOREACH v_table IN ARRAY ARRAY[
    'pcs_progressoes', 'pcs_pontuacao_colaborador'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_write  ON public.%I', v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I', v_table, v_table);

    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (funcionario_id = public.current_user_funcionario_id() OR public.current_user_module_level(''rh'') >= 3)',
      v_table, v_table
    );
    EXECUTE format(
      'CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.current_user_module_level(''rh'') >= 3)',
      v_table, v_table
    );
    EXECUTE format(
      'CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated USING (public.current_user_module_level(''rh'') >= 3) WITH CHECK (public.current_user_module_level(''rh'') >= 3)',
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
-- ETAPA 12 · Comentários
-- =====================================================================
COMMENT ON TABLE public.mem_contribuicoes IS
  'Dízimos/ofertas (LGPD financeira). RLS: membro vê só as próprias · módulo financeiro nivel 3+ vê tudo · super-admin pode deletar.';

COMMENT ON TABLE public.rh_funcionarios IS
  'Funcionários CLT/PJ (CPF, salário, contato). RLS: funcionário vê só o próprio cadastro · módulo rh ou financeiro nível 3+ vêem tudo.';

COMMENT ON TABLE public.rh_avaliacoes IS
  'Ciclo avaliativo 360°. RLS: funcionário vê próprias · líder hierárquico (gestor_id) vê dos subordinados · diretor-rh tudo.';

COMMENT ON TABLE public.pcs_graus IS
  'Tabela de configuração PCS (faixas salariais). Read pra módulo rh>=1 · write só super-admin (mudança crítica de política salarial).';
